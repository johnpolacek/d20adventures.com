"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Download, ExternalLink, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "../ui/badge"
import { useParams } from "next/navigation"

interface AdventurePlanFormHeaderProps {
  isSaving: boolean
  onDownload: () => void
  onSave: (overrideImage?: string, overrideDraft?: boolean) => void
  draft: boolean
  setDraft: (draft: boolean) => void
}

export function AdventurePlanFormHeader({ isSaving, onDownload, onSave, draft, setDraft }: AdventurePlanFormHeaderProps) {
  const { settingId, adventurePlanId } = useParams()

  return (
    <div className="flex items-center justify-between gap-4 w-full border-b border-white/10 pb-2">
      <div className="flex items-center gap-3">
        <Switch
          id="draft-toggle"
          checked={draft}
          onCheckedChange={async (checked) => {
            setDraft(checked)
            await onSave(undefined, checked)
          }}
          disabled={isSaving}
        />
        <Label htmlFor="draft-toggle" className="text-sm font-medium font-mono text-primary-200/90">
          Draft Mode
        </Label>

        {!draft && (
          <>
            <Badge className="font-mono opacity-80 text-xxs font-bold uppercase">Published</Badge>
            <Link
              target="_blank"
              className="relative -top-px opacity-70 hover:opacity-100 scale-90 hover:scale-95 transition-all ease-in-out duration-500"
              href={`/settings/${settingId}/${adventurePlanId}/play`}
            >
              <ExternalLink aria-label="Go to Adventure" />
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button ariaLabel="download json" variant="outline" className="text-sm" size="icon" onClick={onDownload}>
          <Download size={20} className="opacity-50 scale-150" />
        </Button>
        <Button variant="outline" className="font-display font-extrabold tracking-widest text-sm w-24" size="sm" onClick={() => onSave()} disabled={isSaving}>
          {isSaving ? (
            <div className="flex items-center gap-2">
              <Loader2 aria-label="Saving in progress" className="animate-spin" />
            </div>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  )
}
