#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/crm-automation-backend"
DEPLOY_DIR="$APP_DIR/deploy"
ENV_FILE="$DEPLOY_DIR/.env.production"
COMPOSE_FILE="$DEPLOY_DIR/compose.production.yml"
FRONTEND_DEFAULT="https://crm-automation-frontend.vercel.app"
IMAGE="tanhisme/crm-automation-backend:latest"
TAILSCALE_HOSTNAME="crm-automation-ec2"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash $DEPLOY_DIR/bootstrap-ec2.sh" >&2
  exit 1
fi

for command_name in docker curl openssl awk df flock; do
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

for required_file in "$COMPOSE_FILE" "$DEPLOY_DIR/Caddyfile" "$DEPLOY_DIR/check-env.sh" "$DEPLOY_DIR/configure-tailscale-serve.sh" "$DEPLOY_DIR/rabbitmq/definitions.json"; do
  [[ -s "$required_file" ]] || {
    echo "Deployment bundle is incomplete: $required_file" >&2
    exit 1
  }
done

TOTAL_RAM_MIB="$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
FREE_DISK_GIB="$(df -BG --output=avail / | tail -n 1 | tr -dc '0-9')"
echo "Detected RAM: ${TOTAL_RAM_MIB} MiB"
echo "Available root disk: ${FREE_DISK_GIB} GiB"

if (( TOTAL_RAM_MIB < 3584 )); then
  echo "This CRM + n8n Compose stack needs an EC2 instance with about 4 GiB RAM minimum." >&2
  echo "Resize the instance before continuing; 8 GiB is recommended for comfortable headroom." >&2
  exit 1
fi

if (( TOTAL_RAM_MIB < 6144 )); then
  N8N_MEM_LIMIT="1280m"
  BACKEND_MEM_LIMIT="1024m"
  RABBITMQ_MEM_LIMIT="384m"
  CADDY_MEM_LIMIT="128m"
elif (( TOTAL_RAM_MIB < 8192 )); then
  N8N_MEM_LIMIT="1536m"
  BACKEND_MEM_LIMIT="1280m"
  RABBITMQ_MEM_LIMIT="512m"
  CADDY_MEM_LIMIT="128m"
else
  N8N_MEM_LIMIT="2g"
  BACKEND_MEM_LIMIT="1280m"
  RABBITMQ_MEM_LIMIT="512m"
  CADDY_MEM_LIMIT="128m"
fi
echo "Container memory limits: n8n=$N8N_MEM_LIMIT, backend=$BACKEND_MEM_LIMIT, RabbitMQ=$RABBITMQ_MEM_LIMIT, Caddy=$CADDY_MEM_LIMIT"

if (( FREE_DISK_GIB < 10 )); then
  echo "At least 10 GiB of free root disk is recommended before pulling production images." >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]] && ! grep -q 'REPLACE_WITH_' "$ENV_FILE"; then
  echo "An existing non-placeholder production environment file was found."
  echo "It will be preserved; no secrets will be regenerated."
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
  read -r -p "Public n8n webhook domain [hooks.$PUBLIC_IPV4.nip.io]: " N8N_WEBHOOK_DOMAIN
  N8N_WEBHOOK_DOMAIN="${N8N_WEBHOOK_DOMAIN:-hooks.$PUBLIC_IPV4.nip.io}"
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
N8N_WEBHOOK_DOMAIN=$N8N_WEBHOOK_DOMAIN
N8N_TAILSCALE_DNS_NAME=REPLACE_WITH_TAILSCALE_DNS_NAME
N8N_EDITOR_BASE_URL=https://REPLACE_WITH_TAILSCALE_DNS_NAME/
ACME_EMAIL=$ACME_EMAIL
FRONTEND_URL=$FRONTEND_URL
BACKEND_IMAGE_TAG=latest
N8N_MEM_LIMIT=$N8N_MEM_LIMIT
BACKEND_MEM_LIMIT=$BACKEND_MEM_LIMIT
RABBITMQ_MEM_LIMIT=$RABBITMQ_MEM_LIMIT
CADDY_MEM_LIMIT=$CADDY_MEM_LIMIT

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
fi

# Migrate an existing deployment's public n8n hostname into the webhook-only hostname.
read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | head -n 1
}

set_env_value() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

