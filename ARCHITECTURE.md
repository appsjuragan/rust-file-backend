# Architecture Documentation

## Overview
This project follows a modular, layered architecture inspired by Clean Architecture principles.

## Directory Structure

### `src/api`
Contains the HTTP layer (handlers, middleware, error definitions).
- `handlers/`: Request handlers grouped by domain (auth, files).
- `middleware/`: Axum middleware (auth).
- `error.rs`: Centralized `AppError` type.

### `src/services`
Contains the business logic. Services are decoupled from the HTTP layer.
- `file_service.rs`: Core file operations (upload, processing).
- `storage.rs`: S3 abstraction.
- `scanner.rs`: Virus scanner abstraction.
- `metadata.rs`: File metadata extraction.

### `src/infrastructure`
Contains infrastructure setup and configuration.
- `database.rs`: Database connection and migration.
- `storage.rs`: S3 client setup.
- `scanner.rs`: Virus scanner setup.

### `src/entities`
SeaORM entity definitions (Database layer).

### `src/utils`
Shared utilities (auth, validation).

## Error Handling
All errors are mapped to the `AppError` enum in `src/api/error.rs`. This enum implements `IntoResponse` to automatically convert errors to appropriate HTTP status codes and JSON responses.

## Dependency Injection
`AppState` holds `Arc` references to services and infrastructure components, allowing them to be injected into handlers.
