import type { ReactNode } from "react"
import { eyebrow } from "@/components/stage/hud"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AdventureInfo } from "../runtime/game"
import type { Save } from "../runtime/store"
import { OutlineButton, type Page } from "./pages"

// Home: the website's title screen, with Continue for the saved adventure and buttons to the app's pages.
export function Home(props: {
  save: Save | null
  // The adventure a first game starts when nothing is saved.
  starter?: AdventureInfo
  busy: boolean
  account: ReactNode
  onContinue: () => void
  onAdventure: (id: string) => void
  onNavigate: (page: Page) => void
}) {
  const turn = props.save?.turns.find((t) => t._id === props.save?.adventure.currentTurnId)
  const pcs = (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => c.name.split(" ")[0])
  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-stage-ink text-stage-cream">
      <img src="/images/app/backgrounds/d20-hero.png" alt="" className="fade-in absolute inset-0 h-full w-full object-cover" />
      {props.account}
      <h1 className="fade-in relative mt-[12vh] text-center font-display text-[clamp(40px,5vw,72px)] delay-[400ms]" style={textShadowSpreadLight}>
        EXpeRienCe <span className="inline-block scale-90">tHe</span> Thrill
      </h1>
      <div className="absolute inset-x-0 bottom-[5vh] flex flex-col items-center text-center">
        <div className="fade-in font-display text-2xl font-bold delay-[600ms]" style={textShadowSpreadLight}>
          Of tHe
        </div>
        <div className="fade-in -mt-3 font-display text-[clamp(80px,9vw,128px)] leading-none delay-[800ms]" style={textShadowSpreadLight}>
          D20
        </div>
        <div className="fade-in mt-6 flex flex-col items-center gap-4 delay-[1000ms]">
          {props.save ? (
            <>
              <p className={cn(eyebrow, "text-[12px]")} style={textShadowSpreadLight}>
                {props.save.adventure.title} · {props.save.adventure.status === "completed" ? "Adventure complete" : `Round ${turn?.order ?? 1} · ${turn?.title ?? ""}`}
                {pcs.length > 0 && <span className="text-stage-cream/70"> · {pcs.join(", ")}</span>}
              </p>
              <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onContinue}>
                Continue
              </Button>
            </>
          ) : (
            props.starter && (
              <Button variant="epic" size="lg" disabled={props.busy} onClick={() => props.onAdventure(props.starter!.id)}>
                Begin
              </Button>
            )
          )}
          <nav className="flex flex-wrap justify-center gap-3" aria-label="Home">
            <OutlineButton onClick={() => props.onNavigate("adventures")}>Adventures</OutlineButton>
            <OutlineButton onClick={() => props.onNavigate("characters")}>Characters</OutlineButton>
            <OutlineButton onClick={() => props.onNavigate("settings")}>Settings</OutlineButton>
          </nav>
        </div>
      </div>
    </div>
  )
}
