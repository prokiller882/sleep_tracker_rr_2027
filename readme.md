# Трекер сна

Устанавливаемое PWA-приложение для отслеживания сна и самочувствия. Фронтенд — статичный сайт, данные хранятся в Google Таблице через Apps Script. Каждый пользователь пишет в свою таблицу в своём Google Drive.

## Структура

- Корень — статичный PWA-фронтенд: `index.html`, `css/main.css`, `js/script.js`, `manifest.webmanifest`, `sw.js`, `icons/`.
- `apps-script/` — бэкенд: `Code.gs` (JSON API), `appsscript.json` (скоупы/деплой), `Migrate.gs` (одноразовый перенос старых данных).

## Настройка и запуск

### 1. Бэкенд (Apps Script)

1. На https://script.google.com создайте проект, вставьте `apps-script/Code.gs`.
2. Настройки → включите манифест → вставьте `apps-script/appsscript.json`.
3. Развёртывание → Новое развёртывание → Веб-приложение:
   - Выполнять от: **пользователя, открывшего веб-приложение**
   - Доступ: **все, у кого есть Google-аккаунт**
4. Скопируйте URL `/exec` — это ваш `SCRIPT_URL`.

### 2. Google OAuth client ID (для входа)

1. Откройте https://console.cloud.google.com → создайте/выберите проект.
2. **APIs & Services → OAuth consent screen**: тип «External», заполните название. В разделе «Scopes» добавьте `.../auth/spreadsheets`, `.../auth/drive.file`, `.../auth/userinfo.email`.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. В «Authorized JavaScript origins» добавьте адрес, где будет хоститься фронтенд (например `https://<ваш-логин>.github.io`).
5. Скопируйте `Client ID` — это `CLIENT_ID`.

### 3. Фронтенд

1. В `js/script.js` подставьте `SCRIPT_URL` и `CLIENT_ID`.
2. Разместите файлы корня на статичном хостинге (например GitHub Pages) — нужен HTTPS.
3. Откройте сайт, нажмите «Войти через Google». Приложение можно установить из браузера (иконка «Установить»).

## Перенос старых данных

Запустите `migrateLegacy()` из редактора Apps Script (инструкция — в комментариях `Migrate.gs`), проверьте данные, затем удалите `Migrate.gs`.
