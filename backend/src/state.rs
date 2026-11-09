use std::sync::Arc;

use reqwest::Client;
use sqlx::PgPool;

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub http: Client,
    pub request_budget: Arc<crate::abuse::RequestBudget>,
    pub public_requests: Arc<tokio::sync::Semaphore>,
}

impl AppState {
    pub fn new(pool: PgPool, config: AppConfig) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            request_budget: Arc::new(crate::abuse::RequestBudget::default()),
            public_requests: Arc::new(tokio::sync::Semaphore::new(32)),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(12))
                .user_agent("WorldzPayments-NEAR-API/1.0")
                .build()
                .expect("valid reqwest client configuration"),
        }
    }
}
