use anyhow::Result;
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user_id
    pub exp: usize,
    pub jti: String,
}

pub fn create_jwt(user_id: &str, secret: &str) -> Result<String> {
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(24))
        .expect("valid timestamp")
        .timestamp();

    let claims = Claims {
        sub: user_id.to_owned(),
        exp: expiration as usize,
        jti: uuid::Uuid::new_v4().to_string(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?;

    Ok(token)
}

pub fn validate_jwt(token: &str, secret: &str) -> Result<Claims> {
    let (decoding_key, validation) = if let Ok(public_key) = env::var("JWT_PUBLIC_KEY") {
        let mut val = Validation::new(Algorithm::RS256);
        val.validate_aud = false; // Allow any audience for generic OIDC compatibility
        (DecodingKey::from_rsa_pem(public_key.as_bytes())?, val)
    } else {
        (
            DecodingKey::from_secret(secret.as_ref()),
            Validation::default(),
        )
    };

    let token_data = decode::<Claims>(token, &decoding_key, &validation)?;

    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_cycle() {
        let secret = "test_secret";
        let user_id = "user_123";
        let token = create_jwt(user_id, secret).unwrap();
        let claims = validate_jwt(&token, secret).unwrap();
        assert_eq!(claims.sub, user_id);
    }
}
