#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:-}"
IMAGE_TAG="${2:-}"
APP_DIR="/opt/crm-automation-backend"
ENV_FILE="${APP_DIR}/deploy/.env.production"
COMPOSE_FILE="${APP_DIR}/deploy/compose.production.yml"

if [[ "$SERVICE" != "backend" ]]; then
  echo "Usage: $0 backend sha-xxxxxxx" >&2
  exit 2
fi
if [[ ! "$IMAGE_TAG" =~ ^sha-[0-9a-f]{7}$ ]]; then
  echo "Refusing non-immutable image tag: $IMAGE_TAG" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  echo "Production Compose files or deploy/.env.production are missing under $APP_DIR" >&2
  echo "Prepare the production environment on EC2 before enabling automatic deployment." >&2
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

set_env_value BACKEND_IMAGE_TAG "$IMAGE_TAG"
compose config --quiet
compose pull backend backend-migrate
compose up -d --no-build backend

for attempt in $(seq 1 36); do
  if compose exec -T backend node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    echo "Backend health check passed."
    break
  fi
  if [[ "$attempt" -eq 36 ]]; then
    compose logs --tail=120 backend backend-migrate
    exit 1
  fi
  sleep 5
done

compose ps backend rabbitmq n8n caddy
echo "Deployment completed: backend=$IMAGE_TAG"
