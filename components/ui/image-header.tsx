import React from "react"
import Image from "next/image"
import Parchment from "@/components/graphics/background/Parchment"
import { textShadow, textShadowSpread } from "../typography/styles"

interface ImageHeaderProps {
  imageUrl: string
  title?: string
  subtitle?: string
  overlayContent?: React.ReactNode
  imageAlt?: string
}

export default function ImageHeader({ imageUrl, title, subtitle, imageAlt }: ImageHeaderProps) {
  return (
    <>
      <div className="absolute top-12 sm:top-12 left-0 right-0 w-full aspect-video min-h-[480px]">
        <Image className="object-cover rounded-lg shadow-lg" fill src={imageUrl} alt={imageAlt || title || ""} />
        {title && (
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-display text-center w-full absolute bottom-44 sm:bottom-54 px-4" style={textShadowSpread}>
            {title}
          </h2>
        )}
        <div className="absolute bottom-32 sm:bottom-36 left-0 right-0 flex justify-center">
          {subtitle && (
            <h3 className="relative border border-white/20 rounded-sm bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 font-display sm:text-lg md:text-xl font-bold px-6 sm:px-8 py-1 sm:py-2 ring-4 sm:ring-8 ring-black z-[11] contrast-[1.2] saturate-[.4]">
              <Parchment />
              <span style={textShadow}>{subtitle}</span>
            </h3>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent h-1/4 rounded-b-lg" />
        <div className="absolute bottom-6 sm:bottom-12 left-0 right-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent"></div>
        <div className="absolute bottom-36 sm:bottom-42 left-0 right-0 w-full h-[1px] bg-blend-lighten -mb-px overflow-hidden opacity-50 bg-[url('/images/app/art/texture-line.png')]" />
      </div>
      <div className="w-full aspect-video -mb-12 min-h-[480px]" />
    </>
  )
}
