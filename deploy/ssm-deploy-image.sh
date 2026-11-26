#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:-}"
IMAGE_TAG="${2:-}"
APP_DIR="/opt/crm-automation-backend"
ENV_FILE="$APP_DIR/deploy/.env.production"
COMPOSE_FILE="$APP_DIR/deploy/compose.production.yml"

if [[ "$SERVICE" != "backend" ]]; then
  echo "Usage: $0 backend sha-xxxxxxx" >&2
  exit 2
fi
if [[ ! "$IMAGE_TAG" =~ ^sha-[0-9a-f]{7}$ ]]; then
  echo "Refusing non-immutable image tag: $IMAGE_TAG" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  echo "Production environment or Compose configuration is missing." >&2
  echo "Run deploy/bootstrap-ec2.sh once before enabling automatic deployment." >&2
  exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (the SSM workflow invokes it with sudo)." >&2
  exit 1
fi

exec 9>/var/lock/crm-automation-deploy.lock
flock 9

set_env_value() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Deploying backend image tag: $IMAGE_TAG"
set_env_value BACKEND_IMAGE_TAG "$IMAGE_TAG"

if ! compose config --quiet; then
  echo "Compose configuration validation failed." >&2
  exit 1
fi

if ! compose pull backend backend-migrate; then
  echo "Failed to pull the requested backend image." >&2
  exit 1
fi

if ! compose up -d --no-build backend n8n caddy; then
  echo "Backend deployment, database migration, or proxy/automation restart failed. Recent logs:" >&2
  compose logs --tail=160 backend-migrate backend n8n caddy >&2 || true
  exit 1
fi

# Caddyfile is bind-mounted and the admin API is disabled; restart it to load updated config.
if ! compose restart caddy; then
  echo "Caddy restart failed after deployment config update." >&2
  compose logs --tail=100 caddy >&2 || true
  exit 1
fi

bash "$APP_DIR/deploy/configure-tailscale-serve.sh"

echo "Waiting for backend health endpoint..."
for attempt in $(seq 1 60); do
  if compose exec -T backend node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
    echo "Backend health check passed."
    compose ps backend backend-migrate rabbitmq n8n caddy
    echo "Deployment completed: backend=$IMAGE_TAG"
    exit 0
  fi
  sleep 5
done

echo "Backend did not become healthy. Recent logs:" >&2
compose logs --tail=160 backend-migrate backend >&2 || true
exit 1
