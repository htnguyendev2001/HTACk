# HTVA Ck — Exam, Submission & Grading Architecture

Status: implementation baseline for the approved Option B.

## Approved topology

Android HTVA Ck -> Google Apps Script Web App -> Firebase Realtime Database.

There is no separate backend project. Google Apps Script is the trusted server-side boundary. Android must never call Firebase Realtime Database directly and must never contain a Firebase Admin credential, service-account key, database secret, password pepper, or privileged token.

Firebase Authentication is not used.

## Responsibilities

- Android: sign-in UI, exam list/detail, answer composition, local draft, submit/retry, student history, teacher inbox and grading UI.
- Google Apps Script: authenticate app accounts, issue short-lived bearer sessions, authorize every action, validate payloads, write/read Firebase, and audit sensitive operations.
- Firebase Realtime Database: durable records for users, exams, attempts/submissions, grades and audit events.
- Apps Script CacheService: short-lived session cache and rate-limit counters only. Cache eviction means a user may need to sign in again; it is not durable storage.

## Identity and authorization

Each account is provisioned by an authorized operator through the Apps Script editor. Account roles are `student` or `teacher`. The client cannot assign or change its own role.

The server derives the acting user from the bearer session, never from a client-supplied `userId`. A student can submit only as the authenticated student and read only their own history. A teacher can read submissions only for exams assigned to that teacher and grade only those submissions. Role and ownership checks are mandatory on every request.

Passwords are stored as salted PBKDF2-HMAC-SHA256 verifiers, never plaintext. Sessions are random opaque tokens with a six-hour maximum lifetime. Login attempts are rate-limited per username. Use unique, long passwords for teacher accounts and restrict Apps Script editor access to trusted administrators.

## Firebase access

Only the Apps Script execution identity accesses Firebase. Configure the Apps Script project to use the same Google Cloud project as Firebase, enable the Realtime Database API, grant the script execution identity the minimum required Firebase Realtime Database IAM role, and add the `https://www.googleapis.com/auth/firebase.database` OAuth scope. Database Security Rules must deny client reads and writes; the Android app receives no database URL credentials or privileged Firebase token.

The script uses the Apps Script OAuth token server-side. Verify this IAM setup in the target Firebase project before production deployment. Do not fall back to public database rules or embed a database secret in Android.

## Core records

- `users/{uid}`: username, displayName, role, active, password salt and verifier.
- `exams/{examId}`: title, description, status, startAt, endAt, teacherIds, questions and scoring configuration.
- `submissions/{uid}/{attemptId}`: uid, examId, answers, submittedAt, status, score, feedback, gradedBy, gradedAt.
- `audit/{eventId}`: actor uid, action, target id and timestamp. Do not log passwords, session tokens or answer content.

The first implementation uses deterministic `attemptId` paths so a retry with the same ID does not create duplicate submissions. The server rejects a second attempt with a different ID when the exam's attempt policy disallows it; that policy must be explicit in exam data.

## API contract

All requests use HTTPS POST with JSON:
- `action`: `login`, `listExams`, `submitAttempt`, `myHistory`, `teacherSubmissions`, `gradeSubmission`, or `logout`.
- `token`: bearer session token for all actions except login.
- `payload`: action-specific fields.

The API returns `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

Submission payload: `{ examId, attemptId, answers }`. The authenticated uid is attached server-side.
Grade payload: `{ studentUid, attemptId, score, feedback }`. The server verifies teacher assignment and submission ownership.

## Deployment checklist

1. Create a standalone Apps Script project (not a separate backend service).
2. Add `backend/apps-script/Code.gs` and `appsscript.json`.
3. Set Script Properties: `FIREBASE_DATABASE_URL` and `HTVA_SESSION_TTL_SECONDS` (optional; default 21600).
4. Link the Apps Script project to the Firebase Google Cloud project; enable Realtime Database API and grant the execution identity Firebase Realtime Database access.
5. Set database rules to deny all direct client access.
6. Deploy as Web App, execute as the owner, and restrict who can edit the Apps Script project. The web app endpoint is public-facing; all business actions must require a valid server session.
7. Run `provisionAccount(username, password, role, displayName)` from the Apps Script editor for each teacher/student account. Never put provisioning passwords in source control.
8. Set the deployed Web App URL in the local Android Gradle property `HTVA_API_BASE_URL`; do not commit a deployment URL if it is environment-specific.
9. Verify the IAM token can read/write the Firebase database before enabling real student submissions.

## Known limitations before production

- Apps Script is subject to execution quotas, request latency and concurrent execution limits. It is appropriate for a modest pilot, not unbounded exam traffic.
- CacheService sessions may be evicted before expiry; the user must log in again.
- The first milestone does not yet implement a full offline submission queue, exam authoring UI, timed-exam enforcement, attachment uploads, or detailed automatic grading.
- HTTPS transport and server-side authorization are mandatory, but this is not a substitute for a security review, abuse testing, backup/restore testing and an operational account-recovery process.
