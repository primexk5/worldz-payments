use std::{env, net::IpAddr};

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::SigningKey;
use worldz_near_protocol::NetworkId;

use crate::error::ApiError;

#[derive(Clone)]
pub struct NetworkConfig {
    pub rpc_url: String,
    pub rpc_fallback_urls: Vec<String>,
    pub router_id: Option<String>,
    pub fee_recipient: Option<String>,
    pub signer_key_id: String,
    pub signer: Option<SigningKey>,
    pub ft_allowlist: Vec<String>,
    pub indexer_start_height: u64,
}

#[derive(Clone)]
pub struct AppConfig {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub auth_recipient: String,
    pub auth_network_id: NetworkId,
    pub auth_challenge_ttl_seconds: i64,
    pub session_cookie_name: String,
    pub session_ttl_hours: i64,
    pub session_cookie_secure: bool,
    /// Comma-separated list of allowed CORS origins (e.g. https://app.example.com).
    /// Defaults to empty; same-origin proxy requests do not require CORS.
    pub cors_origins: Vec<String>,
    pub webhook_signing_secret: Option<String>,
    pub shopify_api_key: Option<String>,
    pub shopify_api_secret: Option<String>,
    pub shopify_app_url: Option<String>,
    pub shopify_checkout_url: Option<String>,
    pub shopify_token_encryption_key: Option<[u8; 32]>,
    pub vtpass_api_key: Option<String>,
    pub vtpass_public_key: Option<String>,
    pub vtpass_secret_key: Option<String>,
    pub vtpass_data_encryption_key: Option<[u8; 32]>,
    pub testnet: NetworkConfig,
    pub mainnet: NetworkConfig,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ApiError> {
        let testnet = network_config(
            NetworkId::Testnet,
            "TESTNET",
            "https://archival-rpc.testnet.fastnear.com",
        )?;
        let mainnet = network_config(
            NetworkId::Mainnet,
            "MAINNET",
            "https://rpc.mainnet.near.org",
        )?;

        let config = Self {
            host: value("APP_HOST", "127.0.0.1")
                .parse()
                .map_err(|_| ApiError::configuration("APP_HOST must be an IP address"))?,
            port: parse("APP_PORT", 8080u16)?,
            database_url: required("DATABASE_URL")?,
            auth_recipient: required("AUTH_RECIPIENT")?,
            auth_network_id: match value("AUTH_NETWORK_ID", "testnet").as_str() {
                "testnet" => NetworkId::Testnet,
                "mainnet" => NetworkId::Mainnet,
                _ => {
                    return Err(ApiError::configuration(
                        "AUTH_NETWORK_ID must be testnet or mainnet",
                    ))
                }
            },
            auth_challenge_ttl_seconds: parse("AUTH_CHALLENGE_TTL_SECONDS", 300i64)?,
            session_cookie_name: value("SESSION_COOKIE_NAME", "worldz_session"),
            session_ttl_hours: parse("SESSION_TTL_HOURS", 168i64)?,
            session_cookie_secure: parse("SESSION_COOKIE_SECURE", true)?,
            cors_origins: parse_cors_origins(&optional("CORS_ORIGINS").unwrap_or_default()),
            webhook_signing_secret: env::var("WEBHOOK_SIGNING_SECRET")
                .ok()
                .filter(|secret| !secret.is_empty()),
            shopify_api_key: optional("SHOPIFY_API_KEY"),
            shopify_api_secret: optional("SHOPIFY_API_SECRET"),
            shopify_app_url: optional("SHOPIFY_APP_URL"),
            shopify_checkout_url: optional("SHOPIFY_CHECKOUT_URL"),
            shopify_token_encryption_key: optional("SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64")
                .map(|key| {
                    let decoded = STANDARD.decode(key).map_err(|_| {
                        ApiError::configuration(
                            "SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64 must be base64",
                        )
                    })?;
                    decoded.try_into().map_err(|_| {
                        ApiError::configuration(
                            "SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64 must decode to 32 bytes",
                        )
                    })
                })
                .transpose()?,
            vtpass_api_key: optional("VTPASS_API_KEY"),
            vtpass_public_key: optional("VTPASS_PUBLIC_KEY"),
            vtpass_secret_key: optional("VTPASS_SECRET_KEY"),
            vtpass_data_encryption_key: optional("VTPASS_DATA_ENCRYPTION_KEY_BASE64")
                .map(|key| {
                    let decoded = STANDARD.decode(key).map_err(|_| {
                        ApiError::configuration("VTPASS_DATA_ENCRYPTION_KEY_BASE64 must be base64")
                    })?;
                    decoded.try_into().map_err(|_| {
                        ApiError::configuration(
                            "VTPASS_DATA_ENCRYPTION_KEY_BASE64 must decode to 32 bytes",
                        )
                    })
                })
                .transpose()?,
            testnet,
            mainnet,
        };
        if config.auth_challenge_ttl_seconds <= 0 || config.auth_challenge_ttl_seconds > 900 {
            return Err(ApiError::configuration(
                "AUTH_CHALLENGE_TTL_SECONDS must be between 1 and 900",
            ));
        }
        if config.session_ttl_hours <= 0 || config.session_ttl_hours > 720 {
            return Err(ApiError::configuration(
                "SESSION_TTL_HOURS must be between 1 and 720",
            ));
        }
        if config.session_cookie_name.is_empty()
            || !config
                .session_cookie_name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        {
            return Err(ApiError::configuration("SESSION_COOKIE_NAME is invalid"));
        }
        if config
            .webhook_signing_secret
            .as_ref()
            .is_some_and(|secret| secret.len() < 32)
        {
            return Err(ApiError::configuration(
                "WEBHOOK_SIGNING_SECRET must contain at least 32 characters",
            ));
        }
        let vtpass_credentials = [
            config.vtpass_api_key.is_some(),
            config.vtpass_public_key.is_some(),
            config.vtpass_secret_key.is_some(),
        ];
        if vtpass_credentials.iter().any(|configured| *configured)
            && (!vtpass_credentials.iter().all(|configured| *configured)
                || config.vtpass_data_encryption_key.is_none())
        {
            return Err(ApiError::configuration(
                "VTpass requires VTPASS_API_KEY, VTPASS_PUBLIC_KEY, VTPASS_SECRET_KEY, and VTPASS_DATA_ENCRYPTION_KEY_BASE64",
            ));
        }
        let shopify_configured = config.shopify_api_key.is_some()
            || config.shopify_api_secret.is_some()
            || config.shopify_app_url.is_some()
            || config.shopify_checkout_url.is_some()
            || config.shopify_token_encryption_key.is_some();
        if shopify_configured
            && (config.shopify_api_key.is_none()
                || config.shopify_api_secret.is_none()
                || config.shopify_app_url.is_none()
                || config.shopify_checkout_url.is_none()
                || config.shopify_token_encryption_key.is_none())
        {
            return Err(ApiError::configuration(
                "Shopify requires SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SHOPIFY_CHECKOUT_URL, and SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64",
            ));
        }
        if let Some(app_url) = config.shopify_app_url.as_deref() {
            let parsed = url::Url::parse(app_url)
                .map_err(|_| ApiError::configuration("SHOPIFY_APP_URL is invalid"))?;
            if parsed.scheme() != "https" || parsed.host_str().is_none() {
                return Err(ApiError::configuration(
                    "SHOPIFY_APP_URL must be an HTTPS URL",
                ));
            }
        }
        if let Some(checkout_url) = config.shopify_checkout_url.as_deref() {
            let parsed = url::Url::parse(checkout_url)
                .map_err(|_| ApiError::configuration("SHOPIFY_CHECKOUT_URL is invalid"))?;
            if parsed.scheme() != "https" || parsed.host_str().is_none() {
                return Err(ApiError::configuration(
                    "SHOPIFY_CHECKOUT_URL must be an HTTPS URL",
                ));
            }
        }
        Ok(config)
    }

