"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import Link from "next/link"

interface SettingFormHeaderProps {
  settingId: string
  settingName: string
  isSaving: boolean
  onDownload: () => void
  onSave: () => void
}

export function SettingFormHeader({ settingId, settingName, isSaving, onDownload, onSave }: SettingFormHeaderProps) {
  console.log("[SettingFormHeader] Rendering header, isSaving:", isSaving)

  return (
    <div className="w-full flex justify-between items-center p-4 border-b border-white/10 bg-black/50 backdrop-blur-sm -mt-4">
      <div className="flex gap-4">
        <h1 className="text-xl font-display text-primary-200 pl-4">Edit Setting</h1>
        <Link className="border-l border-white/20 text-xl font-display hover:text-amber-400 text-amber-300 font-bold pl-4 transition-all duration-500 ease-in-out" href={`/settings/${settingId}`}>
          {settingName}
        </Link>
      </div>
      <div className="flex gap-8 items-center">
        <Button ariaLabel="Download JSON" variant="outline" size="icon" className="text-white p-0" onClick={onDownload}>
          <Download className="w-4 h-4" />
        </Button>
        <Button variant="epic" size="sm" className="text-sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
