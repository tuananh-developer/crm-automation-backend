# WF07 Verification Evidence

## Backend Live Test (2026-10-29)

### Build
- Command: `pnpm run build`
- Result: exit 0

### Backend Start
- Command: `pnpm run start` (via background_process)
- Result: Nest application running on http://localhost:3000/api/v1
- PostgreSQL: connected
- RabbitMQ: connected

### API Tests

| # | Endpoint | Method | Input | HTTP Status | Response (truncated) |
|---|----------|--------|-------|-------------|---------------------|
| 1 | `/api/v1/segments?isActive=true&limit=3` | GET | query | 200 | `{"data":[{"id":"01364a2c...","name":"High Value Customers"...` |
| 2 | `/api/v1/segments/:id/customers?limit=3` | GET | query | 200 | `{"data":[{"id":"fa545832...","name":"Nguyen Van Test"...` |
| 3 | `/api/v1/segments/:id/evaluate-all` | POST | `{"assignmentType":"RULE"}` | 200 | `{"status":"COMPLETED","total":1,"processed":1,"matched":1,"message":"Evaluated 1 customer(s)"}` |
| 4 | `/api/v1/segments/:id/evaluate-all` | POST | `{}` | 400 | `{"message":["assignmentType must be one of..."],"error":"Bad Request","statusCode":400}` |
| 5 | `/api/v1/segments/000.../evaluate-all` | POST | `{"assignmentType":"RULE"}` | 404 | `{"message":"Segment with ID ... not found","error":"Not Found","statusCode":404}` |

### Membership Consistency
- Backend returned `matched: 1` for segment with 1 customer.
- Workflow Node 6 reads `matched` from response. No recalculation in n8n.

### n8n Access
- n8n running at http://localhost:5678 (healthz: ok)
- N8N_API_KEY not configured in .env → API access unauthorized.
- Workflow import/test on n8n could not be automated. Manual import required.

### Blocker Investigation

#### B8 — Save Summary
- Searched: `grep -rn "output_payload\|workflow-run.*callback\|save.*summary" src/`
- Found: `WorkflowRun` entity has `output_payload` (jsonb, nullable). Data-cleaning module uses callback pattern (`POST /data-cleaning/callback`) to store results.
- No dedicated WF07 callback endpoint exists.
- Status: BLOCKED. Proposed: follow UC10 callback pattern.

#### B10/B11 — Notification
- Searched: `grep -rn "createNotification\|internal.*notification" src/modules/notifications/`
- Found: `NotificationsService.create()` exists but is NOT exposed via controller (only GET/PATCH user-facing).
- No internal endpoint for n8n to call.
- Status: BLOCKED. Proposed: `POST /api/v1/internal/notifications`.

#### B9 — Correlation ID / Idempotency
- Searched: `grep -rn "correlationId\|X-Correlation" src/` → 0 results.
- Searched: `grep -rn "idempotency" src/modules/customers/` → 0 results.
- Status: PROPOSED only. Not implemented.

#### AI Live Test
- OpenAI credentials: NOT CONFIGURED in n8n.
- Status: NOT TESTED.
