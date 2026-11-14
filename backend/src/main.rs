mod abuse;
mod api;
mod auth;
mod config;
mod db;
mod error;
mod indexer;
mod models;
mod near_rpc;
mod oneclick;
#[cfg(test)]
mod oneclick_db_tests;
mod orders;
#[cfg(test)]
mod orders_db_tests;
#[cfg(test)]
mod security_tests;
mod shopify;
mod state;
mod vtpass;
#[cfg(test)]
mod vtpass_db_tests;
mod webhooks;
mod workers;

use std::net::SocketAddr;

use axum::{routing::get, Router};
use config::AppConfig;
use sqlx::postgres::PgPoolOptions;
use state::AppState;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, trace::TraceLayer};
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
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations/postgres").run(&pool).await?;

    let address = SocketAddr::new(config.host, config.port);

    let cors = cors_layer(&config.cors_origins)?;

    let state = AppState::new(pool, config);
    // Keep the total at ten connections, reserving eight exclusively for HTTP.
    let worker_pool = PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&state.config.database_url)
        .await?;
    let mut worker_state = state.clone();
    worker_state.pool = worker_pool;
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(api::ready))
        .nest("/v1", api::routes())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            abuse::protect,
        ))
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    webhooks::spawn_worker(worker_state.clone());
    orders::spawn_reconciliation_worker(worker_state.clone());
    shopify::spawn_order_sync_worker(worker_state.clone());
    indexer::spawn_indexer_worker(worker_state.clone());
    oneclick::spawn_oneclick_worker(worker_state.clone());
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            interval.tick().await;
            if let Err(error) = sqlx::query("DELETE FROM auth_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '1 day'")
                .execute(&worker_state.pool).await {
                tracing::error!(%error, "rate limit cleanup deferred");
            }
        }
    });

    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "WorldzPayments NEAR API listening");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}

fn cors_layer(origins: &[String]) -> Result<CorsLayer, axum::http::header::InvalidHeaderValue> {
    use axum::http::{header, Method};
    use tower_http::cors::AllowOrigin;

    let origins = origins
        .iter()
        .map(|o| o.parse::<axum::http::HeaderValue>())
        .collect::<Result<Vec<_>, _>>()?;

    let allow_origin = if origins.is_empty() {
        // No origins configured — deny all cross-origin requests.
        AllowOrigin::list(vec![])
    } else {
        AllowOrigin::list(origins)
    };

    Ok(CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            axum::http::HeaderName::from_static("x-checkout-token"),
        ])
        .allow_credentials(true))
}
