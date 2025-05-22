import { CSSProperties } from "react"

// Extend CSSProperties and include textWrap
interface CustomCSSProperties extends CSSProperties {
  textWrap?: "wrap" | "nowrap" | "balance" | "pretty" | "stable" | "inherit" | "initial" | "revert" | "revert-layer" | "unset"
}

export const emboss = {
  style: {
    textWrap: "balance",
    borderRadius: "255px 15px 225px 15px/15px 225px 15px 255px",
    boxShadow: "-1px 1px 8px 3px rgba(0,0,0,.25) inset",
  } as CustomCSSProperties,
  className:
    "bg-primary-700 text-base font-bold opacity-90 cursor-pointer border-2 sm:border-4 hover:border-primary-400 transition-all ease-in-out duration-500 hover:scale-105 border-primary-500 text-blue-50 hover:text-white disabled:bg-gray-600 disabled:opacity-50 uppercase tracking-widest px-6 rounded-md py-1",
}

export const paper = {
  className: "bg-amber-50 bg-contain bg-repeat brightness-150 contrast-150",
  style: { backgroundImage: `url('/images/app/backgrounds/paper-texture.png')`, backgroundSize: "33%", filter: "saturate(2) hue-rotate(330deg) contrast(1.1)" },
}
