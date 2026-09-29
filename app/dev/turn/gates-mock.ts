import type { Beat } from "@/lib/stage/beats"
import type { StagingShot } from "@/lib/stage/spec/staging"

// A canned run of March of Davos, encounter 1 ("The Gates of Kordavos"), for the stage-first turn page mock.
// No Convex and no model: each GM turn is scripted, with the beats a per-turn generator would produce, and the player's
// typed reply is quoted back as their line. The party waits one step back in the line and is called forward by "Next!".

export interface MockRoll {
  skill: string
  ability: string
  dc: number
  modifier: number
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
  narrative: (reply: string | null, roll: { total: number; success: boolean } | null) => string[]
  beats: (reply: string | null, roll: { total: number; success: boolean } | null) => Beat[]
  hold: MockHold | null
}

export const PARTY = ["branka", "cassia", "yeva", "milos"] as const
export const START: Record<string, [number, number]> = {
  branka: [1.42, 13.9],
  cassia: [0.22, 13.9],
  yeva: [0.82, 14.75],
  milos: [-0.4, 14.75],
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

export const TURNS: MockTurn[] = [
  {
    title: "The Gates of Kordavos",
    narrative: () => [
      "As the adventurers approach the grand gates of Kordavos, they are greeted by the sight of towering stone archways adorned with vibrant Asterian and Valkaran banners fluttering in the breeze. The sound of laughter, music, and lively chatter fills the air, signaling the ongoing festivities of the Harvest Festival just beyond the gates.",
      "However, before they can join the revelry, they find themselves in a long line of travelers, merchants, and villagers all waiting to be inspected by the city guard. A few guards move among the crowd, occasionally pulling aside individuals for further questioning.",
      "“Next!” shouts a burly Asterian guard with a stern face but kind eyes. Stepping forward, he inspects each person meticulously. “State your business in Kordavos,” he demands from each group. “There is a fee of three marks for entrance.”",
    ],
    beats: () => [
      { narrate: 0 },
      { shot: "gate", cut: true },
      { wait: 7 },
      { narrate: 1 },
      { shot: "queue" },
      { wait: 7 },
      { narrate: 2 },
      { shot: "checkpoint" },
      { wait: 1.6 },
      { line: "garlan", text: "Next!" },
      { move: "branka", to: "front1" },
      { move: "cassia", to: "front2" },
      { move: "yeva", to: "front3" },
      { move: "milos", to: "front4", wait: true },
      { face: "branka", to: "garlan" },
      { face: "cassia", to: "garlan" },
      { face: "yeva", to: "garlan" },
      { face: "milos", to: "garlan" },
      { shot: "party" },
      { wait: 1.4 },
      { line: "garlan", text: "State your business in Kordavos." },
      { line: "garlan", text: "There is a fee of three marks for entrance." },
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
      { shot: { position: [3, 2.2, 17], target: [0, 5, -20], fov: 56 } },
      { move: "branka", to: [1.2, 9.4], speed: 1.2 },
      { move: "cassia", to: [0.4, 9.2], speed: 1.2 },
      { move: "yeva", to: [1.7, 8.8], speed: 1.3 },
      { move: "milos", to: [0.9, 9.8], speed: 1.1, wait: true },
      { move: "branka", to: [-1.2, -14], speed: 1.3 },
      { move: "cassia", to: [0.2, -15], speed: 1.3 },
      { move: "yeva", to: [1.4, -13.5], speed: 1.4 },
      { move: "milos", to: [0.8, -12.5], speed: 1.2 },
      { wait: 4 },
      { narrate: 2 },
      { shot: "gate" },
      { wait: 5 },
    ],
    hold: null,
  },
]
