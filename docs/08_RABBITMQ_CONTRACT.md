# 08 — RabbitMQ Event and Queue Contract

## 1. Envelope

Use one versioned event envelope for domain commands/events:

```json
{
  "eventId": "uuid",
  "eventType": "lead.qualification.requested",
  "version": 1,
  "occurredAt": "ISO-8601 timestamp",
  "data": {}
}
```

`eventId` identifies the message; `eventType` is the event/routing semantic; `version` is the payload contract version; `occurredAt` is the UTC occurrence time; `data` contains the minimum required IDs/context. Never include secrets or unnecessary personal data. A backward-incompatible payload change increments `version` and updates all producers/consumers/tests together.

## 2. Exchange, queues and routing keys

Use durable topic exchange `crm.events`. Each independent consumer gets its own durable queue; different consumers must not share one queue when each requires its own copy of an event. Replicas of the same consumer may share that consumer's queue for load balancing.

| Consumer | Durable queue | Routing key | Required `data` fields |
|---|---|---|---|
| Lead-created audit consumer (only if enabled) | `crm.audit.lead-created.q` | `lead.created` | `leadId` |
| Qualification | `n8n.lead-qualification.q` | `lead.qualification.requested` | `leadId`, `workflowRunId` |
| Enrichment | `n8n.lead-enrichment.q` | `lead.enrichment.requested` | `leadId`, `workflowRunId`, `provider`/provider mode |
| Scoring | `n8n.lead-scoring.q` | `lead.scoring.requested` | `leadId`, `workflowRunId` |
| Follow-up execution | `n8n.follow-up-execution.q` | `lead.follow_up.triggered` | `executionId`, `enrollmentId`, `leadId`, `sequenceId`, `stepId`, `scheduledAt` where applicable |
| Data Cleaning | `n8n.data-cleaning.q` | `data.cleaning.requested` | `workflowRunId`, `scope`, `timestamp`, optional actor/filter |

The fifteen workflows do not all require RabbitMQ. Explicit UI requests enter through NestJS; backend authorizes and creates a run, then invokes a protected internal webhook or publishes an event according to the workflow trigger. Periodic scans use the appropriate schedule trigger. User browsers never call production n8n webhooks directly.

## 3. Required event definitions

### Qualification

```json
{"eventId":"<uuid>","eventType":"lead.qualification.requested","version":1,"occurredAt":"<ISO-8601>","data":{"leadId":"<uuid>","workflowRunId":"<uuid>"}}
```

### Enrichment

```json
{"eventId":"<uuid>","eventType":"lead.enrichment.requested","version":1,"occurredAt":"<ISO-8601>","data":{"leadId":"<uuid>","workflowRunId":"<uuid>","provider":"MOCK"}}
```

### Scoring

```json
{"eventId":"<uuid>","eventType":"lead.scoring.requested","version":1,"occurredAt":"<ISO-8601>","data":{"leadId":"<uuid>","workflowRunId":"<uuid>"}}
```

### Follow-up

```json
{"eventId":"<uuid>","eventType":"lead.follow_up.triggered","version":1,"occurredAt":"<ISO-8601>","data":{"executionId":"<persisted-execution-uuid>","enrollmentId":"<uuid>","leadId":"<uuid>","sequenceId":"<uuid>","stepId":"<uuid>","scheduledAt":"<ISO-8601>"}}
```

`data.executionId` is mandatory and must reference a persisted `FollowUpExecution`. It is the business identity for execution idempotency; `eventId` is the message identity.

### Data Cleaning

```json
{"eventId":"<uuid>","eventType":"data.cleaning.requested","version":1,"occurredAt":"<ISO-8601>","data":{"workflowRunId":"<uuid>","scope":"ALL","triggeredByUserId":"<uuid-or-null>","filter":null,"timestamp":"<ISO-8601>"}}
```

Other Topic 12 workflows use authenticated NestJS request/callback contracts or scheduled triggers where that is the agreed node blueprint; do not publish invented events solely to make every flow event-driven.

## 4. Delivery, retry and recovery

- Durable exchange/queue configuration; message persistence where supported; explicit acknowledgements and dead-letter routing.
- Retry recoverable failures after 1, 5 and 15 minutes after the initial attempt. Maximum four total attempts.
- Exhausted message goes to terminal failure/DLQ with original event ID, workflow/run identity, attempt count, timestamps and safe error category.
- Non-retryable schema/auth/permission failures go to terminal handling without blind repeated delivery.
- Manual replay requires an authorized operator, AuditLog, resource revalidation and the original business idempotency identity.
- Consumer callbacks/status changes are idempotent. A repeated event cannot create duplicate scores/tasks or cause duplicate message delivery.
- Do not operate a broad generic queue as a workflow executor for all `lead.#` messages. Exact bindings and dedicated queues keep independent consumer semantics clear.

## 5. Producer/consumer responsibilities

NestJS validates the user request, creates required DB/run state, then publishes a domain event. It must report whether publication succeeded or use an outbox/recovery pattern so an event cannot silently diverge from persisted state. n8n validates the envelope, reads authoritative data through NestJS, processes, and calls authenticated backend callbacks. Backend callbacks validate event/run/resource identity, authorization, allowed state transition and idempotency before persisting.

## 6. Message security and observability

- Credentials and sensitive raw transcript/feedback content never enter event payloads.
- Service identities use least-privilege credentials; rotate/secret-manage them outside workflow JSON.
- Structured logs include `eventId`, `eventType`, `workflowRunId`, n8n execution identity, business resource ID and attempt number.
- Monitor queue depth, oldest message age, retry count, DLQ count and terminal failures.
