# Stageview

Rules for encounter stagings, sets, the camera and how the stage's files are served.

- Where everyone starts is the encounter's 3D staging (`src/stagings`). An NPC whose intro reads as a close ambush is staged close to the party. Run `pnpm stage:plans` after changing a set or a staging. `pnpm stage:plans:check` fails on a stale plan. The site's `components/floorplan` draws from the same plans.
- An encounter shows in the desktop app and hosted play once it has a scene in `src/stagings/<adventure>/scenes.json`: its set, staging, place name, the GM's opening line and the party's spots. A new adventure also needs its line in `SCENE_FILES`, and in `FIGURES` and `CARD_PORTRAITS` if it has them (`src/sets/index.ts`). The app reads scenes from its adventure packages (`plans/adventure-packages.md`).
- The camera views the cast only from where nothing solid hides them (`src/spec/view.ts`, `src/spec/sight.ts`). `pnpm stage:check` prints a `WARN hidden` for each view no camera clears. Leaves count as see-through there, so check a warning at `/dev/stage` before moving anyone.
- The director (`src/director.ts`) shoots each moment that `apps/desktop/src/moments.ts` reads from the story. `/dev/stage` has a button for each take. `pnpm stage:director` checks them.
- Stage files load through `served()` (`src/served.ts`), and a new loader must too. The live site fetches them from the bucket, which needs the CloudFront policy “CORS-With-Preflight”, not “SimpleCORS”. An empty `NEXT_PUBLIC_ASSET_HOST` falls back to the relay in `next.config.ts`.
- A set built or rebuilt for its finished look goes through the dream loop before it is done: `.agents/skills/stage-dream-loop/SKILL.md`. A blockout, a change to the rules alone and a painted set skip it.
