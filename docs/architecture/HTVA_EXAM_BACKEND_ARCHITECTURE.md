# HTVA Ck — Shared Exam, Submission & Grading Architecture

Status: anonymous shared-data implementation baseline.

## Approved topology

```
Android HTVA Ck -> Google Apps Script Web App -> Firebase Realtime Database/HTVAData
```

There is no separate backend project. Google Apps Script is the trusted server-side boundary. Android never accesses Firebase directly and never contains a Firebase service-account key, Firebase Admin credential, database secret or privileged token.

## User identity and access model

- Students do not register, sign in, sign out or receive bearer sessions.
- Each app installation creates a random 32-character device ID and stores it in private app preferences.
- The device ID groups submissions and the local device's history. It is not authentication, is not proof of identity and can be spoofed or lost when the app is reinstalled.
- Exam listings are shared across all devices.
- Teacher grading is protected by a shared access code stored only in Apps Script Script Properties as `HTVA_TEACHER_ACCESS_CODE`. This is an operational gate, not a user account or login session. Anyone who knows the code can access teacher actions.
- Do not put personal or confidential student data in this public shared-data model.

Because the endpoint is public and students are anonymous, this design is suitable only for a small, low-risk shared quiz/pilot. It does not provide strong student identity, per-student authorization, anti-cheating guarantees or robust abuse prevention. A determined caller can forge device IDs and submit directly to the public endpoint. The server still validates payload sizes, question IDs, attempt limits and per-device request rate.

## Responsibilities

- Android: home screen, shared exam list/detail, answer composition, submission, local-install history and teacher grading UI.
- Google Apps Script: validate anonymous requests, check the teacher access code for privileged grading actions, write/read Firebase, rate-limit by device ID and audit operations.
- Firebase Realtime Database: shared exams, submissions and audit events under one root.
- Apps Script CacheService: OAuth access-token cache and short-lived per-device rate-limit counters only.

## Firebase access and data root

Only Apps Script accesses Firebase. The script creates a short-lived Google OAuth2 access token from a service-account JWT and calls the Realtime Database REST API with an Authorization Bearer header.

All application reads and writes use exactly:

```
/HTVAData/
```

No application operation may read or write `/users`, `/teachers`, `/students`, `/submissions` or any other path outside this root. The legacy root `/htva/` is read only by the explicit one-time migration helper; normal runtime operations never use it.

Required Script Properties:
- `FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM; newline characters may be stored as `\\n`)
- `HTVA_TEACHER_ACCESS_CODE` (random value, minimum 8 characters)

The service-account email/private key and teacher access code remain only in Script Properties. Restrict Apps Script editor access to trusted administrators. Firebase Security Rules deny direct client reads and writes.

## Shared data model

- `HTVAData/exams/{examId}`: title, description, status, startAt, endAt, questions and maxAttempts.
- `HTVAData/submissions/{deviceId}/{attemptId}`: deviceId, examId, answers, submittedAt, status, score, feedback and gradedAt.
- `HTVAData/audit/{eventId}`: deviceId, action, targetId and timestamp.
- `HTVAData/meta/...`: operational metadata.

Exam listings are visible to every device. Student history is filtered by the installation's device ID, while teacher inbox aggregates submissions from every device. Reinstalling the app or switching devices creates a new device ID and does not automatically restore that installation's history.

Student-facing exam payloads recursively remove fields commonly used for answer keys and teacher-only material. Avoid storing sensitive answer keys inside the same public exam object; for high-stakes assessments, keep them in a separate server-only path.

## API contract

All requests use HTTPS POST with JSON:
- `action`: `health`, `listExams`, `submitAttempt`, `myHistory`, `teacherSubmissions` or `gradeSubmission`.
- `deviceId`: random installation ID for student submissions/history.
- `payload`: action-specific fields.
- Teacher actions additionally include `payload.accessCode`.

Response:
```json
{ "ok": true, "data": {} }
```
or
```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

Submission payload: `{ examId, attemptId, answers }`.
Grade payload: `{ accessCode, studentUid, attemptId, score, feedback }`, where `studentUid` is the installation device ID returned by the teacher inbox.

A retry with the same `attemptId` is idempotent. The server validates exam availability, answer IDs, payload sizes, attempt limits and per-device submission rate.

## Migration from legacy root

The previous implementation stored records under `/htva/`. After configuring the service account, run `migrateLegacyHtvaDataToHTVAData()` manually from Apps Script. It copies only `exams`, `submissions` and `audit` to `/HTVAData/`, does not delete the legacy data, and aborts if the destination is non-empty. Review the returned result before deploying the Android client.

## Deployment checklist

1. Create/update the standalone Apps Script project with `backend/apps-script/Code.gs` and `appsscript.json`.
2. Store `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` and `HTVA_TEACHER_ACCESS_CODE` in Script Properties.
3. Ensure the service account has the required Firebase Realtime Database IAM role and that database rules deny direct client access.
4. If legacy data exists, run and verify `migrateLegacyHtvaDataToHTVAData()` before switching clients.
5. Deploy Apps Script as a Web App executing as its owner. Restrict script editors; the endpoint itself is public.
6. Set the deployed Web App URL in local Gradle property `HTVA_API_BASE_URL`.
7. Run `testFirebaseConnection()` and verify the returned root is `HTVAData`.
8. Publish a test exam using `provisionExam(...)` and test listing, submission, history and teacher grading across two physical/emulated devices.

## Known limitations

- Apps Script has execution quotas, latency and concurrency limits; suitable for a modest pilot, not unbounded traffic.
- Device IDs are installation identifiers, not credentials. Rate limiting by device ID can be bypassed by forging new IDs.
- Teacher access code is shared and can be copied; rotate it if disclosed. Do not reuse a personal password.
- Student history does not automatically move between devices.
- No offline submission queue, exam authoring UI, attachments, anti-cheating system or production load test is included.
- This anonymous model is not appropriate where student identity, confidential grades or strict exam integrity are required.
