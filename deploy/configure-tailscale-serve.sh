#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/crm-automation-backend"
ENV_FILE="$APP_DIR/deploy/.env.production"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi
if [[ ! -s "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  exit 1
fi
if ! command -v tailscale >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "Tailscale and jq must be installed on this EC2 host." >&2
  exit 1
fi

TAILSCALE_STATE="$(tailscale status --json | jq -r '.BackendState // empty')"
if [[ "$TAILSCALE_STATE" != "Running" ]]; then
  echo "Tailscale is not connected; refusing to expose the n8n editor." >&2
  tailscale status >&2 || true
  exit 1
fi

EXPECTED_DNS_NAME="$(sed -n 's/^N8N_TAILSCALE_DNS_NAME=//p' "$ENV_FILE" | head -n 1)"
ACTUAL_DNS_NAME="$(tailscale status --json | jq -r '.Self.DNSName // empty' | sed 's/\.$//')"
if [[ -z "$EXPECTED_DNS_NAME" || "$EXPECTED_DNS_NAME" != "$ACTUAL_DNS_NAME" ]]; then
  echo "Tailscale DNS name does not match production configuration." >&2
  echo "Expected: $EXPECTED_DNS_NAME" >&2
  echo "Actual:   $ACTUAL_DNS_NAME" >&2
  exit 1
fi

# Serve is tailnet-only. n8n publishes port 5678 on host loopback only.
tailscale serve --bg --https=443 --yes http://127.0.0.1:5678
tailscale serve status

echo "Private n8n Editor: https://$ACTUAL_DNS_NAME/"
