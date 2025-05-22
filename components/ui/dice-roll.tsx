"use client"
import React, { useState, useRef } from "react"
import { Button } from "./button"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { textShadow } from "../typography/styles"
import DiceRollResult from "@/components/adventure/dice-roll-result"

const DICE_SIDES = 20
const ROLL_ANIMATION_DURATION = 1200 // ms
const ROLL_ANIMATION_INTERVAL = 60 // ms

export default function DiceRoll({
  className,
  icon = "/images/app/dice/d20.svg",
  iconSize = 42,
  id,
  onRoll,
}: {
  className?: string
  icon?: string
  iconSize?: number
  id?: string
  onRoll?: (result: number) => void
}) {
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [display, setDisplay] = useState<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const rollDice = () => Math.floor(Math.random() * DICE_SIDES) + 1

  const handleRoll = () => {
    setRolling(true)
    setResult(null)
    let elapsed = 0
    intervalRef.current = setInterval(() => {
      const animRoll = rollDice()
      setDisplay(animRoll)
      elapsed += ROLL_ANIMATION_INTERVAL
      if (elapsed >= ROLL_ANIMATION_DURATION) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        const final = rollDice()
        setDisplay(final)
        setResult(final)
        setRolling(false)
        if (onRoll) {
          onRoll(final)
        }
      }
    }, ROLL_ANIMATION_INTERVAL)
  }

  // Clean up interval on unmount
  React.useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (result !== null) {
    return <DiceRollResult result={result} />
  }

  return (
    <Button
      ariaLabel="Roll D20"
      className={cn(
        "group text-2xl brightness-125 contrast-150 font-display flex gap-[7px] justify-center items-center pt-[2px] pb-0 px-3 bg-blue-600 rounded-full ring-4 ring-blue-800 border border-blue-400/50 transition-all ease-in-out duration-500 bg-[url('/images/app/backgrounds/buried.png')]",
        className,
        rolling && "pointer-events-none"
      )}
      id={id}
      onClick={handleRoll}
    >
      <span style={textShadow} className="pt-[2px]">
        Roll
      </span>
      <Image
        style={{ transform: rolling ? "rotate(720deg)" : undefined, transition: "transform 1.2s cubic-bezier(.22,1,.36,1)" }}
        className="inline-block border border-[rgba(255,255,255,.33)] ring-4 ring-blue-600 group-disabled:ring-gray-600 shadow-inner shadow-black rounded-full overflow-hidden p-[2px] transition-all ease-in-out delay-100 duration-[2s]"
        src={icon}
        width={iconSize}
        height={iconSize}
        alt=""
      />
      <span style={textShadow} className="pt-[2px] w-16 text-center">
        {rolling ? (display ?? "") : "D20"}
      </span>
    </Button>
  )
}
