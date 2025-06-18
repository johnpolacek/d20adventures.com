import { auth } from "@clerk/nextjs/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SignInButton } from "@clerk/nextjs"
import Link from "next/link"
import { textShadowSpread, textShadowSpreadLight } from "@/components/typography/styles"
import FullPageImage from "@/components/layout/fullpage-image"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { s3Client, isAwsConfigured } from "@/lib/aws"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Setting } from "@/types/setting"
import Image from "next/image"
import { getImageUrl } from "@/lib/utils"
import { ChevronsLeft } from "lucide-react"

export default async function CreateAdventurePage() {
  const { userId } = await auth()

  if (!userId) {
    return (
      <FullPageImage overlay>
        <div className="container max-w-2xl mx-auto py-16 relative z-10">
          <Card>
            <CardContent className="flex flex-col items-center gap-6 py-16">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">Sign in to Create</h2>
                <p className="text-muted-foreground">Create an account or sign in to start creating your adventure</p>
              </div>
              <SignInButton mode="modal">
                <Button size="lg">Sign in to Continue</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </FullPageImage>
    )
  }

  // Get existing settings
  let settings: Setting[] = []
  try {
    if (!isAwsConfigured() || !s3Client) {
      throw new Error("AWS S3 is not configured")
    }

    // First, list all setting directories
    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_DATA,
      Prefix: "settings/",
      Delimiter: "/",
    })
    const response = await s3Client.send(command)

    // For each directory, read its setting-data.json file
    if (response.CommonPrefixes) {
      const settingPromises = response.CommonPrefixes.map(async (prefix) => {
        if (!prefix.Prefix) return null
        const settingId = prefix.Prefix.split("/")[1]
        if (!settingId) return null

        console.log("[CreateAdventurePage] settingId", settingId)

        try {
          const setting = (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting
          return { ...setting, id: settingId }
        } catch (err) {
          console.error(`Error reading setting ${settingId}:`, err)
          return null
        }
      })

      const settingsWithNull = await Promise.all(settingPromises)
      settings = settingsWithNull.filter((s): s is Setting & { id: string } => s !== null)
    }
  } catch (err) {
    console.error("Error fetching settings:", err)
  }

  return (
    <FullPageImage overlay>
      <div className="container max-w-6xl mx-auto py-16 relative z-10">
        <h1 className="text-amber-300 text-4xl sm:text-5xl font-display text-center my-12" style={textShadowSpreadLight}>
          Choose a Setting
        </h1>

        <div className="flex flex-wrap justify-center gap-8">
          {/* Existing Settings */}
          {settings.map((setting) => (
            <Card key={setting.id} className="w-full p-0 md:w-1/2 lg:w-1/3 bg-black backdrop-blur-sm border-white/20 group hover:border-amber-300/50 transition-all duration-300">
              <Link href={`/settings/${setting.id}/new`} className="block h-full">
                <CardContent className="space-y-4 flex flex-col items-center h-full p-0">
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-4">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent z-10" />
                    <Image src={getImageUrl(setting.image)} alt={setting.name} fill className="object-cover" />
                  </div>
                  <div className="px-6 pb-6 relative z-10 text-center">
                    <h2 style={textShadowSpread} className="text-2xl font-semibold text-amber-300 -mt-16 pb-4 font-display group-hover:text-amber-400 transition-colors">
                      {setting.name}
                    </h2>
                    <p className="text-white/80 text-center flex-1 text-sm line-clamp-5">{setting.description}</p>
                    <div className="flex justify-center p-2">
                      <Button variant="epic" size="sm" className="text-sm mt-4">
                        Use Setting
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
        <div className="w-full flex justify-center pt-8">
          <Link href="/settings/new" className="block h-full">
            <Button variant="epic" size="sm" className="text-xs px-6 py-3 mt-4">
              Create New Setting
            </Button>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <Link href="/create">
            <Button variant="ghost" size="sm">
              <ChevronsLeft /> Back to Create Options
            </Button>
          </Link>
        </div>
      </div>
    </FullPageImage>
  )
}
