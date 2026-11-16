# SRS traceability — NEMS v1.0 (SEECS deployment)

Where each requirement of the *NUST Events Management System — Software Requirements
Specification v1.0* is implemented, and how it is verified.

**Scope decision.** The SRS describes one organising body. This deployment serves
**several SEECS societies**, and applies the SRS structure inside each society:
Faculty Sponsor → Admin → Officers → Members, with Event Heads, Team Leads and
Executives assigned per event. Sign-up is limited to `@seecs.edu.pk`
(`ALLOWED_EMAIL_DOMAINS`).

**Verification.** ✅ = covered by the end-to-end suite (`tests/srs-flows.test.mjs`),
☑️ = implemented, checked by type-check/build/page smoke test, ⚠️ = partial, ❌ = not done.

## 5.1 Authentication and account management

| ID | Implementation | |
|---|---|---|
| FR-AUTH-01 | Sign-up `POST /api/auth/register`; access request to a society with requested role/portfolio/event `POST /api/societies/[id]/join-requests` | ✅ |
| FR-AUTH-02 | Approve / reject / request more info / interview: `PATCH …/join-requests/[requestId]`; applicant answers via `PUT …/join-requests/me` | ✅ |
| FR-AUTH-03 | Email + password login; reset: `/forgot-password` → emailed link → `/reset-password` (signs out all sessions) | ✅ |
| FR-AUTH-04 | SEECS-domain check + 6-digit email OTP (`/api/auth/verify-otp`, hashed codes, 5 tries, 15 min) | ✅ |
| FR-AUTH-05 | Approval / rejection / info-request emails via `src/lib/notify.ts` | ☑️ |
| FR-AUTH-06 | Platform suspend (`/api/admin/users/[id]/suspend`) and society suspend; `getCurrentUser()` re-checks status on every request | ✅ |

## 5.2 Roles and permissions

| ID | Implementation | |
|---|---|---|
| FR-ROLE-01 | Tiers on `roles.tier`; Event Head on `events.event_head_id`; Team Lead/Executive in `event_team_members`; all checks in `src/lib/rbac.ts` | ✅ |
| FR-ROLE-02 | `fn_has_privilege()` grants everything to Faculty Sponsor and Admin tiers (minutes approval stays with the Faculty Sponsor) | ✅ |
| FR-ROLE-03 | Faculty Sponsor creates Officer roles and toggles their permissions: **Roles & Permissions** page, `POST /api/societies/[id]/roles`, `PATCH …/governance/privileges` | ✅ |
| FR-ROLE-04 | Direct assignment (Teams tab) or from applications/recruitment results; source recorded | ✅ |
| FR-ROLE-05 | `PUT /api/events/[id]/event-head` | ✅ |
| FR-ROLE-06 | `role_change_log` (append-only) filled by DB triggers with who/when/why/source; role changes require a reason; shown on Roles & Permissions | ✅ |

## 5.3 Event management

| ID | Implementation | |
|---|---|---|
| FR-EVT-01 | Create/edit/cancel need `CREATE_EVENT`/`EDIT_EVENT`/`CANCEL_EVENT` (Admins by default); archive `POST /api/events/[id]/archive` | ✅ |
| FR-EVT-02 | Name, description, dates, venue, status (existing) + `budget_total`, portfolios (event teams) | ☑️ |
| FR-EVT-03 | Any number of concurrent events per society | ✅ |
| FR-EVT-04 | `event_plan_items` (day, start/end time, venue, team) — Plan tab | ✅ |
| FR-EVT-05 | Trigger-written `event_plan_changes`; visible on the Plan tab; team notified | ✅ |

## 5.4 Portfolios and teams

| ID | Implementation | |
|---|---|---|
| FR-TEAM-01 | 15-portfolio catalog seeded per society (`portfolio_templates`) with function tags | ✅ |
| FR-TEAM-02 | Wings optional; Officer roles can be tied to a wing | ☑️ |
| FR-TEAM-03 | Event-specific portfolios flagged with the events they apply to | ☑️ |
| FR-TEAM-04 | Activate/deactivate portfolios per event: `POST /api/events/[id]/teams` | ✅ |
| FR-TEAM-05 | Team Leads add/remove their Executives and assign their team's duties | ✅ |

## 5.5 Recruitment

| ID | Implementation | |
|---|---|---|
| FR-REC-01 | Form builder (6 question types) in the Recruitment tab | ✅ |
| FR-REC-02 | `/recruitment` and `/recruitment/[formId]`; answers validated against the form | ✅ |
| FR-REC-03 | Shortlist / reject with email notification | ✅ |
| FR-REC-04 | Interviews with schedule, mode, score 0–10 and notes | ✅ |
| FR-REC-05 | Finalize places selected candidates on the team (and in the society) | ✅ |
| FR-REC-06 | Admins (and Event Head) see every form and application | ✅ |
| FR-REC-07 | Team Lead recruitment forms (Admin only), applicant picks the portfolio | ☑️ |

## 5.6 Duties

| ID | Implementation | |
|---|---|---|
| FR-DUTY-01 | Duty with description, time, location, assignee | ✅ |
| FR-DUTY-02 | Team members see all team duties | ✅ |
| FR-DUTY-03 | Admins and Event Head see all | ✅ |
| FR-DUTY-04 | Assignee updates status (also from **My Work**) | ✅ |
| FR-DUTY-05 | New/changed/cancelled duty notifications (in-app + email) | ☑️ |

