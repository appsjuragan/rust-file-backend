# Stage 1: Build Stage
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build-time environment variables
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN bun run build

# Stage 2: Production Stage
FROM nginx:1.27-alpine

# Set working directory to nginx asset directory
WORKDIR /usr/share/nginx/html

# Clean the default assets
RUN rm -rf ./*

# Copy built assets from builder stage
COPY --from=builder /app/dist .

# Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Metadata for better maintainability
LABEL maintainer="AppsJuragan"
LABEL description="Frontend for Rust File Backend"

EXPOSE 80

# Healthcheck to ensure the container is running correctly
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

