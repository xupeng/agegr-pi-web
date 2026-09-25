# Prototype portable ask_user extension

## Goal

Make the bounded `ask_user` tool/schema/validation reusable as a locally installable Pi extension while Pi Web retains its current asynchronous question-card behavior.

## Background

The archived standalone feasibility report separates reusable tool logic (`lib/ask-user/{tool,types,store}.ts`) from Pi Web's inline adapter and host-owned state/UI. A Pi package by itself cannot supply a question card in another host.

## Requirements

- Provide a local package/extension entry compatible with Pi SDK 0.85.1 and an explicit `open` host bridge contract; return an error if unavailable, never `terminate: true` on an unregistered ask.
- Reuse a single schema/validator and bounded DTO definitions across package and Pi Web; preserve existing Pi Web open/supersede/submit/cancel/follow-up semantics and settings/tool visibility.
- Document local installation and peer SDK version requirements; verify actual SDK discovery plus one host adapter. Do not promise npm or third-party compatibility.
- Keep Pi Web-only names, persistence files, SSE and Web components outside the portable contract; retain MIT notice for substantial copied code.

## Acceptance Criteria

- [ ] Extension loads through a local Pi package path; a missing host bridge fails visibly; malformed inputs stay errors and no pending ask is lost by pretending success.
- [ ] Pi Web's existing async ask lifecycle and visibility behavior remain unchanged under focused and full regression checks.
- [ ] A documented bridge contract can be exercised from an isolated host fixture and consumed by the PA task without importing Next/server-only modules.

## Out of Scope

- Publishing to npm, silently enabling the operator's PA extension switch, and owning PA browser/state behavior in the portable package.
