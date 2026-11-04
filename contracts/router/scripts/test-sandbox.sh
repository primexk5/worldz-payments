#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."
cargo build -p worldz-near-router --target wasm32-unknown-unknown --release
WORLDZ_ROUTER_WASM="target/wasm32-unknown-unknown/release/worldz_near_router.wasm" \
  cargo test -p worldz-near-router --test sandbox -- --nocapture
