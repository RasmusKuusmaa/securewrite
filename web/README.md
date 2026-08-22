# Private Writer — Web

Browser build of Private Writer, for writing privately on a machine where you
can't (or don't want to) install the desktop app — e.g. a work computer. Same
encryption (Argon2id + AES-256-GCM), same masked view, same recovery-key flow
as the desktop app, but running entirely client-side against IndexedDB instead
of a Rust backend and the filesystem.

**This is a separate vault from the desktop app.** A password set up here does
not unlock the desktop vault, and notes don't sync between them — everything
stays in this browser's local storage, on this device, encrypted at rest.

Read the in-app "Before you start writing" screen (or `src/components/ThreatModelIntro.tsx`)
before relying on this for anything sensitive — a browser tab has real gaps
the desktop app doesn't (no screen-capture exclusion, no taskbar hardening,
and it can't see or defend against corporate endpoint-monitoring software on
a managed work computer).

## Local development

```
npm install
npm run dev
```

## Building

```
npm run build
```

Output goes to `dist/` — a fully static site (HTML/CSS/JS + a WASM Argon2
worker chunk). No server-side component, no network calls at runtime.

## Deploying somewhere you can reach from a work browser

**Important:** don't just double-click `dist/index.html` and open it as a
`file://` URL — Chromium-based browsers don't reliably support IndexedDB on
`file://` origins, so the vault may silently fail to persist. Serve it over
http(s), even from `localhost`.

Options, roughly in order of convenience:

1. **itch.io (recommended, reuses the account/workflow from the desktop release)**
   - `npm run build`, then zip the contents of `dist/` (not the `dist/` folder
     itself — the zip's root should contain `index.html` directly)
   - On your itch.io project page, upload the zip and check **"This file will
     be played in the browser"** (unlike the desktop `.exe`/`.msi` uploads,
     which leave that unchecked)
   - Consider setting the project's visibility to **Restricted** with itch's
     own page password — that's a second gate in front of the app's own
     password prompt, at no extra cost
   - You get a stable URL you can open from any browser, including a locked-down
     work machine, as long as itch.io itself isn't blocked on that network

2. **Any other static host** (GitHub Pages, Cloudflare Pages, Netlify, etc.) —
   upload `dist/`'s contents. Same IndexedDB-needs-http(s) caveat applies.

3. **Run it yourself locally** — `npm run build && npx serve dist`, then bookmark
   `http://localhost:<port>`. Keeps everything on your own machine with no
   third party involved, but only works on machines where you can run Node.

## Notes for anyone extending this

- `src/lib/vaultService.ts`, `documentsService.ts`, `settingsService.ts` are
  ports of `../src-tauri/src/crypto.rs`, `documents.rs`, `settings.rs` — keep
  them in sync if the desktop vault format or logic changes, though the two
  vaults are independent and don't need to stay binary-compatible.
- `src/lib/invoke.ts` stands in for `@tauri-apps/api/core`'s `invoke()`, which
  is why the zustand stores in `src/store/` are near-identical copies of the
  desktop ones.
- Argon2id runs in `src/lib/argon2Worker.ts`, a dedicated Web Worker — moving
  it off the main thread was necessary, not optional; without it, every
  unlock attempt freezes the tab for several seconds.
