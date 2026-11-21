export const IMAGE_HOST = "https://d1dkwd3w4hheqw.cloudfront.net"

/** The live site, for links that must be whole: the sitemap, canonical links and share cards. */
export const SITE_URL = "https://d20adventures.com"

export const siteConfig = {
  title: "D20 Adventures",
  description: "An open source platform for building and playing 5e fantasy adventures with an AI Game Master, solo or multiplayer.",
  shortDescription: "An open source platform for building and playing 5e fantasy adventures with an AI Game Master, solo or multiplayer.",
  url: "d20adventures.com",
  shareImage: "https://d20adventures.com/images/screenshot.png",
  x: "",
  github: "",
  logo: "",
  imageHost: IMAGE_HOST,
} as const

export type SiteConfig = {
  title: string
  description: string
  shortDescription: string
  url: string
  shareImage: string
  x: string
  github: string
  logo: string
  imageHost: string
}
