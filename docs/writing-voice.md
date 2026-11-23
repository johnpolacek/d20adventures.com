# Writing Posts for D20 Adventures

Posts for `/updates` (`content/updates/*.md`) are written in John Polacek’s voice. The voice itself lives in one shared guide, used by this site and johnpolacek.com:

- On John’s Mac: `/Users/johnpolacek/Projects/johnpolacek-com-nextjs/writing/voice.md`
- Anywhere else: `curl -s https://johnpolacek.com/voice.md`

Read it in full before drafting and run its self-check. The rules below are only what differs on this site. Where they conflict with the shared guide, these win. The shared guide’s Images and Frontmatter sections are for johnpolacek.com, so use the ones here instead.

## How a post gets written

1. **Find the point.** Ask what the piece is about if the source doesn’t say. A repo tells you what was built, not why it matters.
2. **Collect facts.** Use this repo, the live site, and Breadcrumb history. Ask John for the origin and the human moments, since those can’t be recovered from code.
3. **Draft short, then publish.** John often prefers to publish and edit on the live site. Traffic is low, so don’t hold a post over small risks. Name them once and move on.
4. **Check what the post links to.** Readers will click it. A live page shouldn’t let them change real data or run up costs.
5. **Learn from his edits.** After he edits a draft, diff it against the draft and write down the real before and after. A lesson about his voice goes in the shared guide: on John’s Mac, edit it there and commit in that repo. A lesson about this site only goes here. On any other machine, hand the lesson to John instead of editing a copy.

## Site rules

- **Headings** are fine in a long build log or tutorial (700+ words): a few `###` in Title Case, 2–4 words.
- **Tables** only when the material is truly tabular, like a cost per step.
- **Links.** A bare domain for the site itself: “[d20adventures.com]”.
- **Images and video.** Raw HTML `<img>`, never markdown `![]()`: `<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/<post>/name.webp" alt="Plain description" width="1600" height="883" />` with the real measured dimensions. Video is a YouTube `youtube-nocookie.com` iframe.
- **Code.** Filename as an italic line above the fence: `*lib/updates.ts*`.
- **Frontmatter.** `title`, `date` (YYYY-MM-DD, the post shows from that day, Chicago time), `description` (a written one-sentence summary), `image` (full bucket URL), and `draft: true` while it isn’t ready. Frontmatter values keep straight quotes.

## Short and long titles

Write a short title and a long title for the content queue. The short one names the outcome and the best-known tools. The long one keeps the short one whole and extends it with the stack and the promise (“Every Prompt Included”). Name the setup plainly and leave the reasons for the post. John picked “…Running Claude Opus Locally and Gemini Flash-Lite on the Web” over “…with Claude Opus as the Best GM and Gemini for the Web Demo”. It never lists incidents. This long title listed bugs and was rejected: “How I Keep an AI Game Master Honest When It Suggests Impossible Spells, Skips Rolls and Narrates Things That Never Happened”.

The first one, before and after:

> A full rigged 3D character for $0.60, and three in the game for about $4
>
> Short: Turn Your Character Art into Animated 3D Figures with Hi3D and Blender
>
> Long: How I Turn Painted Character Art into Rigged, Animated 3D Figures with Hi3D, Hyper3D and Blender, Every Prompt Included

## Social posts

- Social posts go to X only.
- A thread for an `/updates` post follows the post, with its pictures. One post per section, in order, each carrying that section’s image, and the last post links the writeup. John, 2026-11-21: “i was expecting the x post to match the content of the update and use the same images.”
- Drafts don’t add @mentions. The queue page suggests the checked handles in `lib/content-queue/handles.json` for John to click in.
