"use client"
import type React from "react"
import { useEffect, useRef } from "react"
import Image from "./native-image"
import { cn } from "./utils"
import AnimateIn from "./animate-in"

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

// In a turn it scrolls itself into view, so the reader sees the next part is coming. `scroll={false}` keeps it still.
const LoadingAnimation = ({ className, children, containerClassName, scroll = true }: { className?: string; containerClassName?: string; children?: React.ReactNode; scroll?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scroll) containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [scroll])

  return (
    <div ref={containerRef} className={cn("flex flex-col items-center justify-center gap-2", containerClassName)}>
      <AnimateIn from="opacity-0 scale-0" to="opacity-50 scale-50" duration={300} className={cn("w-full flex justify-center", className)}>
        <style>{spin}</style>
        <Image
          className="inline-block p-4 border-2 bg-black/90 border-primary-300 rounded-full overflow-hidden transition-all ease-in-out animate-spin"
          src="/images/d20-white.svg"
          width={96}
          height={96}
          alt="Loading"
          style={{ animation: "spin 2s infinite ease-in-out" }}
        />
      </AnimateIn>
      {children && (
        <AnimateIn className="font-mono" style={{ textShadow: "0 2px 4px #000, 0 2px 16px #000" }} from="opacity-0" to="opacity-80" delay={400}>
          {children}
        </AnimateIn>
      )}
    </div>
  )
}

export default LoadingAnimation
