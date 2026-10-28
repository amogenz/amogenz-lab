/* AMOGENZ LAB v1 — lab.js */
(function(){
"use strict";

/* ---------- navigasi layar ala game ---------- */
const screens = ["splash","menu","proyek","zero","log","arsip","tentang"];
function go(name){
  screens.forEach(s => document.getElementById(s).classList.toggle("active", s===name));
  window.scrollTo(0,0);
  if(name==="zero"){ bootZero(); if(!go._papanLoaded){ loadPapan(); go._papanLoaded = true; } }
  if(name==="log" && !go._logLoaded){ loadLog(); go._logLoaded = true; }
}
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
document.getElementById("btn-enter").addEventListener("click", () => go("menu"));
document.getElementById("btn-next-exp").addEventListener("click", () => { go("zero"); switchTab("usulkan"); });

/* ---------- tabs Zero ---------- */
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab===name));
  document.querySelectorAll(".tabpanel").forEach(p => p.classList.toggle("active", p.id==="tab-"+name));
  if(name==="papan" && !go._papanLoaded){ loadPapan(); go._papanLoaded = true; }
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

/* ---------- Firebase (komentar usulan, realtime) ----------
   Pakai project yang sama dengan Aksara (amogenz-inc, asia-southeast1).
   Data: lab_komen/<id-usulan>/<pushId> = {nama, teks, waktu}.
   apiKey di bawah ini BUKAN rahasia (public client key, wajar di kode web);
   keamanan dijaga oleh Firebase Rules (lihat firebase-rules-lab.json). */
const FB_CONFIG = {
  apiKey: "AIzaSyAeVLZVH7Chlw1utVt2Z9v87jcZxPZZtpk",
  authDomain: "amogenz-inc.firebaseapp.com",
  databaseURL: "https://amogenz-inc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "amogenz-inc"
};
let FB = null;
(function initFB(){
  Promise.all([
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js")
  ]).then(([appM, dbM]) => {
    const app = appM.initializeApp(FB_CONFIG);
    FB = { db: dbM.getDatabase(app), ref: dbM.ref, push: dbM.push, onChildAdded: dbM.onChildAdded };
  }).catch(() => { FB = null; });
})();

/* ---------- helper ---------- */
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function addMsg(cls, html){
  const log = document.getElementById("chat-log");
  const d = document.createElement("div");
  d.className = "msg " + cls; d.innerHTML = html;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
  return d;
}

/* ---------- ZERO: tanya ---------- */
const chatHistory = [];
let zeroBooted = false;
function bootZero(){
  if(zeroBooted) return; zeroBooted = true;
  addMsg("zero", "<b>ZERO</b> online. Sistem lab siap.<br>Tanya apa saja soal AMOGENZ LAB — atau buka tab <b>USULKAN EKSPERIMEN</b> kalau punya ide gila.");
}
async function askZero(){
  const inp = document.getElementById("chat-text");
  const text = inp.value.trim();
  if(!text) return;
  bootZero(); inp.value = "";
  addMsg("user", esc(text));
  const wait = addMsg("sys", "Zero berpikir...");
  try{
    const r = await fetch("/api/zero", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ mode:"tanya", message:text, history:chatHistory.slice(-6) })
    });
    const data = await r.json();
    wait.remove();
    if(!r.ok){
      if(data.error === "ZERO_OFFLINE"){
        addMsg("zero error", "<b>ZERO</b> belum terhubung ke otak (kunci API belum dipasang). Coba lagi nanti ya.");
      } else {
        addMsg("zero error", "Zero lagi error: " + esc(data.error || r.status));
      }
      return;
    }
    addMsg("zero", esc(data.reply).replace(/\n/g,"<br>"));
    chatHistory.push({q:text, a:data.reply});
  }catch(e){
    wait.remove();
    addMsg("zero error", "Koneksi ke Zero gagal. Periksa internet lalu coba lagi.");
  }
}
document.getElementById("chat-send").addEventListener("click", askZero);
document.getElementById("chat-text").addEventListener("keydown", e => { if(e.key==="Enter") askZero(); });

/* ---------- filter kata kasar (ringan, client-side) ---------- */
const BAD = ["anjing","bangsat","kontol","memek","ngentot","tolol","goblok","bego","jancuk","asu","porno","bokep","sex","coli","masturbasi"];
function bersih(s){ const t = String(s||"").toLowerCase().replace(/[^a-z ]/g," "); return !BAD.some(w => t.includes(w)); }

