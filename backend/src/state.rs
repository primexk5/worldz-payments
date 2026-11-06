use std::sync::Arc;

use reqwest::Client;
use sqlx::PgPool;

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub http: Client,
}

impl AppState {
    pub fn new(pool: PgPool, config: AppConfig) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(12))
                .user_agent("WorldzPayments-NEAR-API/1.0")
                .build()
                .expect("valid reqwest client configuration"),
        }
    }
}
