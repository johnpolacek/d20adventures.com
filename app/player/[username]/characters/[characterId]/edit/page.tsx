import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { PCTemplate } from "@/types/character"
import { EditCharacterView } from "@/components/views/edit-character-view"
import FullPageImage from "@/components/layout/fullpage-image"

interface EditCharacterPageProps {
  params: Promise<{ username: string; characterId: string }>
}

export default async function EditCharacterPage(props: EditCharacterPageProps) {
  const { username, characterId } = await props.params
  const user = await currentUser()

  if (!user) {
    redirect("/sign-in")
  }

  if (user.username !== username) {
    console.log(`User mismatch: user.username=${user.username}, url username=${username}. Redirecting to /`)
    redirect("/")
  }

  // Load character from S3
  let character: PCTemplate | null = null
  const s3Key = `characters/${user.id}/${characterId}.json`
  try {
    const data = await readJsonFromS3(s3Key)
    character = data as PCTemplate
  } catch (err) {
    console.log(`[EditCharacterPage] Error loading character from S3: ${err}. Redirecting to /player/${username}`)
    redirect(`/player/${username}`)
  }

  return (
    <FullPageImage>
      <div className="max-w-3xl mx-auto py-12 relative z-10">
        <EditCharacterView character={character} />
      </div>
    </FullPageImage>
  )
}
