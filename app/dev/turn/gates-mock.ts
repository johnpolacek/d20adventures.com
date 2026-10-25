import type { Beat } from "@d20/stage/beats"
import type { StagingShot } from "@d20/stage/spec/staging"

// A canned run of March of Davos, encounter 1 ("The Gates of Kordavos"), for the stage-first turn page mock.
// No Convex and no model: each GM turn is scripted, with the beats a per-turn generator would produce, and the player's
// typed reply is quoted back as their line. The set's queue loop keeps the line alive.
//
// The scene is where the characters meet. The intro is the encounter's opening, staged a paragraph at a time: the gate,
// the line (people in it talking), and Garlan at the counter, after which he takes his time with a carter and the line
// stops. Intros like it would be drafted by a model when the adventure plan is staged, and edited by its author.
// - Round 1, in line: each character gets a turn to introduce themselves (or do anything). On hers, Yeva can lift the
//   purse of the merchant behind the party: a contest, with his Perception rolled on the card first.
// - Round 2, at the counter: Garlan questions them one by one. How Yeva's turn goes depends on the purse.

export interface MockRoll {
  skill: string
  ability: string
  dc: number
  modifier: number
  // A contest: the opposing roll, shown first; the player has to meet or beat its total.
  versus?: { name: string; skill: string; natural: number; modifier: number }
  // What the result decides later in the scene.
  key?: keyof Story
}
// What earlier turns decided (the scripted branches read it).
export interface Story {
  pickpocket?: boolean
  talkedOut?: boolean
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
  rollPrompt?: string
  // Waiting in line, nobody walks: the reply isn't turned into movement.
  stay?: boolean
}
export interface MockTurn {
  title: string
  intro?: boolean
  round?: 1 | 2
  // Whose turn the GM's beats are, for the initiative bar (an NPC answering), if anyone's.
  npc?: string
  narrative: (reply: string | null, roll: Outcome, story: Story) => string[]
  beats: (reply: string | null, roll: Outcome, story: Story) => Beat[]
  contest?: MockContest
  hold: MockHold | ((story: Story) => MockHold) | null
}

export const PARTY = ["branka", "cassia", "yeva", "milos"] as const
// Stageview checks: ?roll=20 fixes the player's natural roll (to see both outcomes of a roll).
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
}

