# 11 — Workflow Ownership and Responsibility Map

## 1. Identifier namespaces

- `UC01`–`UC12`: application use cases.
- `T12-WF01`–`T12-WF15`: the fifteen Topic 12 automation workflows.

These IDs are related but not interchangeable. The canonical mapping is UC10 = Data Cleaning, UC11 = Dashboard, UC12 = Manage Users.

## 2. Accountable workflow owners

| Owner | Workflow IDs | Deliverables |
|---|---|---|
| **Tuấn Anh** | WF01, WF08, WF10, WF11, WF12 | Qualification; Data Cleaning; Next Best Action; Sales Meeting; Quote & Proposal. |
| **Trường Linh** | WF02, WF03, WF05, WF09, WF14 | Enrichment; Lead Scoring; Customer 360; Conversation Summarizer; Customer Feedback. |
| **Trọng** | WF04, WF06, WF07, WF13, WF15 | Follow-up; Churn Monitoring; Customer Segmentation; Renewal Management; Account Management. |

The accountable owner delivers the n8n JSON with exactly 12 functional nodes, backend/API contract alignment, fixtures, unit/integration checks, runtime evidence and synchronized documentation. Shared data/API/security/queue contracts require coordinated review by all affected owners.

## 3. Use-case ownership boundaries

| Use Case | Authoritative owner | Boundary |
|---|---|---|
| UC01 Lead Management | NestJS Leads service | Owns Lead CRUD/source/owner validation. |
| UC02 Qualification | Lead Intelligence/Qualification service | Owns qualification persistence and confidence-policy request; Review service owns the resulting ReviewTask. |
| UC03 Enrichment | Enrichment service | Owns provider normalization, provenance and status. |
| UC04 Scoring | Scoring policy/service | Owns canonical score, label and version. |
| UC05 Enrollment | Follow-up service | Owns sequence and enrollment lifecycle, not delivery. |
| UC06 Execution | Follow-up + Communication services | Owns one execution and delivery/retry outcome. |
| UC07 Review | ReviewTask service | Owns explicit human review/approval lifecycle. |
| UC08 Conversion | Lead-to-Customer service | Owns transactional conversion and conversion audit. |
| UC09 Segmentation | Segmentation Rule Engine | Owns criteria evaluation and membership writes. |
| UC10 Data Cleaning | Data Cleaning service | Owns scan state, finding validation and apply transaction. |
| UC11 Dashboard | Read-model/dashboard service | Reads authoritative records and does not mutate CRM data. |
| UC12 User Management | Auth/User service | Owns user lifecycle, server-side role policy and admin audit. |

## 4. Shared service ownership

- **ReviewTask:** created/deduplicated/resolved only by backend Review service.
- **CustomerTask:** operational retention/escalation/account-follow-up tasks from WF06/WF14/WF15; backend owns type/source validation, deduplication and state transitions.
- **Communication API:** all actual email/message sending; n8n does not send SMTP directly.
- **Scoring and health policies:** deterministic, versioned backend policies.
- **Segmentation:** backend Rule Engine only.
- **Price calculation:** backend catalog/pricing service only.
- **PII redaction/retention/access:** backend transcript/feedback services; the AI provider receives only minimized redacted content.
- **Events and callbacks:** RabbitMQ contract and internal service auth are owned jointly by backend and consuming workflow owners.

## 5. Workflow definition of done

1. Exact 12 functional nodes and valid connections/branches.
2. Trigger/input/output schema and canonical API/event references verified by tests.
3. Business mutations only through authenticated backend APIs.
4. Success, partial, validation, timeout, retry and terminal-failure states handled.
5. Correlation and idempotency prevent duplicate changes/tasks/sends.
6. Privacy, authorization and provenance rules are met.
7. n8n import/runtime test and backend integration test evidence recorded.
8. Owner updates the checklist/traceability row and obtains the agreed review.
