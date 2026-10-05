// js/quiz.js — Sistem Quiz My Nahwu untuk AMOGENZ LAB
// Database: https://raw.githubusercontent.com/amogenz/Amogenz/main/db/amogenzdb-lv1.js
// Format: export const AMOGENZ_DB_LV1 = [{id_kalimat, teks_kalimat, analysis: [{word, steps: {"1": {question, options, correct, explanation}}}]}]

const QuizDB = (() => {
  const URL = 'https://raw.githubusercontent.com/amogenz/Amogenz/main/db/amogenzdb-lv1.js';
  const LS_KEY = 'mynahwu_quiz_db_v1';
  let cache = null;

  async function load() {
    if (cache) return cache;
    // 1. coba fetch fresh
    try {
      const res = await fetch(URL, { cache: 'no-cache' });
      if (res.ok) {
        const text = await res.text();
        const data = parse(text);
        if (data && data.length) {
          cache = data;
          try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
          return cache;
        }
      }
    } catch (_) { /* offline -> fallback */ }
    // 2. fallback: localStorage
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { cache = JSON.parse(raw); return cache; }
    } catch (_) {}
    // 3. fallback terakhir: data minimal embedded
    cache = FALLBACK_DB;
    return cache;
  }

  function parse(text) {
    try {
      const lines = text.split('\n').filter(l => !l.trim().startsWith('//'));
      const clean = lines.join('\n');
      const m = clean.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
      if (!m) return null;
      return JSON.parse(m[1]);
    } catch (_) { return null; }
  }

  // Data darurat jika fetch gagal & belum ada cache (2 kalimat contoh)
  const FALLBACK_DB = [
    {
      id_kalimat: 'amogenz_kalimat_001',
      teks_kalimat: 'زيد طالب',
      analysis: [
        { id_lafadz: 'amogenz_lafadz_001', word: 'زيد', steps: {
          '1': { question: 'Apa jenis kalimat زيد?', options: ['Isim', "Fi'il", 'Huruf'], correct: 'Isim', explanation: 'Karena menunjukkan nama orang. Semua yang menunjukkan nama termasuk isim.' },
          '2': { question: 'Apa tanda isim pada زيد?', options: ['Tanwin', 'Alif Lam', 'Huruf Jer'], correct: 'Tanwin', explanation: 'Terdapat tanwin di akhir kata, dan tanwin adalah tanda khusus isim.' }
        }},
        { id_lafadz: 'amogenz_lafadz_002', word: 'طالب', steps: {
          '1': { question: 'Apa jenis kalimat طالب?', options: ['Isim', "Fi'il", 'Huruf'], correct: 'Isim', explanation: 'Karena menunjukkan profesi/subjek.' }
        }}
      ]
    }
  ];

  return { load };
})();

const QuizProgress = (() => {
  const KEY = 'mynahwu_quiz_progress_v1';
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function write(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  }
  function getKalimat(id) { return read()[id] || null; }
  function saveResult(id, score, total) {
    const p = read();
    const prev = p[id];
    p[id] = {
      best: Math.max(prev ? prev.best : 0, score),
      total,
      completed: true,
      at: Date.now()
    };
    write(p);
  }
  function completedCount() {
    return Object.values(read()).filter(v => v.completed).length;
  }
  return { getKalimat, saveResult, completedCount };
})();

