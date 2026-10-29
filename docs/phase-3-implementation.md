# Phase 3 Implementation

## Architecture

- NestJS backend with modules: communication, follow-up, customers, notifications.
- n8n workflows WF04 and WF07 integrated via HTTP webhooks.
- Communication API: `POST /api/v1/communication/send` protected by `N8nAuthGuard`.
- Notifications internal endpoint: `POST /api/v1/notifications/internal/create` protected by `N8nAuthGuard`.
- WF07 callbacks: `POST /api/v1/segments/:id/workflow-runs` (201), `POST /api/v1/segments/:id/workflow-callback` (200/400/401/404).

## Endpoints

### Communication
- `POST /api/v1/communication/send` — send email (simulated in dev, real in production with SMTP).

### Notifications
- `POST /api/v1/notifications/internal/create` — create notification (internal, n8n auth required).

### Segments (WF07)
- `GET /api/v1/segments` — list segments
- `GET /api/v1/segments/:id/customers` — segment customers
- `POST /api/v1/segments/:id/evaluate-all` — evaluate all customers
- `POST /api/v1/segments/:id/workflow-runs` — create workflow run (201)
- `POST /api/v1/segments/:id/workflow-callback` — callback (200/400/401/404)

## Environment Variables

- `N8N_API_KEY` or `N8N_WEBHOOK_SECRET` — authentication for n8n webhooks.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP configuration (production).
- `NODE_ENV` — determines simulated vs real email mode.
- `OPENAI_API_KEY` — OpenAI credentials for AI node (optional, mock tests available).

## Workflow Integration

- WF04: Follow-up execution via webhook, calls Communication API.
- WF07: Customer segmentation via webhook, calls segment endpoints.

## Limitations

- Email sending is simulated in dev mode; production requires SMTP configuration.
- Anomaly threshold is configurable; not auto-configured.
- OpenAI credentials not available; AI node uses mock tests.
- No RabbitMQ consumer for correlation ID verification.
