// Repo-local set and staging specs, keyed `<settingId>/<id>`. Later these come from the setting's wiki source in S3.
export const SETS: Record<string, () => Promise<unknown>> = {
  "realm-of-myr/kordavos-south-gate": () => import("./realm-of-myr/kordavos-south-gate.json").then((m) => m.default),
  "realm-of-myr/kordavos-harvest-square": () => import("./realm-of-myr/kordavos-harvest-square.json").then((m) => m.default),
  "realm-of-myr/valkarr-forest-trail": () => import("./realm-of-myr/valkarr-forest-trail.json").then((m) => m.default),
  "realm-of-myr/old-standing-stones": () => import("./realm-of-myr/old-standing-stones.json").then((m) => m.default),
  "realm-of-myr/thalberns-forest-home": () => import("./realm-of-myr/thalberns-forest-home.json").then((m) => m.default),
}
export const STAGINGS: Record<string, () => Promise<unknown>> = {
  "march-of-davos/the-gates-of-kordavos": () => import("../stagings/march-of-davos/the-gates-of-kordavos.json").then((m) => m.default),
  "march-of-davos/the-harvest-festival": () => import("../stagings/march-of-davos/the-harvest-festival.json").then((m) => m.default),
  "the-midnight-summons/broken-silence": () => import("../stagings/the-midnight-summons/broken-silence.json").then((m) => m.default),
  "the-midnight-summons/owlbear-confrontation": () => import("../stagings/the-midnight-summons/owlbear-confrontation.json").then((m) => m.default),
  "the-midnight-summons/timely-rescue": () => import("../stagings/the-midnight-summons/timely-rescue.json").then((m) => m.default),
  "the-midnight-summons/back-home": () => import("../stagings/the-midnight-summons/back-home.json").then((m) => m.default),
  "the-midnight-summons/preparing-for-the-city": () => import("../stagings/the-midnight-summons/preparing-for-the-city.json").then((m) => m.default),
  "the-midnight-summons/the-missing-relics": () => import("../stagings/the-midnight-summons/the-missing-relics.json").then((m) => m.default),
  "the-midnight-summons/meeting-at-the-stones": () => import("../stagings/the-midnight-summons/meeting-at-the-stones.json").then((m) => m.default),
}
