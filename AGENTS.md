# AGENTS.md — HTVA Ck

## 1. Project identity and approved architecture

- Product: **HTVA Ck**, Android exam, submission and teacher grading application.
- Android applicationId: `com.htanh.appck`.
- HTAVk is a separate app (`com.htanh.appvk`); never mix the two repositories or application IDs.
- Approved topology: Android -> Google Apps Script Web App -> Firebase Realtime Database.
- There is no separate Backend project. Google Apps Script is the approved server-side processing layer.
- Firebase Authentication is explicitly rejected and must not be added.
- Read README.md and docs/architecture/HTVA_EXAM_BACKEND_ARCHITECTURE.md before backend or security work.

## 2. Mandatory workflow

1. Inspect branch, repository structure, relevant source, build configuration and tests.
2. Identify behavior that is actually implemented; do not infer from product descriptions.
3. Preserve unrelated work and current Java/XML conventions.
4. For non-trivial changes, state scope, affected files, risks and validation plan before editing.
5. Implement in small, reviewable increments.
6. Run relevant Gradle checks where an execution environment is available. Never claim checks passed unless observed.

## 3. Android engineering baseline

- Native Android Java, XML layouts, Gradle Groovy DSL.
- AGP 7.2.2, Gradle 7.3.3, compileSdk 32, minSdk 21, targetSdk 32.
- Java 8 compatibility.
- Do not migrate to Kotlin/Compose or upgrade build tooling opportunistically.
- Do not blindly replace `com.example.bmi`; inspect namespace, manifest package, applicationId, Java paths and generated R/BuildConfig references separately.
- Keep applicationId `com.htanh.appck`.

## 4. Security boundaries

- Android communicates only with the Apps Script HTTPS endpoint. It must not call Firebase directly.
- Never add Firebase Authentication.
- Never embed Firebase Admin credentials, service-account JSON/private keys, database secrets, Apps Script OAuth tokens, password pepper, account passwords or signing credentials in Android or source control.
- Apps Script executes as its trusted owner identity and is the only component allowed to access Firebase.
- Firebase Rules must deny direct client reads/writes. Verify server-side IAM access before production.
- The server derives UID and role from the session, never from client-supplied identity or role fields.
- Students can read their own history only and submit as their own UID.
- Teachers can read/grade only submissions for exams assigned to their UID.
- Validate every action and payload server-side. Treat client validation as UX only.
- Do not log passwords, bearer tokens or answer content.
- Keep session tokens short-lived and avoid persistent plaintext storage on Android.

## 5. Product behavior

- Student: sign in, browse published exams, answer supported question types, submit, inspect history/score/feedback.
- Teacher: sign in, view assigned exam submissions, grade and provide feedback.
- Account provisioning and exam provisioning are initially operator-managed through Apps Script editor functions.
- Manual grading is the current baseline; do not claim automatic grading.
- Offline durable queue, attachments, account recovery, exam authoring UI, advanced proctoring and production operations are not implemented unless verified in source.

## 6. Apps Script and Firebase

- Keep Apps Script source under `backend/apps-script/`.
- Keep Firebase data below the `htva/` root.
- Store `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` and `HTVA_PASSWORD_PEPPER` only in Apps Script Script Properties.
- Apps Script creates short-lived Firebase OAuth2 tokens from a service-account JWT; grant the service account the required Firebase Realtime Database IAM role. Never use public database rules as a workaround.
- Keep user roles server-controlled. Account provisioning is an operator-only editor action.
- Use deterministic attempt IDs for retry idempotency and enforce configured `maxAttempts`.
- Apps Script quotas and CacheService eviction are known operational limits; disclose them.

## 7. Git discipline

- Work on a dedicated feature branch.
- Do not force-push, merge, delete branches or publish releases without explicit authorization.
- Do not discard unrelated changes or commit generated build output.
- Use focused commits and report changed files, actual validation, known limitations and next steps.
