import { Switch as BaseSwitch, SwitchThumb } from "@ui-sdk/react/switch"
import type { ComponentProps } from "react"
import { cn } from "./utils"

type SwitchProps = Omit<ComponentProps<typeof BaseSwitch>, "className" | "children"> & { className?: string }

function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch
      className={cn(
        "peer data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchThumb className="bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0" />
    </BaseSwitch>
  )
}

export { Switch }
