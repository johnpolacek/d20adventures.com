import type { Beat } from "@/lib/stage/beats"
import type { StagingShot } from "@/lib/stage/spec/staging"

// A canned run of March of Davos, encounter 1 ("The Gates of Kordavos"), for the stage-first turn page mock.
// No Convex and no model: each GM turn is scripted, with the beats a per-turn generator would produce, and the player's
// typed reply is quoted back as their line. The set's queue loop keeps the line alive.
//
// The intro is the encounter's opening, staged a paragraph at a time: the gate, the line (people in it talking), and
// Garlan at the counter. Intros like it would be drafted by a model when the adventure plan is staged and edited by its
// author. Then the turns: Yeva, waiting in the stalled line beside a spice merchant, while a cutpurse works the crowd
// (a contest: his Sleight of Hand, shown, against her Perception); then Garlan's questions at the front.

export interface MockRoll {
  skill: string
  ability: string
  dc: number
  modifier: number
  // A contest: the opposing roll, shown first; the player has to meet or beat its total.
  versus?: { name: string; skill: string; natural: number; modifier: number }
}
type Outcome = { total: number; success: boolean } | null
// A roll the GM calls for partway through a turn: the turn's beats stop for it, then the rest plays out with the result.
export interface MockContest {
  actor: string
  prompt: string
  roll: MockRoll
  narrative: (reply: string | null, roll: Outcome) => string[]
  beats: (reply: string | null, roll: Outcome) => Beat[]
}
export interface MockHold {
  actor: string
  shot: StagingShot
  prompt: string
  suggestion: string
  // The GM asks for this roll after the actor's reply, before the next turn resolves.
  roll?: MockRoll
}
export interface MockTurn {
  title: string
  intro?: boolean
  // Whose turn the GM's beats are, for the initiative bar (an NPC answering), if anyone's.
  npc?: string
  narrative: (reply: string | null, roll: { total: number; success: boolean } | null) => string[]
  beats: (reply: string | null, roll: { total: number; success: boolean } | null) => Beat[]
  contest?: MockContest
  hold: MockHold | null
}

export const PARTY = ["branka", "cassia", "yeva", "milos"] as const
// Stageview checks: ?roll=20 fixes the player's natural roll (to see both outcomes of the contest).
export const FORCED_ROLL = typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("roll")) || null

// Card text for the characters (from the premade sheets and Garlan's NPC entry).
export const ABOUT: Record<string, { about: string; lines?: string[] }> = {
  garlan: {
    about: "A burly Asterian with a stern face, kind eyes and a well-groomed beard, in polished half-plate and the navy-and-gold tabard of the city guard. Diligent and fair.",
    lines: ["Next!", "State your business in Kordavos.", "There is a fee of three marks for entrance."],
  },
  branka: { about: "A broad-shouldered dwarf with copper braids and a battered breastplate stamped with the old gate-ward sigil of Kordavos. Her family kept this gate for four generations." },
  cassia: { about: "A precise Asterian cartographer-mage with ink-stained fingers, a grey travelling coat lined with map pockets, and a folio of charts of the tunnels beneath Kordavos." },
  yeva: { about: "A quick halfling with sharp hazel eyes and dark curls under a festival cap. Half a dozen hidden pockets, and at least one item she was only holding for a friend." },
  milos: { about: "A lean Valkaran Wayfinder priest in undyed robes, with a close-cropped grey beard, a bronze compass-star of the Church of Valkara, and a staff notched with the miles." },
  oskar: {
    about:
      "A stout spice-trader of the Saffron Road in a quilted burgundy doublet, with a spice chest under his arm and a fat embroidered purse at his belt. He tells anyone within earshot what the fee is costing him.",
    lines: ["Three marks a head, at Harvest! Highway robbery in a tabard."],
  },
  cutpurse: { about: "A lanky street youth in a patched grey hood, with quick hands and quicker feet. Harvest crowds are good hunting." },
}

