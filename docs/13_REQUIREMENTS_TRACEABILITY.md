# 13 — Requirements-to-Workflow Traceability

`workflow-traceability.csv` is the row-level matrix used to connect each workflow to its owner, trigger, canonical contract, output, data model and acceptance evidence. This document defines the interpretation of those rows.

| Workflow | Main entities / result | Primary trigger or source | Required acceptance evidence |
|---|---|---|---|
| WF01 | LeadQualification, WorkflowRun, ReviewTask | `lead.qualification.requested` | 12-node JSON, 0.80 boundary test, duplicate callback test |
| WF02 | LeadEnrichment, WorkflowRun | `lead.enrichment.requested` | Provider provenance, mock label, SUCCESS/PARTIAL/FAILED tests |
| WF03 | LeadScore, WorkflowRun | `lead.scoring.requested` | Backend score policy, threshold and policy-version tests |
| WF04 | FollowUpExecution, enrollment, Notification/delivery records | `lead.follow_up.triggered` | Required executionId, exactly-once behavior, failure/retry/no-advance tests |
| WF05 | Customer/Lead and linked activity/insight records | Authenticated NestJS request | Source coverage and explicit no-data behavior |
| WF06 | CustomerChurnAssessment, CustomerTask | Scheduled cohort scan | Churn bands, history, insufficient data and task deduplication |
| WF07 | Segment, CustomerSegment | Scheduled or authorized request | Backend Rule Engine remains authoritative |
| WF08 | WorkflowRun, AuditLog and Lead | `data.cleaning.requested` | stale/unsafe/unauthorized/rejected and approved-apply tests |
| WF09 | ConversationTranscript, ConversationSummary, ConversationActionItem | Authenticated transcript ingress | Redaction-before-AI, access/retention and summary schema tests |
| WF10 | WorkflowRun output/recommendation result, ReviewTask when needed | Authenticated NestJS request | Action allowlist, evidence and review gate tests |
| WF11 | SalesMeeting, ConversationTranscript/Summary/ActionItem | Authenticated meeting/transcript ingress | Meeting association, privacy and action-item lifecycle tests |
| WF12 | ProductCatalogItem, Quote, QuoteItem, ReviewTask | Authenticated Sales request | authoritative pricing arithmetic and approval-state tests |
| WF13 | CustomerContract, RenewalAttempt, CustomerTask/ReviewTask if needed | Scheduled due-renewal scan | due-window, consent/approval, idempotency and send policy tests |
| WF14 | CustomerFeedback, CustomerTask | Feedback submitted via NestJS | input/rate-limit, redaction, classification and escalation dedupe tests |
| WF15 | Customer, CustomerHealthAssessment, CustomerTask | Weekly schedule | manual strategic flag, weighted score, insufficient data and dedupe tests |

The complete exact node sequences are in `03_T12_15_WORKFLOWS_DESIGN.md`; the cross-component message sequences are under `diagrams/sequence/`, and the domain relationships are under `diagrams/erd/`.
