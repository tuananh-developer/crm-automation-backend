# Backend Confirmation — WF04, WF06, WF07, WF13, WF15

> Status: PENDING_CONFIRMATION — awaiting backend team response.

## Confirmation Table

| ID | Workflow | API/Function | Expected Endpoint | Implemented? | Tested? | Contract Finalized? | Owner | Action Needed | Deadline |
|----|----------|-------------|-------------------|-------------|---------|---------------------|-------|---------------|----------|
| 1 | WF04 | Get Follow-up Context | GET `/api/v1/follow-ups/executions/:executionId` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 2 | WF04 | Execute Follow-up Step | POST `/api/v1/follow-ups/executions` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 3 | WF04 | Backend Send Message | POST `/api/v1/internal/communication/send` | No | No | No | Backend | Implement | TBD |
| 4 | WF04 | Retry Execution | POST `/api/v1/follow-ups/executions/:executionId/retry` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 5 | WF06 | Get Customer Cohort | GET `/api/v1/customers` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 6 | WF06 | Get Customer Profile | GET `/api/v1/customers/:customerId` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 7 | WF06 | Churn Assessments (GET) | GET `/api/v1/customers/:customerId/churn-assessments` | No | No | No | Backend | Implement | TBD |
| 8 | WF06 | Churn Assessments (POST) | POST `/api/v1/customers/:customerId/churn-assessments` | No | No | No | Backend | Implement | TBD |
| 9 | WF06 | Customer Tasks (GET) | GET `/api/v1/customer-tasks` | No | No | No | Backend | Implement | TBD |
| 10 | WF06 | Customer Tasks (POST) | POST `/api/v1/customer-tasks` | No | No | No | Backend | Implement | TBD |
| 11 | WF07 | Get Active Segments | GET `/api/v1/segments` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 12 | WF07 | Get Segment Detail | GET `/api/v1/segments/:segmentId` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 13 | WF07 | Evaluate Segment | POST `/api/v1/segments/:segmentId/evaluate` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 14 | WF07 | Evaluate All Segments | POST `/api/v1/segments/evaluate-all` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 15 | WF07 | Get Segment Customers | GET `/api/v1/segments/:segmentId/customers` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 16 | WF07 | Save Workflow Summary | (no endpoint found) | No | No | No | Backend | Confirm endpoint or reuse WorkflowRun | TBD |
| 17 | WF13 | Get Due Contracts | GET `/api/v1/customer-contracts/due-for-renewal` | No | No | No | Backend | Implement | TBD |
| 18 | WF13 | Get Contract Detail | GET `/api/v1/customer-contracts/:contractId` | No | No | No | Backend | Implement | TBD |
| 19 | WF13 | Create Renewal Attempt | POST `/api/v1/customer-contracts/:contractId/renewal-attempts` | No | No | No | Backend | Implement | TBD |
| 20 | WF13 | Get Renewal Attempt | GET `/api/v1/renewal-attempts/:attemptId` | No | No | No | Backend | Implement | TBD |
| 21 | WF13 | Backend Send Message | POST `/api/v1/internal/communication/send` | No | No | No | Backend | Implement | TBD |
| 22 | WF15 | Get/Patch Strategic Status | GET/PATCH `/api/v1/customers/:customerId/strategic-status` | No | No | No | Backend | Implement | TBD |
| 23 | WF15 | Get Customer Detail | GET `/api/v1/customers/:customerId` | Yes (code) | No | No | Backend | Verify + test | TBD |
| 24 | WF15 | Health Assessments (GET) | GET `/api/v1/customers/:customerId/health-assessments` | No | No | No | Backend | Implement | TBD |
| 25 | WF15 | Health Assessments (POST) | POST `/api/v1/customers/:customerId/health-assessments` | No | No | No | Backend | Implement | TBD |
| 26 | WF15 | Customer Issues | GET `/api/v1/customers/:customerId/issues` | No | No | No | Backend | Implement | TBD |
| 27 | WF15 | Customer Feedback | GET `/api/v1/customers/:customerId/feedback` | No | No | No | Backend | Implement | TBD |
| 28 | WF15 | Customer Tasks (GET) | GET `/api/v1/customer-tasks` | No | No | No | Backend | Implement | TBD |
| 29 | WF15 | Customer Tasks (POST) | POST `/api/v1/customer-tasks` | No | No | No | Backend | Implement | TBD |

## Questions for Backend Team

For each API above, the following questions must be answered:

1. Has this endpoint been run successfully in an integration environment?
2. Is JWT or service-to-service authentication required? Which role/permission?
3. What is the official request DTO and response schema?
4. Which fields are required vs optional?
5. Does the API have side effects (DB writes, events published)?
6. Does the API support idempotency? If so, how (header, body field, DB constraint)?
7. Does the API return a resource ID or processing status?
8. If not implemented, who is responsible and what is the estimated completion date?
9. Is there a test environment or approved fixture available?
10. For WF04: Is there an internal Communication API? If not, what is the approved email delivery mechanism?
11. For WF13/WF15: Are CustomerContract, CustomerTask, CustomerHealthAssessment entities planned? If so, who owns them?
12. For WF07: Is there a dedicated "save workflow summary" endpoint, or should we reuse WorkflowRun.output_payload?
