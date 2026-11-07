# T12 n8n Import and Runtime Acceptance

This runbook is the operational acceptance procedure for WF01, WF08, WF10, WF11 and WF12. A JSON structure test does not prove that n8n can import, authenticate or execute the workflow.

## 1. Import order and shared configuration

1. Import `integrations/n8n/workflows/t12-error-handler.json` first.
2. Import the five business exports:
   - WF01: `uc02-ai-lead-qualification.json`
   - WF08: `uc10-ai-crm-data-cleaning.json`
   - WF10: `t12-wf10-next-best-action.json`
   - WF11: `t12-wf11-sales-meeting.json`
   - WF12: `t12-wf12-quote-proposal.json`
3. In each business workflow (WF10/WF11/WF12), open Workflow Settings and select the imported **T12 Shared Error Handler** as its Error Workflow. The imported n8n workflow ID is assigned by that n8n instance, so this association cannot be safely hard-coded in the exported JSON. Do not assign the Error Handler to itself.
4. Configure `BACKEND_INTERNAL_URL`, `N8N_API_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, and the RabbitMQ/HTTP Header credentials in n8n's credential store. Never commit credential values to workflow JSON.
5. For WF01/WF08, configure RabbitMQ credentials and confirm the queues `n8n.lead-qualification.q` and `n8n.data-cleaning.q` exist. For WF10/WF11/WF12, configure protected webhook credentials and HTTPS destinations.

## 2. Disposable-environment test matrix

Run with a disposable database, synthetic records and provider sandbox/test credentials. Do not use production customer transcripts.

| Workflow | Success case | Negative/recovery case | Required persisted evidence |
|---|---|---|---|
| WF01 | high-confidence qualification | confidence 0.80; duplicate callback | qualification, exactly one ReviewTask where required, WorkflowRun state |
| WF08 | scan with deterministic findings | stale value, unsafe field and callback retry | findings, scan state, AuditLog after approved apply |
| WF10 | allowlisted candidate actions with evidence | competing execution claim; Gemini timeout | recommendation, review/notification gate, final WorkflowRun state |
| WF11 | redacted transcript, summary and proposed action items | competing execution; provider failure | backend-redacted transcript, summary, pending action items, failure state |
| WF12 | catalog-backed quote draft | invalid catalog item/quantity; provider failure; approval required | quote price snapshot, approval state and WorkflowRun state |

For each case, record the workflow export version/commit, n8n workflow ID, execution ID, fixture name, expected/actual result and sanitized evidence link. Include one failure execution per WF10/WF11/WF12 and confirm the shared Error Handler callback marks the matching run `FAILED` without storing provider message text or stack traces.

## 3. Lease recovery checks

The default WorkflowRun claim lease is 1200 seconds. Configure `N8N_WORKFLOW_CLAIM_LEASE_SECONDS` from 60 to 3600 seconds when needed.

- Retry the same claim with the same n8n execution ID: it must be idempotent and renew the lease.
- Claim with a different execution ID while the lease is active: it must be rejected.
- Expire the lease in the disposable database, then claim from a different execution: exactly one claimant must recover the run.
- Send a heartbeat from the current owner: it must renew the lease.
- Send failure callback from a stale/non-owning execution: it must be rejected.
- Send failure callback from the current execution: the run must become `FAILED`; WF11 meeting status must also become `FAILED`.

## 4. Evidence and current status

The repository contains structural Jest checks and backend unit tests. No n8n instance/provider credentials are attached to this task, so import/activation, live Gemini calls and the runtime cases above remain **not run**. Do not mark the Import/runtime or Integration tests cells in `docs/12_ACCEPTANCE_CHECKLIST.md` complete until this evidence is recorded.
