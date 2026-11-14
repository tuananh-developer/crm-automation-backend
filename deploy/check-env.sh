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
  echo "The production environment still contains placeholder secrets." >&2
  exit 1
fi

read_env() {
  local key="$1"
  local value
  value="$(sed -n "s/^$key=//p" "$ENV_FILE" | head -n 1)"
  printf '%s' "$value"
}

required_secrets=(
  POSTGRES_ADMIN_PASSWORD
  LOCAL_DB_PASSWORD
  N8N_DB_PASSWORD
  LOCAL_RABBITMQ_PASSWORD
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

for key in CRM_DOMAIN N8N_DOMAIN ACME_EMAIL POSTGRES_ADMIN_USER LOCAL_DB_USER LOCAL_DB_NAME N8N_DB_USER N8N_DB_NAME LOCAL_RABBITMQ_USER; do
  value="$(read_env "$key")"
  if [[ -z "$value" ]]; then
    echo "$key must be set in $ENV_FILE." >&2
    exit 1
  fi
done

crm_domain="$(read_env CRM_DOMAIN)"
n8n_domain="$(read_env N8N_DOMAIN)"
if [[ "$crm_domain" == "$n8n_domain" ]]; then
  echo "CRM_DOMAIN and N8N_DOMAIN must be different hostnames." >&2
  exit 1
fi
if [[ "$crm_domain" == *example.com* || "$n8n_domain" == *example.com* ]]; then
  echo "Replace the example.com hostnames with real DNS names." >&2
  exit 1
fi
if [[ "$(read_env LOCAL_DB_USER)" == "$(read_env POSTGRES_ADMIN_USER)" ]]; then
  echo "The CRM database role must differ from the PostgreSQL admin role." >&2
  exit 1
fi
if [[ "$(read_env N8N_DB_USER)" == "$(read_env POSTGRES_ADMIN_USER)" || "$(read_env N8N_DB_USER)" == "$(read_env LOCAL_DB_USER)" || "$(read_env N8N_DB_USER)" == "postgres" ]]; then
  echo "The n8n database role must be distinct from the other PostgreSQL roles." >&2
  exit 1
fi
if [[ "$(read_env LOCAL_RABBITMQ_USER)" == "guest" ]]; then
  echo "Do not use RabbitMQ's default guest account." >&2
  exit 1
fi

chmod 600 "$ENV_FILE"
echo "Production environment checks passed. Secret values were not displayed."
