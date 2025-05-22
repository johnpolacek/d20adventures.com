"use client"
import React, { useEffect, useRef } from "react"
import Image from "next/image"
import AnimateIn from "./animate-in"
import { cn } from "@/lib/utils"

const spin = `@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  80% {
    transform: rotate(360deg);
  }
  99.99% {
    transform: rotate(360deg);
  }
}`

const LoadingAnimation = ({ className, children, containerClassName }: { className?: string; containerClassName?: string; children?: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  return (
    <div ref={containerRef} className={cn("flex flex-col items-center justify-center gap-2 py-16", containerClassName)}>
      <AnimateIn from="opacity-0 scale-0" to="opacity-50 scale-100" duration={1000} className={cn("w-full flex justify-center", className)}>
        <style>{spin}</style>
        <Image
          className="inline-block p-3 border-2 bg-black/90 border-white/75 rounded-full overflow-hidden transition-all ease-in-out animate-spin"
          src="/images/d20-white.svg"
          width={96}
          height={96}
          alt="Loading"
          style={{ animation: "spin 2s infinite ease-in-out", boxShadow: "0 0 2px #000, 0 0 4px #000, 0 0 8px #000, 0 0 16px #000" }}
        />
      </AnimateIn>
      {children && (
        <AnimateIn className="font-mono" style={{ textShadow: "0 2px 4px #000, 0 2px 16px #000" }} from="opacity-0" to="opacity-80" delay={1000}>
          {children}
        </AnimateIn>
      )}
    </div>
  )
}

export default LoadingAnimation
