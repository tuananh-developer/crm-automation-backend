#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER must be set by the PostgreSQL image}"
: "${LOCAL_DB_USER:?LOCAL_DB_USER is required}"
: "${LOCAL_DB_PASSWORD:?LOCAL_DB_PASSWORD is required}"
: "${LOCAL_DB_NAME:?LOCAL_DB_NAME is required}"
: "${N8N_DB_USER:?N8N_DB_USER is required}"
: "${N8N_DB_PASSWORD:?N8N_DB_PASSWORD is required}"
: "${N8N_DB_NAME:?N8N_DB_NAME is required}"

valid_identifier() {
  [[ "$1" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]
}

for identifier in "$LOCAL_DB_USER" "$LOCAL_DB_NAME" "$N8N_DB_USER" "$N8N_DB_NAME"; do
  if ! valid_identifier "$identifier"; then
    echo "Invalid PostgreSQL identifier: $identifier" >&2
    exit 1
  fi
done

if [[ ${#LOCAL_DB_PASSWORD} -lt 32 || ${#N8N_DB_PASSWORD} -lt 32 ]]; then
  echo "Application and n8n database passwords must be at least 32 characters." >&2
  exit 1
fi

if [[ "$LOCAL_DB_USER" == "$N8N_DB_USER" || "$LOCAL_DB_USER" == "$POSTGRES_USER" || "$N8N_DB_USER" == "$POSTGRES_USER" ]]; then
  echo "PostgreSQL admin, CRM app, and n8n database roles must be distinct." >&2
  exit 1
fi

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_user="$LOCAL_DB_USER" \
  --set=app_password="$LOCAL_DB_PASSWORD" \
  --set=app_database="$LOCAL_DB_NAME" \
  --set=n8n_user="$N8N_DB_USER" \
  --set=n8n_password="$N8N_DB_PASSWORD" \
  --set=n8n_database="$N8N_DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_database')
\gexec

SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'n8n_user', :'n8n_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'n8n_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'n8n_database', :'n8n_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'n8n_database')
\gexec
SQL
