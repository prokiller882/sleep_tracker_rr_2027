/* ============================================================
   ТРЕКЕР СНА — СЕРВЕР (Google Apps Script · HTMLService)
   Многопользовательский режим: каждый пользователь пишет
   в СВОЮ таблицу в СВОЁМ Google Drive.

   ⚙️ Деплой веб-приложения (обязательно):
     1. «Выполнять от: пользователя, открывшего веб-приложение»
     2. «Доступ: все, у кого есть Google-аккаунт»

   🔐 Требуемые скоупы (указать в appsscript.json):
       https://www.googleapis.com/auth/spreadsheets
       https://www.googleapis.com/auth/drive.file
   ============================================================ */

const SHEET_NAME = 'Записи';
const HEADERS = ['ID', 'Bed', 'Wake', 'Quality', 'Note'];
const MAX_NOTE = 500;

/* ---------- Веб-интерфейс ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Трекер сна')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Подключение CSS/JS внутрь Index.html: <?!= include('Css'); ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ---------- Текущий пользователь ---------- */

function getUserEmail() {
  return Session.getActiveUser().getEmail() || '';
}

/* ---------- Личная таблица пользователя ---------- */

function getSheet_() {
  const props = PropertiesService.getUserProperties(); // привязка к конкретному пользователю
  const id = props.getProperty('SHEET_ID');

  if (id) {
    try {
      return ensureSheet_(SpreadsheetApp.openById(id));
    } catch (e) {
      // Таблица удалена или недоступна — создаём новую.
      props.deleteProperty('SHEET_ID');
    }
  }

  const ss = SpreadsheetApp.create('Трекер сна');
  const sheet = ss.getSheets()[0];
  sheet.setName(SHEET_NAME);
  writeHeaders_(sheet);
  props.setProperty('SHEET_ID', ss.getId());
  return sheet;
}

function ensureSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (String(sheet.getRange(1, 1).getValue()) !== HEADERS[0]) {
    writeHeaders_(sheet);
  }
  return sheet;
}

function writeHeaders_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

/* ---------- Данные (вызываются с клиента через google.script.run) ---------- */

function getEntries() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];

  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return rows
    .filter((r) => r[1] && r[2])
    .map((r) => ({
      id: String(r[0]),
      bed: String(r[1]),
      wake: String(r[2]),
      quality: Number(r[3]) || 0,
      note: String(r[4] || '')
    }));
}

function addEntry(bed, wake, quality, note) {
  const bedIso = validDate_(bed);
  const wakeIso = validDate_(wake);
  const q = validQuality_(quality);
  const text = noteText_(note);

  const id = Utilities.getUuid();
  appendEntry_(getSheet_(), id, bedIso, wakeIso, q, text);

  return { id, bed: bedIso, wake: wakeIso, quality: q, note: text };
}

function deleteEntry(id) {
  const key = String(id == null ? '' : id).trim();
  if (!key) throw new Error('Нет id записи');

  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { result: 'success' };

  const ids = sheet.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0]));
  const idx = ids.indexOf(key);
  if (idx !== -1) sheet.deleteRow(idx + 2);

  return { result: 'success' };
}

/* ---------- Валидация ---------- */

function validDate_(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error('Некорректная дата');
  return d.toISOString();
}

function validQuality_(v) {
  const q = Number(v);
  if (isNaN(q) || q < 1 || q > 5 || Math.floor(q) !== q) {
    throw new Error('Оценка должна быть от 1 до 5');
  }
  return q;
}

function noteText_(v) {
  return String(v == null ? '' : v).slice(0, MAX_NOTE);
}

// Записывает строку и принудительно делает ячейку заметки обычным текстом,
// чтобы значения вида "- ...", "= ...", "+ ...", "@ ..." не стали формулами.
function appendEntry_(sheet, id, bed, wake, quality, note) {
  sheet.appendRow([id, bed, wake, quality, '']);
  const cell = sheet.getRange(sheet.getLastRow(), 5);
  cell.setNumberFormat('@');
  cell.setValue(note);
}
