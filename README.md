# Amaranth Tweaks

A cross-browser (Firefox + Chromium) extension that enlarges the cramped detail popups on the Okestro groupware (`gw.okestro.com`) so you don't have to scroll to read them.

## What it does

When the `카드사용내역상세` (card usage detail) popup opens, a content script measures how much of the receipt is hidden and grows the popup just enough to show all of it — centered, and capped at 90% of the window height (only then does it fall back to an internal scroll). It touches only the popup's height, so drag-to-move still works, and it does nothing if the popup already fits or if the site's markup changes.

## Requirements

[Bun](https://bun.sh), which also runs the TypeScript build. Firefox's `web-ext` tooling is pulled in as a dev dependency.

## Project layout

- `src/content.ts` — the content script (TypeScript).
- `src/manifest.json` — the shared Manifest V3 source; the Firefox build keeps `browser_specific_settings`, the Chromium build drops it.
- `build.ts` — the Bun build script; emits `build/firefox` and `build/chromium`.
- `tsconfig.json` — TypeScript config (type-checking only; Bun does the bundling).

## Build

```sh
bun install
bun run build
```

This produces two ready-to-load extensions: `build/firefox` and `build/chromium`.

## Load it for testing

**Firefox** — open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on…*, and pick `build/firefox/manifest.json`. Or just run `bun run dev:firefox`.

**Chromium browsers** (Chrome, Edge, Brave, …) — open the extensions page (e.g. `chrome://extensions`), enable *Developer mode*, click *Load unpacked*, and pick the `build/chromium` folder. Or run `bun run dev:chromium`.

Loading into your normal profile reuses your existing logged-in session; `bun run dev:*` launches a fresh throwaway profile instead.

## Install permanently

**Firefox** — sign an unlisted build. Get API credentials at <https://addons.mozilla.org/developers/addon/api/key/>, then:

```sh
WEB_EXT_API_KEY=your-issuer WEB_EXT_API_SECRET=your-secret bun run sign
```

The signed `.xpi` lands in `dist/`; install it via `about:addons` → gear → *Install Add-on From File…*.

**Chromium browsers** — a *Load unpacked* extension already persists across restarts, so pointing at `build/chromium` is enough for personal use. To distribute, run `bun run package` and upload the `dist/` zip to the Chrome Web Store or Edge Add-ons.

## Adding more popups

Every popup with the same layout is one line away: add its exact `<h1>` title to `TARGET_TITLES` at the top of `src/content.ts`, then rebuild.

```ts
const TARGET_TITLES = ['카드사용내역상세', '현금영수증상세'];
```

## Commands

- `bun run build` — build both browser targets into `build/`.
- `bun run typecheck` — type-check with `tsc`.
- `bun run lint` — build, then validate with `web-ext lint`.
- `bun run dev:firefox` / `bun run dev:chromium` — build and launch the browser with the extension loaded.
- `bun run package` — build unsigned zips for both targets into `dist/`.
- `bun run sign` — build and sign the Firefox `.xpi` into `dist/`.

## How it works

The popup is a WEHAGO/Orbit `OBTDialog` whose size is hard-coded in inline styles (`width: 444px; height: 620px`), with the receipt living inside a fixed-height custom scrollbar — so tall receipts get clipped. The script finds the sized box (the parent of `.dialog_content`), reads how far its inner scroll area overflows, and grows the box and its `.dialog_data` column by that amount. The new height is written with `!important` and re-applied by a small `MutationObserver` if the framework ever resets it, while position is left untouched so dragging keeps working.

## Troubleshooting

- Open the devtools console and look for `[amaranth-tweaks]` messages to confirm the script loaded and whether it resized anything.
- If nothing resizes, the site's markup may have changed; check the selectors in `src/content.ts` (`data-orbit-component="OBTDialog"`, `.dialog_content`, `.dialog_data`, and `OBTScrollbar_root`).
