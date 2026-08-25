---
name: gameplay-playthrough-testing
description: Run an authenticated end-to-end gameplay playthrough of a D20 Adventures adventure in a real browser to test the actual player flow — character select, turns, dice rolls, encounter transitions, NPC roleplay, and completion. Use when verifying a gameplay change, reproducing or confirming a fix in the running app (not just unit/bridge tests), assessing AI Game Master / roleplay quality, or driving an adventure (Midnight Summons, Covert Cargo, Road to Kordavos, March of Davos) to completion. Bridge tests cover compiled data flow; this covers the live runtime that only a real authenticated session exercises.
---

# Gameplay playthrough testing

Drive a real authenticated adventure in a browser to exercise the live runtime (create → turns → rolls → transitions → completion). This catches bugs the wiki-adventure **bridge tests cannot** — e.g. the solo auto-start redirect swallow, `adventurePatch` dropping malformed AI fields, and the player-reply / NPC-DM paths reading a stale legacy S3 plan instead of the wiki runtime.

## 1. Start the app

```bash
pnpm dev    # Convex + Next on :3000; confirm `next-server` (this project's cwd) owns :3000
```
A stray `wikibop-2` dev server may also be running on the machine — verify the :3000 owner's cwd is this repo.

## 2. Test env flags (local only; revert when done)

Add to `.env.local` (gitignored), then **restart `pnpm dev`** (env is read at startup):
- `NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES=true` — disables Replicate image generation (returns placeholders). Replicate (`104.18.x`) is often unreachable from dev machines and its connect-timeouts bog down heavy multi-NPC turns; **it is never on the gameplay/LLM path**, so disabling it is safe and recommended. The text model (`gemini-3.5-flash-lite`) is fast and is the real engine.

In `.env`, add the test user's Clerk id to `ADMIN_USER_IDS` (comma-separated) for **admin + practice-mode** access, then restart.

In-game **token economy**: a fresh user starts ~700 tokens and each LLM call charges it (`INSUFFICIENT_TOKENS` stalls turns). Top up:
```bash
npx convex run userTokenManagement:incrementTokens '{"userId":"<clerkId>","tokensToCredit":1000000,"transactionType":"adjustment_manual"}'
```

## 3. Auth — create a test user (don't sign up in-browser)

Clerk is a dev instance (`pk_test`). Browser **sign-up hangs on Clerk bot/CAPTCHA**, so create the user via the Backend API with `CLERK_SECRET_KEY` (in `.env`):
```bash
curl -s -X POST https://api.clerk.com/v1/users \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"username":"d20tester","email_address":["d20-tester+clerk_test@example.com"],"password":"<pw>","skip_password_checks":true,"skip_legal_checks":true}'
```
API-created emails are **auto-verified**, so password **sign-in** works (sign-in is not CAPTCHA-gated). `+clerk_test` emails need no real inbox.

## 4. Drive the browser with agent-browser

`agent-browser` (CLI; use `npx -y agent-browser@latest skills get core` for current docs). `--headed` shows the window; persist auth with `state save`/`--state <file>` (there is **no standalone Clerk sign-in page** — it's a modal — so state-restore is the reliable rerun).

Turn loop per character: **Go To Reply → wait ~2.5s+ for the `<textarea>` to appear → fill a present-tense third-person action → Send Reply → (maybe Roll D20) → Go To Next Turn.**

Hard-won driving rules:
- The reply textbox takes ~2.5s after "Go To Reply"; **retry, and `agent-browser reload` to recover** when it doesn't appear (long sessions leave the UI stale). Reloading also re-triggers stalled NPC processing.
- Match the **`button "Roll D20"`** exactly — don't grep loosely (the "D20 Adventures" logo also matches `d20`).
- Multi-PC turns act in **initiative order**; the engine's `[LLM] Stopping at player character: X` log (not the roster "YOU" badge) tells you the real current actor.
- LLM turn-advance takes ~20–60s; long `agent-browser wait` calls may background — poll the task output file.

## 5. Adventure shapes

- **Solo** (1-player, premade — e.g. Midnight Summons): selecting the premade **auto-starts** and redirects to turn 1.
- **Multi-player** (Covert Cargo, party 2-2): the public flow is a real **lobby** (needs 2 players + invite). Solo-test via **practice mode** (`/settings/<setting>/<plan>/practice`, admin-gated) to control all PCs.
- **Custom-character** (Road to Kordavos, 1-3): select a saved character or create one. To **backend-create** a character (the UI image step needs Replicate), write a `pcTemplateSchema` (`types/character.ts`) JSON to S3 `characters/<clerkId>/<id>.json` via `updateJsonOnS3` (run with `node --env-file=.env --env-file=.env.local --import tsx scripts/<x>.ts`).

## 6. Encounter transitions

Transitions fire when the AI GM picks the next encounter based on the **`## Transitions` cues in the encounter source** (`content/settings/<setting>/adventures/<plan>/encounters/*.md`). Read them first. Examples: `the-shipment → the-transaction` needs "Lyra verbally confirms the magic"; `battle-on-the-boat → the-crate` needs overcoming the guards; `well-met → the-gates-ahead` is "after 4 turns" (automatic). **Generic actions that match no cue correctly keep the GM in the encounter** — that is not a bug; match the real cue.

## 7. Proving a fix

Reproduce the broken state, fix, and **prove the fix uses the intended path** by deliberately breaking the old source. E.g. for the legacy-plan bugs: re-stub the S3 plan (empty `sections[].scenes[].encounters`) and confirm the action still works (proving it reads the wiki runtime), then restore the complete plan from `wiki/sources/adventure plans/*.json`.

## 8. Cleanup

Revert `.env.local` (`NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES`) and the `ADMIN_USER_IDS` test entry. The Clerk test user, credited tokens, and any backend-created characters/plans persist in the dev backend (harmless to leave). Stop `pnpm dev` and `agent-browser close`. The agent-browser session/vault lives in gitignored `.agent-browser/`.
