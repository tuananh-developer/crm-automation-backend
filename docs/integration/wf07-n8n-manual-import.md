# WF07 — n8n Manual Import & Test Plan

## Import Instructions

1. Open n8n UI: http://localhost:5678
2. Go to Workflows → Import from File.
3. Select: `integrations/n8n/workflows/wf07-customer-segmentation.json`
4. Configure credentials:
   - **HTTP Header Auth**: Set base URL to `http://host.docker.internal:3000/api/v1` (Docker) or `http://localhost:3000/api/v1` (local). Add header `Authorization: Bearer <JWT_TOKEN>`.
   - **OpenAI**: Add API key from OpenAI dashboard.
5. Set environment variables in n8n:
   - `CRM_API_BASE_URL` = `http://host.docker.internal:3000/api/v1` (or localhost if n8n runs locally)
   - `AI_MODEL` = `gpt-4o-mini` (optional, default)
6. Save and activate workflow.

## Node Test Plan

### Node 2 — Get Active Segments
- **Input:** Schedule trigger fires.
- **Expected Output:** JSON array of active segments with `id`, `name`, `isActive`, `criteria`.
- **PASS:** HTTP 200, `data` array present, at least one segment.
- **FAIL:** HTTP error, empty array (no active segments → workflow should end gracefully).

### Node 4 — Get Customer Cohort
- **Input:** Segment from Node 3.
- **Expected Output:** JSON array of customers with `id`, `name`, `email`, `companyName`.
- **PASS:** HTTP 200, `data` array present.
- **FAIL:** HTTP error, empty array (segment has no customers → normalize to zero, no fake data).

### Node 6 — Evaluate Segment
- **Input:** Segment ID + `{ assignmentType: "RULE" }`.
- **Expected Output:** `{"status":"COMPLETED","total":N,"processed":N,"matched":M,"message":"..."}`.
- **PASS:** HTTP 200, `matched` field present and is a number.
- **FAIL:** HTTP 400 (missing assignmentType), HTTP 404 (segment not found), HTTP 500, timeout.

### Node 7 — Get Evaluation Statistics
- **Input:** Response from Node 6.
- **Expected Output:** `{status, total, processed, matched, message, source: "backend_rule_engine"}`.
- **PASS:** All fields present, no null values for total/processed/matched.
- **FAIL:** Missing required field → throws error (correct behavior).

### Node 8 — Normalize Statistics
- **Input:** Statistics from Node 7 + segment info from Node 5.
- **Expected Output:** `{segmentId, segmentName, status, total, processed, matched, unmatched, matchRate, dataSource: "backend_rule_engine"}`.
- **PASS:** `matched` equals backend value. `unmatched = total - matched`. `matchRate` computed correctly.
- **FAIL:** `matched` differs from backend response (should never happen — no recalculation).

### Node 9 — Generate AI Insights
- **Input:** Normalized statistics from Node 8.
- **Expected Output:** JSON array of insights with `{insight, evidence, confidence}`.
- **PASS:** AI returns valid JSON, insights cite evidence fields.
- **FAIL:** AI returns invalid JSON → insights = [] (graceful fallback). AI returns ungrounded insight → rejected in Node 10.

### Node 10 — Validate Insights
- **Input:** AI response + input statistics.
- **Expected Output:** `{aiInsights: [...valid], rejectedInsights: N}`.
- **PASS:** Only insights with evidence matching input fields are kept.
- **FAIL:** All insights rejected → `aiInsights: []`, `rejectedInsights: total`.

### Node 11 — Save Workflow Summary
- **Status:** BLOCKED. No endpoint exists.
- **Expected (when implemented):** HTTP 200, `{workflowRunId, status}`.

### Node 12 — Notify on Anomaly
- **Status:** BLOCKED. No endpoint + no approved threshold.
- **Expected (when implemented):** HTTP 200/201, notification created.

## Evidence Collection
For each test run, save:
- n8n execution JSON export (from n8n UI → Execution → Download).
- HTTP status and response body for each HTTP Request node.
- Screenshot of node output (no secrets visible).

Save evidence to: `docs/integration/evidence/wf07/`
