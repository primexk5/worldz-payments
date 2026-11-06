FROM rust:1.95-slim-bookworm AS builder
WORKDIR /workspace
COPY . .
RUN cargo build --release -p worldz-near-api --bin worldz-near-api

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home worldz
COPY --from=builder /workspace/target/release/worldz-near-api /usr/local/bin/worldz-near-api
USER worldz
EXPOSE 10000
CMD ["/usr/local/bin/worldz-near-api"]
