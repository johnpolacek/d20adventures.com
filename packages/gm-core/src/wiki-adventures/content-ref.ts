export type ContentRef =
  | {
      source: "published"
      settingId: string
      planId: string
      versionId: string
      contentHash: string
    }
  | {
      source: "latest"
      settingId: string
      planId: string
    }
  | {
      source: "preview"
      settingId: string
      planId: string
      draftId: string
      contentHash?: string
    }
