const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/

export function assertSafeSegment(segment: string, name: string): string {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(`${name} must be a lowercase slug, got "${segment}"`)
  }
  return segment
}

export function adventureSourcePrefix(settingId: string, planId: string): string {
  return `content/settings/${assertSafeSegment(settingId, "settingId")}/adventures/${assertSafeSegment(planId, "planId")}`
}

export function activeDraftPrefix(settingId: string, planId: string): string {
  return `${adventureSourcePrefix(settingId, planId)}/draft`
}

export function previewPrefix(settingId: string, planId: string, draftId: string): string {
  return `preview/settings/${assertSafeSegment(settingId, "settingId")}/adventures/${assertSafeSegment(planId, "planId")}/drafts/${assertSafeSegment(draftId, "draftId")}`
}

export function publishedVersionPrefix(settingId: string, planId: string, versionId: string): string {
  if (!/^[0-9TZ-]+-[a-f0-9]{8,64}$/.test(versionId)) {
    throw new Error(`versionId must be timestamp-hash shaped, got "${versionId}"`)
  }
  return `published/settings/${assertSafeSegment(settingId, "settingId")}/adventures/${assertSafeSegment(planId, "planId")}/${versionId}`
}

export function latestPointerKey(settingId: string, planId: string): string {
  return `published/settings/${assertSafeSegment(settingId, "settingId")}/adventures/${assertSafeSegment(planId, "planId")}/latest.json`
}

export function isSafeSourcePath(path: string): boolean {
  return !path.startsWith("/") && !path.includes("..") && (path.startsWith("content/") || path.startsWith("preview/") || path.startsWith("published/"))
}

export function isAllowedS3Url(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && allowedHosts.includes(parsed.host)
  } catch {
    return false
  }
}
