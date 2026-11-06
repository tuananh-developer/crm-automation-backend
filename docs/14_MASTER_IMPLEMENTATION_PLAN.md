# 14 — Master Implementation Plan and Current Gap Inventory

This plan is based on the repositories and documentation inspected on 2026-10-31. It is a working inventory, not an acceptance sign-off. Items are complete only when the linked implementation and verification evidence exist.

## Repository baseline

| Repository | Branch / base                     | Worktree at audit                                 | Notes                                                                                                                                                   |
| ---------- | --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend    | `main`, `0e4035c`                 | 17 modified tracked files and 2 untracked files   | Existing uncommitted auth, data-cleaning, lead-intelligence and workflow changes are user work and must be preserved/reviewed before overlapping edits. |
| Frontend   | `feat/frontend-skills`, `d818a17` | `app/register/page.tsx`, `types/auth.ts` modified | These are the public-registration role-selector removal; preserve.                                                                                      |

The workspace root is not a Git repository. The checked-in `.agents/agents/*.md` files are role definitions; native sub-agent delegation is available in this environment. No `.opencode/agents` adapter directory or root `opencode.json` was present at audit time.

## Confirmed product baseline

The authoritative scope is SRS FR-01–FR-21, application use cases UC01–UC12, the 15 Topic 12 workflow blueprints, API/event contracts, and checklist in docs 01–13. The README files describe an older, narrower UC01–UC10 implementation and are not sufficient acceptance criteria.

Source inventory: backend currently has 11 feature modules, 18 TypeORM entities, two migrations (18 core tables plus the enrollment uniqueness migration), 15 controllers, 26 unit specs and 3 E2E specs. Five n8n exports are present (`uc02`, `uc03`, `uc04`, `uc06`, `uc10`); a static node inventory found functional-node counts of 11, 7, 7, 6 and 11 respectively after excluding Sticky Notes. None meets the exact 12-node blueprint, and trigger counts vary; none has yet been runtime-verified. Frontend routes cover login/register, dashboard, leads, customers, follow-ups, review, segments and data cleaning. Frontend defines only lint/build scripts; no test script is configured. `proxy.ts` redirects based on presence of the browser cookie, which is a navigation aid and does not authenticate API requests.

## Priority and milestones

### M0 — Preserve state and establish trustworthy baseline (in progress)

- **Status:** Repository/docs/source inventory completed. Pre-existing backend diffs were inspected; static type-check exposed incorrect fixture shapes in the pre-existing untracked internal-n8n spec, which have now been corrected without discarding the tests. A fail-closed seed guard and unit cases were added. Backend and frontend type-checks, focused/backend lint, frontend lint and diff checks pass. Jest and builds remain unexecuted/unverified under the current process sandbox.
- **Scope:** Review pre-existing backend working-tree changes; inspect scripts, CI, Docker, env-variable names, migrations, n8n exports and route/service contracts. Keep all user modifications intact.
- **Acceptance:** Exact dirty-file inventory retained; baseline checks run only in a safe isolated environment; each pre-existing change either reviewed/tested or explicitly left unverified.
- **Dependencies:** None.

### M1 — Backend authentication and authorization (critical; partial implementation, unverified)

