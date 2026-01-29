@echo off
echo Starting OIDC Provider...
podman run --rm -d -p 9100:9000 -e "REDIRECTS=http://127.0.0.1:3000/auth/oidc/callback" -e "ISSUER=http://localhost:9100" qlik/simple-oidc-provider
echo OIDC Provider started on http://localhost:9100
