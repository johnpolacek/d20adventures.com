<!-- Generated from shared/desktop-webviews.md; run scripts/sync_initialization.py. -->

# Desktop webviews

Tauri, Electron, and Wails host the app's frontend in a desktop window. The frontend's router and its framework skill still own the lifecycle. This reference covers what the shell changes. Read the installed shell version and its docs before trusting these notes; Tauri 1 and 2 differ in config and URL schemes.

## Rendering engine

- Tauri and Wails use the OS webview: WebKit on macOS, WebView2 (Chromium) on Windows, WebKitGTK on Linux. Electron bundles Chromium everywhere.
- Test effects on every target engine. A Chromium-only check does not cover a Tauri build.
- WebKitGTK is often the weakest tier. Measure WebGL, `filter`, `backdrop-filter`, opacity on large layers, and clip-path tweens there, and lower budgets through the same capability query as [Devices and input](devices.md).
- WebKitGTK WebGL can fall onto a slow path silently, and its renderer string is not trustworthy. Give WebGL effects a non-WebGL fallback on Linux, or an in-app setting to turn them off.
- Blank windows and resize flicker on Linux, mostly with NVIDIA, are shell graphics issues. Tauri's Linux graphics guide owns the workarounds; do not patch them in motion code.
- Feature-detect rather than branch on the shell. Pass a budget hint from the shell to the frontend only when detection cannot see the difference.

## No server rendering

- Shell apps usually ship a static or SPA build, so there is no SSR, streaming, or hydration mismatch.
- Initial-state guards still apply: the first paint must not flash content that an intro will hide.
- Indexing and no-JavaScript fallbacks matter less. Recovery from stalled fonts, media, and timelines still applies.

## Windows and focus

- Hidden, minimized, or occluded windows can throttle or stop frame callbacks, like a background tab. Electron can opt out with `backgroundThrottling`; do not rely on it.
- Bound phase waits with timeouts and settle stalled phases, as in [Backgrounded pages](devices.md#backgrounded-pages).
- Window resizing is continuous and common. Debounce rebuilds of splits and pin measurements, and keep settled content still during the drag.
- Native zoom and maximize can resize the webview after the window animates, so layout jumps once. Treat it as one resize, not a motion bug.
- Each window is its own document. Shared motion state across windows goes through the shell's messaging, not GSAP.

## Drag regions and pointer input

- Custom title bars mark drag regions with `data-tauri-drag-region` in Tauri or `-webkit-app-region: drag` in Electron and Wails.
- A primary-button press in a drag region starts a window drag, so effects there never see the move. Keep Draggable, swipe, and magnetic effects out of drag regions.
- In recent Tauri 2 releases, links, buttons, form controls, and interactive ARIA roles block window drag unless marked. `data-tauri-drag-region="deep"` covers a subtree and `"false"` opts out. Electron and Wails use `-webkit-app-region: no-drag` instead.
- Custom cursors must hand back the native cursor over drag regions and window edges.

## Assets and WebGL

- The app origin differs by OS. Tauri 2 serves `tauri://localhost` on macOS and Linux, and `http://tauri.localhost` on Windows and Android, or `https://` with `useHttpsScheme`.
- Build local file URLs with `convertFileSrc`, never by hand. It returns `asset://localhost/…` on macOS and Linux and `http://asset.localhost/…` on Windows and Android.
- Local files also need an `app.security.assetProtocol` scope, and the asset origin in the CSP `img-src` and `media-src`.
- WebGL textures need CORS-clean sources. Prefer bundled images from the app's own origin. Test asset-protocol textures on every engine.
- Audio autoplay policy depends on the engine. Keep sound behind a user gesture.

## Desktop pacing

- Desktop apps reopen often, so long intros and preloaders wear thin. Prefer a short first-launch intro and quick returns.
- Navigation inside a tool should feel instant. Keep page curtains brief or drop them for frequent actions.
- Honor `prefers-reduced-motion` from the OS and any in-app setting, and confirm each engine reports the OS setting.

## Verify

- Run the build in every target shell and OS, not only the dev server in a browser.
- Linux with WebKitGTK: idle frame pacing holds, or budgets drop.
- Minimize and restore during intro: phases settle without replay.
- Drag-resize the window through breakpoints: no flashes, replays, or stale pins.
- Drag the window by its title bar: no motion effect captures the press.
- WebGL textures load from bundled assets on every engine.

Report shell builds separately from browser checks.
