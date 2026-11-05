use std::sync::Arc;

use reqwest::Client;
use sqlx::MySqlPool;

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub pool: MySqlPool,
    pub config: Arc<AppConfig>,
    pub http: Client,
}

impl AppState {
    pub fn new(pool: MySqlPool, config: AppConfig) -> Self {
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
