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

## Owner decision, 2026-11-21: nothing posts on its own

The engine plans, drafts, listens and organizes. John approves and posts every word.

- No script calls a write endpoint on X, Bluesky or Reddit.
- Buffer gets a post only when John presses Send to Buffer on an approved X or Bluesky draft. Approving alone sends nothing.
- Reddit posts and all replies are copied and pasted by hand.
- X is read through John’s signed-in Chrome only when he asks, in a live Claude session, never on a timer. X’s terms ban automated access, so it waits until Bluesky and Reddit listening work.

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
   - Frontmatter: `rank`, `tier`, `scores`, `status` (idea, draft, scheduled, posted, shelved), `into` for folded ideas, `asset`, `evidence`, `posted` URLs.
   - Body: point, hook, payoff, why it spreads, facts, John’s words.
   - Body sections per platform: X, Bluesky, Reddit, update post.
   - Written in the voice of `docs/writing-voice.md`.
3. **Queue page.** `/admin/content`. It writes files, so it edits on localhost only.
   - Ranked list, drag to reorder, status changes, copy edits.
   - A copy button per platform. Reddit’s text sits ready to paste.
   - Ideas can be merged into one update post.
4. **Week planner.** `pnpm content:plan` fills the schedule’s slots from the ranked queue and writes `content/queue/week-<date>.json`. The queue page gets a Week view.
5. **Drafter.** `pnpm content:draft <slug>` fills an idea’s X, Bluesky and Reddit sections from the voice guide, its “Social threads” part above all. Status becomes drafted, and John approves.
6. **Listener.** `pnpm content:listen` writes one file per conversation to `content/inbox/`, synced like the queue.
   - Bluesky: replies, mentions and quotes, plus a few searches, with an app password.
   - Reddit: new posts in the subs below, plus searches, from the public JSON.
   - Claude scores each one on whether it is worth joining and drafts an answer.
   - An Inbox tab on the queue page: the thread, the draft, Open, Copy, Replied, Skip.
7. **X reader.** A project skill for a live Claude session that reads notifications and 2 or 3 searches through Claude in Chrome, slowly, into `content/inbox/`.
8. **Buffer button.** Send to Buffer on approved X and Bluesky drafts.
   - Buffer’s GraphQL API, one key on the free plan, 3,000 requests per 30 days.
   - Pictures go by public URL, so an asset is in the public bucket first.
   - Writes the Buffer id, then the posted URL, back to the draft.

## Gameplay videos

Owner decision, 2026-11-21: keep a record of when each gameplay video is recorded, and draft its posts from the commits made since the one before.

- `content/queue/videos.json` holds each video's title, recorded time and YouTube link. It syncs with the queue.
- `pnpm content:video add <url> --at <time>` records one. A time without an offset is Chicago time.
- `pnpm content:video draft` writes `gameplay-<date>.md`: titles, the changes a player would notice, and 3 to 6 clips, each with a short post and the moment to cut.
- John marks where each clip is in the video. The draft only knows what changed, not what the camera caught.

## Limits to work within

- Buffer’s free plan holds 10 scheduled posts per channel. Schedule a few days at a time, not a whole week.
- Buffer’s free plan has 3 channels, already X, Bluesky and LinkedIn.
- Reddit subs: r/AI_RPGs, r/TheAI_GM, r/AI_gamedevs, r/SoloDevelopment. Check each one’s self-promotion rules first.

## Stages

1. Miner, run by hand, writing candidates to `content/queue`. Done 2026-11-21. `pnpm content:mine`, with `--dry`, `--day` and `--since`. One call per day, then one to merge and rank. A day takes about 45 seconds. The miner syncs before and after it writes.
2. Queue page reading and writing those files. Done 2026-11-21. `/admin/content`, development only and admin only. Live, folded and cut views, sort by rank or score, drag or arrows to reorder, an editor per idea with X, Bluesky and Reddit drafts, character counts, Copy buttons, posted URLs, and a Sync button. Cmd+S saves.
3. Week planner and drafter.
4. Bluesky and Reddit listener, with the Inbox tab.
5. Buffer button.
6. X reader through Chrome, tested once by hand before it becomes a skill.
7. Weekly run documented, first week seeded from the 3D figures post.
