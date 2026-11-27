# AGENTS.md — HTA Ck

## 1. Project identity

- Product name: **HTA Ck**.
- Android application ID: **com.htanh.appck**.
- Related but separate app: **HTAVk**, application ID **com.htanh.appvk**.
- Never swap these IDs or assume the two apps already communicate.
- Read README.md and .agents/skills/relationship-app/SKILL.md before product or architecture work.

## 2. Mandatory start-of-task workflow

Before making changes:

1. Inspect the current branch, working tree, repository structure and relevant files.
2. Read the relevant Gradle configuration, manifest, source code, resources and tests.
3. Identify the actual behavior implemented today; do not infer implementation from product ideas or documentation.
4. Check existing project conventions and preserve unrelated user changes.
5. For non-trivial work, state the intended scope, affected files, risks and validation plan before editing.
6. Do not assume prior agent notes are more current than the checked-out source.

## 3. Existing engineering baseline

The repository currently uses Android Native Java, XML layouts/resources and Gradle Groovy DSL. The current baseline includes Android Gradle Plugin 7.2.2, compileSdk 32, minSdk 21 and targetSdk 32.

- Preserve Java/XML conventions for incremental changes.
- Do not migrate to Kotlin, Jetpack Compose, a new architecture, or a new build system unless explicitly requested or justified and approved.
- Do not upgrade Gradle, AGP, SDK levels or dependencies opportunistically.
- Keep changes focused and compatible with the repository's current toolchain.

## 4. Android identity and package rules

The intended application ID is com.htanh.appck; HTAVk remains com.htanh.appvk.

Treat these as distinct concepts:

- applicationId: installed app identity and Play distribution identity.
- namespace: Android Gradle namespace, if configured.
- Manifest package: legacy/source namespace behavior, depending on AGP version.
- Java/Kotlin package declarations and their directory paths.

Do not perform a blind global replacement of com.example.bmi. Before changing namespace, manifest package, source package declarations, imports, generated R references or file paths, inspect all usages and plan the migration. A change to applicationId alone does not migrate Java packages.

Keep the launcher label aligned with HTA Ck. Do not leave project identity configured as BMI where it is directly user-facing, but do not rename unrelated resources/classes without checking references.

## 5. Product boundaries and consent

HTA Ck is a personal relationship-organizing tool, not a surveillance or coercive-control tool.

Allowed product directions include personal reminders, important dates, shared plans, date ideas, memories and notes about information voluntarily shared.

Never implement or facilitate:

- Covert location tracking or hidden monitoring.
- Reading private messages or accessing another person's accounts without authorization.
- Hidden audio/video recording, spyware, stealth collection or permission bypass.
- Sharing personal information with HTAVk without clear, informed, revocable consent.

Clearly distinguish owner-entered notes from information the partner voluntarily provides. Make sharing state visible and revocable.

## 6. Personal data and security

- Default to private/local handling unless an approved architecture says otherwise.
- Collect the minimum data needed for the feature.
- Do not put sensitive relationship notes or personal data in logs, analytics, crash reports or notification previews by default.
- Use platform permissions only when required, explain their purpose and handle denial gracefully.
- When persistence or synchronization is introduced, define access control, encryption/storage protection, retention, export and deletion behavior.
- Never add a backend, cloud database, Firebase, Supabase, analytics, advertising SDK or third-party data processor without explicit approval.
- Never commit keystores, signing credentials, tokens, passwords, OAuth secrets, service-account keys or local machine configuration.

## 7. HTAVk relationship

HTAVk is a separate Android application with application ID com.htanh.appvk.

Do not assume a shared database, API, authentication system, deep-link contract, permissions model or data-sharing agreement exists. Propose an explicit integration design first. Any future sharing must be opt-in, scoped, authenticated, auditable where appropriate and revocable.

## 8. Implementation workflow

For each task:

1. Confirm scope and acceptance criteria.
2. Inspect the smallest relevant code surface.
3. Implement the smallest maintainable change.
4. Add or update tests where meaningful.
5. Run the narrowest relevant Gradle build/test commands; expand validation when risk warrants it.
6. Review the diff for unrelated edits, secrets, privacy leaks and package/configuration mistakes.
7. Report changed files, validation actually performed, known limitations and follow-up work.

Never claim a build or test passed unless it was actually run and its result observed.

## 9. Git discipline

- Do not force-push, rewrite shared history, delete branches, merge branches or publish releases without explicit authorization.
- Do not discard or overwrite unrelated work.
- Do not commit generated build output or machine-specific files.
- Use focused commits with descriptive messages when committing is requested.
