use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::Mutex,
    time::{Duration, Instant},
};

use axum::{
    extract::{ConnectInfo, Request, State},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::{error::ApiError, state::AppState};

const WINDOW: Duration = Duration::from_secs(60);
const MAX_CALLERS: usize = 4096;

pub struct RequestBudget {
    inner: Mutex<HashMap<(Option<IpAddr>, &'static str), (Instant, u32)>>,
}

impl Default for RequestBudget {
    fn default() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }
}

impl RequestBudget {
    fn check(&self, peer: Option<IpAddr>, group: &'static str, limit: u32, now: Instant) -> bool {
        let mut windows = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        windows.retain(|_, (start, _)| now.duration_since(*start) < WINDOW);
        let key = (peer, group);
        if !windows.contains_key(&key) && windows.len() >= MAX_CALLERS {
            return false;
        }
        let entry = windows.entry(key).or_insert((now, 0));
        if entry.1 >= limit {
            return false;
        }
        entry.1 += 1;
        true
    }
}

pub async fn protect(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if !request.uri().path().starts_with("/v1/") {
        return next.run(request).await;
    }
    // Only the actual transport peer is trusted. Forwarded headers are caller-controlled
    // unless validated by a separately configured ingress; never use them for identity.
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|peer| peer.0.ip());
    let path = request.uri().path();
    let (group, limit) = if path.ends_with("/claim") {
        ("claim", 60)
    } else if path.contains("/auth/") || path.ends_with("/onboarding") {
        ("auth", 120)
    } else if path.ends_with("/assets") || path.ends_with("/payment-readiness") {
        ("rpc", 120)
    } else {
        ("api", 600)
    };
    let now = Instant::now();
    if !state.request_budget.check(None, "global", 3000, now)
        || !state.request_budget.check(peer, group, limit, now)
    {
        return ApiError::rate_limited().into_response();
    }
    let Ok(_permit) = state.public_requests.clone().try_acquire_owned() else {
        return ApiError::unavailable("The service is busy. Please retry shortly.").into_response();
    };
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("private, no-store"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_are_bounded_reset_and_isolate_callers() {
        let budget = RequestBudget::default();
        let now = Instant::now();
        let peer = Some("1.1.1.1".parse().unwrap());
        assert!(budget.check(peer, "claim", 1, now));
        assert!(!budget.check(peer, "claim", 1, now));
        assert!(budget.check(Some("8.8.8.8".parse().unwrap()), "claim", 1, now));
        assert!(budget.check(peer, "claim", 1, now + WINDOW));
        assert_eq!(budget.inner.lock().unwrap().len(), 1);
    }

    #[test]
    fn concurrent_calls_cannot_exceed_the_budget() {
        let budget = std::sync::Arc::new(RequestBudget::default());
        let now = Instant::now();
        let tasks: Vec<_> = (0..40)
            .map(|_| {
                let budget = budget.clone();
                std::thread::spawn(move || budget.check(None, "global", 10, now))
            })
            .collect();
        assert_eq!(
            tasks
                .into_iter()
                .map(|task| task.join().unwrap() as usize)
                .sum::<usize>(),
            10
        );
    }
}
