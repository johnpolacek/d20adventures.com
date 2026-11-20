#!/bin/bash
# Vercel's ignore step. Exit 0 skips the build, exit 1 builds. A push that changes nothing the site uses is skipped:
# plans, scripts, tests, design, scorecards, the Tauri shell and READMEs. vercel.json's ignoreCommand allows only 256
# characters, so the list lives here.
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null &&
  git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . \
    ':(exclude)wiki' ':(exclude)plans' ':(exclude)scripts' ':(exclude)tests' ':(exclude)design' \
    ':(exclude)asset-library/scorecards' ':(exclude)apps/desktop/src-tauri' ':(exclude)apps/desktop/scripts' \
    ':(exclude)AGENTS.md' ':(exclude)*README.md' || exit 1
