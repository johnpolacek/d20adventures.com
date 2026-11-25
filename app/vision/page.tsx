import type { Metadata } from "next"
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@d20/ui/accordion"
import { LedgerShell } from "@/components/layout/ledger-page"
import { share } from "@/lib/share"
import { featureProgress, themeProgress, visionThemes, type VisionFeature, type VisionTheme } from "@/lib/vision"
import { Gauge } from "./marks"
import "./vision.css"

export const metadata: Metadata = {
  ...share({ title: "Vision", description: "Building Baldur’s Gate 3 as a free, open source platform, and how far along each part is." }),
}

function Chevron() {
  return (
    <svg className="vn-chev" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 6 L8 10 L12 6" />
    </svg>
  )
}

const milestones = (t: VisionTheme) => t.features.flatMap((f) => f.milestones)
const byProgress = (fs: VisionFeature[]) => [...fs].sort((a, b) => featureProgress(b) - featureProgress(a))

/** A milestone's mark: a small ring, closed with the check when it is done. */
function Tick({ done }: { done: boolean }) {
  return (
    <span className={`vn-tick${done ? " is-done" : ""}`} aria-hidden>
      {done && <span className="vn-ink-check" />}
    </span>
  )
}

/**
 * The feature table, on UI SDK's Accordion: a row per theme, led by its engraved emblem, with its count and progress.
 * Opening a row slides its parts down beneath it, set in the row's own columns. Emblems are in
 * public/images/vision/emblems, named by theme id.
 */
function FeatureTable() {
  return (
    <Accordion multiple className="vn-table">
      {visionThemes.map((t) => {
        const pct = themeProgress(t)
        return (
          <AccordionItem key={t.id} value={t.id} className="vn-row">
            <AccordionHeader className="vn-row-head">
              <AccordionTrigger className="vn-row-trigger">
                <img className="vn-emblem" src={`/images/vision/emblems/${t.id}.webp`} alt="" width={256} height={256} />
                <span className="vn-name">
                  <b>{t.name}</b>
                  <small>{t.why}</small>
                </span>
                <span className="vn-count">
                  <span className="vn-num">
                    {milestones(t).filter((x) => x.done).length} of {milestones(t).length}
                  </span>
                </span>
                <Gauge pct={pct} label={`${t.name} progress`} size={44} />
                <Chevron />
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="vn-row-panel">
              <ul>
                {byProgress(t.features).map((f) => (
                  <li key={f.name}>
                    <span />
                    <span className="vn-name">
                      <b>{f.name}</b>
                      <small>{f.note}</small>
                      <ul className="vn-steps" aria-label={`${f.name} milestones`}>
                        {f.milestones.map((x) => (
                          <li key={x.text} className={x.done ? "is-done" : undefined}>
                            <Tick done={x.done} />
                            <span>
                              {x.text}
                              <span className="sr-only">{x.done ? ", done" : ", not done yet"}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </span>
                    <span />
                    <Gauge pct={featureProgress(f)} label={`${f.name} progress`} size={32} />
                    <span />
                  </li>
                ))}
              </ul>
            </AccordionPanel>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

/** The page's header: a title page across the full width, over a pen and ink engraving of the road to the city. */
function Header() {
  return (
    <header className="vn-head">
      <img className="vn-head-art" src="/images/vision/road-to-the-gate.webp" alt="" width={2172} height={724} />
      <div className="vn-head-inner">
        <div className="vn-orn" aria-hidden>
          <span />
          <i />
          <span />
        </div>
        <p className="up-label">The Road to</p>
        <h1>Baldur’s Gate 3</h1>
        <p className="vn-head-as">as a Free, Open Source Platform</p>
        <div className="vn-orn" aria-hidden>
          <span />
          <i />
          <span />
        </div>
      </div>
    </header>
  )
}

export default function VisionPage() {
  return (
    <LedgerShell>
      <Header />
      <div className="vn-wrap is-edge">
        <FeatureTable />
        <div className="vn-outro">
          <p>This is a work in progress, and the numbers are honest guesses that change as the work goes. It’s a big goal, and help is welcome.</p>
          <p>
            Everything is open source on <a href="https://github.com/johnpolacek/d20adventures.com">Github</a>.
          </p>
          <p>
            Read why in <a href="/updates/building-baldurs-gate-3-as-a-free-open-source-platform">Building Baldur’s Gate 3 as a Free Open Source Platform</a>.
          </p>
        </div>
      </div>
    </LedgerShell>
  )
}
