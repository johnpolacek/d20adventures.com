export const IMAGE_HOST = "https://d1dkwd3w4hheqw.cloudfront.net";

export const siteConfig = {
  title: "D20 Adventures",
  description: "A new narrative-driven RPG platform that blends play-by-post gameplay and real-time updates facilitated by an AI Game Master.",
  shortDescription: "A new narrative-driven RPG platform that blends play-by-post gameplay and real-time updates facilitated by an AI Game Master.",
  url: "d20adventures-com.vercel.app",
  shareImage: "",
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