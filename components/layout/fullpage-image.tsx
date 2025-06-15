import Image from "next/image"

export default async function FullPageImage({ children, image }: { children: React.ReactNode; image?: string }) {
  return (
    <div className="flex min-h-[max(100vh,100vw)] lg:min-h-screen flex-col relative">
      {children}
      <div className="fixed inset-0 z-0">
        <Image className="object-cover fade-in" fill={true} src={image ?? "/images/app/backgrounds/d20-hero.png"} alt="D20" />
      </div>
    </div>
  )
}
