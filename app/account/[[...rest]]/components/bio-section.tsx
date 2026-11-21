"use client"

import { Heading } from "@d20/ui/typography/heading"
import { useUser } from "@clerk/nextjs"
import { useState } from "react"
import { Button } from "@d20/ui/button"
import { Textarea } from "@d20/ui/textarea"

export function BioSection() {
  const { user } = useUser()
  const [bio, setBio] = useState((user?.unsafeMetadata?.bio as string) || "")
  const [isSaving, setIsSaving] = useState(false)

  const saveBio = async () => {
    if (!user) return
    setIsSaving(true)
    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          bio,
        },
      })
    } catch (error) {
      console.error("Error saving bio:", error)
    }
    setIsSaving(false)
  }

  return (
    <div className="rounded-lg border p-4">
      <Heading variant="h4" as="h2" className="mb-4">Your Bio</Heading>
      <Textarea placeholder="Tell us about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} className="mb-4" rows={4} />
      <Button onClick={saveBio} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save Bio"}
      </Button>
    </div>
  )
}
