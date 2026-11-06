# WF07 — Proposed Backend APIs (Save Summary + Notification)

## 1. Save Workflow Summary

**Proposed endpoint:** `POST /api/v1/workflow-runs/:workflowRunId/callback`

**Pattern:** Follow existing callback pattern (UC10 data-cleaning, UC02/UC03/UC04 lead-intelligence).

**Request DTO (proposed):**
```json
{
  "status": "SUCCESS | FAILED",
  "output": {
    "segmentId": "uuid",
    "segmentName": "string",
    "statistics": { "total": 0, "processed": 0, "matched": 0, "unmatched": 0, "matchRate": "0.00%" },
    "aiInsights": [{ "insight": "...", "evidence": "field=value", "confidence": 0.9 }],
    "rejectedInsights": 0,
    "anomalyDetected": false,
    "anomalyRule": "UNAPPROVED"
  }
}
```

**Backend behavior:**
- Find WorkflowRun by ID.
- Update `status` and `output_payload` (jsonb).
- Create AuditLog entry.
- Return `{ workflowRunId, status }`.

**Idempotency:** If WorkflowRun already has status SUCCESS, return existing result without re-processing.

## 2. Notify on Anomaly (Internal)

**Proposed endpoint:** `POST /api/v1/internal/notifications`

**Request DTO (proposed):**
```json
{
  "type": "ANOMALY_ALERT",
  "severity": "HIGH | MEDIUM | LOW",
  "title": "Segment anomaly detected",
  "message": "Segment X: 0 matched customers out of 50",
  "referenceType": "SEGMENT",
  "referenceId": "uuid",
  "workflowRunId": "uuid"
}
```

**Backend behavior:**
- Create Notification record for relevant users (segment owner, admin).
- Create AuditLog entry.
- Return `{ notificationId, status }`.

**Note:** This is an INTERNAL endpoint for n8n. Should use N8nAuthGuard (same as data-cleaning callback).

## 3. Anomaly Rule (Needs Approval)

**Current state:** No anomaly threshold defined in code or docs.

**Options for backend/business approval:**
1. `matched === 0` (no customers matched) — current placeholder in workflow.
2. `matchRate < 5%` (very low match rate).
3. `matched changed by > 50%` from previous run (trend-based).
4. `total === 0` (no customers to evaluate).

**Recommendation:** Backend defines the rule; n8n only evaluates the approved condition.

## 4. OpenAI Credential Configuration Guide

**In n8n UI:**
1. Go to Credentials → Add Credential → OpenAI.
2. Enter API Key (from OpenAI dashboard).
3. Save as "OpenAI WF07".
4. In workflow node "9. Generate AI Insights", select this credential.

**Environment variable (alternative):**
- Set `OPENAI_API_KEY` in n8n environment.
- Node uses `modelId: {{ $env.AI_MODEL || 'gpt-4o-mini' }}`.

**Security:** Never commit API keys to Git. Use n8n credential store or env vars.
