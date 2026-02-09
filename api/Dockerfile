# Stage 1: Cargo Chef (Prepare)
FROM lukemathwalker/cargo-chef:latest-rust-alpine AS chef
WORKDIR /app
# Install build dependencies
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
FROM alpine:latest
# Install runtime dependencies
RUN apk add --no-cache ca-certificates libgcc libstdc++ openssl tzdata

WORKDIR /app

# Copy the compiled binary from builder
COPY --from=builder /app/target/release/rust-file-backend /app/rust-file-backend

# Inject environment variables from .env.example
ENV DATABASE_URL=postgres://filebackend:filebackend@db:5432/filebackend \
    JWT_SECRET=your_super_secret_jwt_key \
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
    OIDC_CLIENT_ID=foo \
    OIDC_CLIENT_SECRET=bar \
    OIDC_REDIRECT_URL=http://localhost:3000/auth/oidc/callback \
    OIDC_SKIP_DISCOVERY=true \
    RUST_LOG=info

EXPOSE 3000
VOLUME /app/data

ENTRYPOINT ["/app/rust-file-backend"]
CMD ["--mode", "all", "--port", "3000"]
