#!/bin/bash
set -e

# Automatically create n8n database if it does not already exist
N8N_DB="${N8N_DB_NAME:-crm_db}"

if [ -n "$N8N_DB" ] && [ "$N8N_DB" != "$POSTGRES_DB" ]; then
    echo "Ensuring database '$N8N_DB' exists for n8n automation..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE "$N8N_DB"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$N8N_DB')\gexec
EOSQL
fi
