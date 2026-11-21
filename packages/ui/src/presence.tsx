"use client"

import type { AnimationEvent, CSSProperties, JSX, ReactElement, ReactNode } from "react"
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "./utils"

/** How a part comes and goes. Each names an `enter-*` and an `exit-*` class in components/theme.css. */
export type Motion = "fade" | "rise" | "drop" | "left" | "right" | "pop"

// Longer than any exit, for an exit whose end event never comes.
const EXIT_LIMIT = 300

type ChildProps = { className?: string; style?: CSSProperties; onAnimationEnd?: (e: AnimationEvent<HTMLElement>) => void }

type Shared = {
  /** The motion both ways. `exit` sets a different one for leaving. */
  motion?: Motion
  exit?: Motion
  /** The place in a staggered row or list. Each step waits a little longer to come in. */
  index?: number
  /** Put the motion on the one child element instead of a wrapper. The child must take `className`, `style` and `onAnimationEnd`. */
  asChild?: boolean
  as?: keyof JSX.IntrinsicElements
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

// Past the eighth, a staggered part comes in with the eighth, so a long list is never slow.
const stagger = (index?: number): CSSProperties | undefined => (index ? ({ "--i": Math.min(index, 8) } as CSSProperties) : undefined)

function useExit(leaving: boolean, done: () => void) {
  const finish = useRef(done)
  useLayoutEffect(() => {
    finish.current = done
  })
  useEffect(() => {
    if (!leaving) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return finish.current()
    const timer = setTimeout(() => finish.current(), EXIT_LIMIT)
    return () => clearTimeout(timer)
  }, [leaving])
}

function part(node: ReactNode, motionClass: string, onEnd: ((e: AnimationEvent<HTMLElement>) => void) | undefined, { index, asChild, as = "div", className, style }: Shared, key?: string | number) {
  const delay = stagger(index)
  if (asChild && isValidElement(node)) {
    const child = node as ReactElement<ChildProps>
    return cloneElement(child, {
      key,
      className: cn(child.props.className, motionClass, className),
      style: delay || style ? { ...child.props.style, ...delay, ...style } : child.props.style,
      onAnimationEnd: (e: AnimationEvent<HTMLElement>) => {
        child.props.onAnimationEnd?.(e)
        onEnd?.(e)
      },
    } as ChildProps & { key?: string | number })
  }
  const Tag = as as "div"
  return (
    <Tag key={key} className={cn(motionClass, className)} style={delay || style ? { ...delay, ...style } : undefined} onAnimationEnd={onEnd}>
      {node}
    </Tag>
  )
}

/**
 * Shows `children` while `show` is true. They animate in when they appear and stay mounted to animate out. The last
 * children shown are the ones that leave, so `{value && <Card value={value} />}` works as the children.
 */
function Presence({
  show,
  initial = true,
  onExited,
  ...shared
}: Shared & { show: boolean; /** False skips the entrance of a part that is there from the first render. */ initial?: boolean; /** Runs once the part has left. */ onExited?: () => void }) {
  const { motion = "rise", exit = motion, children } = shared
  const [present, setPresent] = useState(show)
  const [first, setFirst] = useState(true)
  const last = useRef<ReactNode>(children)
  if (show && !present) setPresent(true)
  if (!present && first) setFirst(false)
  useLayoutEffect(() => {
    if (show) last.current = children
  })
  const leaving = present && !show
  const gone = () => {
    setPresent(false)
    onExited?.()
  }
  useExit(leaving, gone)
  if (!present) return null
  const motionClass = leaving ? `exit-${exit}` : first && !initial ? "" : `enter-${motion}`
  // An animation that ends inside the part bubbles up. Only the part's own exit unmounts it.
  const onEnd = leaving ? (e: AnimationEvent<HTMLElement>) => e.target === e.currentTarget && gone() : undefined
  return part(leaving ? last.current : children, motionClass, onEnd, shared)
}

/**
 * Shows one thing at a time. When `id` changes, what was there animates out and the new children animate in. For a
 * screen, a tab's content or a step.
 */
function Swap({ id, initial = true, ...shared }: Shared & { id: string | number; /** False skips the entrance of what is there on the first render. */ initial?: boolean }) {
  const { motion = "fade", exit = motion, children } = shared
  const [shown, setShown] = useState(id)
  const [first] = useState(id)
  const [swapped, setSwapped] = useState(false)
  if (shown !== first && !swapped) setSwapped(true)
  const last = useRef<ReactNode>(children)
  const leaving = shown !== id
  useLayoutEffect(() => {
    if (!leaving) last.current = children
  })
  useExit(leaving, () => setShown(id))
  const onEnd = leaving ? (e: AnimationEvent<HTMLElement>) => e.target === e.currentTarget && setShown(id) : undefined
  return part(leaving ? last.current : children, leaving ? `exit-${exit}` : !initial && !swapped ? "" : `enter-${motion}`, onEnd, shared, shown)
}

export { Presence, Swap }
