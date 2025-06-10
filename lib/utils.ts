import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { IMAGE_HOST } from "@/lib/config"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Constructs a proper image URL, avoiding doubling up the IMAGE_HOST
 * @param imagePath - The image path (can be relative or absolute URL)
 * @returns A properly constructed image URL
 */
export function getImageUrl(imagePath: string): string {
  if (!imagePath) return imagePath

  // If it's already a full URL (starts with http:// or https://), return as-is
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath
  }

  // If it's already prefixed with our IMAGE_HOST, return as-is
  if (imagePath.startsWith(IMAGE_HOST)) {
    return imagePath
  }

  // Remove leading slash from relative path and construct full URL
  const cleanPath = imagePath.replace(/^\/+/, "")
  return `${IMAGE_HOST}/${cleanPath}`
}

/**
 * Strips the IMAGE_HOST from a URL to get the relative path for storage
 * @param url - The full URL or relative path
 * @returns The relative path without IMAGE_HOST
 */
export function stripImageHost(url: string): string {
  if (!url) return url

  // Remove the IMAGE_HOST domain if present
  if (url.startsWith(IMAGE_HOST)) {
    return url.replace(IMAGE_HOST, "").replace(/^\/+/, "") // Remove leading slashes
  }

  // Also handle the case where the URL might be from the CloudFront domain directly
  // Extract domain from IMAGE_HOST to handle both with and without protocols
  const imageHostDomain = IMAGE_HOST.replace(/^https?:\/\//, "")
  if (url.startsWith(`https://${imageHostDomain}/`)) {
    return url.replace(`https://${imageHostDomain}/`, "")
  }
  if (url.startsWith(`http://${imageHostDomain}/`)) {
    return url.replace(`http://${imageHostDomain}/`, "")
  }

  // If it's already a relative path, return as-is
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url
  }

  return url
}

/**
 * Format a date string to a more readable format
 * @param dateString ISO date string
 * @returns Formatted date string (e.g., "Jan 1, 2023")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)
}

export function hasBooleanProp(obj: unknown, prop: string): obj is { [key: string]: boolean } {
  return !!obj && typeof obj === "object" && prop in obj && typeof (obj as { [key: string]: unknown })[prop] === "boolean"
}
export function hasNumberProp(obj: unknown, prop: string): obj is { [key: string]: number } {
  return !!obj && typeof obj === "object" && prop in obj && typeof (obj as { [key: string]: unknown })[prop] === "number"
}
export function isRollRequired(obj: unknown): obj is { rollType: string; difficulty?: number; modifier?: number } {
  return !!obj && typeof obj === "object" && "rollType" in obj
}

/**
 * Map a Convex turn document to the frontend Turn type
 * @param raw Convex turn document
 * @returns Turn or null
 */
export function mapConvexTurnToTurn(raw: unknown): import("@/types/adventure").Turn | null {
  if (!raw || typeof raw !== "object" || !("encounterId" in raw) || !("title" in raw)) return null;
  const t = raw as { _id: string; encounterId: string; title: string; narrative: string; characters: import("@/types/adventure").TurnCharacter[]; adventureId: string; isFinalEncounter?: boolean };
  return {
    id: t._id,
    encounterId: t.encounterId,
    title: t.title,
    narrative: t.narrative,
    characters: t.characters,
    adventureId: t.adventureId,
    isFinalEncounter: t.isFinalEncounter,
  };
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export function formatNumberToK(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return Math.round(num).toString();
}

/**
 * Converts a slugified string back to a readable title
 * @param slug - The slugified string (e.g., "dragon-of-icespire-peak")
 * @returns A readable title with proper capitalization (e.g., "Dragon of Icespire Peak")
 */
export function reverseSlugify(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}
