import Image from "@d20/ui/native-image"
import { picture } from "@/lib/images"

export default async function FullPageImage({ children, image, overlay }: { children: React.ReactNode; image?: string; overlay?: boolean }) {
  return (
    <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
      {children}
      <div className="fixed inset-0 z-0">
        {overlay && <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/10 to-transparent" />}
        <Image className="object-cover fade-in" fill={true} {...(image ? picture(image) : { src: "/images/app/backgrounds/d20-hero.webp" })} alt="D20" />
      </div>
    </div>
  )
}
