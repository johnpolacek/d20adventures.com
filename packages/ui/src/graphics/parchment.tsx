import { served } from "@d20/stage/served"
import Image from "../native-image"
import { cn } from "../utils"

export default function Parchment({ containerClass, imageClass }: { containerClass?: string; imageClass?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden bg-gradient-to-t from-[rgba(11,0,0,.1)] to-40%", containerClass)}>
      <Image className={cn("object-cover opacity-[.133]", imageClass)} src={served("/images/app/backgrounds/parchment-texture.webp")} fill={true} alt="" priority />
    </div>
  )
}
