"use client"

import React, { useEffect, useState } from "react"
import { IMAGE_HOST } from "@/lib/config"
import ImageHeader from "@/components/ui/image-header"
import { Adventure } from "@/types/adventure"
import Turn from "@/components/adventure/turn"
import { useTurn } from "@/lib/context/TurnContext"
import { useParams } from "next/navigation"

export const dynamic = "force-dynamic"

function AdventureHomeContent({ initialImage, initialSubtitle, adventure, teaser }: { initialImage: string; initialSubtitle: string; adventure: Adventure; teaser?: string }) {
  const { adventurePlanId, settingId } = useParams()
  const [image, setImage] = useState(initialImage)
  const [subtitle, setSubtitle] = useState(initialSubtitle)

  const turn = useTurn()

  useEffect(() => {
    if (turn) {
      if (turn.subtitle) {
        setSubtitle(turn.subtitle)
      }
      if (turn.encounterId) {
        setImage(`images/settings/${settingId}/${adventurePlanId}/${turn.encounterId}.png`)
      }
    }
  }, [turn?.id])

  console.log("[AdventureHomeContent]", JSON.stringify({ image, subtitle, turn }, null, 2))

  return (
    <>
      <div className="flex flex-col items-center min-h-screen relative">
        <ImageHeader imageUrl={`${IMAGE_HOST}/${image}`} title={adventure.title} subtitle={subtitle} imageAlt={turn?.title || adventure.title} />
        {turn ? (
          <Turn />
        ) : (
          <div className="grow max-w-2xl fade-in">
            <p className="text-sm sm:text-base md:text-lg whitespace-pre-line">{teaser}</p>
          </div>
        )}
      </div>
    </>
  )
}

export default AdventureHomeContent
