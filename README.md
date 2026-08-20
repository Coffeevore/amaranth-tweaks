# Amaranth Tweaks

A cross-browser (Firefox + Chromium) extension with a few quality-of-life tweaks for the Okestro groupware (`gw.okestro.com`).

## What it does

Three independent tweaks, all scoped to `gw.okestro.com` and doing nothing anywhere else:

- **Bigger detail popups.** When a cramped detail popup opens (such as the `카드사용내역상세` card-usage receipt), a content script measures how much of the content is hidden and grows the popup just enough to show all of it — centered, and capped at 90% of the window height (only then falling back to an internal scroll). It touches only the popup's height, so drag-to-move still works, and it does nothing if the popup already fits or the markup changes.
- **Check-in time badge.** Fetches today's check-in time from the groupware's own HR API and shows it next to your name in the header.
- **Persistent login.** Re-writes the groupware's session cookies with an expiry so they survive a browser restart, keeping you signed in for the remainder of the server session instead of dropping you back at the login screen.

## Requirements

[Bun](https://bun.sh), which also runs the TypeScript build. Firefox's `web-ext` tooling comes in as a dev dependency, used by `bun run sign` and `bun run lint`.

## Project layout

- `src/content.ts` — the entry point: the popup resizer, plus the wiring that starts the other two features.
- `src/attendance.ts` — the check-in badge; reads the time from the HR API using your active session and renders it via a CSS `::after` rule so the site's React tree never sees a foreign node.
- `src/persist-session.ts` — the session-cookie persistence.
- `src/manifest.json` — the shared Manifest V3 source; the Firefox build keeps `browser_specific_settings`, the Chromium build drops it.
- `build.ts` — the Bun build script; bundles `src/content.ts` and emits `build/firefox` and `build/chromium`.
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

Loading into your normal profile reuses your existing logged-in session; `bun run dev:*` launches a fresh throwaway profile instead. The check-in badge and persistent login only do anything while you are logged into `gw.okestro.com`.

## Install manually

**Firefox** — sign a build yourself. Get API credentials at <https://addons.mozilla.org/developers/addon/api/key/>, then:

```sh
WEB_EXT_API_KEY=your-issuer WEB_EXT_API_SECRET=your-secret bun run sign
```

The signed `.xpi` lands in `dist/`; install it via `about:addons` → gear → *Install Add-on From File…*.

**Chromium browsers** — a *Load unpacked* extension already persists across restarts, so pointing at `build/chromium` is enough for personal use.

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

**Popups.** The popup is a WEHAGO/Orbit `OBTDialog` whose size is hard-coded in inline styles (`width: 444px; height: 620px`), with the receipt living inside a fixed-height custom scrollbar — so tall receipts get clipped. The script finds the sized box (the parent of `.dialog_content`), reads how far its inner scroll area overflows, and grows the box and its `.dialog_data` column by that amount. The new height is written with `!important` and re-applied by a small `MutationObserver` if the framework ever resets it, while position is left untouched so dragging keeps working.

**Persistent login.** The groupware issues its auth cookies without an expiry, so the browser drops them on close even while the server session is still valid. The script re-writes the same cookies with an expiry pinned to the server's own session deadline, so a restart keeps you signed in for whatever remains of that window — and never longer.

## Troubleshooting

- Open the devtools console and look for `[amaranth-tweaks]` messages to confirm the script loaded and whether it resized anything.
- If nothing resizes, the site's markup may have changed; check the selectors in `src/content.ts` (`data-orbit-component="OBTDialog"`, `.dialog_content`, `.dialog_data`, and `OBTScrollbar_root`).
- If the check-in badge is missing, confirm you are logged in; the API rejects unsigned or unauthenticated requests, and the script fails quietly when it can't read a value.
