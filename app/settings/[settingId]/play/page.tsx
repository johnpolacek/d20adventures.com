import { textShadow } from "@/components/typography/styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ImageHeader from "@/components/ui/image-header";
import { isDev } from "@/lib/auth-utils";
import {
  listAndReadJsonFilesInS3Directory,
  readJsonFromS3,
} from "@/lib/s3-utils";
import { getImageUrl } from "@/lib/utils";
import type { AdventurePlan } from "@/types/adventure-plan";
import type { Setting } from "@/types/setting";
import Image from "next/image";
import Link from "next/link";

export default async function SettingAdventures(props: {
  params: Promise<{ settingId: string }>;
}) {
  const { settingId } = await props.params;

  const isQuickStart = settingId === "realm-of-myr";

  const key = `settings/${settingId}/setting-data.json`;

  let setting: Setting | null = null;
  try {
    setting = (await readJsonFromS3(key)) as Setting;
  } catch (err) {
    console.error("Error fetching JSON from S3:", err);
    return <div>Error loading setting data.</div>;
  }

  // Read all adventure plan JSON files (excluding setting-data.json)
  let adventures: AdventurePlan[] = [];
  let publishedAdventures: AdventurePlan[] = [];
  let draftAdventures: AdventurePlan[] = [];
  try {
    const adventureFiles = await listAndReadJsonFilesInS3Directory(
      `settings/${settingId}/`,
      ["setting-data.json"]
    );
    adventures = adventureFiles.map((file) => file.data as AdventurePlan);
    publishedAdventures = adventures.filter((a) => !a.draft);
    draftAdventures = adventures.filter((a) => !!a.draft);
  } catch (err) {
    console.error("Error fetching adventure files from S3:", err);
  }

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-[2s] relative z-10">
        <ImageHeader
          variant="semicompact"
          imageUrl={getImageUrl(setting.image)}
          title={setting.name}
          subtitle="Adventures"
          imageAlt={setting.name}
        />
        <div className="max-w-4xl xl:max-w-6xl mx-auto -mt-32 relative z-10 whitespace-pre-line">
          {isQuickStart ? (
            <div className="mb-8 text-center">
              <p className="text-center pt-4">
                Choose from short introductory adventures or dive right in with
                the full adventure.
              </p>
              <h4 className="inline-block font-bold bg-black/50 px-8 py-2 rounded text-lg text-amber-400/90 font-display mt-8 mb-4 text-center tracking-wider font-bold">
                Intro Adventures
              </h4>
              <div className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10 pb-8 auto-rows-fr">
                {[
                  publishedAdventures[0],
                  publishedAdventures[2],
                  publishedAdventures[3],
                ].map((adventure) => (
                  <Link
                    key={adventure.id}
                    href={`/settings/${settingId}/${adventure.id}/character-select`}
                    className="block h-full"
                  >
                    <Card className="w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                      <div className="pb-2 relative aspect-video w-full">
                        <div className="absolute top-1 right-3 z-10 flex gap-2 items-end">
                          {adventure.premadePlayerCharacters &&
                            adventure.premadePlayerCharacters.length > 0 && (
                              <span className="bg-amber-500/90 text-black text-xxs font-mono px-2 py-1 rounded font-semibold">
                                Premade Characters
                              </span>
                            )}
                          <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">
                            {adventure.party[0] === 1 &&
                            adventure.party[1] === 1
                              ? "Single Player"
                              : adventure.party[0] === 2 &&
                                  adventure.party[1] === 2
                                ? `${adventure.party[0]} Players`
                                : `${adventure.party[0]}-${adventure.party[1]} Players`}
                          </span>
                        </div>
                        <div
                          style={textShadow}
                          className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10"
                        >
                          {adventure.title}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                        <Image
                          src={getImageUrl(adventure.image)}
                          alt={adventure.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="relative z-10 flex-1 flex flex-col">
                          <div className="text-gray-300 text-base -mt-2 flex-1 line-clamp-4">
                            {adventure.teaser || adventure.overview}
                          </div>
                          <div className="mt-4 mb-6 w-full flex justify-center">
                            <Button
                              variant="epic"
                              size="sm"
                              className="text-sm pointer-events-none"
                            >
                              Play
                            </Button>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              {publishedAdventures[1] && (
                <>
                  <h4 className="inline-block text-xl font-bold bg-black/50 px-8 py-2 rounded text-sm text-amber-400/90 font-display my-4 text-center tracking-wider">
                    Full Adventure
                  </h4>
                  <Link
                    key={publishedAdventures[1].id}
                    href={`/settings/${settingId}/${publishedAdventures[1].id}/character-select`}
                    className="block h-full w-full mx-auto"
                  >
                    <Card className="w-full h-full bg-black/80 border-white/20 hover:scale-[1.01] hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                      <div className="pb-2 relative aspect-video md:aspect-[3/1] w-full">
                        <div className="absolute top-1 right-3 z-10 flex gap-2 flex-col items-end">
                          <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">
                            {publishedAdventures[1].party[0] === 1 &&
                            publishedAdventures[1].party[1] === 1
                              ? "Single Player"
                              : publishedAdventures[1].party[0] === 2 &&
                                  publishedAdventures[1].party[1] === 2
                                ? `${publishedAdventures[1].party[0]} Players`
                                : `${publishedAdventures[1].party[0]}-${publishedAdventures[1].party[1]} Players`}
                          </span>
                          {publishedAdventures[1].premadePlayerCharacters &&
                            publishedAdventures[1].premadePlayerCharacters
                              .length > 0 && (
                              <span className="bg-amber-500/90 text-black text-xxs font-mono px-2 py-1 rounded font-semibold">
                                Premade Characters
                              </span>
                            )}
                        </div>
                        <div
                          style={textShadow}
                          className="absolute bottom-2 left-0 right-0 -mt-16 w-full text-center font-bold font-display text-3xl md:text-5xl text-amber-300 z-10"
                        >
                          {publishedAdventures[1].title}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                        <Image
                          src={getImageUrl(publishedAdventures[1].image)}
                          alt={publishedAdventures[1].title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="relative z-10 flex-1 flex flex-col">
                          <div className="text-gray-300 text-base -mt-2 flex-1">
                            {publishedAdventures[1].teaser ||
                              publishedAdventures[1].overview}
                          </div>
                          <div className="mt-4 mb-6 w-full flex justify-center">
                            <Button
                              variant="epic"
                              size="sm"
                              className="text-sm pointer-events-none"
                            >
                              Play
                            </Button>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                      </CardContent>
                    </Card>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10 py-8 auto-rows-fr">
              {publishedAdventures.map((adventure) => (
                <Link
                  key={adventure.id}
                  href={`/settings/${settingId}/${adventure.id}/character-select`}
                  className="block h-full"
                >
                  <Card className="w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-[6px] ring-black hover:ring-8 hover:ring-primary-500 transition-colors cursor-pointer transition-all duration-500 ease-in-out p-0 overflow-hidden flex flex-col">
                    <div className="pb-2 relative aspect-video w-full">
                      <div className="absolute top-1 right-3 z-10 flex gap-2 flex-col items-end">
                        <span className="bg-black/80 text-white text-xxs font-mono px-2 py-1 rounded">
                          {adventure.party[0] === 1 && adventure.party[1] === 1
                            ? "Single Player"
                            : adventure.party[0] === 2 &&
                                adventure.party[1] === 2
                              ? `${adventure.party[0]} Players`
                              : `${adventure.party[0]}-${adventure.party[1]} Players`}
                        </span>
                        {adventure.premadePlayerCharacters &&
                          adventure.premadePlayerCharacters.length > 0 && (
                            <span className="bg-amber-500/90 text-black text-xxs font-mono px-2 py-1 rounded font-semibold">
                              Premade Characters
                            </span>
                          )}
                      </div>
                      <div
                        style={textShadow}
                        className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-xl z-10"
                      >
                        {adventure.title}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                      <Image
                        src={getImageUrl(adventure.image)}
                        alt={adventure.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="relative z-10 flex-1 flex flex-col">
                        <div className="text-gray-300 text-base -mt-2 flex-1">
                          {adventure.teaser || adventure.overview}
                        </div>
                        <div className="mt-4 mb-6 w-full flex justify-center">
                          <Button
                            variant="epic"
                            size="sm"
                            className="text-sm pointer-events-none"
                          >
                            Play
                          </Button>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <div className="text-center">
            <h4 className="inline-block text-xl font-bold bg-black/50 px-8 py-2 rounded text-base text-amber-400/90 font-display my-4 text-center tracking-wider">
              Setting Overview
            </h4>
          </div>
          <div className="px-8 max-w-4xl mx-auto">
            <p>{setting.description}</p>
          </div>
          <div className="flex justify-center pt-8 pb-24">
            <Link href={`/settings/${settingId}`}>
              <Button variant="epic" asChild>
                Go To Setting
              </Button>
            </Link>
          </div>

          {/* Draft Adventures Section */}
          {isDev() && draftAdventures.length > 0 && (
            <div className="pb-12 mb-12 px-4 max-w-4xl mx-auto">
              <h3 className="text-lg font-display text-amber-400/90 mb-4 -mt-8 text-center">
                Draft Adventures
              </h3>
              <div className="rounded-lg overflow-hidden flex flex-col divide-y divide-white/10 bg-black/60">
                {draftAdventures.map((adventure) => (
                  <Link
                    key={adventure.id}
                    href={`/settings/${settingId}/${adventure.id}/edit`}
                    className="block group"
                  >
                    <div className="flex items-center px-6 py-4 hover:bg-white/10 border-t border-white/20 transition-all duration-500 ease-in-out cursor-pointer">
                      <div className="flex-1 font-display text-lg text-amber-300 group-hover:text-amber-200">
                        {adventure.title}
                      </div>
                      <div className="w-40 text-sm">
                        {adventure.party[0] === 1 && adventure.party[1] === 1
                          ? "Single Player"
                          : adventure.party[0] === 2 && adventure.party[1] === 2
                            ? `${adventure.party[0]} Players`
                            : `${adventure.party[0]}-${adventure.party[1]} Players`}
                      </div>
                      <div className="flex-1 max-w-md truncate text-gray-300 text-xs line-clamp-2 ml-4">
                        {adventure.teaser || adventure.overview}
                      </div>
                      <div className="text-right ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-sm opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none"
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
