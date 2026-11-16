#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/crm-automation-backend"
DEPLOY_DIR="$APP_DIR/deploy"
ENV_FILE="$DEPLOY_DIR/.env.production"
COMPOSE_FILE="$DEPLOY_DIR/compose.production.yml"
FRONTEND_DEFAULT="https://crm-automation-frontend.vercel.app"
IMAGE="tanhisme/crm-automation-backend:latest"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash $DEPLOY_DIR/bootstrap-ec2.sh" >&2
  exit 1
fi

for command_name in docker curl openssl awk df; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is missing: $command_name" >&2
    exit 1
  }
done

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 plugin is required." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "Docker Engine is not running or the daemon is unavailable." >&2
  exit 1
}

for required_file in "$COMPOSE_FILE" "$DEPLOY_DIR/Caddyfile" "$DEPLOY_DIR/check-env.sh" "$DEPLOY_DIR/rabbitmq/definitions.json"; do
  [[ -s "$required_file" ]] || {
    echo "Deployment bundle is incomplete: $required_file" >&2
    exit 1
  }
done

TOTAL_RAM_MIB="$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
FREE_DISK_GIB="$(df -BG --output=avail / | tail -n 1 | tr -dc '0-9')"
echo "Detected RAM: ${TOTAL_RAM_MIB} MiB"
echo "Available root disk: ${FREE_DISK_GIB} GiB"

if (( TOTAL_RAM_MIB < 4096 )); then
  echo "This Compose stack is not suitable for an EC2 instance with less than 4 GiB RAM." >&2
  echo "Resize the instance to at least 4 GiB RAM (8 GiB is recommended) before continuing." >&2
  exit 1
fi
if (( TOTAL_RAM_MIB < 6144 )); then
  echo "WARNING: less than 6 GiB RAM detected. n8n and backend may compete for memory under load."
fi
if (( FREE_DISK_GIB < 10 )); then
  echo "At least 10 GiB of free root disk is recommended before pulling production images." >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]] && ! grep -q 'REPLACE_WITH_' "$ENV_FILE"; then
  echo "An existing non-placeholder production environment file was found."
  echo "It will be preserved; no secrets will be regenerated."
  bash "$DEPLOY_DIR/check-env.sh" "$ENV_FILE"
