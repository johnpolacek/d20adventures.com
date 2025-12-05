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
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import React from "react"

interface DeleteEncounterAlertProps {
  disabled: boolean
  onDelete: () => void
  encounterTitle: string
}

export function DeleteEncounterAlert({ disabled, onDelete, encounterTitle }: DeleteEncounterAlertProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} size="sm" variant="ghost" className="flex items-center gap-2 text-red-400 hover:text-red-400 hover:bg-red-400/10 z-10">
          <X size={14} />
          Delete Encounter
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Encounter</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to delete the encounter “{encounterTitle}”? This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-red-800 font-display font-bold hover:bg-red-700 focus:ring-red-800">
            Delete Encounter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
