# Full-stack local Docker stack

This Compose overlay runs the complete CRM application locally:

- Frontend (Next.js)
- Backend (NestJS)
- PostgreSQL
- RabbitMQ
- n8n

The existing `docker-compose.yml` remains the infrastructure-only setup. The overlay adds the backend and frontend and routes service-to-service traffic over the Compose network.

## Prerequisites

- Docker Engine and Docker Compose v2
- GNU Make
- Both repositories checked out as siblings:

```text
~/Projects/
├── crm-automation-backend/
└── crm-automation-frontend/
```

The frontend checkout must contain the Dockerfile from [frontend PR #48](https://github.com/tuananh-developer/crm-automation-frontend/pull/48).

## Configure once

From `crm-automation-backend`:

```bash
# Only create .env when it does not already exist.
test -f .env || cp .env.example .env
nano .env
```

Fill any missing required secrets and credentials, including `GEMINI_API_KEY`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`, and `N8N_ENCRYPTION_KEY`.

**Important:** If reusing the existing `n8n_data` volume, preserve the exact existing `N8N_ENCRYPTION_KEY`. Do not overwrite an existing `.env` with `.env.example`, generate a new key, delete the volume, or run `docker compose down -v`.

For this local stack, Compose routes:
- Backend -> `postgres:5432` and `rabbitmq:5672`
- Backend -> n8n at `http://n8n:5678`
- n8n -> backend at `http://backend:3000`
- Browser frontend -> backend through `http://localhost:3000/api/v1`

The browser-facing API base URL is a build-time argument named `NEXT_PUBLIC_API_BASE_URL`. The default is suitable for local use.

## Start everything

```bash
make stack-up
```

## Open the applications

- CRM frontend: http://localhost:3001
- Backend health: http://localhost:3000/api/v1/health
- Backend Swagger: http://localhost:3000/api/docs
- n8n: http://localhost:5678
- RabbitMQ management: http://localhost:15672

## Inspect, follow logs, and stop

```bash
make stack-ps
make stack-logs
make stack-down
```

`make stack-down` stops containers but preserves PostgreSQL, RabbitMQ, and n8n named volumes. Never add `-v` unless you intentionally want to delete persistent data.

## Production boundary

This Compose overlay is for local integration testing. It does not modify Render services or migrate production data.

Render Free web services still spin down when idle. Render recommends keeping separate applications in separate services; a single Compose stack is better suited to a VPS/VM that runs Docker Compose. Moving production requires a separate review of database migration, secrets, TLS, persistent storage, backups, monitoring, and update/rollback procedures.
