#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  echo "Copy deploy/.env.production.example to deploy/.env.production and fill it first." >&2
  exit 1
fi

if grep -q 'REPLACE_WITH_' "$ENV_FILE"; then
  echo "The production environment still contains placeholder values." >&2
  exit 1
fi

read_env() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | head -n 1
}

required_secrets=(
  LOCAL_RABBITMQ_PASSWORD
  N8N_DB_PASSWORD
  JWT_SECRET
  N8N_API_KEY
  N8N_WEBHOOK_SECRET
  N8N_ENCRYPTION_KEY
)

declare -A seen_secrets=()
for key in "${required_secrets[@]}"; do
  value="$(read_env "$key")"
  if [[ "${#value}" -lt 32 ]]; then
    echo "$key must contain at least 32 characters." >&2
    exit 1
  fi
  if [[ -n "${seen_secrets[$value]:-}" ]]; then
    echo "$key must not reuse the secret configured for ${seen_secrets[$value]}." >&2
    exit 1
  fi
  seen_secrets["$value"]="$key"
done

for key in API_DOMAIN N8N_DOMAIN FRONTEND_URL ACME_EMAIL N8N_DB_HOST N8N_DB_NAME N8N_DB_USER LOCAL_RABBITMQ_USER; do
  value="$(read_env "$key")"
  if [[ -z "$value" ]]; then
    echo "$key must be set in $ENV_FILE." >&2
    exit 1
  fi
done

if [[ "$(read_env NODE_ENV)" != "production" ]]; then
  echo "NODE_ENV must be production." >&2
  exit 1
fi
if [[ "$(read_env USE_LOCAL_DB)" != "false" || "$(read_env USE_LOCAL_AMQP)" != "true" || "$(read_env ALLOW_LOCAL_INFRA_IN_PRODUCTION)" != "true" ]]; then
  echo "Expected hybrid mode: managed PostgreSQL + private Compose RabbitMQ." >&2
  exit 1
fi
if [[ "$(read_env USE_CLOUD_AMQP)" != "false" || -n "$(read_env RABBITMQ_URL)" ]]; then
  echo "CloudAMQP settings must be empty/disabled when using private Compose RabbitMQ." >&2
  exit 1
fi
if [[ "$(read_env LOCAL_RABBITMQ_HOST)" != "rabbitmq" ]]; then
  echo "LOCAL_RABBITMQ_HOST must be rabbitmq." >&2
  exit 1
fi
if [[ "$(read_env LOCAL_RABBITMQ_USER)" == "guest" ]]; then
  echo "Do not use RabbitMQ's default guest account." >&2
  exit 1
fi

database_url="$(read_env DATABASE_URL)"
if [[ "$database_url" != postgres://* && "$database_url" != postgresql://* ]]; then
  echo "DATABASE_URL must be a PostgreSQL connection string." >&2
  exit 1
fi
if [[ "$database_url" != *sslmode=require* && "$database_url" != *sslmode=verify-full* ]]; then
  echo "DATABASE_URL must require TLS (sslmode=require or verify-full)." >&2
  exit 1
fi

frontend_url="$(read_env FRONTEND_URL)"
if [[ "$frontend_url" != https://* ]]; then
  echo "FRONTEND_URL must be the HTTPS Vercel production origin." >&2
  exit 1
fi

api_domain="$(read_env API_DOMAIN)"
n8n_domain="$(read_env N8N_DOMAIN)"
if [[ "$api_domain" == "$n8n_domain" ]]; then
  echo "API_DOMAIN and N8N_DOMAIN must be different hostnames." >&2
  exit 1
fi
if [[ "$api_domain" == *example.com* || "$n8n_domain" == *example.com* ]]; then
  echo "Replace example.com hostnames with real DNS names." >&2
  exit 1
fi

if [[ "$(read_env N8N_DB_SSL_ENABLED)" != "true" || "$(read_env N8N_DB_SSL_REJECT_UNAUTHORIZED)" != "true" ]]; then
  echo "n8n Neon PostgreSQL connections must use verified TLS." >&2
  exit 1
fi

chmod 600 "$ENV_FILE"
echo "Production environment checks passed. Secret values were not displayed."
