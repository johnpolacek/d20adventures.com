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

## Patterns that work

What John's own posts show works, added each time he finishes one. `pnpm content:posts` reads this section when it plans an idea, and the brief on `/admin/content` points the drafting LLM here.

- **Plan, don't draft.** The picker gathers an idea's angle, stories, quotes, pictures and questions, and John writes the post with an LLM. Its full draft of “Building an AI Game Master That Plays by the D&D Rules” kept the title and lost the content (John, 2026-11-25: “i like the title but not the content”).
- **Claude, not Gemini.** Name Claude as the game master and leave Gemini out (John, 2026-11-25: “do not mention Gemini - focus on Claude”).
- **Say 5E.** A title says “5E Rules Engine”, not SRD 5.2.1. “Keeping an AI Game Master Inside the Rules with Claude Opus and a 5E Rules Engine” beat “Building an AI Game Master That Plays by the D&D Rules”.
- **One shape.** Title, a short topic intro, a list of items, each one thing and what we did with a picture or a clip, then a conclusion linking to pages on d20adventures.com (John, 2026-11-25: “thats probably a good general structure”). For a whole system, read the codebase for all of it, not only the week's commits. Playtest stories go inside the item they taught. It started as “analyze the codebase for where we are implementing the 5E rules and think of it like a list post, with each item on the list being a thing and what we did”.
- **Show how it works.** A technical post opens its list with the system end to end, such as how an adventure is written and what one turn does, and says at each step whether the AI decides or code does (John, 2026-11-25: “do we get enough into the technical aspects? how we have an adventure plan? what the ai does and what is deterministic?”).
- **Honest about what's open.** Say what we are doing, and that we are still figuring it out. Each item names what is unsolved or untested, and the post doesn't claim a choice is settled before play has shown it (John, 2026-11-25: “i like the idea of saying what we are doing but also being honest that we are still figuring it out”).
- **BG3 is the reason.** Baldur's Gate 3 is the bar for D20 Adventures' rules choices. Full book rules, and suggestions that offer only what works, are both “to be like BG3”, so a post can give that as the why (John, 2026-11-25, on why full rules and on the Speak with Animals suggestion: “full rules is to be like BG3”, “same”).
- **Short post titles.** The post's own title stays short. “Trying to Train an AI Game Master on 5E Rules” replaced “Trying to Keep an AI Game Master Inside the Rules with Claude Opus and a 5E Rules Engine” (John, 2026-11-25: “The title is too long”). The long title is for the queue, not the post.

## Short and long titles

Write a short title and a long title for the content queue. The short one names the outcome and the best-known tools. The long one keeps the short one whole and extends it with the stack. Leave off creator-post promises like “Every Prompt Included”, which read as paid content. Name the setup plainly and leave the reasons for the post. John picked “…Running Claude Opus Locally and Gemini Flash-Lite on the Web” over “…with Claude Opus as the Best GM and Gemini for the Web Demo”. It never lists incidents. This long title listed bugs and was rejected: “How I Keep an AI Game Master Honest When It Suggests Impossible Spells, Skips Rolls and Narrates Things That Never Happened”.

The first one, before and after:

> A full rigged 3D character for $0.60, and three in the game for about $4
>
> Short: Turn Your Character Art into Animated 3D Figures with Hi3D and Blender
>
> Long: How I Turn Painted Character Art into Rigged, Animated 3D Figures with Hi3D, Hyper3D and Blender

## Social posts

- Social posts go to X and Bluesky, the same thread on each (John, 2026-11-25).
- A thread for an `/updates` post follows the post, with its pictures. One post per section, in order, each carrying that section’s image, and the last post links the writeup. John, 2026-11-21: “i was expecting the x post to match the content of the update and use the same images.”
- Drafts don’t add @mentions. The queue page suggests the checked handles in `lib/content-queue/handles.json` for John to click in.
