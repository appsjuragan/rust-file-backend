# Stage 1: Cargo Chef (Prepare)
FROM lukemathwalker/cargo-chef:0.1.68-rust-1.84-alpine AS chef
WORKDIR /app

# Install build dependencies
# musl-dev is required for static compilation on alpine
RUN apk add --no-cache musl-dev gcc g++ make pkgconfig openssl-dev perl

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: Build (Cook)
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# This layer caches dependencies
RUN cargo chef cook --release --recipe-path recipe.json

# Build the actual application
COPY . .
RUN cargo build --release --bin rust-file-backend

# Stage 3: Runtime
FROM alpine:3.20

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    libgcc \
    libstdc++ \
    openssl \
    tzdata \
    curl

WORKDIR /app

# Copy the compiled binary from builder
COPY --from=builder /app/target/release/rust-file-backend /app/rust-file-backend

# --- Default Environment Variables ---
# Note: These should be overridden in production via docker-compose or k8s
ENV RUST_LOG=info \
    DATABASE_URL=postgres://filebackend:filebackend@db:5432/filebackend \
    JWT_SECRET=change_me_in_production \
    MINIO_ENDPOINT=http://minio:9000 \
    MINIO_ACCESS_KEY=minioadmin \
    MINIO_SECRET_KEY=minioadmin \
    MINIO_BUCKET=uploads \
    MINIO_REGION=us-east-1 \
    MAX_FILE_SIZE=268435456 \
    UPLOADS_PER_HOUR=250 \
    ENABLE_VIRUS_SCAN=false \
    VIRUS_SCANNER_TYPE=clamav \
    CLAMAV_HOST=clamav \
    CLAMAV_PORT=3310 \
    CHUNK_SIZE=10485760 \
    OIDC_ISSUER_URL=http://keycloak:8080/realms/master \
    OIDC_CLIENT_ID=file-backend \
    OIDC_CLIENT_SECRET=change_me \
    OIDC_REDIRECT_URL=http://localhost:3000/auth/oidc/callback \
    OIDC_SKIP_DISCOVERY=true

# Create data directory and define volume
RUN mkdir -p /app/data && \
    adduser -D -u 10001 appuser && \
    chown -R appuser:appuser /app
VOLUME /app/data

# Switch to non-root user
USER appuser

# Metadata
LABEL maintainer="AppsJuragan"
LABEL description="Backend for Rust File Backend"

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/rust-file-backend"]
# Default command arguments
CMD ["--mode", "all", "--port", "3000"]