## 5.7 Logistics and inventory

| ID | Implementation | |
|---|---|---|
| FR-LOG-01 | Items with quantity, condition, location, owned/borrowed/rented, return date | ✅ |
| FR-LOG-02 | Team Leads request items for their event team | ✅ |
| FR-LOG-03 | Logistics approves, issues and receives back | ✅ |
| FR-LOG-04 | Damage and loss recorded on return; low-stock alerts; borrowed items due-back warning | ✅ |
| FR-LOG-05 | Every movement in append-only `inventory_transactions` | ✅ |

## 5.8 Finance

| ID | Implementation | |
|---|---|---|
| FR-FIN-01 | Append-only `fund_allocations` (event pool or team); corrections as negative entries | ✅ |
| FR-FIN-02 | Sponsorship received with sponsor and date; Finance verifies | ✅ |
| FR-FIN-03 | Team Leads log expenses with category, date, description, receipt upload | ✅ |
| FR-FIN-04 | Finance portfolio and Admins see all expenses; Team Leads see their team's | ✅ |
| FR-FIN-05 | Allocated / spent / verified / remaining per team and event | ✅ |
| FR-FIN-06 | Alert (in-app + email) when a team's spending crosses its allocation | ✅ |
| FR-FIN-07 | CSV exports (summary, expenses, allocations, sponsorships); print-to-PDF report | ✅ (CSV) / ☑️ (PDF) |

## 5.9 Sponsors and outreach

| ID | Implementation | |
|---|---|---|
| FR-SPN-01 | Sponsor directory with contacts and totals | ✅ |
| FR-SPN-02 | Append-only interaction log; deals with deliverables and status | ✅ |
| FR-SPN-03 | Confirmed/received deals appear in the event finance totals | ✅ |

## 5.10 Minutes

| ID | Implementation | |
|---|---|---|
| FR-MIN-01 | Date, venue, attendees, agenda, decisions, action items | ✅ |
| FR-MIN-02 | Submitted to the Faculty Sponsor (approve / reject / request changes) | ✅ |
| FR-MIN-03 | Approved minutes go to the Admins' queue | ✅ |
| FR-MIN-04 | Admin forwards to the Principal (`/principal` inbox) | ✅ |
| FR-MIN-05 | Status + append-only approval history with comments | ✅ |
| FR-MIN-06 | Locked after approval by a DB trigger | ✅ |

## 5.11 Audience: registration and ticketing

| ID | Implementation | |
|---|---|---|
| FR-AUD-01 | Public event pages (existing) | ☑️ |
| FR-AUD-02 | Registration form (existing) — **signed-in SEECS accounts only** | ⚠️ |
| FR-AUD-03 | Unique signed QR ticket (existing) | ☑️ |
| FR-AUD-04 | Capacity limits (existing); **multiple ticket types not implemented** | ⚠️ |
| FR-AUD-05 | Duplicate/over-capacity prevention, waitlist (existing) | ☑️ |
| FR-AUD-06 | QR scan or manual check by `SCAN_QR` holders **or Security/Ushers/Crowd Control team members** | ☑️ |
| FR-AUD-07 | Confirmation email on registration and on paid-ticket approval | ☑️ |

## 5.12 Logging, reporting, notifications

| ID | Implementation | |
|---|---|---|
| FR-LOGS-01 | `audit_logs` written by every module (append-only) | ✅ |
| FR-LOGS-02 | Activity Log page with filters (`VIEW_AUDIT_LOGS`) | ☑️ |
| FR-LOGS-03 | Event workspace overview (duties, money, inventory, minutes); society analytics | ☑️ |
| FR-LOGS-04 | `notifyUser` / `notifyUsers`: in-app + email + push | ☑️ |

## Non-functional requirements

| ID | Status |
|---|---|
| NFR-01 Performance | ⚠️ Not load-tested for 500 concurrent registrations. Per-request runtime schema changes removed from the hot paths; one shared DB pool. |
| NFR-02 Security | bcrypt; RBAC enforced server-side; sessions re-validated each request; rate limits per IP **and** per account; signed QR codes; upload type/magic-byte checks. |
| NFR-03 Privacy | Attendee lists limited to `VIEW_REGISTRATIONS`, Event Head and Team Leads; drafts private to authors. |
| NFR-04 Availability | Hosting concern (Azure). |
| NFR-05 Reliability | Use Azure PostgreSQL automated backups; restore procedure should be rehearsed. Money records are append-only/locked. |
| NFR-08 Maintainability | Ordered migrations, central RBAC module, end-to-end test suite. |
| NFR-09 Auditability | DB-level append-only logs for audit, role changes, allocations, inventory, sponsor interactions, minutes steps. |

## SRS open issues — decisions taken

1. **Officer permissions** — fully configurable by the Faculty Sponsor (per role and per person).
2. **Online payment** — not added; the existing payment-proof upload + verification flow is kept.
3. **Principal approval** — chosen per minutes sheet by the Admin (“Forward to Principal”).
4. **Audience accounts** — still required (SEECS sign-in). Guest registration is the main open item.
5. **Expense approval** — Finance verifies or rejects each expense; verified entries are locked.
6. **VP wing dashboards** — not built; VPs are Officers and can be tied to a wing.
