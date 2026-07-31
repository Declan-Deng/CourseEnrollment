# Course Enrolment System

A dissertation-oriented full-stack course enrolment system for an HKU-style workflow. The current system focuses on:

- a responsive React interface
- a Node.js API with a rule/constraint engine
- transparent enrolment decisions
- legacy pain-point fixes such as visible capacity, policy labels, conflict checks, and clearer request states

The student-facing system is aligned to the dissertation short note by keeping announcement/window content backend-driven, using a canonical request status view, and preserving a separate admin-ready backend surface for future staff tooling.

## Run locally

```bash
npm install
npm run dev
```

The root script starts:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

## Current scope

- runtime state can be stored in MongoDB when `MONGODB_URI` is configured
- without MongoDB, the API falls back to an in-memory repository so the system is still easy to run locally
- course supply is shared across demo students, so capacity and waitlist changes are reflected globally
- a simulated cohort of seeded students backs part of the shared seat and queue counters with complete records (enrollments, waitlist/review/lottery requests), and every student id — including generated seat-roster entries — resolves to the same deterministic identity across the staff console and student portal
- bootstrap responses now include backend-driven `announcementContent`, so the student-facing announcement and online enrolment schedule pages no longer depend only on frontend constants
- bootstrap responses also include a canonical `requestStatusView`, so `Results` remains the main student status page while `Cancel` stays a focused action view
- supported flows:
  - browse and filter courses (capacity filters use numeric seat data from the API)
  - preview enrolment decisions before submitting
  - submit requests (FCFS requests join the waitlist behind any existing queue)
  - cancel pending requests (lottery entries stay withdrawable until staff resolve them)
  - drop approved courses (freed FCFS seats are taken by the earliest waitlisted request, with a `waitlist-promoted` audit event)
  - inspect timetable conflicts and window/policy notes
  - reset the demo state (an explicit action; Logout no longer resets anything)
  - inspect and manage admin offerings (multi-slot schedules can be edited without losing slots)
  - resolve requests from the admin side, including manual resolution of lottery pools (no automated draw exists)
  - create and deactivate student-specific constraint overrides

## Verification

- backend scenario tests: `npm test --prefix server`
- client model tests: `npm run test:client`
- browser end-to-end smoke (starts API + Vite automatically, needs `npx playwright install chromium` once): `npm run test:browser`
- basic load smoke test against a running local API: `npm run test:load --prefix server` (set `ENROLLMENT_API_BASE_URL` to target a non-default port)
- optional Mongo repository contract test: set `TEST_MONGODB_URI` and run `npm test --prefix server`

## MongoDB

- set `MONGODB_URI` to enable MongoDB-backed runtime state
- optional: set `MONGODB_DB_NAME` and `MONGODB_COLLECTION_NAME`
- Mongo mode now stores semester, courses, offerings, students, enrolments, requests, audit events, and constraint overrides in separate collections under the configured prefix
- API requests may also pass `x-student-id` or `?studentId=` to isolate demo snapshots per student without changing the current frontend contract
- actor-aware requests may pass `x-actor-type` and `x-actor-id` for staff/system audit context
- non-default demo students start from an empty plan, but they still affect the same live course capacity and waitlist counts
- without a MongoDB connection, the server falls back to the in-memory repository so the system still runs locally

## Admin-ready API surface

- `GET /api/admin/offerings`
- `PATCH /api/admin/offerings/:offeringId`
- `GET /api/admin/requests`
- `POST /api/admin/requests/:requestId/resolve`
- `GET /api/admin/audit`
- `GET /api/admin/overrides`
- `POST /api/admin/overrides`
- `DELETE /api/admin/overrides/:overrideId`
# Course Enrolment System

A dissertation-oriented full-stack course enrolment system for an HKU-style workflow. The current system focuses on:

- a responsive React interface
- a Node.js API with a rule/constraint engine
- transparent enrolment decisions
- legacy pain-point fixes such as visible capacity, policy labels, conflict checks, and clearer request states

The student-facing system is aligned to the dissertation short note by keeping announcement/window content backend-driven, using a canonical request status view, and preserving a separate admin-ready backend surface for future staff tooling.

## Run locally

```bash
npm install
npm run dev
```

The root script starts:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

## Current scope

- runtime state can be stored in MongoDB when `MONGODB_URI` is configured
- without MongoDB, the API falls back to an in-memory repository so the system is still easy to run locally
- course supply is shared across demo students, so capacity and waitlist changes are reflected globally
- bootstrap responses now include backend-driven `announcementContent`, so the student-facing announcement and online enrolment schedule pages no longer depend only on frontend constants
- bootstrap responses also include a canonical `requestStatusView`, so `Results` remains the main student status page while `Cancel` stays a focused action view
- supported flows:
  - browse and filter courses
  - preview enrolment decisions before submitting
  - submit requests
  - cancel pending requests
  - drop approved courses
  - inspect timetable conflicts and window/policy notes
  - reset the demo state
  - inspect and manage admin offerings
  - resolve requests from the admin side
  - create and deactivate student-specific constraint overrides

## Verification

- backend scenario tests: `npm test --prefix server`
- basic load smoke test against a running local API: `npm run test:load --prefix server`
- optional Mongo repository contract test: set `TEST_MONGODB_URI` and run `npm test --prefix server`

## MongoDB

- set `MONGODB_URI` to enable MongoDB-backed runtime state
- optional: set `MONGODB_DB_NAME` and `MONGODB_COLLECTION_NAME`
- Mongo mode now stores semester, courses, offerings, students, enrolments, requests, audit events, and constraint overrides in separate collections under the configured prefix
- API requests may also pass `x-student-id` or `?studentId=` to isolate demo snapshots per student without changing the current frontend contract
- actor-aware requests may pass `x-actor-type` and `x-actor-id` for staff/system audit context
- non-default demo students start from an empty plan, but they still affect the same live course capacity and waitlist counts
- without a MongoDB connection, the server falls back to the in-memory repository so the system still runs locally

## Admin-ready API surface

- `GET /api/admin/offerings`
- `PATCH /api/admin/offerings/:offeringId`
- `GET /api/admin/requests`
- `POST /api/admin/requests/:requestId/resolve`
- `GET /api/admin/audit`
- `GET /api/admin/overrides`
- `POST /api/admin/overrides`
- `DELETE /api/admin/overrides/:overrideId`
