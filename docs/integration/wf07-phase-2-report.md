# WF07 Phase 2 Report — Customer Segmentation

## 1. Scope Completed

### Files Created/Updated
- `integrations/n8n/workflows/wf07-customer-segmentation.json` — 12 business nodes, valid JSON, importable.
- `docs/integration/wf07-endpoint-mapping.md` — endpoint mapping verified against code.
- `docs/integration/wf07-api-proposal.md` — proposed Save Summary + Notification APIs + anomaly options.
- `docs/07_API_CONTRACT.md` — fixed evaluate-all endpoint to match code.
- `docs/integration/workflow-contracts.md`, `api-dependency-matrix.md`, `backend-confirmation.md`, `test-plan.md`, `blocker-register.md`, `phase-1-verification-report.md` — updated endpoint references.
- 11 mock fixtures in `test/fixtures/integration/wf07-*.mock.json`.

### 12 Business Nodes
1. Schedule Trigger — configurable schedule, no overlap.
2. Get Active Segments — `GET /api/v1/segments?isActive=true`.
3. Split Segments — per-segment independent processing.
4. Get Customer Cohort — `GET /api/v1/segments/:id/customers`.
5. Validate Evaluation Request — validates segment ID, rule definition.
6. Evaluate Segment — `POST /api/v1/segments/:id/evaluate-all` (Rule Engine authoritative).
7. Get Evaluation Statistics — reads from backend response.
8. Normalize Statistics — consistent structure, no fabrication.
9. Generate AI Insights — OpenAI, evidence-only.
10. Validate Insights — rejects ungrounded insights.
11. Save Workflow Summary — BLOCKED (no endpoint).
12. Notify Backend on Anomaly — BLOCKED (no endpoint + no approved threshold).

## 2. Verified Endpoints & DTOs

| Endpoint | Method | Controller | DTO | Response DTO | Status |
|----------|--------|-----------|-----|-------------|--------|
| `/api/v1/segments?isActive=true` | GET | `segments.controller.ts` findAll | QuerySegmentDto | PaginatedResponseDto<SegmentResponseDto> | VERIFIED |
| `/api/v1/segments/:id/customers` | GET | `segments.controller.ts` getCustomers | QuerySegmentDto | PaginatedResponseDto<CustomerResponseDto> | VERIFIED |
| `/api/v1/segments/:id/evaluate-all` | POST | `segments.controller.ts` evaluateAll | EvaluateSegmentBulkDto | EvaluateSegmentBulkResponseDto | VERIFIED |

**EvaluateSegmentBulkDto:** `assignmentType` (required, enum), `customerIds` (optional, UUID array).
**EvaluateSegmentBulkResponseDto:** `status` (string), `total` (number), `processed` (number), `matched` (number), `message` (string).

## 3. Verification Commands & Results

```
$ python3 -c "import json; d=json.load(open('...wf07-customer-segmentation.json')); assert len(d['nodes'])==12"
→ 12 nodes, valid JSON, connections verified in sequence.

$ python3 -c "validate 11 fixtures"
→ 11/11 valid JSON, all have _mock: true.

$ grep -rn "segments/evaluate-all\b" docs/ integrations/ (without :segmentId/:id)
→ 0 remaining old references.

$ grep -n "setGlobalPrefix" src/main.ts
→ 'api/v1' confirmed.
```

## 4. Blocker Register

| ID | Blocker | Workflow Node | Severity | Owner | Status |
|----|---------|--------------|----------|-------|--------|
| B8 | Save Workflow Summary endpoint not implemented | Node 11 | MEDIUM | Backend | BLOCKED |
| B10 | Notification create endpoint not implemented | Node 12 | HIGH | Backend | BLOCKED |
| B11 | Anomaly threshold not defined/approved | Node 12 | HIGH | Backend/Business | BLOCKED |
| B9 | Correlation ID not implemented (no middleware, no field) | All | HIGH | Backend | PROPOSED |
| B10b | Idempotency not implemented for segmentation | All | HIGH | Backend | PROPOSED |

