---
title: "Add Real-Time Voice to Your Game’s AI-Generated Text"
date: 2026-11-26
description: "How D20 Adventures priced text-to-speech against one real game, picked Kokoro by ear, and runs it free on the player’s own machine in the desktop app and the browser."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/add-real-time-voice-to-your-games-ai-generated-text/story-box.webp"
header: /images/updates/add-real-time-voice-to-your-games-ai-generated-text.webp
draft: true
---

<!-- Not made: the desktop app clip with the Narrator row, the paid voice vs Kokoro clip, the Myr and Silas before and after clip, and the Silas voice-switch clip. They need the desktop app or audio, and both were off limits for this run. The Narrator row is desktop only, so the site's Scene Settings can't show it, and a code block stands in. The Read Aloud picture is cropped from an 823 px session screenshot, so it's small. -->

I wanted the story in [D20 Adventures](https://d20adventures.com) read aloud. The catch is that the AI game master writes most of it on the fly, and paying a voice service for every line adds up.

So I priced text-to-speech options against one real game, then picked by ear. The winner costs nothing per game.

### How It Works

Some story text is written ahead in the adventure’s markdown, and the AI writes the rest each turn. Code does everything after that. It splits a paragraph into sentences and skips rolls, class features and the players’ own words. [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) turns each sentence into audio on the player’s machine. The desktop app runs it in Node, and the browser on the graphics card.

The scene’s ambience dips about 6 dB while the voice speaks, then eases back. Nobody has tuned that by ear yet, or tried it on iOS.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/add-real-time-voice-to-your-games-ai-generated-text/story-box.webp" alt="A dark forest trail at night in the Owlbear Prowls, with the story box at the bottom left reading “Eyes shine in the shadows of the tree line, where the sound came from.”" width="1600" height="750" />

### Pricing a Real Game

The first idea was to render the authored text once and serve it as files. I pointed out that the AI writes a lot of it live, so Claude counted my latest save of The Midnight Summons: 10 turns, 8,513 characters, about 9.5 minutes of speech. The AI wrote 71% of it. Caching the authored 29% saves little, so every option has to read new text in real time.

| Option | Per 1,000 games |
|---|---|
| OpenAI gpt-4o-mini-tts, retiring Jan 2027 | ~$140 |
| Google Chirp 3 HD | ~$260 |
| ElevenLabs Flash | ~$430 |
| ElevenLabs Multilingual v2 | ~$850 |
| Kokoro on the player’s machine | $0 |

The paid rows come from the published rates for [Chirp 3 HD](https://cloud.google.com/text-to-speech/docs/chirp3-hd), [OpenAI](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) and [ElevenLabs](https://elevenlabs.io/pricing/api), not my bills.

Claude first passed over the open model, since a server costs the same every month whether anyone plays. I asked why. Kokoro is small enough to run on the player’s own computer, so there’s no server at all.

Claude rendered three story boxes from my last game in Kokoro and in a paid cloud voice. Kokoro made each 13 to 18 second clip in 5 to 8 seconds on the Mac’s CPU. Kokoro sounded better to me.

### Chatterbox, Dropped

[Chatterbox Turbo](https://huggingface.co/ResembleAI/chatterbox-turbo) looked like the one open model that might out-act Kokoro and still run on a Mac. It’s several times bigger.

| Model | Size | Download |
|---|---|---|
| Kokoro | 82M parameters | about 90 MB |
| Chatterbox Turbo | 350M parameters | about 560 MB to 3.3 GB |

The 8-bit version made nothing in 10 minutes. The 4-bit one took 30 to 90 seconds a clip, and 2 of 3 clips came out mostly silence. Both ran on the CPU, so it wasn’t a fair test. Resemble AI’s own version runs on the Mac’s graphics chip and never got a try.

### Four Voices in the App

Two voices per accent is enough to split narration from dialogue. Scene Settings in the desktop app got a Narrator row with Off and four voices, English Woman by default. Each voice names its counterpart:

*packages/ui/src/sound/narrator.ts*

```ts
  { id: "bf_emma", label: "English Woman", gender: "female", other: "bm_george" },
  { id: "bm_george", label: "English Man", gender: "male", other: "bf_emma" },
  { id: "af_heart", label: "American Woman", gender: "female", other: "am_michael" },
  { id: "am_michael", label: "American Man", gender: "male", other: "af_heart" },
```

Words in quote marks from a speaker of the other gender go to `other`. Gender comes from the character sheet, or else the pronouns in their description. Every man in the game shares one voice.

The Node process starts once and stays up, so the model loads one time. It makes speech about twice as fast as it plays and adds 39 MB to the app.

### The Browser, Twice

The first browser try ran Kokoro on the CPU. Speech came out slower than it plays, and on the site’s play screen it never made a sentence at all. Worse, Continue waited forever on the live site. Now a sentence not ready in 12 seconds is skipped, so the story never waits on the voice. The browser voice still never spoke on the site, so the site lost its narrator until the next try.

A second benchmark in Chrome on a Mac put Kokoro in a worker on WebGPU:

| Model | Download | Speed |
|---|---|---|
| 8-bit on CPU (desktop app) | 92 MB | about speech speed |
| Full size on GPU | 326 MB | 5x faster than speech |
| Half size on GPU | 163 MB | 5x, duller, clips peaks |
| 4-bit on GPU | 155 MB | 5x, duller |

The full-size model sounded about the same as the desktop voice to me, so that’s the one. Read Aloud on the web demo starts off and counts its download up to 100%. It reads the latest turn’s new paragraphs and plays the scene’s ambience. Browsers without WebGPU get no switch.

It’s only been tried in Chrome on a Mac, and Claude watched it work without hearing it. Safari, phones, and reading paragraphs as the GM writes them are all untested.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/add-real-time-voice-to-your-games-ai-generated-text/read-aloud.webp" alt="The web demo’s turn view for Thalbern, with Sound and Read Aloud switches at the bottom left under the story text" width="560" height="392" />

### Saying Made-Up Names

Kokoro guesses sounds from spelling, and it had never seen the setting’s names. “Myr” came out “muh” and names drifted between sentences. Now each setting lists its names as a sound-alike or as IPA, British then American:

*content/settings/realm-of-myr/pronunciations.md*

```
- Myr: "meer"
- Silas: /sˈaɪləs/
- Valkaran: /vˈalkɑːɹan/ /vˈælkɑɹæn/
```

The narrator copies the step [kokoro-js](https://www.npmjs.com/package/kokoro-js) uses to turn words into sounds, and swaps in the listed sounds for each name. A names tool lists every made-up name and renders each in all four voices. A hero’s name the player picked is still a guess.

The free web demo is [The Midnight Summons](https://d20adventures.com/settings/realm-of-myr/the-midnight-summons), in [the Realm of Myr](https://d20adventures.com/settings/realm-of-myr). The narrator runs in [the desktop app](https://d20adventures.com/desktop), its code is [on Github](https://github.com/johnpolacek/d20adventures.com/tree/main/packages/ui/src/sound), and other build posts are at [d20adventures.com/updates](https://d20adventures.com/updates).
