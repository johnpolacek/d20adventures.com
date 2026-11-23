import type { User } from "@clerk/nextjs/server"
import type { CSSProperties } from "react"
import { clerkClient } from "@clerk/nextjs/server"
import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { DeleteAdventureButton } from "@/components/admin/delete-adventure-button"
import { LedgerHead } from "@/components/layout/ledger-page"
import type { Doc } from "@/convex/_generated/dataModel"

// A person by name, else by username or email, since a Clerk account may have no name.
const nameOf = (user: User | undefined) => (user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.emailAddresses[0]?.emailAddress || user.id : "Unknown")

export default async function AdminAdventuresPage() {
  const adventures: Doc<"adventures">[] = await getAllAdventuresAdmin()

  // Get unique ownerIds
  const ownerIds = Array.from(new Set(adventures.map((a) => a.ownerId)))
  // Get unique player userIds
  const playerIds = Array.from(new Set(adventures.flatMap((a) => (a.players || []).map((p) => p.userId))))
  const allUserIds = Array.from(new Set([...ownerIds, ...playerIds]))

  // Fetch user info for each owner and player
  const client = await clerkClient()
  const { data: users } = await client.users.getUserList({ userId: allUserIds })
  const userMap = new Map(users.map((user: User) => [user.id, user]))

  return (
    <>
      <LedgerHead title="Games" subtitle={`${adventures.length} ${adventures.length === 1 ? "game" : "games"}, newest first`} />
      <section className="up-panel">
      <div className="up-table">
      <table>
        <thead>
          <tr>
            <th>Game</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Players</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {adventures.map((adventure, index) => {
            const user = userMap.get(adventure.ownerId)
            const players = (adventure.players || []).map((p) => {
              const playerUser = userMap.get(p.userId)
              return {
                userId: p.userId,
                aiControlled: p.controlledBy === "ai",
                name: nameOf(playerUser),
                email: playerUser ? playerUser.emailAddresses[0]?.emailAddress : "Unknown",
              }
            })
            return (
              <tr key={adventure._id} className={index < 40 ? "enter-fade" : undefined} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
                <td>
                  <div>{adventure.title}</div>
                  <div className="up-small font-mono !text-xs">{adventure._id}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <span className={`up-pill ${adventure.status === "completed" ? "is-good" : (adventure.status ?? "active") === "active" ? "is-accent" : ""}`}>{(adventure.status ?? "active") === "waitingForPlayers" ? "Waiting" : (adventure.status ?? "active")[0].toUpperCase() + (adventure.status ?? "active").slice(1)}</span>
                    {(adventure.runType ?? "campaign") === "practice" && <span className="up-pill is-warn">Practice</span>}
                    {players.some((p) => p.aiControlled) && <span className="up-pill">{players.filter((p) => p.aiControlled).length} AI</span>}
                  </div>
                </td>
                <td>
                  <div className="whitespace-nowrap">{nameOf(user)}</div>
                </td>
                <td>
                  {players.length === 0 ? (
                    <span className="up-small">No players</span>
                  ) : (
                    <ul className="space-y-1">
                      {players.map((p, index) => (
                        <li key={`${p.userId}-${index}`} className="text-xs">
                          {p.aiControlled ? <span className="up-small !text-xs">AI Companion</span> : <span title={p.email}>{p.name}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap">{new Date(adventure.createdAt).toLocaleDateString()}</td>
                <td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <a className="up-btn is-xs" href={`/settings/${adventure.settingId}/${adventure.planId}/${adventure._id}`} target="_blank" rel="noopener noreferrer">
                      View
                    </a>
                    <DeleteAdventureButton adventureId={adventure._id} title={adventure.title} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      </section>
    </>
  )
}
