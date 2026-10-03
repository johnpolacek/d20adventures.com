import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import type { AdventureRecord, Store, TurnRecord, WikiTurnCommit } from "@d20/gm-core"
import { type AdventurePatch, validateAdventurePatch } from "@d20/gm-core/wiki-adventures/adventure-patch"
import { validateRuntimeTransition } from "@d20/gm-core/wiki-adventures/transition-validator"
import type { MovementIntent } from "@d20/stage/movement"
import { type CharacterStates, desktopPatchSchema, nextCharacterState, rememberCharacters } from "./characters"

export type SavedAdventure = AdventureRecord & {
  currentTurnId: string
  currentEncounterId: string
  status: "active" | "completed"
  endedAt?: number
  discoveries: unknown[]
  entityUpdates: unknown[]
  openThreads: Array<{ id: string }>
  resolvedThreadIds: string[]
  adventureSummaryMarkdown: string
}
export type Save = {
  version: 1
  provider: string
  adventure: SavedAdventure
  turns: Array<TurnRecord & { adventurePatch?: AdventurePatch }>
  rolls: Record<string, number>
  rollChecks?: Record<string, { name: string; skill: string; dc: number; modifier: number }>
  appliedMovement?: string[]
  movement: Record<string, { actorId: string; intent: MovementIntent }>
  positions: Record<string, { x: number; z: number; ry: number }>
  characterStates?: CharacterStates
}

