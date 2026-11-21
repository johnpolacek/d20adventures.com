# Content Engine

Goal: find the most shareable things in each week’s work and keep them as ranked drafts, ready to post. Opened 2026-11-21.

## Owner decisions, 2026-11-21

- Drafts are markdown files in `content/queue`, not a Convex table. The repo is public, so they stay out of Git and sync to the private data bucket under `content-queue/` with `pnpm content:sync`.
- The miner runs `claude -p` headless on John’s subscription. No new provider sees the sessions.
- Posts go out from John’s personal accounts.
- Buffer stays on the free plan.
- Mastodon waits. Revisit once X and Bluesky hold the cadence for a month.
- The queue page edits files on localhost only.
- Reddit posts are copied by hand from a text box on the queue page.

## Schedule it feeds

From the 2026 schedule John pasted, starting at the low end:

- X 1 to 2 a day, Bluesky 1, Reddit 1 a week, Wednesday.
- An `/updates` post every 7 to 10 days, written first, feeding the short posts.
- Saturday gets the week’s best visual for #ScreenshotSaturday.
- Raise X once two weeks of approved drafts are banked.

Every post carries a number, a screenshot or a clip, or it doesn’t ship.

Each idea is judged as a stranger scrolling would see it, scored 1 to 5 on each:

- Hook: would they stop scrolling? Lead with the moment, not “I built.”
- Payoff: what do they walk away with?
- Spread: why would they pass it on?

What spreads here: rules gotchas and AI GM mistakes, cost tables, funny visual fails with a fix, tricks for AI 3D and agents. Ideas scoring 12 or more are tier 1. Cut and folded ideas keep a rank of 90 and up.

## Pieces

1. **Miner.** `pnpm content:mine --since 7d`, local only.
   - Reads commits: subject, body, files touched.
   - Reads Claude sessions in `~/.claude/projects/<this repo>/*.jsonl` and Codex sessions in `~/.codex/sessions`. Keeps John’s prompts and the final replies, drops tool output. The Claude logs are 2.6 GB.
   - Scrubs keys and tokens before any snippet reaches the model.
   - Groups the week into topics and scores each on hook, payoff and spread.
   - `--print` with `--day` tries the prompt on one day and writes nothing.
   - Writes candidates with their evidence: commit hashes, session ids, short quotes.
   - Keeps a marker of what it has read, so nothing is mined twice.
2. **Drafts.** `content/queue/<slug>.md`, one per idea.
   - Frontmatter: `rank`, `tier`, `scores`, `status` (idea, drafted, approved, scheduled, posted, folded, cut), `into` for folded ideas, `asset`, `evidence`, `posted` URLs.
   - Body: point, hook, payoff, why it spreads, facts, John’s words.
   - Body sections per platform: X, Bluesky, Reddit, update post.
   - Written in the voice of `docs/writing-voice.md`.
3. **Queue page.** `/admin/content`. It writes files, so it edits on localhost only.
   - Ranked list, drag to reorder, status changes, copy edits.
   - A copy button per platform. Reddit’s text sits ready to paste.
   - Ideas can be merged into one update post.
4. **Scheduler.** `pnpm content:schedule`.
   - X and Bluesky through Buffer’s API.
   - Writes the posted URLs back to the draft.

## Limits to work within

- Buffer’s free plan holds 10 scheduled posts per channel. Schedule a few days at a time, not a whole week.
- Buffer’s free plan has 3 channels, already X, Bluesky and LinkedIn.
- Reddit subs: r/AI_RPGs, r/TheAI_GM, r/AI_gamedevs, r/SoloDevelopment. Check each one’s self-promotion rules first.

## Stages

1. Miner, run by hand, writing candidates to `content/queue`. Done 2026-11-21. `pnpm content:mine`, with `--dry`, `--day` and `--since`. One call per day, then one to merge and rank. A day takes about 45 seconds. The miner syncs before and after it writes.
2. Queue page reading and writing those files. Done 2026-11-21. `/admin/content`, development only and admin only. Live, folded and cut views, sort by rank or score, drag or arrows to reorder, an editor per idea with X, Bluesky and Reddit drafts, character counts, Copy buttons, posted URLs, and a Sync button. Cmd+S saves.
3. Scheduler for Buffer.
4. Weekly run documented, first week seeded from the 3D figures post.
