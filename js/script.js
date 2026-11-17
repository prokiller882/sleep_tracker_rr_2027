/* ============================================================
   ТРЕКЕР СНА — ФРОНТЕНД (статичный PWA)
   Общается с Apps Script (JSON API) через OAuth-токен.
   Данные хранятся в личной таблице текущего пользователя.
   ============================================================ */

(function () {
  'use strict';

  /* ================== НАСТРОЙКИ ================== */
  // ⚠️ ВСТАВЬТЕ СВОИ ЗНАЧЕНИЯ:
  const SCRIPT_URL = 'https://script.google.com/macros/s/PASTE_YOUR_SCRIPT_ID/exec';
  const CLIENT_ID = 'PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com';
  const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  const CACHE_KEY = 'sleep-tracker-cache-v2';
  const MOODS       = ['', 'Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  const MOOD_EMOJI  = ['', '😵', '😕', '😐', '🙂', '🤩'];
  const DAY_MS      = 86400000;
  const CHART_DAYS  = 7;

  /* ================== GOOGLE AUTH ================== */
  let tokenClient = null;
  let accessToken = null;
  let authResolve = null;

  function initAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp && resp.error !== undefined) {
          const err = new Error(resp.error_description || resp.error || 'Ошибка входа');
          if (authResolve) { authResolve.reject(err); authResolve = null; }
          return;
        }
        accessToken = resp.access_token;
        if (authResolve) { authResolve.resolve(accessToken); authResolve = null; }
      }
    });
  }

  function requestToken() {
    if (accessToken) return Promise.resolve(accessToken);
    return new Promise((resolve, reject) => {
      authResolve = { resolve, reject };
      tokenClient.requestAccessToken();
    });
  }

  // Ждём, пока загрузится скрипт Google Identity Services.
  function ensureGsi(cb) {
    if (window.google && google.accounts && google.accounts.oauth2) { cb(); return; }
    setTimeout(() => ensureGsi(cb), 100);
  }

  /* ================== СЕРВЕРНЫЙ API ================== */
  async function api(action, payload) {
    const token = await requestToken();
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });

    if (res.status === 401 || res.status === 403) {
      accessToken = null;
      showAuth();
      throw new Error('Требуется повторный вход');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    if (data.result !== 'success') throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  const server = {
    getEntries() {
      return api('getEntries').then((d) => ({ entries: d.entries || [], email: d.email || '' }));
    },
    addEntry(bed, wake, quality, note) {
      return api('add', { bed, wake, quality, note }).then((d) => d.entry);
    },
    deleteEntry(id) {
      return api('delete', { id });
    }
  };

  /* ================== СОСТОЯНИЕ ================== */
  let state = {
    entries: [],
    pending: null,
    online: true
  };

  let editingQuality = 3;
  let isLoading = false;
  let showAll = false;

  /* ================== DOM ================== */
  const $ = (sel) => document.querySelector(sel);

  const el = {
    auth:       $('#auth'),
    btnLogin:   $('#btnLogin'),
    authError:  $('#authError'),
    bigTime:    $('#bigTime'),
    bigLabel:   $('#bigLabel'),
    btnSleep:   $('#btnSleep'),
    btnWake:    $('#btnWake'),
    btnReset:   $('#btnReset'),
    statCount:  $('#statCount'),
    statDur:    $('#statDur'),
    statMood:   $('#statMood'),
    list:       $('#list'),
    empty:      $('#empty'),
    btnAdd:     $('#btnAdd'),
    btnMore:    $('#btnMore'),
    modal:      $('#modal'),
    fBed:       $('#fBed'),
    fWake:      $('#fWake'),
    fQuality:   $('#fQuality'),
    fNote:      $('#fNote'),
    qualityLbl: $('#qualityLabel'),
    btnCancel:  $('#btnCancel'),
    btnSave:    $('#btnSave'),
    toast:      $('#toast'),
    chart:      $('#chart'),
    account:    $('#account')
  };

  /* ================== УТИЛИТЫ ================== */
  const pad = (n) => String(n).padStart(2, '0');

  function toInputValue(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtTime(value) {
    const d = new Date(value);
    if (isNaN(d)) return '--:--';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDate(value) {
    const d = new Date(value);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  }

  function fmtDur(ms) {
    const total = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return `${m} мин`;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }

  function entryDuration(e) {
    return new Date(e.wake) - new Date(e.bed);
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  function showAuth() { el.auth.hidden = false; }
  function hideAuth() { el.auth.hidden = true; }

  /* ================== ЦВЕТА ДЛЯ ГРАФИКА ================== */
  function qualityColor(q) {
    const colors = {
      0: '#30363d',
      1: '#f85149',
      2: '#db6d28',
      3: '#d29922',
      4: '#3fb950',
      5: '#56d364'
    };
    return colors[q] || colors[0];
  }

  /* ================== ЛОКАЛЬНЫЙ КЭШ ================== */
  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        entries: state.entries,
        pending: state.pending
      }));
    } catch (err) { /* ignore */ }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        state.entries = parsed.entries.filter(e => e && e.bed && e.wake);
      }
      if (parsed && parsed.pending) state.pending = parsed.pending;
    } catch (err) { /* ignore */ }
  }

  /* ================== СИНХРОНИЗАЦИЯ ================== */
  async function syncFromServer(showToast) {
    if (isLoading) return;
    isLoading = true;

    try {
      const data = await server.getEntries();
      state.entries = data.entries;
      state.online = true;
      saveCache();
      render();
      el.account.textContent = data.email ? 'Аккаунт: ' + data.email : '';
      if (showToast) toast('Данные обновлены');
    } catch (err) {
      console.error('Ошибка загрузки:', err);
      state.online = false;
      render();
      if (showToast) toast('Не удалось обновить данные — показан кэш');
    } finally {
      isLoading = false;
    }
  }

  /* ================== ОТРИСОВКА: БЫСТРАЯ КАРТОЧКА ================== */
  function renderQuick() {
    if (state.pending) {
      el.bigTime.textContent = fmtTime(state.pending);
      el.bigLabel.textContent = 'Вы легли спать';
      el.btnSleep.hidden = true;
      el.btnWake.hidden = false;
      el.btnReset.hidden = false;
    } else {
      el.bigTime.textContent = fmtTime(new Date());
      el.bigLabel.textContent = 'Сейчас';
      el.btnSleep.hidden = false;
      el.btnWake.hidden = true;
      el.btnReset.hidden = true;
    }
  }

  /* ================== ОТРИСОВКА: СТАТИСТИКА ================== */
  function renderStats() {
    const entries = state.entries;
    el.statCount.textContent = entries.length;

    if (!entries.length) {
      el.statDur.textContent = '—';
      el.statMood.textContent = '—';
      return;
    }

    const recent = [...entries]
      .sort((a, b) => new Date(b.wake) - new Date(a.wake))
      .slice(0, 7);

    const avgDur = recent.reduce((s, e) => s + entryDuration(e), 0) / recent.length;
    const avgMood = recent.reduce((s, e) => s + (Number(e.quality) || 0), 0) / recent.length;

    el.statDur.textContent = fmtDur(avgDur);
    el.statMood.textContent = avgMood.toFixed(1) + ' ' + (MOOD_EMOJI[Math.round(avgMood)] || '');
  }

  /* ================== ОТРИСОВКА: ГРАФИК ================== */
  function renderChart() {
    if (!el.chart) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const slots = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const dayStart = new Date(today.getTime() - i * DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);

      const entry = state.entries.find((e) => {
        const wake = new Date(e.wake);
        return wake >= dayStart && wake < dayEnd;
      });

      slots.push({ date: dayStart, entry: entry || null });
    }

    const W = 340;
    const H = 160;
    const padTop = 24;
    const padBottom = 30;
    const padLeft = 6;
    const padRight = 6;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const n = slots.length;
    const gap = n > 5 ? 6 : 10;
    const barW = (chartW - gap * (n - 1)) / n;

    const hoursArr = slots.map((s) => (s.entry ? entryDuration(s.entry) / 3600000 : 0));
    const maxHours = Math.max.apply(null, hoursArr.concat([8]));
    const scaleMax = Math.max(8, Math.ceil(maxHours / 2) * 2);

    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="График сна за 7 дней">`;

    [4, 8, 12].forEach((refH) => {
      if (refH > scaleMax) return;
      const y = padTop + chartH - (refH / scaleMax) * chartH;
      svg += `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="rgba(139,148,158,.14)" stroke-width="1" stroke-dasharray="2 4"/>`;
      svg += `<text x="${W - padRight - 2}" y="${y - 3}" text-anchor="end" font-size="8" fill="#8b949e">${refH}ч</text>`;
    });

    const baseY = padTop + chartH;
    svg += `<line x1="${padLeft}" y1="${baseY}" x2="${W - padRight}" y2="${baseY}" stroke="#2a3038" stroke-width="1"/>`;

    slots.forEach((slot, i) => {
      const x = padLeft + i * (barW + gap);
      const cx = x + barW / 2;

      if (slot.entry) {
        const h = entryDuration(slot.entry) / 3600000;
        const barH = Math.max(3, (h / scaleMax) * chartH);
        const y = baseY - barH;
        const q = Number(slot.entry.quality) || 0;

        svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" ry="4" fill="${qualityColor(q)}"/>`;
        svg += `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="9" font-weight="600" fill="#c9d1d9">${h.toFixed(1)}</text>`;
      } else {
        svg += `<rect x="${x}" y="${baseY - 3}" width="${barW}" height="3" rx="1.5" fill="#30363d"/>`;
      }

      const dayNum = slot.date.getDate();
      svg += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="#8b949e">${dayNum}</text>`;
    });

    svg += `</svg>`;
    el.chart.innerHTML = svg;
  }

  /* ================== ОТРИСОВКА: ИСТОРИЯ ================== */
  function renderList() {
    const entries = [...state.entries].sort((a, b) => new Date(b.wake) - new Date(a.wake));

    el.empty.style.display = entries.length ? 'none' : 'block';

    const visible = showAll ? entries : entries.slice(0, 5);

    el.list.innerHTML = visible.map((e) => {
      const q = Number(e.quality) || 0;
      return `
        <li class="entry">
          <div class="entry-head">
            <span class="entry-date">${fmtDate(e.wake)}</span>
            <button class="del" data-id="${esc(e.id)}" aria-label="Удалить">✕</button>
          </div>
          <div class="entry-times">
            <span class="t">${fmtTime(e.bed)}</span>
            <span class="arrow">→</span>
            <span class="t">${fmtTime(e.wake)}</span>
            <span class="dur">${fmtDur(entryDuration(e))}</span>
          </div>
          <div class="entry-mood">
            <span class="mood-emoji">${MOOD_EMOJI[q] || '—'}</span>
            <span>${MOODS[q] || 'Без оценки'}</span>
          </div>
          ${e.note ? `<p class="entry-note">${esc(e.note)}</p>` : ''}
        </li>`;
    }).join('');

    const hiddenCount = entries.length - visible.length;
    if (hiddenCount > 0) {
      el.btnMore.hidden = false;
      el.btnMore.textContent = showAll ? 'Свернуть' : `Показать все (ещё ${hiddenCount})`;
    } else {
      el.btnMore.hidden = true;
    }
  }

  /* ================== ОБЩАЯ ОТРИСОВКА ================== */
  function render() {
    renderQuick();
    renderStats();
    renderChart();
    renderList();
  }

  /* ================== МОДАЛЬНОЕ ОКНО ================== */
  function setQuality(value) {
    editingQuality = value;
    el.fQuality.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('on', Number(btn.dataset.v) <= value);
    });
    el.qualityLbl.textContent = `${MOOD_EMOJI[value]} ${MOODS[value]}`;
  }

  function openModal(opts) {
    opts = opts || {};
    const now = new Date();
    const bedDate = opts.bed ? new Date(opts.bed) : new Date(now.getTime() - 8 * 3600 * 1000);
    const wakeDate = opts.wake ? new Date(opts.wake) : now;

    el.fBed.value = toInputValue(bedDate);
    el.fWake.value = toInputValue(wakeDate);
    el.fNote.value = '';
    setQuality(3);

    el.modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    el.modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ================== СОХРАНЕНИЕ ЗАПИСИ ================== */
  async function saveEntry() {
    const bedVal = el.fBed.value;
    const wakeVal = el.fWake.value;

    if (!bedVal || !wakeVal) {
      toast('Заполните оба времени');
      return;
    }

    let bedDate = new Date(bedVal);
    let wakeDate = new Date(wakeVal);

    if (isNaN(bedDate) || isNaN(wakeDate)) {
      toast('Некорректное время');
      return;
    }

    if (wakeDate <= bedDate) {
      bedDate = new Date(bedDate.getTime() - DAY_MS);
    }

    if (wakeDate - bedDate > DAY_MS) {
      toast('Сон длиннее 24 часов — проверьте время');
      return;
    }

    el.btnSave.disabled = true;
    el.btnSave.textContent = 'Сохранение…';

    try {
      const entry = await server.addEntry(
        bedDate.toISOString(),
        wakeDate.toISOString(),
        editingQuality,
        el.fNote.value.trim()
      );

      state.entries.push(entry);
      state.pending = null;
      saveCache();
      render();
      closeModal();
      toast('Запись сохранена');
    } catch (err) {
      console.error(err);
      toast('Ошибка сохранения: ' + (err && err.message ? err.message : err));
    } finally {
      el.btnSave.disabled = false;
      el.btnSave.textContent = 'Сохранить';
    }
  }

  /* ================== УДАЛЕНИЕ ================== */
  async function deleteEntry(id) {
    if (!confirm('Удалить эту запись?')) return;

    const backup = [...state.entries];
    state.entries = state.entries.filter(e => e.id !== id);
    render();

    try {
      await server.deleteEntry(id);
      saveCache();
      toast('Запись удалена');
    } catch (err) {
      console.error(err);
      state.entries = backup;
      render();
      toast('Не удалось удалить: ' + (err && err.message ? err.message : err));
    }
  }

  /* ================== СОБЫТИЯ ================== */
  el.btnLogin.addEventListener('click', () => {
    el.authError.textContent = '';
    requestToken()
      .then(() => {
        hideAuth();
        syncFromServer(false);
      })
      .catch((err) => {
        el.authError.textContent = 'Не удалось войти: ' + (err && err.message ? err.message : err);
      });
  });

  el.btnSleep.addEventListener('click', () => {
    state.pending = new Date().toISOString();
    saveCache();
    renderQuick();
    toast('Спокойной ночи');
  });

  el.btnWake.addEventListener('click', () => {
    openModal({ bed: state.pending, wake: new Date() });
  });

  el.btnReset.addEventListener('click', () => {
    state.pending = null;
    saveCache();
    renderQuick();
    toast('Отметка отменена');
  });

  el.btnAdd.addEventListener('click', () => openModal());
  el.btnMore.addEventListener('click', () => {
    showAll = !showAll;
    renderList();
  });
  el.btnCancel.addEventListener('click', closeModal);
  el.btnSave.addEventListener('click', saveEntry);

  el.fQuality.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    setQuality(Number(btn.dataset.v));
  });

  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('.del');
    if (!btn) return;
    deleteEntry(btn.dataset.id);
  });

  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.modal.classList.contains('open')) closeModal();
  });

  // Обновление часов каждые 15 секунд
  setInterval(() => {
    if (!state.pending && !el.modal.classList.contains('open')) renderQuick();
  }, 15000);

  // Синхронизация при возврате на вкладку
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && accessToken) {
      render();
      syncFromServer(false);
    }
  });

  /* ================== СТАРТ ================== */
  loadCache();
  render();
  ensureGsi(initAuth);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
