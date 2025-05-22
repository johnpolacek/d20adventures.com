"use client"
import React, { useState } from "react"
import { Button } from "./button"
import Image from "next/image"
import { cn } from "@/lib/utils"

const RollButton = ({
  className,
  onClick,
  isReroll,
  text1,
  text2,
  disabled,
  icon = "/images/app/dice/d20.svg",
  iconSize = 42,
  id,
}: {
  className?: string
  onClick: () => void
  isReroll?: boolean
  text1?: string
  text2?: string
  disabled?: boolean
  icon?: string
  iconSize?: number
  id?: string
}) => {
  const [count, setCount] = useState(0)

  const clickHandler = () => {
    setCount(count + 1)
    onClick()
  }

  return (
    <Button
      ariaLabel="Roll"
      className={cn(
        "group text-2xl brightness-125 contrast-150 font-display flex gap-[7px] justify-center items-center pt-[2px] pb-0 px-3 bg-blue-600 rounded-full ring-4 ring-blue-800 disabled:ring-gray-800 border border-blue-400/50 disabled:border-gray-400/50 transition-all ease-in-out duration-500 bg-[url('/images/app/backgrounds/buried.png')]",
        className
      )}
      id={id}
      onClick={clickHandler}
      disabled={disabled}
    >
      <span className="pt-[2px]">{text1 ? text1 : isReroll ? "re" : "Roll"}</span>
      <Image
        style={{ transform: `rotate(${count * 360}deg)` }}
        className="inline-block border border-[rgba(255,255,255,.33)] ring-4 ring-blue-600 group-disabled:ring-gray-600 shadow-inner shadow-black rounded-full overflow-hidden p-[2px] transition-all ease-in-out delay-100 duration-[2s]"
        src={icon}
        width={iconSize}
        height={iconSize}
        alt=""
      />
      <span className="pt-[2px]">{text2 ? text2 : isReroll ? "roll" : "D20"}</span>
    </Button>
  )
}

export default RollButton
