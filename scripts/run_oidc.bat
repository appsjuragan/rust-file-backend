@echo off
echo Starting OIDC Provider (Soluto)...
set "JSON=[{\"ClientId\":\"foo\",\"ClientSecrets\":[\"bar\"],\"RedirectUris\":[\"http://localhost:3000/auth/oidc/callback\",\"http://127.0.0.1:3000/auth/oidc/callback\"],\"AllowedScopes\":[\"openid\",\"profile\",\"email\"],\"AllowedGrantTypes\":[\"authorization_code\"],\"RequirePkce\":false}]"
podman run --rm -d -p 9100:80 ^
  -e "ASPNETCORE_URLS=http://+:80" ^
  -e "SERVER_OPTIONS__AUTHORITY=http://localhost:9100" ^
  -e "CLIENTS_CONFIGURATION_INLINE=%JSON%" ^
  -e "USERS_CONFIGURATION_PATH=/tmp/users.json" ^
  -v "%~dp0oidc_users.json:/tmp/users.json" ^
  ghcr.io/soluto/oidc-server-mock:latest
echo OIDC Provider started on http://localhost:9100
