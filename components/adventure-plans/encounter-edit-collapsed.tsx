"use client"

import * as React from "react"
import Image from "next/image"
import { AdventureEncounter } from "@/types/adventure-plan"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { X, Edit, ChevronsRight } from "lucide-react"

interface EncounterEditCollapsedProps {
  encounter: AdventureEncounter
  imageUrl: string
  availableEncounters: { id: string; title: string }[]
  isSaving: boolean
  toggleEditMode: () => void
  onDelete: (sectionIndex: number, sceneIndex: number, encounterIndex: number) => void
  sectionIndex: number
  sceneIndex: number
  encounterIndex: number
}

export function EncounterEditCollapsed({ encounter, imageUrl, availableEncounters, isSaving, toggleEditMode, onDelete, sectionIndex, sceneIndex, encounterIndex }: EncounterEditCollapsedProps) {
  return (
    <div className="p-4 flex items-center gap-4 relative">
      <div onClick={toggleEditMode} className="h-16 aspect-video rounded-lg overflow-hidden bg-white/10 flex-shrink-0 cursor-pointer relative">
        {imageUrl ? (
          <Image fill={true} src={imageUrl} alt={encounter.title || "Encounter"} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">No Image</div>
        )}
      </div>
      <div onClick={toggleEditMode} className="flex-1 min-w-0 cursor-pointer">
        <div className="text-lg font-display font-bold text-amber-300 truncate">{encounter.title || "Untitled Encounter"}</div>
        {!encounter.transitions ||
          (encounter.transitions.length === 0 && (
            <div className="absolute -bottom-3 left-6 bg-black border border-red-700/80 rounded px-2 py-0.5 text-xxs font-mono text-white/90">Final Encounter</div>
          ))}
        <div className="text-sm text-white/90 space-y-1">{encounter.intro && <div className="text-white/60 text-xs truncate">{encounter.intro.substring(0, 100)}...</div>}</div>
        {/* Transition Badges */}
        {encounter.transitions && encounter.transitions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {encounter.transitions.map((transition, idx) => {
              const target = availableEncounters.find((enc) => enc.id === transition.encounter)
              if (!target) return null
              return (
                <span
                  key={transition.encounter + idx}
                  className="inline-flex items-center gap-1 bg-indigo-800/80 text-indigo-100 text-xxs font-mono rounded-full px-2 py-0.5 max-w-xs truncate"
                  title={target.title}
                >
                  <ChevronsRight size={10} /> {target.title}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <Button onClick={toggleEditMode} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
        <Edit size={14} />
        Edit
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
            <X size={14} />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Encounter</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete the encounter “{encounter.title || "Untitled Encounter"}”? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(sectionIndex, sceneIndex, encounterIndex)} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
              Delete Encounter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
