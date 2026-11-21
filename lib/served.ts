// Where the stage's art and the site's background textures are fetched from. A production build names the bucket's
// own address, so a visitor's browser fetches them from CloudFront and the deploy's relay carries none. Development
// keeps the workspace's own files. NEXT_PUBLIC_ASSET_HOST names another host, or none when set empty.
//
// The host is named when this file loads, and a page is written on the server with the addresses the browser then
// hydrates with, so the root layout and the providers both import it.

import { served, serveFrom } from "@d20/stage/served"
import { IMAGE_HOST } from "./config"

const host = process.env.NEXT_PUBLIC_ASSET_HOST ?? (process.env.NODE_ENV === "production" ? IMAGE_HOST : "")
if (host) serveFrom(host)

export { served }

// The paper and stone textures, as CSS reads them. components/theme.css falls back to the app's own files.
const TEXTURES = { "--tex-buried": "buried.png", "--tex-black-paper": "black-paper.png", "--tex-paper": "paper-texture.png" }
export const textures = Object.fromEntries(Object.entries(TEXTURES).map(([name, file]) => [name, `url("${served(`/images/app/backgrounds/${file}`)}")`]))
