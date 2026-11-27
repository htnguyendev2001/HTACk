---
name: relationship-app
description: Project-specific guidance for designing and implementing HTVA Ck, a privacy-first Android relationship-organizing app. Use for product planning, Android implementation, personal-data handling, reminders, and any proposed HTVA Vk integration.
---

# HTVA Ck — Relationship App Skill

## 1. Identity

- App: **HTVA Ck**
- Application ID: **com.htanh.appck**
- Related, separate app: **HTVA Vk**
- HTVA Vk application ID: **com.htanh.appvk**

These identifiers are not interchangeable. Do not assume an integration exists.

## 2. Product framing

Design HTVA Ck as a respectful personal organizer for relationship-related information. Suitable directions include:

- Important dates and reminders.
- Shared plans, activities and date ideas.
- Personal notes about preferences or details voluntarily shared.
- Memories and meaningful moments.

Use neutral, respectful language. The app helps its owner organize their own plans and memories; it must not frame another person as property or as someone to control. Treat feature ideas as proposals until verified in source code.

## 3. Consent and privacy by design

- Private by default; least data necessary.
- Clearly label information entered by the app owner versus information voluntarily shared by the partner.
- Never create covert tracking, hidden surveillance, message interception, unauthorized account access, hidden recording or permission bypass.
- Do not infer consent from a relationship, device ownership or access to a shared device.
- Make any sharing explicit, understandable, limited in scope and revocable.
- Avoid exposing sensitive notes in notification previews, logs, screenshots used for diagnostics, analytics or crash reporting.

## 4. Data lifecycle

When a feature stores personal information, specify:

1. What data is collected and why.
2. Who enters it and who can access it.
3. Where it is stored and whether it leaves the device.
4. How it is protected in storage and transit.
5. How long it is retained.
6. How the owner can export or delete it.
7. Whether another person has consented to any sharing.

Do not introduce a database, cloud service, backend, analytics, Firebase, Supabase or third-party SDK without an explicit architecture decision.

## 5. Android engineering context

The existing codebase is Android Native Java with XML layouts and Gradle Groovy DSL.

- Follow existing Java/XML conventions for incremental implementation.
- Do not migrate to Kotlin or Compose without an explicit request or approved plan.
- Inspect the actual Gradle/AGP version before using newer Android APIs or build syntax.
- Keep applicationId, Gradle namespace, manifest package and Java/Kotlin package declarations conceptually separate.
- Avoid global package replacement. Trace imports, activity declarations, generated resources and source paths before a package migration.
- Request only runtime permissions that a clearly defined feature needs.

## 6. HTVA Vk integration

Any future HTVA Ck ↔ HTVA Vk integration is a separate design decision. Before implementation, define:

- The user value and exact data being shared.
- Explicit opt-in and revocation behavior.
- Identity/authentication and authorization boundaries.
- Transport/API or platform handoff contract.
- Data minimization, retention and deletion semantics.
- Failure handling and user-visible sync state.

Do not assume shared credentials, shared storage, common backend, automatic device discovery or silent background transfer.

## 7. Feature design checklist

Before implementing a feature, answer:

- Does it solve a clear organizer/reminder/memory use case?
- Is the information provided voluntarily and collected minimally?
- Is the UI transparent about what is stored and shared?
- Can the owner correct or delete the information?
- Does it avoid surveillance, coercion and unnecessary permissions?
- Does it fit the existing Java/XML project without an unjustified migration?
- Are loading, empty, error, permission-denied and offline states considered where relevant?
- Can the behavior be tested?

## 8. Definition of done

A change is complete only when:

- The agreed behavior is implemented, not merely documented.
- Existing conventions and unrelated code are preserved.
- Relevant tests/build checks were run and their actual results reported.
- No secrets or unnecessary personal data are exposed.
- Documentation reflects the implementation accurately.
- Any remaining limitations or unimplemented ideas are clearly stated.
