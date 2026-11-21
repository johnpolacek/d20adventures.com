export default function SettingAdventuresLoading() {
  return (
    <div className="flex min-h-screen flex-col relative" aria-busy="true" aria-label="Loading adventures">
      <div className="w-full aspect-[2.25] min-h-[480px] -mb-12 bg-gradient-to-b from-white/[0.04] to-black animate-pulse" />
      <div className="max-w-4xl xl:max-w-6xl w-full mx-auto relative z-10 pt-8 px-4 md:px-0">
        <div className="w-full aspect-video md:aspect-auto md:h-[380px] rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-8 py-8 space-y-8 md:space-y-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/5] rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
