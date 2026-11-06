mod api;
mod auth;
mod config;
mod error;
mod indexer;
mod models;
mod near_rpc;
mod orders;
mod shopify;
mod state;
mod webhooks;

use std::net::SocketAddr;
use std::str::FromStr;

use axum::{routing::get, Router};
use config::AppConfig;
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use state::AppState;
use tower_http::{limit::RequestBodyLimitLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let local_env = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    let _ = dotenvy::from_path(local_env).or_else(|_| dotenvy::dotenv().map(|_| ()));
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .json()
        .init();

    let config = AppConfig::from_env()?;
    let options =
        MySqlConnectOptions::from_str(&config.database_url)?.timezone("+00:00".to_owned());
    let pool = MySqlPoolOptions::new()
        .max_connections(20)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let address = SocketAddr::new(config.host, config.port);
    let state = AppState::new(pool, config);
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(api::ready))
        .nest("/v1", api::routes())
        .layer(RequestBodyLimitLayer::new(1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    webhooks::spawn_worker(state.clone());
    orders::spawn_reconciliation_worker(state.clone());
    shopify::spawn_order_sync_worker(state.clone());
    indexer::spawn_indexer_worker(state);

    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "WorldzPayments NEAR API listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
