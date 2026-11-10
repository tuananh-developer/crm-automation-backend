# Phase 1 Checklist — WF04, WF06, WF07, WF13, WF15

> Status: Phase 1 only — survey, verify, prepare integration documentation.
> No workflow built or activated. No business logic changed.

## WF04 — AI CRM Follow-up Agent

- [ ] Checklist created for WF04
- [x] 12-node design documented (from `03_T12_15_WORKFLOWS_DESIGN.md`)
- [x] API dependencies identified and verified against controller
- [ ] API contract confirmed with backend team
- [ ] Trigger type confirmed (RabbitMQ `lead.follow_up.triggered`)
- [ ] `workflowRunId` / `correlationId` / `idempotencyKey` convention proposed
- [ ] n8n/NestJS responsibility boundary documented
- [ ] Mock fixtures prepared
- [ ] Test plan prepared
- [ ] Blockers identified

## WF06 — AI Churn Monitoring Agent

- [ ] Checklist created for WF06
- [x] 12-node design documented
- [x] API dependencies identified (2 implemented, 4 not implemented)
- [ ] API contract confirmed with backend team
- [ ] Trigger type confirmed (Schedule Trigger)
- [ ] `workflowRunId` / `correlationId` / `idempotencyKey` convention proposed
- [ ] n8n/NestJS responsibility boundary documented
- [ ] Mock fixtures prepared
- [ ] Test plan prepared
- [ ] Blockers identified (churn-assessments, customer-tasks APIs not implemented)

## WF07 — AI Customer Segmentation Agent

- [ ] Checklist created for WF07
- [x] 12-node design documented
- [x] API dependencies identified (5 implemented, 1 needs confirmation)
- [ ] API contract confirmed with backend team
- [ ] Trigger type confirmed (Schedule Trigger or authorized request)
- [ ] `workflowRunId` / `correlationId` / `idempotencyKey` convention proposed
- [ ] n8n/NestJS responsibility boundary documented
- [ ] Mock fixtures prepared
- [ ] Test plan prepared
- [ ] Blockers identified (Save Workflow Summary endpoint not found)

## WF13 — AI Renewal Management Agent

- [ ] Checklist created for WF13
- [x] 12-node design documented
- [x] API dependencies identified (0 implemented, 5 not implemented)
- [ ] API contract confirmed with backend team
- [ ] Trigger type confirmed (Schedule Trigger)
- [ ] `workflowRunId` / `correlationId` / `idempotencyKey` convention proposed
- [ ] n8n/NestJS responsibility boundary documented
- [ ] Mock fixtures prepared
- [ ] Test plan prepared
- [ ] Blockers identified (ALL APIs not implemented — CustomerContract, RenewalAttempt, Communication API)

## WF15 — AI Account Management Agent

- [ ] Checklist created for WF15
- [x] 12-node design documented
- [x] API dependencies identified (1 implemented, 7 not implemented)
- [ ] API contract confirmed with backend team
- [ ] Trigger type confirmed (Schedule Trigger)
- [ ] `workflowRunId` / `correlationId` / `idempotencyKey` convention proposed
- [ ] n8n/NestJS responsibility boundary documented
- [ ] Mock fixtures prepared
- [ ] Test plan prepared
- [ ] Blockers identified (strategic-status, health-assessments, issues, feedback, customer-tasks APIs not implemented)

## Completion Criteria

- [x] Checklist for WF04, WF06, WF07, WF13, WF15 created
- [x] API/dependency matrix created
- [x] API status (implemented vs not implemented) documented
- [ ] Backend confirmation questions answered (PENDING)
- [x] workflowRunId/correlationId/idempotencyKey convention proposed
- [x] n8n/NestJS responsibility boundary documented
- [x] Mock fixture rules documented
- [x] Credential management rules documented
- [x] Test plan prepared
- [ ] Blockers and conditions for integration start documented
- [x] No workflow built or activated

## Blockers

| # | Workflow | Blocker | Status |
|---|----------|---------|--------|
| 1 | WF04 | Communication API (`POST /api/v1/internal/communication/send`) not implemented | PENDING_BACKEND |
| 2 | WF06 | Churn assessment APIs not implemented | PENDING_BACKEND |
| 3 | WF06 | CustomerTask APIs not implemented | PENDING_BACKEND |
| 4 | WF07 | "Save Workflow Summary" endpoint not found | PENDING_BACKEND |
| 5 | WF13 | ALL APIs not implemented (contracts, renewals, communication) | PENDING_BACKEND |
| 6 | WF15 | strategic-status, health-assessments, issues, feedback, customer-tasks APIs not implemented | PENDING_BACKEND |
| 7 | All | No test environment with real data available | NEEDS_CONFIRMATION |
