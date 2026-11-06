# WF07 — UC10 Callback Pattern Investigation (for Save Summary API)

## UC10 Pattern (Data Cleaning)

### Controller
- File: `src/modules/data-cleaning/data-cleaning.controller.ts`
- Endpoint: `POST /api/v1/data-cleaning/callback`
- Guard: `N8nAuthGuard` (API key auth)
- DTO: `DataCleaningCallbackDto` (workflowRunId, status, summary, findings, errorMessage)

### Service
- File: `src/modules/data-cleaning/data-cleaning.service.ts`
- Method: `handleCallback(dto)`:
  1. Find WorkflowRun by ID.
  2. Set status (SUCCESS/FAILED) based on dto.status.
  3. Merge output into `workflowRun.outputPayload` (jsonb).
  4. Set `finishedAt`, `errorMessage`.
  5. Save and return `{success, workflowRunId, status}`.

### Reusable Components
- `WorkflowRun` entity (has `outputPayload` jsonb, `status`, `finishedAt`, `errorMessage`).
- `N8nAuthGuard` (API key auth for n8n).
- `WorkflowRunRepository` (TypeORM).
- Pattern: n8n POSTs callback → backend stores in WorkflowRun.output_payload.

### Proposed WF07 Save Summary Design

**Option A (Recommended):** Create dedicated callback endpoint following UC10 pattern:
- Controller: `src/modules/customers/segments.controller.ts` or new `src/modules/workflow/workflow.controller.ts`
- Endpoint: `POST /api/v1/segments/:segmentId/workflow-callback` or `POST /api/v1/workflow-runs/:runId/callback`
- Guard: `N8nAuthGuard`
- DTO: `SegmentWorkflowCallbackDto` (workflowRunId, status, statistics, aiInsights, anomalyDetected, errorMessage)
- Service: Find WorkflowRun → update status + outputPayload → save → return.

**Files to change (if approved):**
1. Create `src/modules/customers/dto/segment-workflow-callback.dto.ts`
2. Add callback method to `SegmentsService` or `WorkflowService`
3. Add callback route to `SegmentsController` or create `WorkflowController`
4. Register in module if new controller.

**NOT IMPLEMENTED YET.** Requires backend approval.

## Notification API Investigation

### Existing Module
- File: `src/modules/notifications/notifications.service.ts`
- Method: `create(input: CreateNotificationInput)` — creates notification record.
- Controller: `src/modules/notifications/notifications.controller.ts` — only GET/PATCH (user-facing). No POST (create) endpoint.
- No internal endpoint for n8n to call.

### Reusable
- `NotificationsService.create()` can be called internally.
- Need new controller endpoint: `POST /api/v1/internal/notifications` with `N8nAuthGuard`.

### Missing Business Decisions
1. Anomaly threshold: what constitutes an anomaly? (matched=0? matchRate<X%? trend-based?)
2. Who receives notification? (segment owner? admin? all users?)
3. Notification type/severity levels.
4. Whether notification is in-app only or also email (Communication API needed).

## Correlation ID / Idempotency

### Current State
- `workflowRunId`: Created by NestJS (WorkflowRun.id). Exists.
- `correlationId`: NOT implemented (no field, no middleware, no header).
- Idempotency: NOT implemented for segmentation. Only in lead-intelligence and data-cleaning.

### Proposed (NOT IMPLEMENTED)
- Add `correlationId` column to WorkflowRun entity (UUID, nullable, indexed).
- Add correlation ID middleware in `main.ts`.
- Update CORS allowedHeaders to include `X-Correlation-ID`.
- Propagate in RabbitMQ event envelope.
- n8n passes `X-Correlation-ID` in HTTP headers.

### Status: PROPOSED ONLY. No code changes made.
