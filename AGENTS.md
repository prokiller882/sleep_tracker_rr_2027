# AGENTS.md

Installable sleep-tracker PWA. Frontend is a static site; data lives in Google Sheets via an Apps Script JSON API. Each user writes to their own spreadsheet in their own Google Drive.

## Language

Always answer in Russian.

## Architecture

- Static PWA frontend (root): `index.html`, `css/main.css`, `js/script.js`, `manifest.webmanifest`, `sw.js`, `icons/`.
- Apps Script backend (`apps-script/`): `Code.gs` (JSON API), `appsscript.json` (manifest/scopes), `Migrate.gs` (one-time import of old data — delete after use).

Flow: frontend obtains a Google OAuth **access token** (GIS `initTokenClient`), sends it as `Authorization: Bearer <token>` to `SCRIPT_URL` via `fetch` POST with JSON body `{ action: 'getEntries' | 'add' | 'delete', ... }`. Backend runs as the accessing user (`executeAs: USER_ACCESSING`), so `Session.getActiveUser()` + `PropertiesService.getUserProperties()` give per-user isolation; `getSheet_` creates each user's sheet in their own Drive.

## No tooling

No build/lint/test/CI. Edit files in place; preview by serving the folder statically (`python3 -m http.server`). The frontend won't load data until `CLIENT_ID` and `SCRIPT_URL` in `js/script.js` are set and the backend is deployed.

## Required config (easy to get wrong)

- `js/script.js`: set `CLIENT_ID` (GCP OAuth client) and `SCRIPT_URL` (Apps Script `/exec` URL). Scopes: `spreadsheets`, `drive.file`, `userinfo.email`.
- Backend deploy: **"Execute as: User accessing the web app"** + **"Anyone with Google account"**. As "Me", everyone shares one sheet again.
- GCP: OAuth client of type "Web application", with the PWA origin (e.g. GitHub Pages) in "Authorized JavaScript origins".
- After editing `Code.gs`, create a new deployment version.

## Data model

Entry: `{ id, bed, wake, quality, note }` (`bed`/`wake` ISO strings, `quality` 1–5). Stored in sheet `Записи` (header `ID | Bed | Wake | Quality | Note`). Notes written as plain text (cell format `@`) so a note like `- плохо спал` isn't parsed as a formula.

## Security

No shared secret. Isolation is per-user (script runs as the accessing user). OAuth token never stored; re-auth on reload. `sw.js` caches only same-origin GET shell assets, never API POSTs.