const quote = (reply: string | null, fallback: string) => {
  const r = (reply ?? "").trim()
  if (!r) return fallback
  const said = r.match(/[“"]([^”"]{3,})[”"]/)
  if (said) return said[1]
  const first = r.split(/(?<=[.!?])\s/)[0]
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}
// At the counter (round 2).
const onBranka: StagingShot = { subject: "branka", distance: 3.1, angle: 18, height: 1.45, lookHeight: 1.0, fov: 40 }
const onCassia: StagingShot = { subject: "cassia", distance: 3.3, angle: -16, height: 1.7, lookHeight: 1.35, fov: 40 }
const onYeva: StagingShot = { subject: "yeva", distance: 2.9, angle: 22, height: 1.25, lookHeight: 0.8, fov: 40 }
const onMilos: StagingShot = { subject: "milos", distance: 3.4, angle: -20, height: 1.75, lookHeight: 1.45, fov: 40 }
const onGarlan: StagingShot = { subject: "garlan", distance: 3.6, angle: 38, height: 1.7, lookHeight: 1.45, fov: 42 }
// The intro. The line faces east where it turns toward the counter, so the camera stands east of it to see faces.
const inLine: StagingShot = { position: [3.4, 2.0, 17.4], target: [-2.0, 1.2, 15.3], fov: 50 }
const atCounter: StagingShot = { position: [-1.4, 1.75, 10.6], target: [1.5, 1.35, 12.2], fov: 40 }
// Round 1. The four stand at the bend in the line, second from the front, with Oskar behind them; turned toward each
// other they make a loose huddle. Each speaker is framed from outside it, from fixed points (the places in the stalled
// line are always the same), so a turn of the head can't put the camera behind someone else.
const huddleAt: [number, number] = [0.75, 14.85]
const huddle: StagingShot = { position: [3.4, 1.7, 15.6], target: [0.4, 1.05, 14.8], fov: 46 }
const brankaInLine: StagingShot = { position: [0.27, 1.4, 17.14], target: [1.42, 1.05, 14.81], fov: 42 }
const cassiaInLine: StagingShot = { position: [2.76, 1.65, 15.98], target: [0.22, 1.4, 14.81], fov: 42 }
const yevaInLine: StagingShot = { position: [1.85, 1.2, 13.33], target: [0.64, 0.85, 15.52], fov: 42 }
const milosInLine: StagingShot = { position: [2.13, 1.7, 16.79], target: [0.64, 1.45, 14.3], fov: 42 }
// Oskar is framed right of centre: the left of the screen is the narration's.
const oskarInLine: StagingShot = { position: [2.6, 1.7, 17.8], target: [-1.0, 1.25, 15.95], fov: 42 }
const yevaAtLine: [number, number] = [0.64, 15.52]
const huddleUp: Beat[] = [...PARTY.map((id): Beat => ({ face: id, to: huddleAt })), { face: "oskar", to: huddleAt }]
// The end of round 1: Garlan finishes with the carter, the line moves on, and the party is called to the counter.
const toTheFront: Beat[] = [
  { shot: atCounter, duration: 3 },
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
    // carter and the line stops again, leaving the party second in line, where they turn to one another.
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
      { cue: "gate-line:settled" },
      ...huddleUp,
    ],
    hold: {
      actor: "branka",
      shot: brankaInLine,
      stay: true,
      prompt: "Up at the barrier, Garlan is taking his time over a carter's papers, and the line has stopped. Around you stand three strangers who look to be going your way. Branka, what do you do?",
      suggestion:
        "Branka looks the three of them over and nods at the gate. “Looks like we'll be standing together a while. Branka Stoneveil.” She glances down at the halfling. “And keep your hands where I can see them, little one.”",
    },
  },
  {
    title: "Strangers in Line",
    round: 1,
    narrative: () => [
      "Branka's voice carries the way a soldier's does, and a few heads turn along the rope line. Behind the party, a stout spice merchant chuckles into his beard.",
      "“Sound advice, dwarf,” he says, and pats the fat embroidered purse at his belt. “Harvest crowds. Every pocket in Kordavos is somebody's business this week.”",
    ],
    beats: (reply) => [
      { narrate: 0 },
      ...huddleUp,
      { shot: brankaInLine },
      { wait: 0.6 },
      { line: "branka", text: quote(reply, "Branka Stoneveil.") },
      { narrate: 1 },
      { face: "oskar", to: "branka" },
      { shot: oskarInLine },
      { wait: 0.6 },
      { line: "oskar", text: "Sound advice, dwarf." },
      { line: "oskar", text: "Harvest crowds. Every pocket in Kordavos is somebody's business this week." },
    ],
    hold: {
      actor: "cassia",
      shot: cassiaInLine,
      stay: true,
      prompt: "The line still hasn't moved. The dwarf has introduced herself, and the merchant behind you is listening in. Cassia, what do you do?",
      suggestion:
        "Cassia tucks her folio of charts tighter under her arm and inclines her head. “Cassia Verane, cartographer.” She glances at the dwarf's breastplate. “That's the old gate-ward sigil. I've only ever seen it on maps.”",
    },
  },
  {
    title: "Maps and Sigils",
    round: 1,
    narrative: () => [
      "Branka's hand goes to the sigil on her breastplate, and for a moment the dwarf looks almost pleased.",
      "At the word cartographer, the merchant perks up. He is Oskar Venn, he announces, spice-trader of the Saffron Road, and would the lady happen to have a map of the lower markets? He waves both hands as he talks, and the embroidered purse at his belt swings, heavy and unattended.",
    ],
    beats: (reply) => [
      { narrate: 0 },
      ...huddleUp,
      { shot: cassiaInLine },
      { wait: 0.5 },
      { line: "cassia", text: quote(reply, "Cassia Verane, cartographer.") },
      { shot: brankaInLine },
      { wait: 2 },
      { narrate: 1 },
      { face: "oskar", to: "cassia" },
      { shot: oskarInLine },
      { wait: 0.6 },
      { line: "oskar", text: "Oskar Venn, spice-trader of the Saffron Road!" },
      { line: "oskar", text: "A map of the lower markets, my lady? I've a stall on Lantern Row and no idea where it is." },
    ],
    hold: {
      actor: "yeva",
      shot: oskarInLine,
      stay: true,
      prompt: "Oskar is busy talking maps with Cassia, waving both hands. The purse at his belt swings, heavy and unattended. Yeva, what do you do?",
      suggestion: "Yeva hums a festival tune and drifts toward the merchant, admiring the embroidery on his purse. While he's busy with Cassia, her fingers find the strings.",
      roll: { key: "pickpocket", skill: "Sleight of Hand", ability: "DEX", dc: 13, modifier: 5, versus: { name: "Oskar", skill: "Perception", natural: 12, modifier: 1 } },
      rollPrompt: "Oskar's eyes are on Cassia's charts. Yeva, roll Sleight of Hand to beat his Perception.",
    },
  },
  {
    title: "Light Fingers",
    round: 1,
    narrative: (_reply, roll) =>
      roll?.success
        ? [
            `Yeva rolls ${roll.total}. Her fingers are quicker than Oskar's eyes. While he leans over Cassia's charts, the strings part, the purse is gone, and Yeva is humming her festival tune again, hands folded innocently behind her back.`,
            "Oskar doesn't notice a thing. Neither, as far as anyone can tell, does anyone else in the line.",
            "Among the coins in the purse, Yeva's fingers find something else: a folded note, sealed with green wax.",
          ]
        : [
            `Yeva rolls ${roll?.total ?? "low"}. The strings are tighter than they look. The purse jerks, Oskar looks down, and finds a halfling's hand where his saffron money should be.`,
            "“Thief!” Oskar's bellow turns every head in the line. He has Yeva's wrist in one meaty hand. “A thief, at Harvest, in broad daylight!”",
            "Up at the barrier, Garlan looks up from the carter's papers, and his eyes find the party.",
          ],
    beats: (_reply, roll) =>
      roll?.success
        ? [
            { narrate: 0 },
            { shot: oskarInLine },
            { face: "yeva", to: "oskar" },
            { move: "yeva", to: "oskar", stop: 0.6, speed: 0.8, wait: true },
            { wait: 1 },
            { move: "yeva", to: yevaAtLine, speed: 0.8, wait: true },
            { face: "yeva", to: huddleAt },
            { narrate: 1 },
            { shot: huddle },
            { wait: 1.5 },
            { narrate: 2 },
            { shot: yevaInLine },
            { wait: 1 },
          ]
        : [
            { narrate: 0 },
            { shot: oskarInLine },
            { face: "yeva", to: "oskar" },
            { move: "yeva", to: "oskar", stop: 0.6, speed: 0.8, wait: true },
            { face: "oskar", to: "yeva" },
            { narrate: 1 },
            { line: "oskar", text: "Thief!" },
            { line: "oskar", text: "A thief, at Harvest, in broad daylight!" },
            { narrate: 2 },
            { face: "garlan", to: "yeva" },
            { shot: onGarlan },
            { wait: 1.5 },
          ],
    hold: (story) => ({
      actor: "milos",
      shot: milosInLine,
      stay: true,
      prompt: story.pickpocket
        ? "Nobody saw a thing, or nobody is saying so. Milos, you're the last of the four still to speak. What do you do?"
        : "Oskar has Yeva by the wrist, and half the line is staring. Milos, what do you do?",
      suggestion: story.pickpocket
        ? "Milos rests both hands on his notched staff and gives the others a calm smile. “Milos Radan, Wayfinder of Valkara. If we're to stand together, we may as well walk together. The road is kinder in company.”"
        : "Milos steps between the merchant and the halfling, palms open. “Peace, friend. It's Harvest. Let her go, and the Church of Valkara will answer for anything that was taken.”",
    }),
  },
  {
    title: "The Line Moves",
    round: 1,
    narrative: (_reply, _roll, story) =>
      story.pickpocket
        ? [
            "Milos's words settle over the four of them like a blessing, and for a moment they are less strangers than fellow travelers.",
            "Up at the barrier, Garlan waves the carter through and bellows for the next in line. The line lurches forward, and then it is your turn.",
          ]
        : [
            "Milos's calm is hard to argue with. Oskar grumbles, snatches back his purse and lets go of Yeva's wrist, though he keeps one hand on his belt from then on.",
            "Up at the barrier, Garlan waves the carter through and bellows for the next in line. When the party reaches the counter, he is already looking at the halfling.",
          ],
    beats: (reply, _roll, story) => [
      { narrate: 0 },
      { shot: milosInLine },
      { wait: 0.5 },
      { line: "milos", text: quote(reply, story.pickpocket ? "The road is kinder in company." : "Peace, friend. It's Harvest.") },
      ...(story.pickpocket ? [] : ([{ shot: oskarInLine }, { line: "oskar", text: "Hmph. Keep her where I can see her, priest." }] as Beat[])),
      { narrate: 1 },
      ...toTheFront,
    ],
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
    round: 2,
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
    round: 2,
    npc: "garlan",
    narrative: (_reply, _roll, story) => [
      "“Tunnels.” Garlan's jaw tightens. He lowers his voice so the queue behind cannot hear. “Folk go down there and don't come up. Keep your charts in your folio while you're inside the walls, and don't go looking for trouble at Harvest.”",
      story.pickpocket
        ? "Then his eyes move to the halfling. “Three marks a head,” he says, and holds out his hand."
        : "Then his eyes move to the halfling, and stay there. “And you. The merchant back there says you had your hand in his purse.”",
    ],
    beats: (reply, _roll, story) => [
      { narrate: 0 },
      { shot: "twoshot" },
      { wait: 0.4 },
      { line: "cassia", text: quote(reply, "Cartography, sergeant. Half the tunnels under this city were never mapped.") },
      { shot: onGarlan },
      { line: "garlan", text: "Tunnels. Folk go down there and don't come up." },
      { line: "garlan", text: "Keep your charts in your folio while you're inside the walls." },
      { narrate: 1 },
      { face: "garlan", to: "yeva" },
      { shot: onYeva },
      { wait: 1 },
      { line: "garlan", text: story.pickpocket ? "Three marks a head." : "The merchant back there says you had your hand in his purse." },
    ],
    hold: (story) =>
      story.pickpocket
        ? {
            actor: "yeva",
            shot: onYeva,
            prompt: "“Three marks a head,” Garlan says, holding out his hand. Yeva, what do you do?",
            suggestion: "Yeva beams and counts out twelve marks for the whole party from a fat embroidered purse. “My treat, sergeant!”",
          }
        : {
            actor: "yeva",
            shot: onYeva,
            prompt: "“The merchant says you had your hand in his purse,” Garlan says. Yeva, what do you tell him?",
            suggestion: "Yeva spreads her empty hands and looks wounded. “A misunderstanding, sergeant! I was only admiring the embroidery.”",
            roll: { key: "talkedOut", skill: "Deception", ability: "CHA", dc: 14, modifier: 4, versus: { name: "Garlan", skill: "Insight", natural: 11, modifier: 3 } },
            rollPrompt: "Garlan studies her face. Yeva, roll Deception to beat his Insight.",
          },
  },
  {
    title: "Three Marks",
    round: 2,
    npc: "garlan",
    narrative: (_reply, roll, story) => {
      const priest = "Only the cleric remains. Garlan straightens as he sees the bronze compass-star of the Church of Valkara at the man's chest."
      if (story.pickpocket)
        return [
          "Garlan takes the twelve marks and weighs the purse with his eyes, one eyebrow rising at the saffron flowers embroidered on it. He says nothing.",
          "Behind the party, Oskar Venn pats his belt. Then he pats it again.",
          priest,
        ]
      if (roll?.success)
        return [
          `Yeva rolls ${roll.total}. Garlan studies her for a long moment. “Admiring the embroidery,” he repeats, and something twitches at the corner of his mouth. “Admire it from further away while you're in my city.”`,
          "He takes three marks from her and waves her on. Behind the party, Oskar sputters.",
          priest,
        ]
      return [
        `Yeva rolls ${roll?.total ?? "low"}. Garlan doesn't believe a word of it. “Three marks,” he says, “and if I hear your name again this Harvest, you'll spend the rest of it in a cell.”`,
        "Yeva pays. Behind the party, Oskar looks satisfied.",
        priest,
      ]
    },
    beats: (reply, roll, story) => [
      { narrate: 0 },
      { shot: onYeva },
      { line: "yeva", text: quote(reply, story.pickpocket ? "My treat, sergeant!" : "A misunderstanding, sergeant!") },
      { face: "garlan", to: "yeva" },
      { shot: onGarlan },
      {
        line: "garlan",
        text: story.pickpocket
          ? "Twelve marks. Generous."
          : roll?.success
            ? "Admire it from further away while you're in my city."
            : "If I hear your name again this Harvest, you'll spend it in a cell.",
      },
      { narrate: 1 },
      { shot: "party" },
      ...(story.pickpocket ? ([{ wait: 1 }, { line: "oskar", text: "My purse…?" }] as Beat[]) : ([{ wait: 2 }] as Beat[])),
      { narrate: 2 },
      { face: "garlan", to: "milos" },
      { shot: "twoshot" },
      { wait: 1.4 },
    ],
    hold: {
      actor: "milos",
      shot: onMilos,
      prompt: "Garlan bows his head to the Wayfinder priest. “Father. What brings the Church to the gate at Harvest?” Milos, what do you say?",
      suggestion: "Milos returns the bow and rests both hands on his notched staff. “The road, as always, sergeant. The Harvest blessing at the old chapel, and a word with anyone who needs one.”",
    },
  },
  {
    title: "Through the Gate",
    round: 2,
    npc: "garlan",
    narrative: () => [
      "Garlan bows his head in return and, after a moment, presses a coin into the priest's palm. “For the chapel,” he says. Then, louder, to the line: “Let them through!”",
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
