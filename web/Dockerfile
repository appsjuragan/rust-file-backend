# Build Stage
FROM oven/bun:alpine AS builder
WORKDIR /app

# Copy package.json and bun.lock for caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build the application
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN bun run build

# Final Stage: Standard Nginx Alpine
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built assets from builder stage
COPY --from=builder /app/dist .

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
