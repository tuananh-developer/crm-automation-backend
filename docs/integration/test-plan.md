# Test Plan — WF04, WF06, WF07, WF13, WF15

> Phase 1: Preparation only. No tests executed against real business data.

## 1. Common Test Scenarios (All Workflows)

| # | Scenario | Applies To | Priority |
|---|----------|-----------|----------|
| 1 | Valid payload — successful processing | All | High |
| 2 | Missing required fields | All | High |
| 3 | Wrong data types | All | High |
| 4 | No token / invalid token | All | High |
| 5 | Insufficient permissions | All | Medium |
| 6 | API returns validation error | All | High |
| 7 | API returns business error | All | High |
| 8 | API timeout / network failure | All | Medium |
| 9 | Retry after transient failure | All | Medium |
| 10 | Duplicate request (idempotency) | All | High |
| 11 | Correlation ID / workflowRunId propagation | All | High |
| 12 | Response matches contract | All | High |
| 13 | No secrets in logs | All | High |
| 14 | n8n does not write directly to DB | All | High |
| 15 | Error branch does not fake success | All | High |

## 2. Workflow-Specific Test Plans

### WF04 — AI CRM Follow-up Agent

| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1 | Valid execution callback | Valid executionId + delivery result | 200, execution status updated | High |
| 2 | Missing executionId | Empty payload | 400 validation error | High |
| 3 | Invalid executionId (non-UUID) | "abc" | 400 validation error | Medium |
| 4 | Execution not found | Non-existent UUID | 404 | High |
| 5 | Duplicate callback (idempotency) | Same executionId twice | 200, no duplicate update | High |
| 6 | Communication API unavailable | Valid request, backend down | Retry + terminal failure | Medium |
| 7 | Invalid delivery result | Malformed status | 400 | Medium |
| 8 | Unauthorized callback | No service token | 401 | High |

**Note:** Communication API not implemented — cannot test end-to-end. Mock fixture required.

### WF06 — AI Churn Monitoring Agent

| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1 | Valid customer cohort | GET /customers (active) | 200, paginated list | High |
| 2 | Empty cohort | No active customers | 200, empty list | Medium |
| 3 | Churn assessment API (when implemented) | Valid customerId | 200/201, assessment created | High |
| 4 | Insufficient data | Customer with no history | 200, INSUFFICIENT_DATA | Medium |
| 5 | CustomerTask creation (when implemented) | High-risk customer | 201, task created/reused | High |
| 6 | Duplicate CustomerTask | Same idempotency key | 200/201, no duplicate | High |
| 7 | Unauthorized access | No JWT | 401 | High |

**Note:** Churn assessment and CustomerTask APIs not implemented. Cannot test end-to-end. Mock fixtures required.

### WF07 — AI Customer Segmentation Agent

| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1 | Get active segments | GET /segments | 200, segment list | High |
| 2 | Evaluate single segment | POST /segments/:id/evaluate | 200, assignment result | High |
| 3 | Evaluate all segments | POST /segments/evaluate-all | 200, bulk result | High |
| 4 | Get segment customers | GET /segments/:id/customers | 200, customer list | High |
| 5 | Segment not found | Non-existent UUID | 404 | Medium |
| 6 | Invalid segment criteria | Malformed criteria | 400 | Medium |
| 7 | Save workflow summary (when endpoint exists) | Valid summary | 200/201 | Medium |
| 8 | Notify on anomaly (when notifications exist) | Threshold exceeded | 200/201 | Low |

**Note:** Save Workflow Summary endpoint not found. Need backend confirmation.

### WF13 — AI Renewal Management Agent

| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1 | Get due contracts (when implemented) | GET /customer-contracts/due-for-renewal | 200, contract list | High |
| 2 | Get contract detail (when implemented) | GET /customer-contracts/:id | 200, contract detail | High |
| 3 | Create renewal attempt (when implemented) | POST renewal-attempts | 201, attempt created | High |
| 4 | Auto-send gate (policy check) | Various policy combinations | Correct branch (send or create task) | High |
| 5 | Backend Send Message (when implemented) | Valid message payload | 200, delivery result | High |
| 6 | Create approval task (no-send branch) | Policy denied | 201, task created | High |
| 7 | Record renewal attempt status | Valid attempt result | 200, status persisted | High |

**Note:** ALL APIs not implemented. Cannot test. Full mock fixtures required.

### WF15 — AI Account Management Agent

| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1 | Get customer detail | GET /customers/:customerId | 200, customer detail | High |
| 2 | Get/Patch strategic status (when implemented) | GET/PATCH strategic-status | 200, status updated | High |
| 3 | Health assessments (when implemented) | GET/POST health-assessments | 200/201, assessment result | High |
| 4 | Get customer issues (when implemented) | GET /customers/:customerId/issues | 200, issue list | Medium |
| 5 | Get customer feedback (when implemented) | GET /customers/:customerId/feedback | 200, feedback list | Medium |
| 6 | Customer tasks (when implemented) | GET/POST /customer-tasks | 200/201 | Medium |
| 7 | Calculate account health (when implemented) | Feature data | 200, score/level or INSUFFICIENT_DATA | High |
| 8 | Critical risk notification (when implemented) | Critical account | 201, task + notification | Medium |

**Note:** Most APIs not implemented. Cannot test. Full mock fixtures required.

## 3. Mock Fixture Rules

- Every fixture must be labeled `MOCK` in filename and content.
- Separate success and error fixtures.
- Include: valid payload, missing fields, wrong types, unauthorized, business error, timeout, duplicate request.
- No real personal data or secrets.
- Mock data must not be mistaken for production data.

### Example Fixture Names

- `wf04-success.mock.json`
- `wf04-validation-error.mock.json`
- `wf04-unauthorized.mock.json`
- `wf04-timeout.mock.json`
- `wf06-success.mock.json`
- `wf06-insufficient-data.mock.json`
- `wf07-success.mock.json`
- `wf07-anomaly.mock.json`
- `wf13-success.mock.json`
- `wf13-policy-denied.mock.json`
- `wf15-success.mock.json`
- `wf15-insufficient-data.mock.json`

### Fixture Directory

```
test/fixtures/integration/
├── wf04-success.mock.json
├── wf04-validation-error.mock.json
├── wf04-unauthorized.mock.json
├── wf04-timeout.mock.json
├── wf06-success.mock.json
├── wf06-insufficient-data.mock.json
├── wf07-success.mock.json
├── wf07-anomaly.mock.json
├── wf13-success.mock.json
├── wf13-policy-denied.mock.json
├── wf15-success.mock.json
└── wf15-insufficient-data.mock.json
```

## 4. Test Environment Requirements

- No real email sending during testing.
- No production data modification.
- Use mock data and test database only.
- Run targeted tests only (not full suite).
- Verify no secrets in logs.
- Verify n8n does not write directly to CRM DB.
- Verify error branches do not fake success.

## 5. Correlation ID / workflowRunId / Idempotency Key Test

For each workflow, verify:
- `workflowRunId` is generated by NestJS and passed to n8n.
- `correlationId` is propagated through all HTTP calls.
- `idempotencyKey` prevents duplicate processing on retry.
- Repeated event does not create duplicate records.
- Lost response + retry does not cause duplicate side effects.
