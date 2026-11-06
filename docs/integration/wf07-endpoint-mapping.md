# WF07 Customer Segmentation — Endpoint Mapping

## Verified Endpoints

| Node | Endpoint (Code) | Method | DTO | Response | Status |
|------|----------------|--------|-----|----------|--------|
| 2. Get Active Segments | `/api/v1/segments?isActive=true` | GET | QuerySegmentDto | PaginatedResponseDto<SegmentResponseDto> | VERIFIED |
| 4. Get Customer Cohort | `/api/v1/segments/:id/customers` | GET | QuerySegmentDto | PaginatedResponseDto<CustomerResponseDto> | VERIFIED |
| 6. Evaluate Segment | `/api/v1/segments/:id/evaluate-all` | POST | EvaluateSegmentBulkDto { assignmentType: RULE } | EvaluateSegmentBulkResponseDto { status, total, processed, matched, message } | VERIFIED |

## Blocked Endpoints

| Node | Endpoint (Contract) | Status | Blocker |
|------|-------------------|--------|---------|
| 11. Save Workflow Summary | `POST /api/v1/workflow-runs/:runId/callback` (proposed) | NOT_IMPLEMENTED | No workflow-run controller exists. Pattern: n8n callback → backend stores in WorkflowRun.output_payload (as in data-cleaning UC10) |
| 12. Notify Backend on Anomaly | `POST /api/v1/notifications` or internal endpoint | NOT_IMPLEMENTED | NotificationsController only has GET/PATCH (user-facing). No internal create-notification endpoint for n8n |

## Contract Discrepancy

| Item | Contract (07_API_CONTRACT.md) | Code (segments.controller.ts) | Resolution |
|------|------------------------------|------------------------------|------------|
| Evaluate all | `POST /api/v1/segments/evaluate-all` | `POST /api/v1/segments/:id/evaluate-all` | **CODE IS CORRECT** — segment ID required in path. Contract needs update. |

## Notes
- Node 12 anomaly check uses `matched === 0` as placeholder. Backend must define anomaly threshold. Marked as UNAPPROVED in workflow.
- AI node (Node 9) uses OpenAI node type; requires `AI_MODEL` env var and OpenAI credentials in n8n.
- Notification node (Node 12) is an IF node only — actual notification API call is BLOCKED pending backend implementation.