- **Status:** A route-level JWT guard slice covers Leads, Lead Sources, Customers, Segments, Follow-up, Review, Notifications and Users; lead-intelligence user routes use JWT while n8n callbacks retain machine authentication. Notification endpoints scope inboxes to the actor (Admin may select an inbox). Lead Source reads are authenticated and creation is Admin-only. Lead CRUD assigns Sales-created records to their actor and restricts Sales list/detail/update/delete/convert to owned records; Customer list/detail reads use `created_by`. Segment definitions are shared and editable by authenticated roles, deletion is Admin-only, and Sales membership reads/evaluations/counts are scoped to their created Customers. Follow-up enrollment APIs derive creator/assignee identity from JWT and scope Sales enrollment lookup, lifecycle and execution history to owned Leads; the triggered event now carries its persisted execution ID. Review listing/detail is scoped to Lead owner or assigned reviewer; Sales can claim only own Lead tasks and only the assigned reviewer can start/resolve, with decision audit attributed to JWT. Lead Intelligence trigger/history operations enforce Lead ownership and JWT actor attribution. Qualification/enrichment/scoring callbacks require a matching Lead/workflow run and active state, and lock that run inside their transaction to serialize duplicate callbacks; data-cleaning callbacks require an active UC10 run. Data-cleaning scan actor attribution now comes only from JWT, and Sales scan reads/apply operations require matching ownership, including legacy runs with no owner. Backend type-check and targeted lint pass; Jest and DB concurrency tests have not run, so allow/deny/idempotency behavior remains unverified at runtime.
- **Expected behavior:** Default-deny authentication for user-facing APIs; explicit public health/register/login endpoints; service-authenticated callbacks remain usable; role, ownership and assignment checks enforced at the backend.
- **Acceptance:** Unauthenticated requests receive 401 across every protected controller family; public health/auth endpoints still work; n8n callbacks require the service credential; Sales/Admin/assignee allow/deny cases have tests; no existing authenticated workflows regress. Run the new metadata spec and relevant auth/module/integration tests in a suitably isolated test environment before accepting this slice.
- **Dependencies:** Preserve/review dirty AuthModule, JWT strategy and internal callback work. Map all frontend callers before changing user directory behavior.

### M2 — User directory and UC12 administration (implemented slice, pending verification)

- **Status:** Backend and frontend slices are implemented. Admin-only list/detail/create/update/disable endpoints use `RolesGuard`; creation hashes passwords; changes write AuditLog in a transaction; self role/status changes and removal of the last active Admin are rejected. Duplicate-email constraint races map to conflict. Authenticated `/users/assignees` returns only active `id`, `name`, `role`. Frontend `/admin/users` supports list/create/role/status/disable and Sales selectors now use the minimal directory. Admin notification inbox selection uses the Admin directory API. Backend/frontend type-check and lint checks pass; Jest/builds remain unverified and no tests have run.
- **Expected behavior:** Keep Sales' minimum necessary active-assignee lookup; separate Admin-only user lifecycle and role management, with validation and audit. Public registration remains `SALES` only.
- **Acceptance:** Sales cannot enumerate management fields or change role/status; Admin can create/view/update/disable according to state policy; credentials never serialize; UI reflects real authorization and API states. Verify status reactivation policy consistency, then run focused service/controller/API tests in an isolated environment.
- **Dependencies:** M1; choose/verify admin provisioning path (seed/admin bootstrap) without adding a production fallback account.

### M3 — Reliable event and follow-up processing

- **Status:** Partial. `RabbitMQService.publishEvent()` rejects when no channel is ready or the broker rejects publication, rather than returning a success-shaped event. Qualification, enrichment, scoring and data-cleaning now have dedicated exact-key queues across backend setup, RabbitMQ definitions and the four exported n8n triggers. Startup unbinds old broad/qualification bindings from the legacy durable queue without deleting it. Data-cleaning retains its explicit in-process fallback, and workflow-run row locks serialize duplicate intelligence callbacks. Outbox/recovery, DLQ/retry policy, migration behavior against an existing broker, and runtime delivery/concurrency evidence remain incomplete or unverified. Unit specs have not been executed.
- **Expected behavior:** Persist-before-publish recovery, exact durable consumer queues, 1/5/15-minute retries, four total attempts, terminal failure/DLQ, authorized idempotent replay; follow-up advances only after confirmed delivery.
- **Acceptance:** Deterministic publish-failure/retry/duplicate/terminal tests, event envelope contract tests, and runtime evidence in a disposable local stack.
- **Dependencies:** M0, database/reliability design review, and workflow contracts.

### M4 — Complete existing UC01–UC10 contracts

- **Status:** Partial. Existing modules cover leads/customers/segments/intelligence/follow-up/review/notifications/data-cleaning, but routes and frontend use legacy aliases; data ownership, conversion, execution delivery, safety and error paths need per-use-case verification.
- **Known mismatch:** Frontend lead detail now calls the existing `/follow-up/leads/:leadId/enrollments` route and derives the active enrollment from that response. Dashboard HOT counting now uses the canonical `>=75` threshold, and the unverified static “E2E Pipeline Online” badge was removed. The dashboard still computes totals from a capped 100-lead page, calls per-lead scoring endpoints, and does not use the missing dashboard read-model API, so its aggregate values are not authoritative.
- **Acceptance:** For each UC, canonical API/request/response and business-rule boundary tests pass; frontend uses canonical paths and accurate backend read models; no fake success states.
- **Dependencies:** M1–M3 where applicable.

