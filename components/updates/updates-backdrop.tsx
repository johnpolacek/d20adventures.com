import Image from "@d20/ui/native-image"

/** Black paper grain over the whole page, with art faded in behind the top. */
export function UpdatesBackdrop({ image = "/images/app/backgrounds/d20-hero.webp", strength = "opacity-30" }: { image?: string; strength?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-black">
      <div className="absolute inset-x-0 top-0 h-[42rem] [mask-image:linear-gradient(to_bottom,#000_20%,transparent)]">
        <Image className={`object-cover blur-[2px] scale-105 ${strength}`} fill={true} src={image} alt="" />
      </div>
      <div className="stage-grain absolute inset-0 opacity-70" />
    </div>
  )
}
