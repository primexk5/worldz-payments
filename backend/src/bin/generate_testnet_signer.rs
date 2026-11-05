use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::SigningKey;
use rand::{rngs::OsRng, RngCore};

const SEED_NAME: &str = "NEAR_TESTNET_SIGNER_SEED_BASE64";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env");
    let existing = fs::read_to_string(&env_path)?;
    let configured_seed = existing
        .lines()
        .find_map(|line| line.trim().strip_prefix(&format!("{SEED_NAME}=")))
        .map(str::trim)
        .filter(|seed| !seed.is_empty());

    let seed = if let Some(seed) = configured_seed {
        STANDARD.decode(seed)?
    } else {
        let mut generated = [0u8; 32];
        OsRng.fill_bytes(&mut generated);
        let encoded = STANDARD.encode(generated);
        let mut updated = String::new();
        let mut replaced = false;
        for line in existing.lines() {
            if line.trim_start().starts_with(&format!("{SEED_NAME}=")) {
                updated.push_str(&format!("{SEED_NAME}={encoded}"));
                replaced = true;
            } else {
                updated.push_str(line);
            }
            updated.push('\n');
        }
        if !replaced {
            updated.push_str(&format!("{SEED_NAME}={encoded}\n"));
        }
        let temp_path = env_path.with_extension("env.tmp");
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp_path)?;
        file.write_all(updated.as_bytes())?;
        file.sync_all()?;
        fs::rename(temp_path, &env_path)?;
        generated.to_vec()
    };

    let seed: [u8; 32] = seed
        .as_slice()
        .try_into()
        .map_err(|_| "TestNet signer seed must decode to 32 bytes")?;
    let signer = SigningKey::from_bytes(&seed);
    println!("signerKeyId=worldz-testnet-1");
    println!(
        "signerPublicKeyBase64={}",
        STANDARD.encode(signer.verifying_key().to_bytes())
    );
    Ok(())
}
