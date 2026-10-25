import { LinkDesktop } from "./link-desktop"

export const metadata = { title: "Link the desktop app | D20 Adventures" }

export default async function LinkDesktopPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  return <LinkDesktop initialCode={typeof code === "string" ? code : ""} />
}
