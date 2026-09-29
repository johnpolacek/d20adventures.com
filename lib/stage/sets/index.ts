// Repo-local set and staging specs, keyed `<settingId>/<id>`. Later these come from the setting's wiki source in S3.
export const SETS: Record<string, () => Promise<unknown>> = {
  "realm-of-myr/kordavos-south-gate": () => import("./realm-of-myr/kordavos-south-gate.json").then((m) => m.default),
}
export const STAGINGS: Record<string, () => Promise<unknown>> = {
  "march-of-davos/the-gates-of-kordavos": () => import("../stagings/march-of-davos/the-gates-of-kordavos.json").then((m) => m.default),
}
