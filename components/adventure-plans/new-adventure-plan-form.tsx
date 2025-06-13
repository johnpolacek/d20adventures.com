"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createAdventurePlan } from "@/app/_actions/adventure-plan-actions"
import { toast } from "sonner"

interface NewAdventurePlanFormProps {
  settingId: string
}

export function NewAdventurePlanForm({ settingId }: NewAdventurePlanFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = React.useState(false)
  const [formData, setFormData] = React.useState({
    title: "",
    author: "D20Adventures",
    version: Date.now().toString(),
    teaser: "",
    overview: "",
    minPartySize: 1,
    maxPartySize: 4,
    tags: [] as string[],
    image: "",
    start: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const newAdventurePlan = {
        ...formData,
        id: formData.title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        settingId,
        party: [formData.minPartySize, formData.maxPartySize] as [number, number],
        sections: [],
        premadePlayerCharacters: [],
        npcs: {},
        draft: true,
      }

      const result = await createAdventurePlan(newAdventurePlan)

      if (result.success) {
        toast.success("Adventure plan created successfully!")
        router.push(`/settings/${settingId}/${newAdventurePlan.id}/edit`)
      } else {
        toast.error(result.error || "Failed to create adventure plan")
      }
    } catch (error) {
      toast.error("An error occurred while creating the adventure plan")
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div>
        <div>
          <div className="text-2xl font-display text-amber-400 py-8">Create New Adventure Plan</div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="title">Title</label>
              <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
            </div>
            <div className="space-y-2 hidden">
              <label htmlFor="author">Author</label>
              <Input id="author" value="D20Adventures" onChange={(e) => setFormData({ ...formData, author: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="teaser">Teaser</label>
            <Textarea id="teaser" value={formData.teaser} onChange={(e) => setFormData({ ...formData, teaser: e.target.value })} required />
          </div>

          <div className="space-y-2">
            <label htmlFor="overview">Overview</label>
            <Textarea id="overview" value={formData.overview} onChange={(e) => setFormData({ ...formData, overview: e.target.value })} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="minPartySize">Minimum Party Size</label>
              <Input id="minPartySize" type="number" min="1" value={formData.minPartySize} onChange={(e) => setFormData({ ...formData, minPartySize: parseInt(e.target.value) })} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="maxPartySize">Maximum Party Size</label>
              <Input id="maxPartySize" type="number" min="1" value={formData.maxPartySize} onChange={(e) => setFormData({ ...formData, maxPartySize: parseInt(e.target.value) })} required />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="epic" disabled={isSaving}>
          {isSaving ? "Creating..." : "Create Adventure Plan"}
        </Button>
      </div>
    </form>
  )
}
