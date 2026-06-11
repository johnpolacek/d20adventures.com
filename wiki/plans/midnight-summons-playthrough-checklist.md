# The Midnight Summons — Authenticated Playthrough Checklist

[← All plans](index.md) · **Roadmap item #5** · Owner: human tester

The wiki-adventure bridge tests cover data flow, but nothing has run the real authenticated user path to completion. This checklist walks one migrated solo adventure (The Midnight Summons, `realm-of-myr/the-midnight-summons`) from selection through a recorded, completed run. Run it against a local dev server with a signed-in account.

## Setup
1. Start the app: `pnpm dev` (runs Convex + Next on `http://localhost:3000`). Confirm both `convex` and `next` come up.
2. Sign in with a Clerk account (the normal sign-in flow). A real user is required to create an adventure and take turns.
3. Optional admin check: visit `/admin/wiki-adventures` and confirm The Midnight Summons lists with `passed` status and a non-zero encounter count.

## Walkthrough

Record pass/fail and notes for each step.

| # | Action | Expected |
|---|---|---|
| 1 | Open `/settings/realm-of-myr` and choose **The Midnight Summons**. | Card shows correct title, party count (1), premade badge, and image; Play link works. |
| 2 | On character selection, confirm **Thalbern** is shown with Details/Select. | Selecting maps to `thalbern.json` (the sheet), not just the profile markdown. |
| 3 | Select Thalbern. | Solo adventure auto-starts (no multiplayer lobby), copies Thalbern's runtime sheet, and creates the first turn. |
| 4 | Observe the first turn. | Starts at `broken-silence`; narrative combines the encounter intro with Thalbern in initiative; player input is enabled; the AI does **not** play Thalbern. |
| 5 | Submit a cautious investigation action. | GM requests or resolves an appropriate perception/stealth path. |
| 6 | Take a failed or unsafe path. | Transition to `owlbear-confrontation`. |
| 7 | Exercise a critical-health / rescue path. | `timely-rescue` (or Wollandora intervention) behaves consistently. ⚠️ Watch the legacy `broken-silence → wollandora-intervention` edge — it should resolve to `timely-rescue`, not error. |
| 8 | Reach `meeting-at-the-stones`; choose help / go home / learn about relics. | Branch resolves to the chosen target. |
| 9 | Complete one accepted path into `preparing-for-the-city` **and** one refusal into `back-home`. | Both behave as terminal encounters. |
| 10 | Reach a terminal encounter. | Final turn sets `isFinalEncounter`; adventure becomes `status: completed`; `endedAt` is set; completion UI appears. |
| 11 | Inspect the completed record. | Evolved record reflects branch taken, outcome, resolved threads, discoveries, and entity/character updates. |
| 12 | Click **Play Again**. | A new adventure instance starts without mutating the completed record. |

## Acceptance gates
- Public listing and character selection stay visually/behaviorally correct.
- Adventure creation pins the compiled content version/hash.
- Turn advancement reads compiled wiki artifacts, not legacy nested sections/scenes.
- Illegal transitions are rejected before Convex writes.
- Thalbern stays player-controlled; the AI never mutates his sheet without a validated patch.
- Terminal encounters complete the adventure and render completion controls.

## After the run
Record the outcome (and any failures) in [the log](../log.md), and flip roadmap item #5 to done if all gates pass. If a gate fails, capture the encounter id, the action taken, and the observed vs expected behavior.
