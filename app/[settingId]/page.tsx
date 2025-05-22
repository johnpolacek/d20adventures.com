import { textShadow, textShadowSpread } from "@/components/typography/styles"
import Image from "next/image"

export default async function SettingHome(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <h2 className="text-6xl font-display text-center w-full mt-36" style={textShadowSpread}>
          Setting Home
        </h2>
        <p className="text-center font-semibold text-xl" style={textShadow}>
          {settingId}
        </p>
      </div>
      <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.png" alt="D20" />
    </div>
  )
}
