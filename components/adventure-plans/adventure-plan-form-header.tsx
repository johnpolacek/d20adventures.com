"use client"

import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"

interface AdventurePlanFormHeaderProps {
  isSaving: boolean
  onDownload: () => void
  onSave: () => void
}

export function AdventurePlanFormHeader({ isSaving, onDownload, onSave }: AdventurePlanFormHeaderProps) {
  return (
    <div className="flex items-center justify-end gap-4 w-full border-b border-white/10 pb-2">
      <Button ariaLabel="download json" variant="outline" className="text-sm" size="icon" onClick={onDownload}>
        <Download size={20} className="opacity-50 scale-150" />
      </Button>
      <Button variant="outline" className="font-display font-extrabold tracking-widest text-sm w-24" size="sm" onClick={onSave} disabled={isSaving}>
        {isSaving ? (
          <div className="flex items-center gap-2">
            <Loader2 aria-label="Saving in progress" className="animate-spin" />
          </div>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  )
}