const QuizUI = (() => {
  const $ = (id) => document.getElementById(id);
  let db = null;
  let state = null;
  let _net = null, _myName = () => 'Pemain';
  function setNet(net, getName) { _net = net; if (getName) _myName = getName; }
  function bcast(data) {
    try { if (_net && _net.send) _net.send('quiz-activity', Object.assign({ user: _myName() }, data)); } catch (_) {}
  } // {kalIdx, wordIdx, stepKeys, stepPos, correct, total, answers}

  const ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function open() {
    $('quiz-panel').classList.remove('hidden');
    document.body.classList.add('quiz-open');
    renderLoading();
    try {
      db = await QuizDB.load();
    } catch (_) { db = null; }
    if (!db || !db.length) { renderError(); return; }
    renderList();
  }

  function close() {
    $('quiz-panel').classList.add('hidden');
    document.body.classList.remove('quiz-open');
    state = null;
  }

  function isOpen() { return !$('quiz-panel').classList.contains('hidden'); }

  function header(title, opts) {
    opts = opts || {};
    return '<div class="quiz-header">'
      + (opts.back ? '<button class="quiz-iconbtn" id="quiz-back" aria-label="Kembali">' + ICONS.back + '</button>' : '<span class="quiz-iconbtn quiz-spacer"></span>')
      + '<div class="quiz-titlewrap"><span class="quiz-titleicon">' + ICONS.book + '</span><h2>' + esc(title) + '</h2></div>'
      + '<button class="quiz-iconbtn" id="quiz-close" aria-label="Tutup">' + ICONS.close + '</button>'
      + '</div>';
  }

  function bindHeader(opts) {
    opts = opts || {};
    const c = $('quiz-close'); if (c) c.addEventListener('click', close);
    const b = $('quiz-back'); if (b) b.addEventListener('click', opts.onBack || renderList);
  }

  function renderLoading() {
    $('quiz-body').innerHTML = header('My Nahwu Quiz')
      + '<div class="quiz-center"><div class="quiz-spinner"></div><p>Memuat database quiz...</p></div>';
    bindHeader();
  }

  function renderError() {
    $('quiz-body').innerHTML = header('My Nahwu Quiz')
      + '<div class="quiz-center"><p>Gagal memuat database quiz.<br>Periksa koneksi internet lalu coba lagi.</p>'
      + '<button class="quiz-btn quiz-btn-primary" id="quiz-retry">Coba Lagi</button></div>';
    bindHeader();
    $('quiz-retry').addEventListener('click', open);
  }

  function renderList() {
    state = null;
    const done = QuizProgress.completedCount();
    let html = header('My Nahwu Quiz')
      + '<div class="quiz-subhead"><p>Pilih kalimat untuk dianalisis. ' + done + ' dari ' + db.length + ' selesai.</p></div>'
      + '<div class="quiz-list">';
    db.forEach((k, i) => {
      const prog = QuizProgress.getKalimat(k.id_kalimat);
      const words = (k.analysis || []).length;
      const steps = (k.analysis || []).reduce((a, w) => a + Object.keys(w.steps || {}).length, 0);
      html += '<button class="quiz-kalimat" data-i="' + i + '">'
        + '<span class="quiz-knum">' + (i + 1) + '</span>'
        + '<span class="quiz-ktext" dir="rtl" lang="ar">' + esc(k.teks_kalimat) + '</span>'
        + '<span class="quiz-kmeta">' + words + ' kata &bull; ' + steps + ' soal'
        + (prog ? ' &bull; <span class="quiz-kdone">Skor ' + prog.best + '/' + prog.total + '</span>' : '')
        + '</span>'
        + '<span class="quiz-kplay">' + ICONS.play + '</span>'
        + '</button>';
    });
    html += '</div>';
    $('quiz-body').innerHTML = html;
    bindHeader();
    document.querySelectorAll('.quiz-kalimat').forEach(el => {
      el.addEventListener('click', () => startKalimat(parseInt(el.dataset.i, 10)));
    });
  }

  function flattenSteps(kal) {
    // -> [{word, wordIdx, stepKey, step}]
    const out = [];
    (kal.analysis || []).forEach((w, wi) => {
      const keys = Object.keys(w.steps || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      keys.forEach(k => out.push({ word: w.word, wordIdx: wi, stepKey: k, step: w.steps[k] }));
    });
    return out;
  }

  function startKalimat(idx) {
    const kal = db[idx];
    const items = flattenSteps(kal);
    if (!items.length) return;
    state = { kalIdx: idx, kal, items, pos: 0, correct: 0, locked: false };
    renderQuestion();
  }

  function renderQuestion() {
    const s = state, it = s.items[s.pos];
    const totalQ = s.items.length;
    const pct = Math.round((s.pos / totalQ) * 100);
    let html = header('Kalimat ' + (s.kalIdx + 1), { back: true })
      + '<div class="quiz-progress"><div class="quiz-progress-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="quiz-qmeta"><span>Soal ' + (s.pos + 1) + ' / ' + totalQ + '</span><span>Skor: ' + s.correct + '</span></div>'
      + '<div class="quiz-kalimat-full" dir="rtl" lang="ar">' + esc(s.kal.teks_kalimat) + '</div>'
      + '<div class="quiz-focus">Kata: <span dir="rtl" lang="ar">' + esc(it.word) + '</span></div>'
      + '<p class="quiz-question">' + esc(it.step.question) + '</p>'
      + '<div class="quiz-options">';
    it.step.options.forEach((opt) => {
      html += '<button class="quiz-opt" data-opt="' + esc(opt) + '">' + esc(opt) + '</button>';
    });
    html += '</div>';
    $('quiz-body').innerHTML = html;
    bindHeader({ onBack: confirmExit });
    document.querySelectorAll('.quiz-opt').forEach(el => {
      el.addEventListener('click', () => answer(el.dataset.opt, el));
    });
    $('quiz-body').scrollTop = 0;
    // mabar: siarkan soal ke pemain lain
    bcast({ t: 'question', q: it.step.question });
  }

  function confirmExit() {
    if (state && state.pos > 0 && !confirm('Keluar dari quiz? Progress kalimat ini akan hilang.')) return;
    renderList();
  }

  function answer(opt, el) {
    const s = state;
    if (!s || s.locked) return;
    s.locked = true;
    const it = s.items[s.pos];
    const ok = opt === it.step.correct;
    if (ok) s.correct++;
    document.querySelectorAll('.quiz-opt').forEach(o => {
      o.disabled = true;
      if (o.dataset.opt === it.step.correct) o.classList.add('is-correct');
      else if (o === el && !ok) o.classList.add('is-wrong');
      else o.classList.add('is-dim');
    });
    // mabar: siarkan jawaban ke pemain lain
    bcast({ t: 'answer', q: it.step.question, opt: opt, ok: ok });
    setTimeout(() => renderFeedback(ok, it), 650);
  }

  function renderFeedback(ok, it) {
    const s = state;
    let html = header('Kalimat ' + (s.kalIdx + 1), { back: true })
      + '<div class="quiz-feedback ' + (ok ? 'fb-ok' : 'fb-no') + '">'
      + '<span class="quiz-fbicon">' + (ok ? ICONS.check : ICONS.cross) + '</span>'
      + '<h3>' + (ok ? 'Benar!' : 'Kurang tepat') + '</h3>'
      + (!ok ? '<p class="quiz-correctans">Jawaban benar: <strong>' + esc(it.step.correct) + '</strong></p>' : '')
      + (it.step.explanation ? '<p class="quiz-explain">' + esc(it.step.explanation) + '</p>' : '')
      + '</div>'
      + '<button class="quiz-btn quiz-btn-primary" id="quiz-next">'
      + (s.pos + 1 >= s.items.length ? 'Lihat Hasil' : 'Soal Berikutnya')
      + '</button>';
    $('quiz-body').innerHTML = html;
    bindHeader({ onBack: confirmExit });
    $('quiz-next').addEventListener('click', () => {
      s.pos++;
      s.locked = false;
      if (s.pos >= s.items.length) renderResult();
      else renderQuestion();
    });
    $('quiz-body').scrollTop = 0;
  }

  function renderResult() {
    const s = state;
    const total = s.items.length;
    const pct = Math.round((s.correct / total) * 100);
    QuizProgress.saveResult(s.kal.id_kalimat, s.correct, total);
    const msg = pct >= 80 ? 'Masya Allah, luar biasa!' : pct >= 60 ? 'Bagus! Terus tingkatkan.' : 'Jangan menyerah, coba lagi!';
    let html = header('Hasil Quiz', { back: true })
      + '<div class="quiz-result">'
      + '<span class="quiz-trophy">' + ICONS.trophy + '</span>'
      + '<div class="quiz-score">' + s.correct + '<span>/' + total + '</span></div>'
      + '<p class="quiz-resultmsg">' + msg + '</p>'
      + '<p class="quiz-kalimat-full small" dir="rtl" lang="ar">' + esc(s.kal.teks_kalimat) + '</p>'
      + '</div>'
      + '<div class="quiz-resultbtns">'
      + '<button class="quiz-btn quiz-btn-ghost" id="quiz-retry-kal">Ulangi</button>'
      + '<button class="quiz-btn quiz-btn-primary" id="quiz-tolist">Pilih Kalimat Lain</button>'
      + '</div>';
    $('quiz-body').innerHTML = html;
    bindHeader({ onBack: renderList });
    $('quiz-retry-kal').addEventListener('click', () => startKalimat(s.kalIdx));
    $('quiz-tolist').addEventListener('click', renderList);
    $('quiz-body').scrollTop = 0;
  }

  function init() {
    const p = $('quiz-panel');
    if (!p) return;
    // tutup saat klik backdrop (hanya di desktop, area luar kartu)
    p.addEventListener('click', (e) => { if (e.target === p) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  }

  return { init, open, close, isOpen, setNet };
})();

// auto-init saat DOM siap
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', QuizUI.init);
else QuizUI.init();
