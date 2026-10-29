# Phase 3 Test Plan

## Unit Tests

- Communication service: success, failure, duplicate, timeout, UNKNOWN, retry.
- Follow-up service: enrollment, duplicate handling, correlation ID propagation.
- Segments service: evaluation, callback, workflow run creation.
- Notifications service: creation, validation.

## Integration Tests

- WF04: trigger → validate → fetch context → check enrollment → prepare content → call Communication API → normalize → branch → advance/fail.
- WF07: trigger → evaluate → callback → persist WorkflowRun.
- Communication API: HTTP 200 (simulated), 401 (no auth), 400 (missing fields).

## Manual Verification

- Import workflows in n8n.
- Test Communication API with `X-N8N-API-Key` header.
- Test notification creation with anomaly alert.
- Verify simulated mode returns `simulated: true`.
- Verify production mode without SMTP returns `{success: false, error: "SMTP not configured in production"}`.

## Known Limitations

- No OpenAI credentials; AI node uses mock tests only.
- No RabbitMQ consumer for full correlation ID chain verification.
- Anomaly threshold not approved; configurable with safe fallback.