else
  if [[ -f "$ENV_FILE" ]]; then
    cp -a "$ENV_FILE" "$ENV_FILE.example-backup.$(date -u +%Y%m%dT%H%M%SZ)"
  fi

  PUBLIC_IPV4=""
  if IMDS_TOKEN="$(curl -fsS --connect-timeout 2 -X PUT \
      -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
      http://169.254.169.254/latest/api/token 2>/dev/null)"; then
    PUBLIC_IPV4="$(curl -fsS --connect-timeout 2 \
      -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi

  if [[ -z "$PUBLIC_IPV4" ]]; then
    read -r -p "EC2 public IPv4 (prefer an Elastic IP): " PUBLIC_IPV4
  fi
  [[ "$PUBLIC_IPV4" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || {
    echo "A valid public IPv4 address is required for the nip.io defaults." >&2
    exit 1
  }

  read -r -p "API domain [api.$PUBLIC_IPV4.nip.io]: " API_DOMAIN
  API_DOMAIN="${API_DOMAIN:-api.$PUBLIC_IPV4.nip.io}"
  read -r -p "n8n domain [n8n.$PUBLIC_IPV4.nip.io]: " N8N_DOMAIN
  N8N_DOMAIN="${N8N_DOMAIN:-n8n.$PUBLIC_IPV4.nip.io}"
  read -r -p "ACME email for HTTPS certificates: " ACME_EMAIL
  read -r -p "Frontend origin [$FRONTEND_DEFAULT]: " FRONTEND_URL
  FRONTEND_URL="${FRONTEND_URL:-$FRONTEND_DEFAULT}"

  read -r -s -p "Neon PostgreSQL DATABASE_URL (input hidden): " DATABASE_URL
  echo
  [[ "$DATABASE_URL" == postgres://* || "$DATABASE_URL" == postgresql://* ]] || {
    echo "DATABASE_URL must start with postgres:// or postgresql://." >&2
    exit 1
  }
  [[ "$DATABASE_URL" == *sslmode=require* || "$DATABASE_URL" == *sslmode=verify-full* ]] || {
    echo "DATABASE_URL must include sslmode=require or sslmode=verify-full." >&2
    exit 1
  }

  read -r -s -p "Gemini API key (optional; Enter to skip, input hidden): " GEMINI_API_KEY
  echo

  LOCAL_RABBITMQ_PASSWORD="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
  N8N_API_KEY="$(openssl rand -hex 32)"
  N8N_WEBHOOK_SECRET="$(openssl rand -hex 32)"
  N8N_ENCRYPTION_KEY="$(openssl rand -hex 32)"

  umask 077
  cat > "$ENV_FILE" <<EOF
API_DOMAIN=$API_DOMAIN
N8N_DOMAIN=$N8N_DOMAIN
ACME_EMAIL=$ACME_EMAIL
FRONTEND_URL=$FRONTEND_URL
BACKEND_IMAGE_TAG=latest

DATABASE_URL=$DATABASE_URL
NODE_ENV=production
ALLOW_LOCAL_INFRA_IN_PRODUCTION=true
USE_LOCAL_DB=false
USE_LOCAL_AMQP=true
USE_CLOUD_AMQP=false
RABBITMQ_URL=
LOCAL_RABBITMQ_HOST=rabbitmq
LOCAL_RABBITMQ_PORT=5672
LOCAL_RABBITMQ_USER=crm_broker
LOCAL_RABBITMQ_PASSWORD=$LOCAL_RABBITMQ_PASSWORD

JWT_SECRET=$JWT_SECRET
N8N_API_KEY=$N8N_API_KEY
N8N_WEBHOOK_SECRET=$N8N_WEBHOOK_SECRET
N8N_ENCRYPTION_KEY=$N8N_ENCRYPTION_KEY

N8N_BASE_URL=http://n8n:5678
N8N_WEBHOOK_BASE_URL=http://n8n:5678/webhook
N8N_WF10_WEBHOOK_URL=
N8N_WF11_WEBHOOK_URL=
N8N_WF12_WEBHOOK_URL=

GEMINI_API_KEY=$GEMINI_API_KEY
GEMINI_MODEL=gemini-1.5-pro

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=no-reply@example.com
N8N_WEBHOOK_TIMEOUT_MS=45000

OBSERVE_APP_KEY=
OBSERVE_APP_SECRET=
TRANSCRIPT_EXTERNAL_PROCESSING_ENABLED=false
N8N_WORKFLOW_CLAIM_LEASE_SECONDS=1200
QUOTE_APPROVAL_THRESHOLD=0
EOF
  chmod 0600 "$ENV_FILE"
  bash "$DEPLOY_DIR/check-env.sh" "$ENV_FILE"
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "Pulling the prebuilt backend image and production service images..."
docker pull "$IMAGE"
"${COMPOSE[@]}" pull

echo "Starting production services (no local image build)..."
"${COMPOSE[@]}" up -d --no-build

echo "Waiting for backend health endpoint..."
HEALTHY=false
for attempt in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T backend node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 5
done

if [[ "$HEALTHY" != "true" ]]; then
  echo "Backend did not become healthy. Recent logs follow:" >&2
  "${COMPOSE[@]}" logs --tail=150 backend backend-migrate rabbitmq n8n caddy >&2 || true
  exit 1
fi

echo "Waiting for public HTTPS API endpoint..."
API_READY=false
for attempt in $(seq 1 24); do
  if curl -fsS --connect-timeout 5 --max-time 10 "https://$API_DOMAIN/api/v1/health" >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  sleep 5
done

if [[ "$API_READY" != "true" ]]; then
  echo "The backend is healthy internally, but public HTTPS is not ready." >&2
  echo "Check DNS/nip.io resolution and EC2 Security Group inbound TCP 80/443." >&2
  "${COMPOSE[@]}" logs --tail=100 caddy >&2 || true
  exit 1
fi

echo
echo "===== PRODUCTION STACK ====="
"${COMPOSE[@]}" ps
echo
echo "Bootstrap completed."
echo "API: https://$API_DOMAIN/api/v1/health"
echo "n8n: https://$N8N_DOMAIN"
echo "Keep N8N_ENCRYPTION_KEY safe and never delete the n8n_data volume."
echo "Do not enable ENABLE_EC2_DEPLOY until this stack has been verified."
