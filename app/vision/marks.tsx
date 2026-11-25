import { Progress, ProgressIndicator, ProgressTrack } from "@d20/ui/progress"

/**
 * How far along a theme or feature is, on UI SDK's Progress: a ring that fills toward done, a ruled meter and the
 * percent. At 100 the ring closes around a hand-drawn check.
 */

const R = 15
const C = 2 * Math.PI * R

/**
 * The check: hand-drawn art (public/images/vision/check.webp) used as a mask, so it takes the ring's blue. A copy in the
 * paper's color sits behind it, a little fatter, so the ring breaks where the check crosses it and the check reads as
 * inked on top.
 */
function InkCheck() {
  return (
    <>
      <span className="vn-ink-check is-knock" aria-hidden />
      <span className="vn-ink-check" aria-hidden />
    </>
  )
}

/** The ring. Its blue fill runs along the track at the track's own weight; done, it closes around the check. */
function Ring({ pct }: { pct: number }) {
  return (
    <>
      <svg viewBox="0 0 38 38" aria-hidden>
        <circle className="vn-ring-track" cx="19" cy="19" r={R} />
        {pct > 0 && <circle className="vn-ring-fill" cx="19" cy="19" r={R} strokeDasharray={`${(C * Math.min(pct, 100)) / 100} ${C}`} transform="rotate(-90 19 19)" />}
      </svg>
      {pct >= 100 && <InkCheck />}
    </>
  )
}

/** A mark, a ruled meter and the percent, all one progressbar. */
export function Gauge({ pct, label, size }: { pct: number; label: string; size: number }) {
  return (
    <Progress value={pct} aria-label={label} render={<span />} className="vn-progress">
      <span className="vn-mark" style={{ width: size, height: size }} aria-hidden>
        <Ring pct={pct} />
      </span>
      <ProgressTrack render={<span />} className="vn-bar">
        <ProgressIndicator render={<span />} />
      </ProgressTrack>
      <span className="vn-pct" aria-hidden>
        {pct}%
      </span>
    </Progress>
  )
}