    pub fn network(&self, network_id: NetworkId) -> &NetworkConfig {
        match network_id {
            NetworkId::Testnet => &self.testnet,
            NetworkId::Mainnet => &self.mainnet,
        }
    }
}

fn normalize_cors_origin(origin: &str) -> Result<String, ApiError> {
    let url = url::Url::parse(origin)
        .map_err(|_| ApiError::configuration("CORS_ORIGINS must contain exact HTTP(S) origins"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_some_and(|host| host.contains('*'))
    {
        return Err(ApiError::configuration(
            "CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards",
        ));
    }
    Ok(url.origin().ascii_serialization())
}

fn parse_cors_origins(raw: &str) -> Vec<String> {
    let mut origins = Vec::new();
    for entry in raw
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
    {
        match normalize_cors_origin(entry) {
            Ok(origin) if !origins.contains(&origin) => origins.push(origin),
            Ok(_) => {}
            Err(_) => {
                // Do not log the raw value: a malformed URL may contain credentials.
                // An invalid entry grants no browser access, while same-origin proxy
                // traffic remains available even if the entire allowlist is invalid.
                tracing::warn!("Ignoring invalid CORS_ORIGINS entry; no browser access granted for it. Use comma-separated HTTP(S) origins without paths, credentials, or wildcards.");
            }
        }
    }
    origins
}

#[cfg(test)]
mod cors_tests {
    use super::{normalize_cors_origin, parse_cors_origins};
    #[test]
    fn cors_origins_are_exact_and_cannot_include_credentials_or_wildcards() {
        for valid in [
            "https://worldz-payments.vercel.app",
            "http://localhost:3000",
        ] {
            assert!(normalize_cors_origin(valid).is_ok());
        }
        for invalid in [
            "*",
            "null",
            "https://*.example.com",
            "https://user:password@example.com",
            "https://example.com/path",
            "https://example.com?x=y",
            "https://example.com/#fragment",
            "file:///tmp",
        ] {
            assert!(normalize_cors_origin(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn cors_normalizes_root_slashes_case_and_default_ports() {
        assert_eq!(
            normalize_cors_origin("https://Worldz-Payments.Vercel.App:443/").unwrap(),
            "https://worldz-payments.vercel.app"
        );
        assert_eq!(
            normalize_cors_origin("http://localhost:3000/").unwrap(),
            "http://localhost:3000"
        );
        assert_eq!(
            parse_cors_origins(
                " https://example.com/,https://EXAMPLE.com:443,http://localhost:3000/ "
            ),
            ["https://example.com", "http://localhost:3000"]
        );
    }

    #[test]
    fn invalid_cors_entries_grant_no_access_and_do_not_abort_startup() {
        assert!(parse_cors_origins(
            "*,null,https://user:secret@example.com,https://example.com/path"
        )
        .is_empty());
        assert_eq!(
            parse_cors_origins("*, https://example.com/, https://example.com/path"),
            ["https://example.com"]
        );
        assert!(parse_cors_origins("").is_empty());
    }
}

fn network_config(
    id: NetworkId,
    prefix: &str,
    default_rpc: &str,
) -> Result<NetworkConfig, ApiError> {
    let key = format!("NEAR_{prefix}_SIGNER_SEED_BASE64");
    let signer = env::var(&key)
        .ok()
        .filter(|seed| !seed.is_empty())
        .map(|seed| {
            let bytes = STANDARD
                .decode(seed)
                .map_err(|_| ApiError::configuration(format!("{key} must be base64")))?;
            let seed: [u8; 32] = bytes
                .try_into()
                .map_err(|_| ApiError::configuration(format!("{key} must decode to 32 bytes")))?;
            Ok::<_, ApiError>(SigningKey::from_bytes(&seed))
        })
        .transpose()?;

    let rpc_url = value(&format!("NEAR_{prefix}_RPC_URL"), default_rpc);
    validate_rpc_url(&rpc_url, &format!("NEAR_{prefix}_RPC_URL"))?;
    let rpc_fallback_urls = optional(&format!("NEAR_{prefix}_RPC_FALLBACK_URLS"))
        .unwrap_or_else(|| default_fallbacks(id).to_owned())
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != rpc_url)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for url in &rpc_fallback_urls {
        validate_rpc_url(url, &format!("NEAR_{prefix}_RPC_FALLBACK_URLS"))?;
    }
    let router_id = optional(&format!("NEAR_{prefix}_ROUTER_ID"));
    let fee_recipient = optional(&format!("NEAR_{prefix}_FEE_RECIPIENT"));
    for (key, account) in [
        (format!("NEAR_{prefix}_ROUTER_ID"), router_id.as_deref()),
        (
            format!("NEAR_{prefix}_FEE_RECIPIENT"),
            fee_recipient.as_deref(),
        ),
    ] {
        if let Some(account) = account {
            account.parse::<near_account_id::AccountId>().map_err(|_| {
                ApiError::configuration(format!("{key} is not a valid NEAR account ID"))
            })?;
        }
    }
    let signer_key_id = value(
        &format!("NEAR_{prefix}_SIGNER_KEY_ID"),
        if matches!(id, NetworkId::Testnet) {
            "worldz-testnet-1"
        } else {
            "worldz-mainnet-1"
        },
    );
    if signer_key_id.is_empty() || signer_key_id.len() > 64 {
        return Err(ApiError::configuration(format!(
            "NEAR_{prefix}_SIGNER_KEY_ID must contain 1 to 64 characters"
        )));
    }
    let ft_allowlist = optional(&format!("NEAR_{prefix}_FT_ALLOWLIST"))
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for account in &ft_allowlist {
        account.parse::<near_account_id::AccountId>().map_err(|_| {
            ApiError::configuration(format!(
                "NEAR_{prefix}_FT_ALLOWLIST contains invalid account ID {account}"
            ))
        })?;
    }

    Ok(NetworkConfig {
        rpc_url,
        rpc_fallback_urls,
        router_id,
        fee_recipient,
        signer_key_id,
        signer,
        ft_allowlist,
        indexer_start_height: parse(&format!("NEAR_{prefix}_INDEXER_START_HEIGHT"), 0u64)?,
    })
}

fn default_fallbacks(network_id: NetworkId) -> &'static str {
    match network_id {
        NetworkId::Testnet => {
            "https://near-testnet.drpc.org,https://testnet-rpc.intea.rs,https://test.rpc.fastnear.com,https://rpc.testnet.near.org"
        }
        NetworkId::Mainnet => {
            "https://rpc.intea.rs,https://free.rpc.fastnear.com,https://archival-rpc.mainnet.near.org"
        }
    }
}

fn validate_rpc_url(value: &str, key: &str) -> Result<(), ApiError> {
    let parsed = url::Url::parse(value)
        .map_err(|_| ApiError::configuration(format!("{key} contains an invalid URL")))?;
    if !matches!(parsed.scheme(), "https" | "http") || parsed.host_str().is_none() {
        return Err(ApiError::configuration(format!(
            "{key} must contain HTTP(S) URLs"
        )));
    }
    Ok(())
}

fn required(key: &str) -> Result<String, ApiError> {
    optional(key).ok_or_else(|| ApiError::configuration(format!("{key} is required")))
}

fn optional(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}

fn value(key: &str, default: &str) -> String {
    optional(key).unwrap_or_else(|| default.to_owned())
}

fn parse<T: std::str::FromStr>(key: &str, default: T) -> Result<T, ApiError> {
    optional(key)
        .map(|value| {
            value
                .parse()
                .map_err(|_| ApiError::configuration(format!("{key} has an invalid value")))
        })
        .unwrap_or(Ok(default))
}