/* ---------- ZERO: generator usulan ---------- */
let draftProposal = null;
document.getElementById("btn-rumuskan").addEventListener("click", async () => {
  const ide = document.getElementById("ide-text").value.trim();
  const out = document.getElementById("proposal-out");
  if(ide.length < 10){ out.innerHTML = '<p class="loading">Ceritakan idemu sedikit lebih panjang dulu (min. 10 karakter).</p>'; return; }
  if(!bersih(ide)){ out.innerHTML = '<p class="loading">Bahasa yang sopan ya — lab ini tempat berkarya.</p>'; return; }
  const btn = document.getElementById("btn-rumuskan");
  btn.disabled = true; btn.textContent = "ZERO MERUMUSKAN...";
  out.innerHTML = '<p class="loading">Zero sedang meramu idemu jadi proposal resmi lab...</p>';
  try{
    const r = await fetch("/api/zero", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ mode:"usulkan", message:ide })
    });
    const data = await r.json();
    if(!r.ok){
      out.innerHTML = data.error==="ZERO_OFFLINE"
        ? '<p class="loading">Zero belum terhubung ke otak (kunci API belum dipasang). Proposal belum bisa dirumuskan.</p>'
        : '<p class="loading">Zero lagi error: ' + esc(data.error || r.status) + '</p>';
      return;
    }
    const p = data.proposal;
    draftProposal = { ...p, ide_asli: ide };
    out.innerHTML =
      '<div class="proposal">' +
      '<h4>' + esc(p.nama) + '</h4><div class="p-cat">KATEGORI: ' + esc(p.kategori).toUpperCase() + ' • STATUS: USULAN</div>' +
      '<p>' + esc(p.ringkasan) + '</p>' +
      '<div class="p-label">FITUR INTI</div><ul>' + p.fitur.map(f => "<li>"+esc(f)+"</li>").join("") + '</ul>' +
      '<div class="p-label">TANTANGAN TEKNIS</div><ul>' + p.tantangan.map(t => "<li>"+esc(t)+"</li>").join("") + '</ul>' +
      '<div class="p-label">ESTIMASI</div><p>' + esc(p.estimasi) + '</p>' +
      '<div class="proposal-actions"><button class="card-btn" id="btn-terbit">TERBITKAN KE PAPAN</button>' +
      '<button class="ghost-btn" id="btn-buang">BUANG</button></div></div>';
    document.getElementById("btn-terbit").addEventListener("click", terbitkan);
    document.getElementById("btn-buang").addEventListener("click", () => { out.innerHTML=""; draftProposal=null; });
  }catch(e){
    out.innerHTML = '<p class="loading">Koneksi ke Zero gagal. Coba lagi.</p>';
  }finally{
    btn.disabled = false; btn.textContent = "RUMUSKAN JADI PROPOSAL";
  }
});

