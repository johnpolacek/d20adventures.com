"use client"
import React, { useState, useEffect } from "react"
import Image from "next/image"
import { textShadow } from "@/components/typography/styles"

export default function DiceRollResult({ result, animate }: { result: number; animate?: boolean }) {
  const [animatedResult, setAnimatedResult] = useState<number | undefined>(animate ? undefined : result)

  useEffect(() => {
    if (result && animate) {
      let timer: NodeJS.Timeout
      let currentStep = 0
      const steps = 8 // Number of steps for the animation
      const interval = 16 // Initial interval in milliseconds

      const animateResult = () => {
        if (currentStep < steps) {
          setAnimatedResult(Math.ceil(Math.random() * 20)) // Generate a random number between 1 and the die value
          currentStep++
          // Gradually increase the interval to slow down the animation
          timer = setTimeout(animateResult, interval + currentStep * 12)
        } else {
          setAnimatedResult(result) // Finally, set to the actual result
        }
      }

      animateResult()

      return () => {
        clearTimeout(timer) // Clear the timeout if the component unmounts
      }
    }
  }, [result, animate])

  const isNat20 = result === 20
  const isNat1 = result === 1

  const diceBorderColor = isNat20 ? "border-yellow-400/50" : isNat1 ? "border-red-500/50" : "border-blue-300/30"

  const diceTextColor = isNat20 ? "text-yellow-300" : isNat1 ? "text-red-400" : "text-white"

  const diceGlow = isNat20 ? "shadow-[0_0_12px_3px_rgba(250,204,21,0.4)]" : isNat1 ? "shadow-[0_0_12px_3px_rgba(220,38,38,0.4)]" : ""

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className={`w-20 h-20 flex items-center justify-center text-4xl bg-black/70 border-2 ring-8 ring-white/5 rounded-full ${diceBorderColor} ${diceGlow}`}>
        {animatedResult ? <span className={`font-mono ${diceTextColor}`}>{animatedResult}</span> : <span className="font-display">~</span>}
      </div>
      <div className="-mt-2 flex justify-center w-48">
        {result && (
          <div
            style={{ boxShadow: "inset 0 -4px 16px 0 rgba(0,0,0,.5), 0 0 1px 2px #000" }}
            className={`flex gap-1.5 items-center justify-center w-32 border border-white/30 font-display rounded-full pr-4 text-lg bg-[url('/images/app/backgrounds/buried.png')] brightness-110 contrast-150 saturate-150 shadow-inner bg-blue-500`}
          >
            <div className="w-32 flex gap-1.5 items-center fade-in">
              <div style={{ boxShadow: "inset 0 2px 2px 0 rgba(0,0,0,.85)" }} className="bg-black/20 border border-white/30 h-10 w-10 rounded-full flex items-center justify-center">
                <Image src={`/images/app/dice/d20.svg`} width={36} height={36} alt="Dice Roll" />
              </div>
              <span style={textShadow}>Result</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
