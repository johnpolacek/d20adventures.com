# Content Engine

Goal: find the most shareable things in each week’s work and keep them as ranked drafts, ready to post. Opened 2026-11-21.

## Owner decisions, 2026-11-21

- Drafts are markdown files in the repo, not a Convex table. Every edit is a commit.
- The miner runs `claude -p` headless on John’s subscription. No new provider sees the sessions.
- Posts go out from John’s personal accounts.
- Buffer stays on the free plan. Mastodon posts through its own free API.
- Reddit posts are copied by hand from a text box on the queue page.

## Schedule it feeds

From the 2026 schedule John pasted, starting at the low end:

- X 1 to 2 a day, Bluesky 1, Mastodon 1, Reddit 1 a week, Wednesday.
- An `/updates` post every 7 to 10 days, written first, feeding the short posts.
- Saturday gets the week’s best visual for #ScreenshotSaturday.
- Raise X once two weeks of approved drafts are banked.

Every post carries a number, a screenshot or a clip, or it doesn’t ship.

## Pieces

1. **Miner.** `pnpm content:mine --since 7d`, local only.
   - Reads commits: subject, body, files touched.
   - Reads Claude sessions in `~/.claude/projects/<this repo>/*.jsonl` and Codex sessions in `~/.codex/sessions`. Keeps John’s prompts and the final replies, drops tool output. The Claude logs are 2.6 GB.
   - Scrubs keys and tokens before any snippet reaches the model.
   - Groups the week into topics and scores each: a number, a visual, a surprise, a struggle, a fix.
   - Writes candidates with their evidence: commit hashes, session ids, short quotes.
   - Keeps a marker of what it has read, so nothing is mined twice.
2. **Drafts.** `content/queue/<slug>.md`, one per idea.
   - Frontmatter: `rank`, `status` (idea, drafted, approved, scheduled, posted), `asset`, `evidence`, `posted` URLs.
   - Body sections per platform: X, Bluesky, Mastodon, Reddit, update post.
   - Written in the voice of `docs/writing-voice.md`.
3. **Queue page.** `/admin/content`, editing on localhost only, since it writes files.
   - Ranked list, drag to reorder, status changes, copy edits.
   - A copy button per platform. Reddit’s text sits ready to paste.
   - Ideas can be merged into one update post.
4. **Scheduler.** `pnpm content:schedule`.
   - X and Bluesky through Buffer’s API.
   - Mastodon through its API with John’s token.
   - Writes the posted URLs back to the draft.

## Limits to work within

- Buffer’s free plan holds 10 scheduled posts per channel. Schedule a few days at a time, not a whole week.
- Buffer’s free plan has 3 channels, already X, Bluesky and LinkedIn.
- Reddit subs: r/AI_RPGs, r/TheAI_GM, r/AI_gamedevs, r/SoloDevelopment. Check each one’s self-promotion rules first.

## Stages

1. Miner, run by hand, writing candidates to `content/queue`.
2. Queue page reading and writing those files.
3. Scheduler for Buffer and Mastodon.
4. Weekly run documented, first week seeded from the 3D figures post.

## Open

- Which Mastodon instance and account.
- Whether the queue page is ever needed on the live site, or localhost is enough.
