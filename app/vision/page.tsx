import type { Metadata } from "next"
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@d20/ui/accordion"
import { LedgerShell } from "@/components/layout/ledger-page"
import { share } from "@/lib/share"
import { themeProgress, visionThemes, type VisionFeature, type VisionTheme } from "@/lib/vision"
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

const done = (t: VisionTheme) => t.features.filter((f) => f.pct >= 100).length
const byProgress = (fs: VisionFeature[]) => [...fs].sort((a, b) => b.pct - a.pct)

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
                    {done(t)} of {t.features.length}
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
                    </span>
                    <span />
                    <Gauge pct={f.pct} label={`${f.name} progress`} size={32} />
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
        </div>
      </div>
    </LedgerShell>
  )
}