if ! grep -q '^N8N_WEBHOOK_DOMAIN=' "$ENV_FILE"; then
  LEGACY_N8N_DOMAIN="$(read_env_value N8N_DOMAIN)"
  if [[ -z "$LEGACY_N8N_DOMAIN" ]]; then
    echo "N8N_WEBHOOK_DOMAIN is missing and no legacy N8N_DOMAIN can be migrated." >&2
    exit 1
  fi
  set_env_value N8N_WEBHOOK_DOMAIN "$LEGACY_N8N_DOMAIN"
fi

# Install Tailscale on the EC2 host, not inside Docker, so Serve can proxy to loopback.
if ! command -v jq >/dev/null 2>&1; then
  apt-get update
  apt-get install -y jq
fi
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled

TAILSCALE_STATE="$(tailscale status --json 2>/dev/null | jq -r '.BackendState // empty' 2>/dev/null || true)"
if [[ "$TAILSCALE_STATE" != "Running" ]]; then
  echo
  echo "Tailscale needs to join your tailnet."
  echo "Authorize this EC2 device using the login URL printed by the next command."
  tailscale up --hostname="$TAILSCALE_HOSTNAME" --accept-dns=false || true
  for attempt in $(seq 1 120); do
    TAILSCALE_STATE="$(tailscale status --json 2>/dev/null | jq -r '.BackendState // empty' 2>/dev/null || true)"
    [[ "$TAILSCALE_STATE" == "Running" ]] && break
    sleep 5
  done
fi

if [[ "$TAILSCALE_STATE" != "Running" ]]; then
  echo "Tailscale is not connected. Complete device authorization, then rerun bootstrap." >&2
  tailscale status >&2 || true
  exit 1
fi

TAILSCALE_DNS_NAME="$(tailscale status --json | jq -r '.Self.DNSName // empty' | sed 's/\\.$//')"
if [[ -z "$TAILSCALE_DNS_NAME" ]]; then
  echo "Could not determine this EC2 node's Tailscale MagicDNS name." >&2
  exit 1
fi

set_env_value N8N_TAILSCALE_DNS_NAME "$TAILSCALE_DNS_NAME"
set_env_value N8N_EDITOR_BASE_URL "https://$TAILSCALE_DNS_NAME:8443/"
bash "$DEPLOY_DIR/check-env.sh" "$ENV_FILE"

chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "Pulling prebuilt backend and supporting service images..."
docker pull "$IMAGE"
"${COMPOSE[@]}" pull

echo "Starting production stack without building images..."
"${COMPOSE[@]}" up -d --no-build

echo "Configuring private n8n Editor access through Tailscale Serve..."
bash "$DEPLOY_DIR/configure-tailscale-serve.sh"

echo "Waiting for the backend health endpoint..."
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

echo "Waiting for the public HTTPS API endpoint..."
API_READY=false
for attempt in $(seq 1 24); do
  if curl -fsS --connect-timeout 5 --max-time 10 "https://$API_DOMAIN/api/v1/health" >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  sleep 5
done

if [[ "$API_READY" != "true" ]]; then
  echo "Backend is healthy internally, but public HTTPS is not ready." >&2
  echo "Check Security Group inbound TCP 80/443 and DNS resolution for both hostnames." >&2
  "${COMPOSE[@]}" logs --tail=100 caddy >&2 || true
  exit 1
fi

echo "Verifying that the public n8n webhook hostname does not expose the editor..."
N8N_ROOT_STATUS="$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' "https://$N8N_WEBHOOK_DOMAIN/" || true)"
if [[ "$N8N_ROOT_STATUS" != "404" ]]; then
  echo "Expected the public n8n hostname root to return 404, got: $N8N_ROOT_STATUS" >&2
  echo "The n8n editor must only be reachable through Tailscale." >&2
  "${COMPOSE[@]}" logs --tail=100 caddy n8n >&2 || true
  exit 1
fi

echo
echo "===== PRODUCTION STACK ====="
"${COMPOSE[@]}" ps
echo
echo "Bootstrap completed."
echo "API: https://$API_DOMAIN/api/v1/health"
echo "n8n Editor (Tailscale only): https://$TAILSCALE_DNS_NAME:8443/"
echo "n8n public webhook base: https://$N8N_WEBHOOK_DOMAIN/"
echo "The public webhook host returns 404 at / and only forwards webhook/form paths."
echo "Preserve N8N_ENCRYPTION_KEY and Docker volume n8n_data."
echo "Do not enable ENABLE_EC2_DEPLOY until production checks are complete."
