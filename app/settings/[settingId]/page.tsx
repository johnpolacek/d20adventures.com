import { readJsonFromS3 } from "@/lib/s3-utils"
import { Setting } from "@/types/setting"
import ImageHeader from "@/components/ui/image-header"
import { Button } from "@/components/ui/button"
import { isDev } from "@/lib/auth-utils"
import Link from "next/link"
import { getImageUrl } from "@/lib/utils"

export default async function SettingHome(props: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await props.params

  const key = `settings/${settingId}/setting-data.json`

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(key)) as Setting
  } catch (err) {
    console.error("Error fetching JSON from S3:", err)
    return <div>Error loading setting data.</div>
  }

  const canEdit = isDev()

  console.log("[SettingHome] canEdit:", canEdit)

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <ImageHeader variant="semicompact" imageUrl={getImageUrl(setting.image)} title={setting.name} imageAlt={setting.name} />
        {canEdit && (
          <Link className="fixed top-[90vh] right-8 z-10" href={`/settings/${settingId}/edit`}>
            <Button className="text-sm bg-primary-600 hover:bg-primary-700">Edit</Button>
          </Link>
        )}
        <div className="max-w-3xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
          <div className="flex justify-center mb-8">
            <Link href={`/settings/${settingId}/play`}>
              <Button asChild variant="epic">
                Go to Adventures
              </Button>
            </Link>
          </div>
          <p>{setting.description}</p>
          {setting.technology && (
            <>
              <h4 className="text-xl font-display font-bold text-primary-200 mt-6 mb-1">Technology</h4>
              <p>{setting.technology}</p>
            </>
          )}
          {setting.magic && (
            <>
              <h4 className="text-xl font-display font-bold text-primary-200 mt-6 mb-1">Magic</h4>
              <p>{setting.magic}</p>
            </>
          )}
        </div>
        <div id="locations" className="pb-16">
          {setting.locations.map((location, index) => (
            <div key={index} className="w-full relative">
              <div className="flex flex-col pt-16">
                <h4 className="text-xl font-display font-bold text-primary-200">{location.name}</h4>

                <ImageHeader topBorder variant="semicompact" imageUrl={getImageUrl(location.image)} title={location.name} imageAlt={location.name} />

                <div className="max-w-3xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
                  <div className="whitespace-pre-line">
                    <p>{location.description}</p>
                  </div>

                  {location.history && (
                    <>
                      <h5 className="text-lg font-display font-bold text-primary-200 mt-4 mb-1">History</h5>
                      <div className="whitespace-pre-line">
                        <p>{location.history}</p>
                      </div>
                    </>
                  )}

                  {location.inhabitants && (
                    <>
                      <h5 className="text-lg font-display font-bold text-primary-200 mt-4 mb-1">Inhabitants</h5>
                      <div className="whitespace-pre-line">
                        <p>{location.inhabitants}</p>
                      </div>
                    </>
                  )}
                </div>

                {location.organizations.map((org) => (
                  <div key={org.name} className="relative mt-16">
                    <ImageHeader topBorder variant="semicompact" imageUrl={getImageUrl(org.image)} title={org.name} imageAlt={org.name} />
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
