# AGENTS.md

Sleep tracker. Frontend and backend live in one Google Apps Script web app (HTMLService): each user gets their own Google Sheet, nobody can touch anyone else's data.

## Language

Always answer in Russian.

## Layout

- `apps-script/` — the deployed app (source of truth):
  - `Code.gs` — backend. `doGet`/`include` serve the UI; `getEntries`/`addEntry`/`deleteEntry` are called from the client via `google.script.run`. Each user's data lives in a spreadsheet created in their own Drive, ID stored in `PropertiesService.getUserProperties()`.
  - `Index.html` — markup (HtmlService), includes Css/Js via `include`.
  - `Css.html`, `Js.html` — styles and frontend logic, wrapped in `<style>`/`<script>`. `Js.html` talks to the backend with `google.script.run` (NOT `fetch`).
  - `appsscript.json` — manifest: scopes, `executeAs: USER_ACCESSING`, `access: ANYONE`.
  - `Migrate.gs` — one-time import of old data; delete this file from the project after use.
- `index.html`, `css/`, `js/` — the OLD single-user static version (used `fetch` + hardcoded `SECRET_KEY`). No longer deployed; kept for reference.
- `readme.md` — setup/deploy notes.

## No tooling

No build, lint, test, or CI. Files in `apps-script/` are edited in the Apps Script editor (script.google.com) and copied there. `apps-script/Index.html` cannot be previewed standalone (it needs `google.script.run`); use the deployed `/exec` URL.

## Deployment (easy to get wrong)

- Deploy as **"Execute as: User accessing the web app"** + **"Who has access: Anyone with Google account"**. If deployed as "Me", everyone writes to one shared sheet again.
- Scopes (`appsscript.json`): `spreadsheets`, `drive.file`, `userinfo.email`.
- After editing files, create a **new deployment version**; the `/exec` URL stays the same.
- Each new user sees a Google consent screen on first load — normal.

## Data model

Entry: `{ id, bed, wake, quality, note }` (`bed`/`wake` are ISO strings, `quality` 1–5). Stored in a sheet `Записи` with header `ID | Bed | Wake | Quality | Note`. Notes are written as plain text (cell format `@`) so a note like `- плохо спал` isn't parsed as a formula.

## Security

No shared secret. Isolation is per-user via `PropertiesService.getUserProperties()` plus the app running as the accessing user. The old `SECRET_KEY` flow is gone from the frontend; it survives only in the temporary `Migrate.gs`.