const quote = (reply: string | null, fallback: string) => {
  const r = (reply ?? "").trim()
  if (!r) return fallback
  const said = r.match(/[“"]([^”"]{3,})[”"]/)
  if (said) return said[1]
  const first = r.split(/(?<=[.!?])\s/)[0]
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}
const onBranka: StagingShot = { subject: "branka", distance: 3.1, angle: 18, height: 1.45, lookHeight: 1.0, fov: 40 }
const onCassia: StagingShot = { subject: "cassia", distance: 3.3, angle: -16, height: 1.7, lookHeight: 1.35, fov: 40 }
const onYeva: StagingShot = { subject: "yeva", distance: 2.9, angle: 22, height: 1.25, lookHeight: 0.8, fov: 40 }
const onMilos: StagingShot = { subject: "milos", distance: 3.4, angle: -20, height: 1.75, lookHeight: 1.45, fov: 40 }
const onGarlan: StagingShot = { subject: "garlan", distance: 3.6, angle: 38, height: 1.7, lookHeight: 1.45, fov: 42 }
// The intro's and the first turn's framings. The line faces east where it turns toward the counter, so the camera
// stands east of it to see faces: the party with the merchant behind them and their neighbours; Yeva with Oskar looming
// behind her; the same corner as the cutpurse slips in at Oskar's shoulder. And Garlan at the counter.
const inLine: StagingShot = { position: [3.4, 2.0, 17.4], target: [-2.0, 1.2, 15.3], fov: 50 }
const atCounter: StagingShot = { position: [-1.4, 1.75, 10.6], target: [1.5, 1.35, 12.2], fov: 40 }
const yevaOskar: StagingShot = { position: [3.0, 1.5, 16.6], target: [-0.1, 1.0, 15.4], fov: 42 }
const pickpocket: StagingShot = { position: [3.0, 1.5, 16.6], target: [-0.3, 1.05, 15.2], fov: 42 }
const onOskar: StagingShot = { subject: "oskar", distance: 2.8, angle: -24, height: 1.6, lookHeight: 1.45, fov: 40 }
// Where the cutpurse ends up: just north of Oskar, at his purse side, in view past his shoulder.
const atOskarsPurse: [number, number] = [-0.7, 14.75]
const toTheFront: Beat[] = [
  { shot: atCounter },
  { wait: 2.4 },
  { loop: "gate-line", do: "resume" },
  { cue: "gate-line:called" },
  { cue: "gate-line:front" },
  { shot: "party" },
  { wait: 1.2 },
  { line: "garlan", text: "State your business in Kordavos." },
  { line: "garlan", text: "There is a fee of three marks for entrance." },
]

export const TURNS: MockTurn[] = [
  {
    title: "The Gates of Kordavos",
    intro: true,
    narrative: () => [
      "As the adventurers approach the grand gates of Kordavos, they are greeted by the sight of towering stone archways adorned with vibrant Asterian and Valkaran banners fluttering in the breeze. The sound of laughter, music, and lively chatter fills the air, signaling the ongoing festivities of the Harvest Festival just beyond the gates.",
      "However, before they can join the revelry, they find themselves in a long line of travelers, merchants, and villagers all waiting to be inspected by the city guard. A few guards move among the crowd, occasionally pulling aside individuals for further questioning.",
      "“Next!” shouts a burly Asterian guard with a stern face but kind eyes. Stepping forward, he inspects each person meticulously. “State your business in Kordavos,” he demands from each group. “There is a fee of three marks for entrance.”",
    ],
    // Three stages. The gate, wide and quiet (the line waits, so nothing is said too far away to read), then a slow move
    // in over the crowd. The line, close enough to hear it: a neighbour ahead, the merchant behind the party, someone
    // further back. Then Garlan at the counter: one exchange and one "Next!", after which he takes his time with a
    // carter and the line stops again, leaving the party second in line.
    beats: () => [
      { loop: "gate-line", do: "stall" },
      { narrate: 0 },
      { shot: "gate", cut: true },
      { wait: 9 },
      { shot: "queue", duration: 7 },
      { narrate: 1 },
      { shot: inLine, duration: 4.5 },
      { wait: 1.5 },
      { line: "gate-line", fromParty: -1, text: "At this rate we'll see the Harvest fires from out here." },
      { line: "oskar", text: "Three marks a head, at Harvest! Highway robbery in a tabard." },
      { line: "gate-line", fromParty: 2, text: "They say he's searching every cart for tunnel-smugglers." },
      { narrate: 2 },
      { shot: atCounter, duration: 3 },
      { wait: 3 },
      { loop: "gate-line", do: "resume" },
      { cue: "gate-line:next" },
      { loop: "gate-line", do: "stall" },
      { wait: 3 },
    ],
    hold: {
      actor: "yeva",
      shot: yevaOskar,
      prompt:
        "Up at the barrier, Garlan is taking his time over a carter's papers, and the line has stopped moving. Behind you, a stout merchant with a spice chest under his arm grumbles about the fee to anyone who will listen. Yeva, what do you do?",
      suggestion: "Yeva turns to the merchant with her brightest festival smile. “Three marks! Robbery, isn't it? What are you selling that's worth the toll?”",
    },
  },
  {
    title: "A Purse in the Crowd",
    narrative: () => [
      "The merchant brightens at the attention. He is Oskar Venn, he tells Yeva and everyone else within earshot, spice-trader of the Saffron Road, and he pats the fat purse at his belt as if it were a favourite dog. “Saffron, little mistress. Worth its weight in gold at Harvest, and every mark of that fee comes out of my profits.”",
      "Neither of them sees the ragged youth drifting along the rope line until he is close enough to brush Oskar's elbow.",
    ],
    beats: (reply) => [
      { narrate: 0 },
      { face: "yeva", to: "oskar" },
      { face: "oskar", to: "yeva" },
      { shot: onYeva },
      { wait: 0.4 },
      { line: "yeva", text: quote(reply, "Three marks! Robbery, isn't it?") },
      { shot: onOskar },
      { line: "oskar", text: "Oskar Venn, spice-trader of the Saffron Road!" },
      { line: "oskar", text: "Saffron, little mistress. Worth its weight in gold at Harvest." },
      { narrate: 1 },
      { shot: pickpocket },
      { move: "cutpurse", to: atOskarsPurse, speed: 1.3, wait: true },
      { face: "cutpurse", to: "oskar" },
      { shot: onOskar },
      { wait: 1.2 },
    ],
    contest: {
      actor: "yeva",
      prompt: "The cutpurse's fingers find the strings of Oskar's purse. Yeva, roll Perception to catch him at it.",
      roll: { skill: "Perception", ability: "WIS", dc: 16, modifier: 3, versus: { name: "Cutpurse", skill: "Sleight of Hand", natural: 11, modifier: 5 } },
      narrative: (_reply, roll) =>
        roll?.success
          ? [
              `Yeva rolls ${roll.total}. Her hand shoots out and closes on a thin wrist just as the purse strings part. The cutpurse yelps, the purse drops at Oskar's feet, and the boy twists free and bolts into the festival crowd.`,
              "“My saffron money!” Oskar scoops up the purse and clutches it to his chest. “Sharp eyes, little mistress. Find me at the Saffron Stall on Lantern Row. Your first Harvest supper is on Oskar Venn.”",
              "Up at the barrier, Garlan finishes with the carter and bellows for the next in line.",
            ]
          : [
              `Yeva rolls ${roll?.total ?? "low"}. The cutpurse is quicker. By the time Yeva registers the brush of his elbow, the boy is gone into the crowd, and so is Oskar's purse.`,
              "Oskar pats his belt, then pats it again. “My purse! It was right here!” His eyes fall on the halfling at his elbow. “You! You were standing close enough to kiss it!”",
              "Before it can go any further, Garlan finishes with the carter and bellows for the next in line.",
            ],
      beats: (_reply, roll) =>
        roll?.success
          ? [
              { narrate: 0 },
              { shot: pickpocket },
              { move: "yeva", to: "cutpurse", stop: 0.45, speed: 2.6, wait: true },
              { line: "yeva", text: "Oi! Hands off, sparrow!" },
              { line: "cutpurse", text: "Let go of me!" },
              { move: "cutpurse", to: [-13, 11.5], speed: 3.4 },
              { wait: 1 },
              { narrate: 1 },
              { face: "oskar", to: "yeva" },
              { line: "oskar", text: "My saffron money!" },
              { line: "oskar", text: "Sharp eyes, little mistress. Your first Harvest supper is on Oskar Venn." },
              { narrate: 2 },
              ...toTheFront,
            ]
          : [
              { narrate: 0 },
              { move: "cutpurse", to: [-13, 11.5], speed: 1.7 },
              { wait: 2.5 },
              { narrate: 1 },
              { shot: onOskar },
              { line: "oskar", text: "My purse! It was right here!" },
              { face: "oskar", to: "yeva" },
              { line: "oskar", text: "You! You were standing close enough to kiss it!" },
              { narrate: 2 },
              ...toTheFront,
            ],
    },
    hold: {
      actor: "branka",
      shot: onBranka,
      prompt: "Garlan looks your party over, one by one. Branka, you stand at the front of the line: who are you, and what is your business in Kordavos?",
      suggestion:
        "Branka squares her shoulders so the old gate-ward sigil on her breastplate catches the light. “Branka Stoneveil. My family kept this gate for four generations. I'm here for the Harvest, and to see who keeps it now.”",
    },
  },
  {
    title: "A Stoneveil at the Gate",
    npc: "garlan",
    narrative: () => [
      "Garlan's gaze drops to the sigil stamped into Branka's breastplate, the old gate-ward mark of Kordavos, and something in his stern face softens.",
      "“A Stoneveil,” he says, quieter now. “My father stood these walls under a Stoneveil sergeant. Your family kept this gate long before mine did.” He glances up at the Asterian banners, then back to her. “Welcome home, shield-bearer. Three marks, and no questions from me.”",
      "Behind Branka the others wait their turn. Garlan's eyes move to the woman in the grey travelling coat, her folio of charts pressed to her chest.",
    ],
    beats: (reply) => [
      { narrate: 0 },
      { shot: "twoshot" },
      { wait: 0.6 },
      { line: "branka", text: quote(reply, "Branka Stoneveil. My family kept this gate.") },
      { narrate: 1 },
      { shot: onGarlan },
      { line: "garlan", text: "A Stoneveil. My father stood these walls under a Stoneveil sergeant." },
      { line: "garlan", text: "Welcome home, shield-bearer. Three marks, and no questions from me." },
      { narrate: 2 },
      { face: "garlan", to: "cassia" },
      { shot: "twoshot" },
      { wait: 1.2 },
      { line: "garlan", text: "And you, with the charts?" },
    ],
    hold: {
      actor: "cassia",
      shot: onCassia,
      prompt: "“And you, with the charts,” Garlan says. “What business does a surveyor have in Kordavos at Harvest?” Cassia, what do you tell him?",
      suggestion:
        "Cassia offers a thin smile and taps the folio. “Cartography, sergeant. Half the tunnels under this city were never mapped. I intend to finish the job before someone falls into one.”",
    },
  },
  {
    title: "Maps and Marks",
    npc: "garlan",
    narrative: () => [
      "“Tunnels.” Garlan's jaw tightens. He lowers his voice so the queue behind cannot hear. “Folk go down there and don't come up. Keep your charts in your folio while you're inside the walls, and don't go looking for trouble at Harvest.”",
      "He turns to count the party's coins onto the ledger. For a moment his back is to the line, and his attention is on the strongbox and the scales.",
      "Yeva, standing half a step behind the others, notices that the sergeant's purse of fees sits open on the table, and that nobody is watching the gap in the barrier.",
    ],
    beats: (reply) => [
      { narrate: 0 },
      { shot: "twoshot" },
      { wait: 0.4 },
      { line: "cassia", text: quote(reply, "Cartography, sergeant. Half the tunnels under this city were never mapped.") },
      { shot: onGarlan },
      { line: "garlan", text: "Tunnels. Folk go down there and don't come up." },
      { line: "garlan", text: "Keep your charts in your folio while you're inside the walls." },
      { narrate: 1 },
      { face: "garlan", to: [-0.9, 10.7] },
      { shot: "checkpoint" },
      { wait: 3.2 },
      { narrate: 2 },
      { shot: onYeva },
      { wait: 2 },
    ],
    hold: {
      actor: "yeva",
      shot: onYeva,
      prompt: "Garlan's back is turned while he counts the fees. Yeva, what do you do?",
      suggestion: "Yeva hums a festival tune and drifts toward the gap in the barrier, trying to slip through without paying her three marks while the sergeant is busy counting.",
      roll: { skill: "Sleight of Hand", ability: "DEX", dc: 14, modifier: 5 },
    },
  },
  {
    title: "Three Marks",
    npc: "garlan",
    narrative: (_reply, roll) =>
      roll?.success
        ? [
            `Yeva rolls ${roll.total}. Quick as a sparrow, she slips through the gap in the barrier while Garlan's quill scratches in his ledger, and is leaning against the far post with an innocent expression before anyone notices she has moved.`,
            "Garlan looks up, counts the party, frowns, and counts again. He decides not to ask. “Harvest,” he mutters, as if that explains everything.",
            "Only the cleric remains. Garlan straightens as he sees the bronze compass-star of the Church of Valkara at the man's chest.",
          ]
        : [
            `Yeva rolls ${roll?.total ?? "low"}. She gets exactly two steps toward the gap before a gauntleted hand settles on her shoulder.`,
            "“Three marks,” Garlan says, without looking up from his ledger. “Same as everyone. Same as every year.” The guards nearby grin; the queue behind groans.",
            "Only the cleric remains. Garlan straightens as he sees the bronze compass-star of the Church of Valkara at the man's chest.",
          ],
    beats: (reply, roll) =>
      roll?.success
        ? [
            { narrate: 0 },
            { shot: "checkpoint" },
            { line: "yeva", text: quote(reply, "Nothing to see here, sergeant.") },
            { move: "yeva", to: [1.3, 9.0], speed: 2.2, wait: true },
            { face: "yeva", to: "garlan" },
            { narrate: 1 },
            { face: "garlan", to: "yeva" },
            { shot: onGarlan },
            { line: "garlan", text: "Harvest." },
            { narrate: 2 },
            { face: "garlan", to: "milos" },
            { shot: "twoshot" },
            { wait: 1.4 },
          ]
        : [
            { narrate: 0 },
            { shot: "checkpoint" },
            { move: "yeva", to: [1.3, 10.4], speed: 2, wait: true },
            { face: "garlan", to: "yeva" },
            { narrate: 1 },
            { shot: onGarlan },
            { line: "garlan", text: "Three marks. Same as everyone. Same as every year." },
            { move: "yeva", to: "front3", speed: 1.4, wait: true },
            { face: "yeva", to: "garlan" },
            { narrate: 2 },
            { face: "garlan", to: "milos" },
            { shot: "twoshot" },
            { wait: 1.4 },
          ],
    hold: {
      actor: "milos",
      shot: onMilos,
      prompt: "Garlan bows his head to the Wayfinder priest. “Father. What brings the Church to the gate at Harvest?” Milos, what do you say?",
      suggestion:
        "Milos returns the bow and rests both hands on his notched staff. “The road, as always, sergeant. The Harvest blessing at the old chapel, and a word with anyone who needs one.” He counts out the party's marks himself.",
    },
  },
  {
    title: "Through the Gate",
    npc: "garlan",
    narrative: () => [
      "Garlan takes the priest's coins and, after a moment, presses one back into his palm. “For the chapel,” he says. Then, louder, to the line: “Let them through!”",
      "The barrier swings aside. Beyond the great arch the Harvest Festival roars: bunting in orange and green, the smell of roasting chestnuts, a fiddler somewhere out of sight.",
      "Kordavos has let you in. What it wants from you is another matter.",
    ],
    beats: (reply) => [
      { narrate: 0 },
      { shot: "twoshot" },
      { line: "milos", text: quote(reply, "The road, as always, sergeant.") },
      { shot: onGarlan },
      { line: "garlan", text: "For the chapel." },
      { line: "garlan", text: "Let them through!" },
      { narrate: 1 },
      { loop: "gate-line", do: "release" },
      { shot: { position: [3, 2.2, 17], target: [0, 5, -20], fov: 56 } },
      { wait: 8 },
      { narrate: 2 },
      { shot: "gate" },
      { wait: 5 },
    ],
    hold: null,
  },
]
