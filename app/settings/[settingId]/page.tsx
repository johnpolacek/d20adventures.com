import { Heading } from "@d20/ui/typography/heading"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import ImageHeader from "@d20/ui/image-header"
import { isDev } from "@/lib/auth-utils"
import { getCachedSetting } from "@/lib/setting-cache"
import { headerImage } from "@/lib/images"
import type { Setting } from "@/types/setting"

export default async function SettingHome(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params

  let setting: Setting | null = null
  try {
    setting = await getCachedSetting(settingId)
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  const canEdit = isDev()

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-150 relative z-10">
        <ImageHeader {...headerImage(setting.image)} title={setting.name} imageAlt={setting.name} />
        {canEdit && (
          <div className="fixed bottom-[4vh] right-[4vh] z-20 space-y-4 flex flex-col items-end">
            <Link href={`/settings/${settingId}/edit`}>
              <Button>Edit Setting</Button>
            </Link>
          </div>
        )}
        <div className="max-w-3xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
          <div className="flex justify-center mb-8">
            <Link href={`/settings/${settingId}/play`}>
              <Button variant="epic">
                Go to Adventures
              </Button>
            </Link>
          </div>
          <p>{setting.description}</p>
          {setting.technology && (
            <>
              <Heading variant="h3" as="h4" className="mt-6 mb-1">Technology</Heading>
              <p>{setting.technology}</p>
            </>
          )}
          {setting.magic && (
            <>
              <Heading variant="h3" as="h4" className="mt-6 mb-1">Magic</Heading>
              <p>{setting.magic}</p>
            </>
          )}
        </div>
        <div id="locations" className="pb-16">
          {setting.locations.map((location, index) => (
            <div key={index} className="w-full relative">
              <div className="flex flex-col pt-16">
                <Heading variant="h3" as="h4">{location.name}</Heading>

                <ImageHeader topBorder variant="semicompact" {...headerImage(location.image)} title={location.name} imageAlt={location.name} />

                <div className="max-w-3xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
                  <div className="whitespace-pre-line">
                    <p>{location.description}</p>
                  </div>

                  {location.history && (
                    <>
                      <Heading variant="h4" as="h5" className="mt-4 mb-1">History</Heading>
                      <div className="whitespace-pre-line">
                        <p>{location.history}</p>
                      </div>
                    </>
                  )}

                  {location.inhabitants && (
                    <>
                      <Heading variant="h4" as="h5" className="mt-4 mb-1">Inhabitants</Heading>
                      <div className="whitespace-pre-line">
                        <p>{location.inhabitants}</p>
                      </div>
                    </>
                  )}
                </div>

                {location.organizations.map((org) => (
                  <div key={org.name} className="relative mt-16">
                    <ImageHeader topBorder variant="semicompact" {...headerImage(org.image)} title={org.name} imageAlt={org.name} />
                    <div className="max-w-3xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
                      <p>{org.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
