---
name: htva-exam-app
description: Project-specific guidance for HTVA Ck exam delivery, student submissions, teacher grading, Apps Script and Firebase security.
---

# HTVA Ck — Exam App Skill

## Product identity

HTVA Ck is the Android application for students to take exams and submit answers, and for teachers to receive and grade those submissions. Android applicationId: `com.htanh.appck`. HTAVk (`com.htanh.appvk`) is separate.

## Approved architecture

Android -> Google Apps Script Web App -> Firebase Realtime Database.

There is no separate Backend project. Firebase Authentication is not used. Google Apps Script is the trusted server-side boundary. Do not add Firebase Auth or create a separate backend without a new explicit architecture decision.

## Identity and authorization

- App accounts are provisioned by an authorized operator in Apps Script.
- Roles are server-managed: `student` and `teacher`.
- Server derives user UID and role from a valid session.
- Students can only submit as themselves and read their own history.
- Teachers can only inspect/grade exams assigned to them.
- Validate all authorization and business rules server-side.

## Secrets and data

- Never place Firebase Admin credentials, service-account keys, database secrets, password pepper, session tokens or account passwords in Android or source control.
- Keep Firebase access server-side using Apps Script OAuth token and IAM.
- Firebase client rules deny direct reads and writes.
- Keep data under Firebase root `htva/`.
- Do not log passwords, tokens or full answer payloads.
- Use HTTPS only.

## Android conventions

Use Java, XML and the current Gradle Groovy DSL. Preserve the current toolchain unless explicitly approved. Avoid blind package renames. Handle loading, empty, error and network failure states.

## Current scope boundaries

Manual teacher grading is supported. Do not claim automatic grading, offline durable submission queue, attachment upload, account recovery, exam authoring UI, anti-cheating/proctoring or production readiness unless these are implemented and verified.

## Definition of done

A feature is done only when implementation, authorization checks, failure handling, tests/build validation and documentation are reviewed. Report any validation that could not be run.