async function terbitkan(){
  if(!draftProposal) return;
  const oleh = (document.getElementById("ide-nama").value.trim() || "anonim").slice(0,40);
  if(!bersih(oleh + " " + draftProposal.nama)){ alert("Nama tidak pantas."); return; }
  const btn = document.getElementById("btn-terbit");
  btn.textContent = "MENERBITKAN..."; btn.disabled = true;
  try{
    await sbReady();
    const r = await fetch(SB_URL + "/rest/v1/lab_usulan", {
      method:"POST",
      headers:{ "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY, "Content-Type":"application/json", "Prefer":"return=representation" },
      body: JSON.stringify({
        nama:draftProposal.nama, kategori:draftProposal.kategori, ringkasan:draftProposal.ringkasan,
        fitur:draftProposal.fitur, tantangan:draftProposal.tantangan, estimasi:draftProposal.estimasi,
        ide_asli:draftProposal.ide_asli, oleh:oleh
      })
    });
    if(!r.ok) throw new Error("HTTP " + r.status);
    document.getElementById("proposal-out").innerHTML = '<p class="loading">Usulan terbit! Lihat di tab PAPAN USULAN.</p>';
    document.getElementById("ide-text").value = "";
    go._papanLoaded = false;
    switchTab("papan");
  }catch(e){
    btn.textContent = "TERBITKAN KE PAPAN"; btn.disabled = false;
    alert("Gagal menerbitkan. Papan usulan mungkin belum disiapkan (tabel database). Coba lagi nanti.");
  }
}

/* ---------- PAPAN USULAN (Supabase) ---------- */
// Kredensial diambil dari environment via /api/config — TIDAK hard-code di sini.
let SB_URL = "", SB_KEY = "";
let _sbCfg = null;
function sbReady(){
  if(!_sbCfg){
    _sbCfg = fetch("/api/config", { cache:"no-store" }).then(async r => {
      if(!r.ok) throw new Error("config HTTP " + r.status);
      const c = await r.json();
      SB_URL = c.url || ""; SB_KEY = c.anonKey || "";
      if(!SB_URL || !SB_KEY) throw new Error("config kosong");
    }).catch(e => { _sbCfg = null; throw e; });
  }
  return _sbCfg;
}

function votedIds(){
  try{ return JSON.parse(localStorage.getItem("lab_voted")||"[]"); }catch(e){ return []; }
}
function markVoted(id){
  const v = votedIds(); v.push(id);
  try{ localStorage.setItem("lab_voted", JSON.stringify(v)); }catch(e){}
}

async function loadPapan(){
  const list = document.getElementById("papan-list");
  list.innerHTML = '<p class="loading">Memuat papan usulan...</p>';
  try{
    await sbReady();
    const r = await fetch(SB_URL + "/rest/v1/lab_usulan?select=id,nama,kategori,ringkasan,oleh,dukungan,created_at&order=dukungan.desc&order=created_at.desc&limit=50", {
      headers:{ "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY }
    });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    if(!rows.length){
      list.innerHTML = '<p class="loading">Papan masih kosong. Jadilah yang pertama mengusulkan eksperimen!</p>';
      return;
    }
    const voted = votedIds();
    list.innerHTML = "";
    rows.forEach(u => {
      const d = document.createElement("div");
      d.className = "usulan";
      const sudah = voted.includes(u.id);
      d.innerHTML =
        '<h4>' + esc(u.nama) + '</h4>' +
        '<div class="u-meta">' + esc((u.kategori||"").toUpperCase()) + ' • oleh ' + esc(u.oleh||"anonim") + '</div>' +
        '<p>' + esc(u.ringkasan) + '</p>' +
        '<div class="u-foot"><span class="u-votes">▲ ' + (u.dukungan||0) + ' dukungan</span>' +
        (sudah
          ? '<button class="u-vote done" disabled>DIDUKUNG</button>'
          : '<button class="u-vote" data-id="' + u.id + '" data-n="' + (u.dukungan||0) + '">DUKUNG</button>') +
        '</div>' +
        '<div class="komen-wrap">' +
          '<button class="komen-toggle" data-kid="' + u.id + '">Komentar (<span>0</span>)</button>' +
          '<div class="komen-box" hidden>' +
            '<div class="komen-list"></div>' +
            '<div class="komen-form">' +
              '<input class="komen-nama" maxlength="30" placeholder="Namamu (opsional)">' +
              '<div class="komen-row"><input class="komen-teks" maxlength="400" placeholder="Tulis komentar...">' +
              '<button class="komen-kirim">KIRIM</button></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      list.appendChild(d);
    });
    list.querySelectorAll(".u-vote[data-id]").forEach(b => b.addEventListener("click", async () => {      const id = b.dataset.id, n = parseInt(b.dataset.n||"0",10);
      b.disabled = true; b.textContent = "...";
      try{
        const rr = await fetch(SB_URL + "/rest/v1/lab_usulan?id=eq." + id, {
          method:"PATCH",
          headers:{ "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY, "Content-Type":"application/json" },
          body: JSON.stringify({ dukungan:n+1 })
        });
        if(!rr.ok) throw new Error("HTTP " + rr.status);
        markVoted(id);
        b.outerHTML = '<button class="u-vote done" disabled>DIDUKUNG</button>';
        b.parentElement.querySelector(".u-votes").textContent = "▲ " + (n+1) + " dukungan";
      }catch(e){
        b.disabled = false; b.textContent = "DUKUNG";
        alert("Gagal memberi dukungan. Coba lagi.");
      }
    }));

    /* --- komentar usulan (Firebase realtime) --- */
    list.querySelectorAll(".komen-toggle").forEach(t => t.addEventListener("click", () => {
      const wrap = t.closest(".komen-wrap");
      toggleKomen(t.dataset.kid, wrap);
    }));
    list.querySelectorAll(".komen-kirim").forEach(b => b.addEventListener("click", () => {
      const wrap = b.closest(".komen-wrap");
      kirimKomen(wrap.parentElement.querySelector(".komen-toggle").dataset.kid, wrap);
    }));
    list.querySelectorAll(".komen-teks").forEach(i => i.addEventListener("keydown", e => {
      if(e.key === "Enter"){
        const wrap = i.closest(".komen-wrap");
        kirimKomen(wrap.parentElement.querySelector(".komen-toggle").dataset.kid, wrap);
      }
    }));
  }catch(e){
    list.innerHTML = '<p class="loading">Papan usulan belum siap — koneksi database gagal. Coba muat ulang halaman.</p>';
  }
}

/* ---------- komentar: realtime Firebase ---------- */
const komenListeners = new Set();
const komenLastSend = {};

function toggleKomen(usulanId, wrap){
  const box = wrap.querySelector(".komen-box");
  const opening = box.hidden;
  box.hidden = !opening;
  if(!opening) return;
  const list = wrap.querySelector(".komen-list");
  if(!FB){
    list.innerHTML = '<p class="loading">Komentar offline — Firebase belum terhubung.</p>';
    return;
  }
  if(komenListeners.has(usulanId)) return;
  komenListeners.add(usulanId);
  const countSpan = wrap.querySelector(".komen-toggle span");
  FB.onChildAdded(FB.ref(FB.db, "lab_komen/" + usulanId), snap => {
    const k = snap.val();
    if(!k || typeof k.teks !== "string") return;
    const d = document.createElement("div");
    d.className = "komen-item";
    d.innerHTML = "<b>" + esc(k.nama) + "</b><span>" + esc(k.teks) + "</span>";
    list.appendChild(d);
    countSpan.textContent = list.querySelectorAll(".komen-item").length;
  });
}

async function kirimKomen(usulanId, wrap){
  const namaEl = wrap.querySelector(".komen-nama");
  const teksEl = wrap.querySelector(".komen-teks");
  const btn = wrap.querySelector(".komen-kirim");
  const nama = (namaEl.value.trim() || "anonim").slice(0, 30);
  const teks = teksEl.value.trim().slice(0, 400);
  if(teks.length < 2){ teksEl.focus(); return; }
  if(!bersih(nama + " " + teks)){ alert("Bahasa yang sopan ya — lab ini tempat berkarya."); return; }
  const now = Date.now();
  if(komenLastSend[usulanId] && now - komenLastSend[usulanId] < 8000){
    alert("Pelan-pelan... tunggu beberapa detik sebelum komentar lagi.");
    return;
  }
  if(!FB){ alert("Komentar belum online — Firebase belum terhubung."); return; }
  btn.disabled = true;
  try{
    await FB.push(FB.ref(FB.db, "lab_komen/" + usulanId), { nama: nama, teks: teks, waktu: now });
    teksEl.value = "";
    komenLastSend[usulanId] = Date.now();
  }catch(e){
    alert("Gagal mengirim komentar. Coba lagi.");
  }finally{
    btn.disabled = false;
  }
}

/* boot: Zero menyapa saat layar Zero pertama dibuka */
})();

/* ---------- LOG LAB: jurnal dokumentasi semi-otomatis ----------
   Data: data/log.json — ditulis asisten, tayang setelah Bos setujui.
   Filter aman: tanpa info sensitif; entri Aksara ditahan s.d. 22 Okt 2026. */
let LOG_ENTRIES = [], LOG_FILTER = "all";
function escHtml(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
async function loadLog(){
  const list = document.getElementById("log-list");
  try{
    const r = await fetch("data/log.json", {cache:"no-store"});
    const d = await r.json();
    LOG_ENTRIES = d.entries || [];
    renderLogChips(); renderLogList();
  }catch(e){ list.innerHTML = '<p class="panel-desc">Log belum bisa dimuat. Coba lagi nanti.</p>'; }
}
function renderLogChips(){
  const seen = [], names = {};
  LOG_ENTRIES.forEach(e => { if(!seen.includes(e.tag)){ seen.push(e.tag); names[e.tag] = e.proj; } });
  document.getElementById("log-chips").innerHTML =
    ['<button class="chip'+(LOG_FILTER==="all"?' on':'')+'" data-f="all">Semua</button>']
    .concat(seen.map(t => '<button class="chip'+(LOG_FILTER===t?' on':'')+'" data-f="'+escHtml(t)+'">'+escHtml(names[t])+'</button>')).join("");
  document.querySelectorAll("#log-chips .chip").forEach(c =>
    c.addEventListener("click", () => { LOG_FILTER = c.dataset.f; renderLogChips(); renderLogList(); }));
}
function renderLogList(){
  const items = LOG_ENTRIES.filter(e => LOG_FILTER==="all" || e.tag===LOG_FILTER);
  document.getElementById("log-list").innerHTML = items.map(e =>
    '<article class="logcard"><div class="ltop"><span class="logdate">'+escHtml(e.date)+
    '</span><span class="projtag">'+escHtml(e.proj)+'</span><span class="lstatus '+escHtml(e.status)+'">'+escHtml(e.st)+
    '</span></div><h3>'+escHtml(e.title)+'</h3><p>'+escHtml(e.desc)+'</p></article>').join("")
    || '<p class="panel-desc">Belum ada entri.</p>';
}
