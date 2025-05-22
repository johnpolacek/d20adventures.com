import Image from "next/image"

export default function CharacterRollDisplay({ rollType, result, difficulty, character, success }: { rollType: string; result: number; difficulty: number; character: string; success: boolean }) {
  return (
    <div
      className={`my-6 flex items-center gap-3 px-4 py-3 rounded-lg font-display text-base shadow-inner border-2 w-fit mx-auto
        ${success ? "bg-green-900/80 text-green-200 border-green-600" : "bg-red-900/80 text-red-200 border-red-600"}
      `}
    >
      <Image src="/images/app/dice/d20.svg" alt="Dice" width={32} height={32} className="inline-block" />
      <span className="font-bold">{character}</span>
      <span className="opacity-70">{rollType}</span>
      <span className="ml-2 font-mono text-lg">{result}</span>
      <span className="opacity-60 text-sm">vs DC {difficulty}</span>
      <span className={`ml-3 px-2 py-1 rounded text-xs font-bold ${success ? "bg-green-700/80 text-green-100" : "bg-red-700/80 text-red-100"}`}>{success ? "Success" : "Failure"}</span>
    </div>
  )
}
