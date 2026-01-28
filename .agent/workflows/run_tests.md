---
description: Run the project test suite
---
This workflow runs the full test suite for the Rust File Backend.

1. Run unit and integration tests
// turbo
cargo test

2. Run the specific API integration test (mocked S3)
// turbo
cargo test --test api_integration_test
