import Image from "next/image"
import { cn } from "@/lib/utils"

export default function Parchment({ containerClass, imageClass }: { containerClass?: string; imageClass?: string }) {
  return (
    <div className={cn("absolute inset-0 z-0 overflow-hidden bg-gradient-to-t from-[rgba(11,0,0,.1)] to-40%", containerClass)}>
      <Image className={cn("object-cover opacity-[.133]", imageClass)} src="/images/app/backgrounds/parchment-texture.png" fill={true} alt="" priority />
    </div>
  )
}