/** SQLite writes commit each milestone, including the natural die before inference. */
export class LocalStore implements Store {
  db: DatabaseSync
  state: Save | null
  private ownsLock = false
  constructor(
    path: string,
    private transitions: import("@d20/gm-core/wiki-adventures/types").RuntimeTransition[] = []
  ) {
    this.db = new DatabaseSync(path)
    this.db.exec(
      "PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS save (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS active (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL)"
    )
    const row = this.db.prepare("SELECT json FROM save WHERE id=1").get() as { json: string } | undefined
    this.state = row ? JSON.parse(row.json) : null
    if (this.state && this.state.version !== 1) throw new Error("This save needs a newer version of D20 Adventures.")
  }
  acquire() {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const row = this.db.prepare("SELECT pid FROM active WHERE id=1").get() as { pid: number } | undefined
      if (row) {
        let alive = true
        try {
          process.kill(row.pid, 0)
        } catch {
          alive = false
        }
        if (alive) throw new Error("Another game action is still running.")
      }
      this.db.prepare("INSERT OR REPLACE INTO active VALUES(1, ?)").run(process.pid)
      this.db.exec("COMMIT")
      this.ownsLock = true
      const saved = this.db.prepare("SELECT json FROM save WHERE id=1").get() as { json: string } | undefined
      this.state = saved ? JSON.parse(saved.json) : null
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }
  reload() {
    const row = this.db.prepare("SELECT json FROM save WHERE id=1").get() as { json: string } | undefined
    this.state = row ? JSON.parse(row.json) : null
    return this.state
  }
  close() {
    if (this.ownsLock) this.db.prepare("DELETE FROM active WHERE pid=?").run(process.pid)
    this.db.close()
  }
  save() {
    this.db.prepare("INSERT OR REPLACE INTO save VALUES(1, ?)").run(JSON.stringify(this.state))
  }
  current() {
    if (!this.state) throw new Error("Start an adventure first.")
    const turn = this.state.turns.find((t) => t._id === this.state?.adventure.currentTurnId)
    if (!turn) throw new Error("The saved turn is missing.")
    return turn
  }
  turn(id: string) {
    const turn = this.current()
    if (turn._id !== id) throw new Error("This turn has already advanced.")
    return turn
  }
  async getTurn({ turnId }: { turnId: string }) {
    return structuredClone(this.state?.turns.find((t) => t._id === turnId) ?? null)
  }
  async getAdventure({ adventureId }: { adventureId: string }) {
    return structuredClone(this.state?.adventure._id === adventureId ? this.state.adventure : null)
  }
  async getTurns({ adventureId }: { adventureId: string }) {
    return structuredClone(this.state?.turns.filter((t) => t.adventureId === adventureId) ?? [])
  }
  async getTurnByOrder({ adventureId, order }: { adventureId: string; order: number }) {
    return structuredClone(this.state?.turns.find((t) => t.adventureId === adventureId && t.order === order) ?? null)
  }
  async submitReply(args: Parameters<Store["submitReply"]>[0]) {
    const turn = this.turn(args.turnId)
    const c = turn.characters.find((c) => c.id === args.characterId)
    if (!c || c.hasReplied || c.isComplete) throw new Error("This character already acted or is unavailable.")
    if (args.rollRequirement) {
      this.state!.rollChecks ??= {}
      this.state!.rollChecks[`${turn._id}:${c.id}`] = { name: c.name, skill: args.rollRequirement.rollType, dc: args.rollRequirement.difficulty, modifier: args.rollRequirement.modifier ?? 0 }
    }
    turn.narrative += `\n\n${args.originalPlayerInput ? `[OriginalReply: ${args.originalPlayerInput}]\n` : ""}${args.narrativeAction}`
    Object.assign(c, { hasReplied: true, isComplete: !args.rollRequirement, rollRequired: args.rollRequirement, rollResult: undefined })
    this.save()
  }
  async updateTurn({ turnId, patch }: Parameters<Store["updateTurn"]>[0]) {
    Object.assign(this.turn(turnId), patch)
    this.save()
  }
  async patchAdventure({ adventureId, patch }: Parameters<Store["patchAdventure"]>[0]) {
    if (!this.state || this.state.adventure._id !== adventureId) throw new Error("Adventure not found.")
    Object.assign(this.state.adventure, patch)
    this.save()
  }
  async createTurn(_args: Parameters<Store["createTurn"]>[0]): Promise<string> {
    throw new Error("Only authored wiki adventures are supported locally.")
  }
  async createAdventureWithFirstTurn(_args: Parameters<Store["createAdventureWithFirstTurn"]>[0]): Promise<{ adventureId: string; turnId: string }> {
    throw new Error("Use the local adventure setup.")
  }
  async commitWikiTurnAdvance(args: WikiTurnCommit) {
    const old = this.turn(args.expectedCurrentTurnId)
    const state = this.state!
    if (state.adventure._id !== args.adventureId || old.encounterId !== args.expectedCurrentEncounterId || args.order !== old.order + 1 || state.turns.some((t) => t.order === args.order))
      throw new Error("Stale or duplicate turn advance.")
    // The core validates the authored graph. Revalidate patch/transition agreement at storage.
    const transition = validateRuntimeTransition({
      expectedContentHash: "bundled",
      liveContentHash: "bundled",
      expectedCurrentEncounterId: old.encounterId,
      liveCurrentEncounterId: old.encounterId,
      proposedNextEncounterId: args.nextEncounterId,
      legalTransitions: this.transitions,
    })
    if (!transition.allowed) throw new Error("Illegal encounter transition.")
    const patch = validateAdventurePatch(desktopPatchSchema.parse(args.adventurePatch ?? {}), transition)
    const { characters, characterStates } = nextCharacterState({
      current: old.characters,
      next: args.characters,
      remembered: rememberCharacters(state.characterStates ? [old] : state.turns, state.characterStates),
      updates: patch.characterUpdates,
      encounterChanged: old.encounterId !== args.nextEncounterId,
    })
    const turnId = randomUUID()
    const next = structuredClone(state)
    next.characterStates = characterStates
    next.turns.push({
      _id: turnId,
      adventureId: args.adventureId,
      encounterId: args.nextEncounterId,
      title: args.title,
      narrative: args.narrative,
      characters,
      order: args.order,
      isFinalEncounter: args.isFinalEncounter,
      adventurePatch: patch,
    })
    const a = next.adventure
    a.currentTurnId = turnId
    a.currentEncounterId = args.nextEncounterId
    a.status = args.isFinalEncounter ? "completed" : "active"
    if (args.isFinalEncounter) a.endedAt = Date.now()
    a.discoveries.push(...(patch.discoveries ?? []))
    a.entityUpdates.push(...(patch.entityUpdates ?? []))
    a.resolvedThreadIds = [...new Set([...a.resolvedThreadIds, ...(patch.resolvedThreadIds ?? [])])]
    a.openThreads = [...new Map([...a.openThreads, ...(patch.openThreads ?? [])].map((t) => [t.id, t])).values()].filter((t) => !a.resolvedThreadIds.includes(t.id))
    a.adventureSummaryMarkdown = [a.adventureSummaryMarkdown, patch.summaryDelta].filter(Boolean).join("\n\n")
    if (old.encounterId !== args.nextEncounterId) next.positions = {}
    this.db.prepare("INSERT OR REPLACE INTO save VALUES(1, ?)").run(JSON.stringify(next))
    this.state = next
    return { turnId, adventureId: args.adventureId }
  }
}