### M5 — Implement missing Topic 12 domain and persistence

- **Status:** Incomplete. The target model has 32 entities; current schema has only the 18 core tables. Missing domains include CustomerTask, customer 360/issues/churn/health, transcripts/summaries/action items, meetings, feedback, catalog/quotes/approval, contracts/renewals, dashboard and workflow-run operations.
- **Expected behavior:** Add each agreed domain with TypeORM entities, additive reversible migrations, constraints/indexes, DTO/API, backend policy, authorization, audit/idempotency and focused tests. Do not fabricate external-source data.
- **Acceptance:** Domain model, migrations, APIs and frontend contracts align; upgrade/rollback tested against a disposable database; data/privacy/role edge cases covered.
- **Dependencies:** M1–M4 and explicit API/domain sequence from architecture/database review.

### M6 — Implement the remaining automation workflows

- **Status:** Incomplete. Five of 15 workflow JSONs exist; the other ten are absent from the backend workflow export directory. All 15 require exactly 12 functional nodes, valid contracts, fixtures and runtime/import evidence.
- **Acceptance:** All named JSON exports import into the configured n8n runtime; trigger/API/event/node count and connections match the blueprint; mocked providers are labelled; success/failure/retry/callback/idempotency cases are evidenced.
- **Dependencies:** M3–M5. Workflows must not implement CRM business mutations directly.

### M7 — Finish frontend and API integration

- **Status:** Partial. Existing core screens exist; route guard is unused; admin users, dashboard read models, customer insights/tasks, meetings/conversations, NBA, quotes, renewals and workflow detail screens are absent.
- **Expected behavior:** Complete required routes/forms with loading/error/empty/success states, accessible responsive interaction, correct backend auth/role visibility, and actual APIs.
- **Acceptance:** Contract tests and role-specific navigation/API scenarios pass; lead-enrollment lookups use valid endpoints; metrics match backend policies; no production mock data.
- **Dependencies:** M1–M6.

### M8 — Release, deployment readiness and documentation

- **Status:** Incomplete. CI/CD and Docker files exist, but migrations/runtime workflows/recovery and final acceptance evidence are not established. Current README scope lags the SRS.
- **Acceptance:** Backend/frontend lint, typecheck, tests and builds pass in a reproducible environment; disposable DB migration and workflow integration evidence exists; env/deployment docs match code; checklist and known external integrations are explicit. No production deployment is authorized by this plan.
- **Dependencies:** M0–M7.

## Cross-cutting risks and constraints

- A confirmed high-impact access-control gap affects the public API surface; implement M1 before adding sensitive domains.
- The seed entry point now refuses all seeding in production, requires explicit opt-in for non-local databases, and requires a second opt-in for destructive remote `--fresh` runs. Focused seed-safety test cases exist but have not been executed.
- `notifications.controller.spec.ts` covers self-only Sales access and selected Admin inbox access; it and the controller guard need execution under the project's Jest suite before acceptance.
- The backend worktree includes uncommitted changes that overlap authentication and workflow callbacks. Preserve them and coordinate any overlapping edit as additive, reviewed changes.
- The current runtime environment has restricted network/process behavior. A previous frontend build failed first fetching Google Fonts, then under approved execution with a Turbopack process/port permission error; the webpack retry could not parse TypeScript `--showConfig`. These failures do not establish a source defect, but production build remains unverified.
- The dedicated test sandbox could not be established: `bwrap --unshare-all` failed while creating the network namespace, Podman could not create its runtime directory because `/run/user` is read-only, and Docker access was denied at `/var/run/docker.sock`. Jest and backend application builds were therefore not run; lint/type-check are the available local evidence so far.
- External AI, email, calendar and CRM sources require configured provider credentials and disposable test fixtures; production data or deployment must not be used as a verification shortcut.

## Audit limits

The initial audit was repository/source/documentation inspection. It did not establish runtime behavior, database migration success, n8n import/runtime compatibility or production configuration. A full completion claim is not warranted until each milestone has acceptance evidence.
