use std::sync::Arc;

use reqwest::Client;
use sqlx::PgPool;
use std::time::Instant;

use crate::config::AppConfig;

#[derive(Clone)]
pub struct CachedUsdNgnRate {
    pub rate_micros: u128,
    pub rate_display: String,
    pub source_updated_at_seconds: i64,
    pub fetched_at: Instant,
}

#[derive(Clone)]
pub struct CachedNearUsdRate {
    pub price_micros: u128,
    pub price_display: String,
    pub source_updated_at_seconds: i64,
    pub source: &'static str,
    pub fetched_at: Instant,
}

#[derive(Clone)]
pub struct CachedOneClickTokens {
    pub tokens: Arc<Vec<crate::oneclick::OneClickToken>>,
    pub fetched_at: Instant,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub http: Client,
    pub request_budget: Arc<crate::abuse::RequestBudget>,
    pub public_requests: Arc<tokio::sync::Semaphore>,
    pub usd_ngn_rate: Arc<tokio::sync::Mutex<Option<CachedUsdNgnRate>>>,
    pub near_usd_rate: Arc<tokio::sync::Mutex<Option<CachedNearUsdRate>>>,
    pub oneclick_tokens: Arc<tokio::sync::Mutex<Option<CachedOneClickTokens>>>,
}

impl AppState {
    pub fn new(pool: PgPool, config: AppConfig) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            request_budget: Arc::new(crate::abuse::RequestBudget::default()),
            public_requests: Arc::new(tokio::sync::Semaphore::new(32)),
            usd_ngn_rate: Arc::new(tokio::sync::Mutex::new(None)),
            near_usd_rate: Arc::new(tokio::sync::Mutex::new(None)),
            oneclick_tokens: Arc::new(tokio::sync::Mutex::new(None)),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(12))
                .user_agent("WorldzPayments-NEAR-API/1.0")
                .build()
                .expect("valid reqwest client configuration"),
        }
    }
}
