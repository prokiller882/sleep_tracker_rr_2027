/* ============================================================
   МИГРАЦИЯ СТАРЫХ ДАННЫХ — ЗАПУСТИТЬ ОДИН РАЗ ИЗ РЕДАКТОРА,
   ПОСЛЕ УСПЕШНОГО ПЕРЕНОСА УДАЛИТЬ ЭТОТ ФАЙЛ ИЗ ПРОЕКТА.

   Как работает:
   - Забирает все записи через старый GET-эндпоинт
     (старое приложение должно быть ещё развёрнуто/живо).
   - Пишет их в личную таблицу владельца (того, кто запускает
     скрипт в редакторе), не создавая дублей по id.
   ============================================================ */

const LEGACY_URL = 'https://script.google.com/macros/s/AKfycbxV4p7X2WS2OpcFcsqvi1bRacMgcy2PIbVpmw2A3GEKk9vbg2OVaFQBfYICgvtPL1s2/exec';
const LEGACY_KEY = 'MY_SUPER_SECRET_123stanislo322';

function migrateLegacy() {
  const url = `${LEGACY_URL}?key=${encodeURIComponent(LEGACY_KEY)}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('Старое приложение вернуло HTTP ' + code + '. Проверьте, что старый деплой ещё активен.');
  }

  const data = JSON.parse(res.getContentText());
  if (data.result !== 'success') {
    throw new Error('Ошибка экспорта со старого сервера: ' + (data.error || 'неизвестно'));
  }

  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (!entries.length) {
    Logger.log('В старом приложении нет записей — миграция не требуется.');
    return { total: 0, imported: 0, skipped: 0 };
  }

  const sheet = getSheet_();
  const last = sheet.getLastRow();
  const existing = new Set(
    last >= 2 ? sheet.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : []
  );

  let imported = 0;
  let skipped = 0;

  entries.forEach((e) => {
    try {
      const id = String(e.id || Utilities.getUuid());
      const bed = validDate_(e.bed);
      const wake = validDate_(e.wake);
      const quality = Math.min(5, Math.max(0, Number(e.quality) || 0));
      const note = noteText_(e.note);

      if (existing.has(id)) return; // уже перенесено
      appendEntry_(sheet, id, bed, wake, quality, note);
      existing.add(id);
      imported++;
    } catch (err) {
      skipped++;
    }
  });

  Logger.log(`Миграция завершена: всего ${entries.length}, перенесено ${imported}, пропущено ${skipped}.`);
  return { total: entries.length, imported, skipped };
}
