use std::time::Duration;

#[derive(Default)]
pub struct Backoff {
    failures: u32,
}

impl Backoff {
    pub fn reset(&mut self) {
        self.failures = 0;
    }

    fn next_delay(&mut self) -> Duration {
        self.failures = self.failures.saturating_add(1);
        Duration::from_secs(
            5u64.saturating_mul(1 << self.failures.saturating_sub(1).min(6))
                .min(300),
        )
    }

    pub async fn failed(&mut self, worker: &'static str) {
        let delay = self.next_delay();
        tracing::error!(
            worker,
            failures = self.failures,
            retry_seconds = delay.as_secs(),
            "background worker failure; backing off"
        );
        tokio::time::sleep(delay).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retries_back_off_are_capped_and_reset_after_recovery() {
        let mut retry = Backoff::default();
        assert_eq!(retry.next_delay().as_secs(), 5);
        assert_eq!(retry.next_delay().as_secs(), 10);
        for _ in 0..20 {
            retry.next_delay();
        }
        assert_eq!(retry.next_delay().as_secs(), 300);
        retry.reset();
        assert_eq!(retry.next_delay().as_secs(), 5);
    }
}
