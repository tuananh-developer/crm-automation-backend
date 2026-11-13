# Full-stack local Docker stack

This overlay runs the complete CRM application locally with Docker Compose:

- Frontend (Next.js)
- Backend (NestJS)
- PostgreSQL
- RabbitMQ
- n8n

The existing `docker-compose.yml` remains the infrastructure-only setup. This file adds the backend and frontend and overrides the n8n-to-backend URL so every service communicates over the Compose network.

## Prerequisites

- Docker Engine and Docker Compose v2
- Both repositories checked out as siblings:

```text
~/Projects/
├── crm-automation-backend/
└── crm-automation-frontend/
```

The frontend repository must include its Dockerfile (see the frontend Dockerization PR).

## Configure once

From `crm-automation-backend`:

```bash
cp .env.example .env
nano .env
```

Fill the existing required secrets and credentials, including `GEMINI_API_KEY`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`, and `N8N_ENCRYPTION_KEY`.

**Important:** When reusing an existing `n8n_data` volume, keep the exact existing `N8N_ENCRYPTION_KEY`. Do not generate a new key, delete the volume, or run `docker compose down -v`.

For the full local stack, Compose overrides the backend's DB and RabbitMQ hostnames to the container service names `postgres` and `rabbitmq`, and sets n8n's backend URL to `http://backend:3000`.

## Start everything

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build
```

## Open the applications

- CRM frontend: http://localhost:3001
- Backend health: http://localhost:3000/api/v1/health
- Backend Swagger: http://localhost:3000/api/docs
- n8n: http://localhost:5678
- RabbitMQ management: http://localhost:15672

The frontend's browser-side API URL is set at image build time using `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:3000/api/v1`).

## Inspect and stop

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml ps
docker compose -f docker-compose.yml -f docker-compose.full.yml logs -f backend frontend n8n
docker compose -f docker-compose.yml -f docker-compose.full.yml down
```

Use `down` to stop the containers while preserving PostgreSQL, RabbitMQ, and n8n volumes. Do not add `-v` unless you intentionally want to delete persistent data.

## Environment boundaries

This stack is for local integration testing. It deliberately routes n8n to the local backend container and the browser frontend to localhost port 3000. It does not change Render production services or migrate production data.

Render Free web services still spin down when idle. Render does not recommend combining separate applications into a single service; production can keep using separate Render services or move to a VPS that runs this same Compose stack after a separate database, secrets, TLS, backup, and deployment review.
