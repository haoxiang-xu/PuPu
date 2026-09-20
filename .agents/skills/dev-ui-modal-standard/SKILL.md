---
name: dev-ui-modal-standard
description: Standardize modal UI to match the Settings/Tools baseline used in this repo. Use when a user asks to align modal style/spacing/typography/close-button behavior, or says a modal looks inconsistent (for example close button position, border radius, title size/font, or empty-state panel visibility).
---

# Dev UI: Modal Standard

## Overview
Apply the repo's modal baseline from Settings/Tools to a target modal with minimal scope.
Lock exact values for close button and title styling unless the user explicitly requests otherwise.

## Baseline Sources
Read these files before editing so the standard is copied from the real implementation:
- `src/COMPONENTs/settings/settings_modal.js`
- `src/COMPONENTs/toolkit/toolkit_modal.js`
- `src/BUILTIN_COMPONENTs/modal/modal.js`
- `src/BUILTIN_COMPONENTs/theme/default_mini_theme.json`

## Standard Spec
Use these values as the default modal standard in this repo:

1. Modal container
- Do not hardcode modal corner radius unless explicitly requested.
- Let modal corner radius come from theme (`theme.modal.borderRadius`, currently `12`).

2. Close button
- Use `Button` close control for Settings/Tools parity (not `ModalCloseButton`) when standardization is requested.
- Use exact style values:
  - `position: "absolute"`
  - `top: 12`
  - `right: 12`
  - `paddingVertical: 6`
  - `paddingHorizontal: 6`
  - `borderRadius: 6`
  - `opacity: 0.45`
  - `zIndex: 2`
  - `content.prefixIconWrap`: centered flex with `lineHeight: 0`
  - `content.icon`: `{ width: 14, height: 14 }`

3. Title typography
- Match Settings title defaults when asked to align title style:
  - `fontSize: 22`
  - `fontWeight: 600`
  - `fontFamily: "NunitoSans, sans-serif"`

## Workflow
1. Audit
- Inspect the target modal and identify deltas against baseline:
  - close button implementation and offsets
  - modal corner radius source
  - title size/font/weight
  - state-based layout behavior (for example empty-state side panels)

2. Patch minimally
- Change only the target modal and only the requested inconsistencies.
- Preserve existing behavior unless the user asked for behavior changes.

3. Handle empty-state side panels when requested
- If user asks to hide detail/sidebar in empty state, conditionally render that block.
- Default pattern: render the side panel only when state is not empty.
- Keep loading/error behavior unchanged unless user asks otherwise.

4. Verify
- Run file-level eslint for changed files.
- If available, run targeted tests relevant to changed behavior.
- Report any unrelated pre-existing test failures explicitly.

## Output Checklist
Include these in your final response:
- Which modal(s) were aligned
- Exact styling decisions applied
- File references to changed lines
- Validation commands run and results
- Any known unrelated failures
