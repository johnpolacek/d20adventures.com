// Gemini prebuilt TTS voice pools and deterministic character-to-voice assignment.
// Assignments persist on the adventure (voiceAssignments) so a character keeps
// the same voice for the whole adventure.

export const NARRATOR_VOICE = "Charon" // deep, measured — reserved for the narrator

const FEMALE_LEANING_VOICES = ["Kore", "Leda", "Aoede", "Callirrhoe", "Autonoe", "Despina", "Erinome", "Laomedeia", "Achernar", "Pulcherrima", "Vindemiatrix", "Sulafat", "Zephyr"]

const MALE_LEANING_VOICES = ["Puck", "Fenrir", "Orus", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Algenib", "Rasalgethi", "Alnilam", "Schedar", "Achird", "Zubenelgenubi", "Sadachbia", "Sadaltager"]

export interface VoiceAssignment {
  characterId: string
  voice: string
}

interface VoiceCandidate {
  id: string
  gender?: string
}

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function poolFor(gender?: string): string[] {
  const g = gender?.trim().toLowerCase()
  if (g?.startsWith("f")) return FEMALE_LEANING_VOICES
  if (g?.startsWith("m")) return MALE_LEANING_VOICES
  return [...FEMALE_LEANING_VOICES, ...MALE_LEANING_VOICES]
}

// Returns the full assignment list (existing entries preserved) covering every
// candidate. Picks by hash of characterId, skipping voices already taken in
// this adventure until the pool is exhausted.
export function assignVoices(characters: VoiceCandidate[], existing: VoiceAssignment[]): VoiceAssignment[] {
  const assignments = [...existing]
  const taken = new Set(existing.map((a) => a.voice))

  for (const character of characters) {
    if (assignments.some((a) => a.characterId === character.id)) continue
    const pool = poolFor(character.gender)
    const start = fnv1aHash(character.id) % pool.length
    let voice = pool[start]
    for (let offset = 0; offset < pool.length; offset++) {
      const candidate = pool[(start + offset) % pool.length]
      if (!taken.has(candidate)) {
        voice = candidate
        break
      }
    }
    taken.add(voice)
    assignments.push({ characterId: character.id, voice })
  }

  return assignments
}

export function voiceForSpeaker(speaker: string, assignments: VoiceAssignment[]): string {
  if (speaker === "narrator") return NARRATOR_VOICE
  return assignments.find((a) => a.characterId === speaker)?.voice ?? NARRATOR_VOICE
}
