<!--
Read CONTRIBUTING.md first. One problem per PR.
Title it like a commit, since it becomes one: "fix(web): keep the seek bar under the finger".
-->

## Problem

<!-- What's wrong or missing, in a sentence or two. Link the issue: "Closes #123".
A feature needs an issue where we agreed on it. -->

## Change

<!-- How this fixes it. If it touches several parts (contract, server, web,
Android), say why each one is needed for this fix. -->

## Verification

<!-- What you tried by hand and what you saw. Name the browser or device.
For UI changes, add before and after screenshots, and a recording for motion
or gestures. Say what you couldn't test. -->

## Checklist

- [ ] `pnpm verify` passes
- [ ] Tried the affected flows in a browser or on a device
- [ ] New user-facing text is in `locales/en/` and translated
- [ ] Ran `pnpm api:android` after a contract change
- [ ] Generated a new migration after a schema change, without editing old ones

<!-- If a coding agent wrote some of this, name the agent and model here. -->
