# Phase 3 Deployment Guide

## Prerequisites

1. Node.js 20+, pnpm.
2. PostgreSQL database configured.
3. n8n instance with API access.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `N8N_API_KEY` (or `N8N_WEBHOOK_SECRET`).
3. For production email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
4. Run `pnpm install`.
5. Run `pnpm run build`.

## Import Workflows

1. Import `integrations/n8n/workflows/wf04-follow-up-execution.json` into n8n.
2. Import `integrations/n8n/workflows/wf07-customer-segmentation.json` into n8n.
3. Configure credentials in n8n for backend API calls.

## Verification

- `pnpm run build` — should pass.
- `pnpm run lint` — should pass.
- Run follow-up tests: `npm test -- follow-up`.
- Run communication tests: `npm test -- communication`.
- Run segments tests: `npm test -- segments`.

## Production Checklist

- [ ] SMTP configured.
- [ ] N8N_API_KEY set.
- [ ] Database migrations applied.
- [ ] Anomaly threshold configured (or documented as not configured).
