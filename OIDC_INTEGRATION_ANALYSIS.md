# Deep Analysis: OIDC Integration for Rust File Backend

## Objective
Enable users to log in using an OpenID Connect (OIDC) provider (specifically `qlik/simple-oidc-provider` for testing) and automatically create user accounts in the backend if they don't exist.

## 1. Architecture Analysis

### Current Authentication
- **Method**: Username + Password
- **Storage**: `users` table (id, username, password_hash)
- **Session**: JWT Tokens stored in `tokens` table

### Proposed OIDC Flow
1.  **User Action**: User clicks "Login with OIDC" on the frontend.
2.  **Redirect**: Backend constructs an authorization URL and redirects the user to the OIDC Provider.
3.  **Authentication**: User logs in at the Provider.
4.  **Callback**: Provider redirects back to Backend (`/auth/oidc/callback`) with an authorization `code`.
5.  **Exchange**: Backend exchanges `code` for `id_token` and `access_token`.
6.  **Validation**: Backend validates the `id_token` (signature, issuer, audience).
7.  **User Resolution**:
    *   Extract `sub` (subject) and `email`/`name` from `id_token`.
    *   Check `users` table for a matching OIDC subject.
    *   **If found**: Log the user in (issue Backend JWT).
    *   **If not found**: Create a new user record linked to this OIDC subject, then log them in.

## 2. Database Schema Changes

To support OIDC, the `users` table needs to be extended to store the OIDC identity.

```sql
ALTER TABLE users ADD COLUMN oidc_sub VARCHAR(255) UNIQUE DEFAULT NULL;
ALTER TABLE users ADD COLUMN email VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL; -- Password not needed for OIDC users
```

## 3. Implementation Steps

### A. Dependencies
Add the `openidconnect` crate to `Cargo.toml`:
```toml
[dependencies]
openidconnect = "3.0"
```

### B. Configuration
Add OIDC configuration to `.env`:
```env
OIDC_ISSUER_URL=http://localhost:9000
OIDC_CLIENT_ID=foo
OIDC_CLIENT_SECRET=bar
OIDC_REDIRECT_URL=http://localhost:8080/auth/oidc/callback
```

### C. New Handlers (`src/api/handlers/auth.rs`)

#### 1. `login_oidc`
Constructs the OIDC client and generates the authorization URL.

```rust
pub async fn login_oidc(State(state): State<AppState>) -> impl IntoResponse {
    let client = get_oidc_client(&state.config).await;
    let (auth_url, _csrf_token, _nonce) = client
        .authorize_url(
            CoreAuthenticationFlow::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();

    Redirect::to(auth_url.as_str())
}
```

#### 2. `callback_oidc`
Handles the callback, exchanges code, and manages user creation.

```rust
pub async fn callback_oidc(
    State(state): State<AppState>,
    Query(params): Query<AuthCallbackParams>,
) -> Result<Json<AuthResponse>, AppError> {
    let client = get_oidc_client(&state.config).await;
    
    // Exchange code for token
    let token_response = client
        .exchange_code(AuthorizationCode::new(params.code))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::Internal(format!("Token exchange failed: {}", e)))?;

    let id_token = token_response.id_token()
        .ok_or_else(|| AppError::Internal("No ID token received".to_string()))?;

    // Validate ID Token
    let claims = id_token.claims(&client.id_token_verifier(), &Nonce::new_random())
        .map_err(|e| AppError::Internal(format!("Invalid ID token: {}", e)))?;

    let oidc_sub = claims.subject().as_str();
    let email = claims.email().map(|e| e.as_str()).unwrap_or("");
    let username = claims.preferred_username().map(|n| n.as_str()).unwrap_or(email);

    // Find or Create User
    let user = find_or_create_oidc_user(&state.db, oidc_sub, username, email).await?;

    // Issue Backend JWT (same as standard login)
    let token = issue_jwt(&user, &state.config)?;

    Ok(Json(AuthResponse { token }))
}
```

## 4. Testing with `qlik/simple-oidc-provider`

Since `podman` failed, you can run the provider using Docker Desktop or a standard Docker installation:

```bash
docker run -d -p 9000:9000 --name oidc-provider qlik/simple-oidc-provider
```

**Default Configuration for `simple-oidc-provider`:**
- **Issuer**: `http://localhost:9000`
- **Client ID**: `foo`
- **Client Secret**: `bar`
- **Discovery URL**: `http://localhost:9000/.well-known/openid-configuration`

## 5. Security Considerations
- **State Parameter**: Ensure CSRF protection by validating the `state` parameter in the callback (omitted above for brevity but essential for production).
- **HTTPS**: In production, the OIDC provider and your backend MUST use HTTPS.
- **Token Storage**: Store the backend JWT securely on the client (HttpOnly cookie recommended).