## 5. Membership Consistency Evidence

- Workflow Node 6 calls `POST /api/v1/segments/:id/evaluate-all` and reads `matched` from response.
- Node 7 reads `total`, `processed`, `matched`, `message` from the same response.
- Node 8 normalizes but does NOT recalculate `matched` — it copies the backend value.
- No JavaScript code in any node computes membership, counts, or match rates from raw customer data.
- Mock fixture `wf07-membership-consistency.mock.json` asserts `matched=3` equals backend CustomerSegment records.

## 6. AI Integration Status

| Component | Status | Evidence |
|-----------|--------|----------|
| AI node type | `@n8n/n8n-nodes-langchain.openAi` | Referenced in workflow JSON |
| Model config | `={{ $env.AI_MODEL \|\| 'gpt-4o-mini' }}` | Env var, not hardcoded |
| Credential | n8n credential store (predefined) | No API key in JSON |
| Insight validation | Node 10 rejects insights where evidence field doesn't match input statistics | Code in node JS |
| Live test | NOT TESTED | Requires OpenAI credentials in n8n instance |

## 7. Correlation ID / Idempotency Status

- `workflowRunId`: Created by NestJS (WorkflowRun.id UUID). Not yet propagated to WF07.
- `correlationId`: NOT IMPLEMENTED (no field, no middleware, CORS doesn't include header).
- Idempotency: NOT IMPLEMENTED for segmentation. Only exists in lead-intelligence and data-cleaning.
- **Status:** PROPOSED only. Backend must implement.

## 8. Integration Test Steps (Remaining)

1. Import workflow JSON into n8n instance.
2. Configure HTTP Header Auth credential (CRM API base URL + JWT).
3. Configure OpenAI credential (for AI node).
4. Set `CRM_API_BASE_URL` and `AI_MODEL` env vars.
5. Run Test A (no active segments) → verify workflow ends successfully, no evaluation called.
6. Run Test B (segment no customers) → verify total=0, no fake statistics.
7. Run Test C (segment with customers) → verify request body matches DTO, membership matches backend.
8. Run Test D (membership consistency) → compare workflow output with DB CustomerSegment records.
9. Run Test E (backend timeout) → verify error branch, segment recorded as failed.
10. Run Test F (AI ungrounded insight) → verify insight rejected.
11. Run Test G/H (anomaly/no anomaly) → verify notification NOT called (API doesn't exist).
12. Run Test I (summary/notification blocked) → verify BLOCKED status reported.

## 9. Criteria for READY FOR INTEGRATION TEST

- [x] Workflow JSON valid and importable
- [x] 12 business nodes present and connected
- [x] All verified endpoints match code and contract
- [x] DTO and response structures confirmed from source
- [x] Mock fixtures created for all test scenarios
- [x] No hardcoded secrets
- [x] Contract updated to match code
- [ ] Save Summary API implemented (BLOCKED)
- [ ] Notification API implemented (BLOCKED)
- [ ] Anomaly threshold approved (BLOCKED)
- [ ] AI live-tested with OpenAI credentials (NOT TESTED)
- [ ] Correlation ID implemented (PROPOSED)
- [ ] Idempotency implemented (PROPOSED)

## 10. Questions for Backend

1. Save Summary: Use callback pattern (like UC10 data-cleaning) or dedicated endpoint?
2. Notification: What is the internal endpoint for n8n to create notifications?
3. Anomaly: What threshold/rule is approved? (matched=0? matchRate<X%? trend-based?)
4. Contract: Confirm `POST /api/v1/segments/:segmentId/evaluate-all` is the correct path.
5. Correlation ID: Will backend implement middleware + WorkflowRun field?
6. Idempotency: Will backend add idempotency checks to segmentation service?

## 11. Final Status

**PARTIALLY BLOCKED**

Reasons:
- Node 11 (Save Summary) and Node 12 (Notify) depend on APIs not yet implemented.
- Anomaly threshold not approved by business/backend.
- AI integration not live-tested.
- Correlation ID and idempotency not implemented.

Workflow structure, verified endpoints, DTOs, fixtures, and documentation are complete and ready for integration testing once blockers are resolved.

---

## 12. Live API Test Results (2026-10-29)

### Backend Status
- Backend started via `pnpm run start` (port 3000).
- Build: `pnpm run build` → exit 0.
- RabbitMQ connected, PostgreSQL connected.

### API Test Results

| Test | Endpoint | Method | Input | HTTP Status | Result |
|------|----------|--------|-------|-------------|--------|
| Get active segments | `/api/v1/segments?isActive=true&limit=3` | GET | query | 200 | ✅ Returns segment data with criteria, isActive=true |
| Get customers | `/api/v1/segments/:id/customers?limit=3` | GET | query | 200 | ✅ Returns customer data |
| Evaluate all (valid) | `/api/v1/segments/:id/evaluate-all` | POST | `{"assignmentType":"RULE"}` | 200 | ✅ `{"status":"COMPLETED","total":1,"processed":1,"matched":1,"message":"Evaluated 1 customer(s)"}` |
| Evaluate all (missing assignmentType) | `/api/v1/segments/:id/evaluate-all` | POST | `{}` | 400 | ✅ Validation error: "assignmentType must be one of..." |
| Evaluate all (non-existent segment) | `/api/v1/segments/000.../evaluate-all` | POST | `{"assignmentType":"RULE"}` | 404 | ✅ "Segment with ID ... not found" |

### Membership Consistency Evidence
- API returned `matched: 1` for a segment with 1 customer.
- Response fields match `EvaluateSegmentBulkResponseDto`: status, total, processed, matched, message.
- No node in workflow recalculates membership.

### Blocker Status (Unchanged)
- B8: Save Summary API — BLOCKED (no endpoint).
- B10/B11: Notification API + anomaly threshold — BLOCKED.
- B9: Correlation ID / idempotency — PROPOSED.
- AI live test — NOT TESTED (no OpenAI credentials).

### Final Status
**PARTIALLY BLOCKED** — 3/12 nodes depend on unimplemented APIs. Verified endpoints (3/3) work correctly with live backend. Membership consistency confirmed.

---

## 13. Blocker Investigation Results (2026-10-29)

### B8 — Save Summary API
- Searched codebase: `grep -rn "output_payload\|workflow-run.*callback\|save.*summary" src/`
- Found: `WorkflowRun` entity has `output_payload` (jsonb, nullable). Data-cleaning module uses callback pattern (`POST /data-cleaning/callback`) to store results in `WorkflowRun.output_payload`.
- No dedicated WF07 callback endpoint exists in any controller.
- **Status: BLOCKED.** Proposed: follow UC10 callback pattern (`POST /api/v1/data-cleaning/callback` → adapt for WF07).

### B10/B11 — Notification API + Anomaly Threshold
- Searched codebase: `grep -rn "create" src/modules/notifications/notifications.service.ts`
- Found: `NotificationsService.create(input: CreateNotificationInput)` exists internally but is NOT exposed via `NotificationsController` (only GET/PATCH user-facing).
- No internal endpoint for n8n to call.
- **Status: BLOCKED.** Proposed: `POST /api/v1/internal/notifications` using N8nAuthGuard.

### B9 — Correlation ID / Idempotency
- Searched: `grep -rn "correlationId\|X-Correlation" src/` → 0 results.
- Searched: `grep -rn "idempotency" src/modules/customers/` → 0 results.
- **Status: PROPOSED only.** Not implemented in code.

### n8n Access
- n8n running at http://localhost:5678 (healthz: ok).
- `N8N_API_KEY` not configured in .env → API unauthorized.
- Workflow could not be imported or tested on n8n automatically.
- **Manual import required by user.**

### AI Live Test
- OpenAI credentials not configured in n8n.
- **Status: NOT TESTED.**

### Final Status
**PARTIALLY BLOCKED** — 3/3 verified endpoints work with live backend. 3/12 workflow nodes depend on unimplemented APIs. n8n workflow could not be tested live (no API key). AI not tested. Correlation ID and idempotency not implemented.

---

## 14. UC10 Callback Pattern Investigation (2026-10-29)

### Reusable Pattern
- UC10 uses `POST /api/v1/data-cleaning/callback` with `N8nAuthGuard`.
- Callback DTO: `workflowRunId`, `status`, `summary`, `findings`, `errorMessage`.
- Service: finds WorkflowRun → updates status + outputPayload → saves → returns.
- `WorkflowRun.outputPayload` (jsonb) stores results.

### WF07 Save Summary Proposal
- Follow same pattern: `POST /api/v1/segments/:segmentId/workflow-callback` or `POST /api/v1/workflow-runs/:runId/callback`.
- DTO: `workflowRunId`, `status`, `statistics`, `aiInsights`, `anomalyDetected`, `errorMessage`.
- Files to change (if approved): new DTO, service method, controller route.
- **NOT IMPLEMENTED.** Requires backend approval.

## 15. Notification API Investigation (2026-10-29)

### Existing
- `NotificationsService.create(input)` exists internally.
- Controller: only GET/PATCH (user-facing). No POST (create).
- No internal endpoint for n8n.

### Proposed
- `POST /api/v1/internal/notifications` with `N8nAuthGuard`.
- Missing business decisions: anomaly threshold, notification recipients, type/severity levels.

## 16. Manual Import Instructions for n8n

1. Open n8n UI: http://localhost:5678
2. Workflows → Import from File → select `integrations/n8n/workflows/wf07-customer-segmentation.json`
3. Configure HTTP Header Auth credential (base URL + JWT token)
4. Configure OpenAI credential (if AI node to be tested)
5. Set env vars: `CRM_API_BASE_URL`, `AI_MODEL`
6. Save and activate

## 17. Final Status

**PARTIALLY BLOCKED** — 3/3 verified endpoints work with live backend. 3/12 workflow nodes depend on unimplemented APIs. n8n workflow could not be tested live (no API key). AI not tested. Correlation ID and idempotency not implemented. UC10 callback pattern identified as reusable for Save Summary. Notification create exists internally but not exposed as endpoint.

---

## 18. Save Summary API Implementation (2026-10-29)

### Endpoint Created
- `POST /api/v1/segments/:id/workflow-callback`
- Guard: `N8nAuthGuard` (X-N8N-API-KEY header)
- DTO: `SegmentWorkflowCallbackDto` (workflowRunId, segmentId, segmentName, status, statistics, aiInsights, rejectedInsights, anomalyDetected?, errorMessage?)
- Service: `SegmentsService.handleWorkflowCallback()` — finds WorkflowRun by ID, updates status + outputPayload, saves, returns.

### Test Results

| Test | Method | Input | HTTP Status | Result |
|------|--------|-------|-------------|--------|
| No auth | POST | valid body, no header | 401 | ✅ Unauthorized |
| Missing fields | POST | `{}` | 400 | ✅ Validation errors for all required fields |
| Non-existent workflowRunId | POST | valid body, fake UUID | 404 | ✅ "Workflow run not found" |

### Files Changed
- `src/modules/customers/dto/segment-workflow-callback.dto.ts` (new)
- `src/modules/customers/dto/index.ts` (added export)
- `src/modules/customers/segments.service.ts` (added handleWorkflowCallback method + WorkflowRun repository + imports)
- `src/modules/customers/segments.controller.ts` (added callback route + imports)
- `src/modules/customers/customers.module.ts` (added WorkflowRun to forFeature)

### n8n Configuration
- URL: `POST http://host.docker.internal:3000/api/v1/segments/{{ $json.segmentId }}/workflow-callback`
- Header: `x-n8n-api-key: <N8N_API_KEY>`
- Body:
```json
{
  "workflowRunId": "{{ $json.workflowRunId }}",
  "segmentId": "{{ $json.segmentId }}",
  "segmentName": "{{ $json.segmentName }}",
  "status": "SUCCESS",
  "statistics": {
    "total": "{{ $json.total }}",
    "processed": "{{ $json.processed }}",
    "matched": "{{ $json.matched }}",
    "unmatched": "{{ $json.unmatched }}",
    "matchRate": "{{ $json.matchRate }}"
  },
  "aiInsights": "{{ $json.aiInsights }}",
  "rejectedInsights": "{{ $json.rejectedInsights }}",
  "anomalyDetected": false
}
```

### Status
Save Summary API: IMPLEMENTED and tested (401/400/404 verified). Full success test requires a valid WorkflowRun ID (not yet created via WF07 flow).

---

## 19. Save Summary End-to-End Test (2026-10-29)

### WorkflowRun Creation
- `POST /api/v1/segments/:id/workflow-runs` → 201, returns `{workflowRunId, status: "PENDING"}`.

### Callback Test
- `POST /api/v1/segments/:id/workflow-callback` with valid WorkflowRun ID → 200, `{"success":true,"workflowRunId":"...","status":"SUCCESS"}`.

### Data Persistence Verification (PostgreSQL)
```json
{
  "id": "d5885de2-61fa-42e8-aee6-8ac54a0f9d1f",
  "workflow_name": "WF07_CUSTOMER_SEGMENTATION",
  "status": "SUCCESS",
  "output_payload": {
    "segmentId": "01364a2c-d7e7-4692-b301-11e5c9ed0683",
    "segmentName": "High Value Customers",
    "statistics": {"total":1,"processed":1,"matched":1,"unmatched":0,"matchRate":"100.00%"},
    "aiInsights": [],
    "rejectedInsights": 0,
    "anomalyDetected": false,
    "receivedAt": "2026-10-29T13:38:15.818Z"
  }
}
```

### Status
Save Summary API: IMPLEMENTED, TESTED, DATA PERSISTED ✅.

---

## 20. Workflow JSON Update (2026-10-29)

### Changes
- Node 11 (Save Workflow Summary): URL updated to `POST /api/v1/segments/:id/workflow-callback`. Body updated to match `SegmentWorkflowCallbackDto`.
- Added technical node "3b. Create WorkflowRun" after Split Segments to create WorkflowRun and get ID for callback.
- Total nodes: 13 (12 business + 1 technical).

### AI Node (Node 9)
- Uses `@n8n/n8n-nodes-langchain.openAi` node type.
- Model: `={{ $env.AI_MODEL || 'gpt-4o-mini' }}`.
- Credential: n8n OpenAI credential (user must configure).
- Google Gemini: NOT available in codebase. No Gemini node or SDK found.
- Status: NOT TESTED (no OpenAI credentials configured).

### Node 12 (Notify on Anomaly)
- Status: BLOCKED.
- Proposed anomaly conditions (need approval):
  1. `matched === 0` (no customers matched).
  2. `matchRate < 5%` (very low match rate).
  3. `matched` changed by >50% from previous run.
  4. `total === 0` (no customers to evaluate).
- Notification API: `NotificationsService.create()` exists internally but no controller endpoint.
- Proposed: `POST /api/v1/internal/notifications` with `N8nAuthGuard`.

### Final Status
**PARTIALLY BLOCKED** — Save Summary API implemented and tested with data persistence. 3/3 verification endpoints work. Build and lint pass. Node 12 (Notify) and AI node remain untested. Workflow not run end-to-end on n8n. Correlation ID and idempotency not implemented.
