// js/main.js — AMOGENZ 3D World v3: third-person owl + multiplayer (Supabase) + chat
import * as THREE from 'three';
import { buildWorld } from './world.js?v=36';
import { createNet } from './net.js?v=8';
import { createVoice } from './voice.js?v=6';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  // WebGL gagal: biasanya karena terlalu banyak tab membuka situs 3D
  const loadText = document.getElementById('load-text');
  if (loadText) loadText.textContent = 'WebGL gagal dibuat. Tutup tab lain yang membuka situs 3D, lalu muat ulang halaman ini.';
  const btn = document.getElementById('start-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>Tutup tab lain & muat ulang</span>'; }
  throw e;
}
// tangani context lost (mis. GPU sibuk / terlalu banyak konteks)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  const loadText = document.getElementById('load-text');
  if (loadText) loadText.textContent = 'Konteks WebGL hilang. Tutup tab lain, lalu muat ulang.';
  toast('WebGL terputus — tutup tab lain lalu muat ulang ya');
}, false);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
onResize();

// ---------- Toast ----------
let toastT = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------- State ----------
let world = null, started = false;
const player = { x: 0, z: 112, y: 0, yaw: 0, moving: false };
const cam = { yaw: 0, pitch: 0.38, dist: 7.5 };
const keys = {};
const joy = { active: false, id: null, x: 0, y: 0 };
const look = { id: null, lx: 0, ly: 0 };
let myAvatar = null, myColor = '#2dd4a7', myName = 'Penjelajah';
const remotes = new Map();   // id -> {grp, x, z, yaw, tx, tz, tyaw, name}
const knownIds = new Set();

// ---------- Sistem Kendaraan (Helikopter & Sepeda) ----------
let vehicle = null; // { type:'heli'|'bike', bid, y (heli), rotorSpin }
const VEH = {
  heliUp: false, heliDown: false,
};
function boardVehicle(bid) {
  if (vehicle) { toast('Kamu sudah naik kendaraan. Turun dulu!'); return; }
  if (!world || !world.P) { toast('Dunia belum siap.'); return; }
  const V = world.P.vehicles;
  if (!V) { toast('Kendaraan belum siap.'); return; }
  if (bid === 'heli-ride') {
    const H = V.heli;
    if (!H) { toast('Helikopter belum siap.'); return; }
    vehicle = { type: 'heli', bid, ref: H, y: 0.35, vy: 0 };
    // pindahkan pemain ke posisi heli
    player.x = H.grp.position.x; player.z = H.grp.position.z;
    toast('Naik helikopter! Joystick untuk terbang, tombol ▲▼ untuk naik/turun.');
  } else if (bid.indexOf('bike-') === 0) {
    const key = 'bike' + bid.split('-')[1];
    const B = V[key];
    if (!B) { toast('Sepeda belum siap.'); return; }
    if (B.rider) { toast('Sepeda ini sedang dipakai.'); return; }
    B.rider = true; B.parked = false;
    vehicle = { type: 'bike', bid, ref: B };
    player.x = B.grp.position.x; player.z = B.grp.position.z;
    toast('Naik sepeda! Kayuh dengan joystick, lebih cepat dari jalan kaki.');
  } else if (bid.indexOf('drone-') === 0) {
    const key = 'drone' + bid.split('-')[1];
    const D = V[key];
    if (!D) { toast('Drone belum siap.'); return; }
    if (D.rider) { toast('Drone ini sedang dipakai.'); return; }
    D.rider = true; D.flying = true;
    vehicle = { type: 'drone', bid, ref: D, y: 2 };
    player.x = D.home.x; player.z = D.home.z; player.y = 0;
    toast('Mengendalikan drone! Joystick untuk terbang, tombol naik/turun untuk ketinggian.');
  }
  if (vehicle) {
    // avatar tetap terlihat saat naik kendaraan (duduk di sepeda / di heli)
    showVehicleUI(vehicle.type);
  }
}
function exitVehicle() {
  if (!vehicle) return;
  const V = world.P.vehicles;
  if (vehicle.type === 'heli') {
    const H = vehicle.ref;
    // kembali ke helipad
    H.grp.position.set(H.home.x, 0.35, H.home.z);
    H.grp.rotation.y = 0;
    vehicle.flying = false;
    // pemain turun di samping helipad
    player.x = H.home.x + 10; player.z = H.home.z; player.y = 0;
    toast('Turun dari helikopter. Helikopter kembali ke helipad.');
  } else if (vehicle.type === 'bike') {
    const B = vehicle.ref;
    B.rider = false;
    // sepeda tetap di posisi terakhir
    player.x = B.grp.position.x + 1.5; player.z = B.grp.position.z; player.y = 0;
    toast('Turun dari sepeda. Sepeda tetap di sini.');
  } else if (vehicle.type === 'drone') {
    const D = vehicle.ref;
    D.rider = false; D.flying = false;
    // drone kembali ke posko
    D.grp.position.set(D.home.x, 0.55, D.home.z);
    D.grp.rotation.y = 0;
    // pemain turun di dekat posko
    player.x = D.home.x + 3; player.z = D.home.z; player.y = 0;
    toast('Drone kembali ke posko.');
  }
  vehicle = null;
  if (myAvatar) myAvatar.visible = true;
  hideVehicleUI();
}
function showVehicleUI(type) {
  const ui = $('vehicle-ui');
  if (!ui) return;
  ui.classList.remove('hidden');
  ui.dataset.type = type;
  // tampilkan kontrol naik/turun untuk helikopter & drone
  const heliCtl = $('heli-ctl');
  if (heliCtl) heliCtl.classList.toggle('hidden', type !== 'heli' && type !== 'drone');
  const label = $('vehicle-label');
  if (label) label.textContent = type === 'heli' ? 'Helikopter' : type === 'drone' ? 'Drone' : 'Sepeda';
}
function hideVehicleUI() {
  const ui = $('vehicle-ui');
  if (ui) ui.classList.add('hidden');
}
// ---------- Tombol NAIK kendaraan (muncul saat pemain dekat < 4m) ----------
let boardTarget = null; // { bid, label }
let boardHintShown = false;
let lastBoardCheck = 0;
function checkVehicleProximity(now) {
  if (vehicle) { hideBoardBtn(); return; } // sedang naik -> sembunyikan
  if (now - lastBoardCheck < 250) return; // throttle: cek 4x/detik (hemat CPU)
  lastBoardCheck = now;
  const V = world && world.P && world.P.vehicles;
  if (!V) { hideBoardBtn(); return; }
  let best = null, bestD = 6; // radius 6 meter (diperbesar agar mudah ketemu)
  // helikopter (parkir)
  if (V.heli && !V.heli.flying) {
    const p = V.heli.grp.position;
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < bestD) { bestD = d; best = { bid: 'heli-ride', label: 'Naik Helikopter' }; }
  }
  // sepeda (yang tidak sedang dipakai)
  for (const k of Object.keys(V)) {
    if (k === 'heli' || k.indexOf('drone') === 0) continue;
    const B = V[k];
    if (!B || B.rider) continue;
    const p = B.grp.position;
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = { bid: 'bike-' + k.replace('bike', ''), label: 'Naik Sepeda' };
    }
  }
  // drone (yang tidak sedang dipakai) — cek posisi posko (home)
  for (const k of Object.keys(V)) {
    if (k.indexOf('drone') !== 0) continue;
    const D = V[k];
    if (!D || D.rider) continue;
    const hx = D.home.x, hz = D.home.z;
    const d = Math.hypot(player.x - hx, player.z - hz);
    if (d < bestD) {
      bestD = d;
      best = { bid: 'drone-' + k.replace('drone', ''), label: 'Kendalikan Drone' };
    }
  }
  // teropong — cek via clickables
  if (world && world.clickables) {
    for (const c of world.clickables) {
      const bid = c.userData && c.userData.bid;
      if (!bid || bid.indexOf('telescope-') !== 0) continue;
      // posisi world dari clickable (bisa nested, pakai getWorldPosition)
      const wp = new THREE.Vector3();
      try { c.getWorldPosition(wp); } catch (_) { continue; }
      const d = Math.hypot(player.x - wp.x, player.z - wp.z);
      if (d < bestD) {
        bestD = d;
        best = { bid: bid, label: 'Pakai Teropong' };
      }
    }
  }
  boardTarget = best;
  if (best) {
    showBoardBtn(best.label);
    if (!boardHintShown) {
      boardHintShown = true;
      const h = $('board-hint');
      if (h) { h.classList.remove('hidden'); setTimeout(() => h.classList.add('hidden'), 5000); }
    }
  } else {
    hideBoardBtn();
  }
}
function showBoardBtn(label) {
  const b = $('board-btn');
  if (!b) return;
  const l = $('board-label');
  if (l) l.textContent = label;
  b.classList.remove('hidden');
}
function hideBoardBtn() {
  const b = $('board-btn');
  if (b) b.classList.add('hidden');
  boardTarget = null;
}
// update kendaraan tiap frame (dipanggil dari loop utama)
function updateVehicle(dt) {
  if (!vehicle) return;
  const V = vehicle.ref;
  if (vehicle.type === 'heli') {
    // rotor berputar kencang
    V.rotorMain.rotation.y += dt * 25;
    V.rotorTail.rotation.x += dt * 35;
    // kontrol naik/turun
    const upRate = 14;
    if (VEH.heliUp) vehicle.y = Math.min(60, vehicle.y + upRate * dt);
    if (VEH.heliDown) vehicle.y = Math.max(0.35, vehicle.y - upRate * dt);
    // posisi heli mengikuti player (x,z) + ketinggian y
    V.grp.position.set(player.x, vehicle.y, player.z);
    V.grp.rotation.y = player.yaw + Math.PI;
    vehicle.flying = vehicle.y > 2;
  } else if (vehicle.type === 'bike') {
    // roda berputar saat bergerak (sumbu X karena roda di bidang YZ)
    if (player.moving) {
      const spin = dt * 12;
      V.wheels[0].rotation.x -= spin;
      V.wheels[1].rotation.x -= spin;
    }
    V.grp.position.set(player.x, 0, player.z);
    V.grp.rotation.y = player.yaw + Math.PI;
  } else if (vehicle.type === 'drone') {
    // rotor berputar kencang
    for (const r of V.rotors) r.rotation.y += dt * 30;
    // kontrol naik/turun (pakai tombol heli)
    const upRate = 10;
    if (VEH.heliUp) vehicle.y = Math.min(50, vehicle.y + upRate * dt);
    if (VEH.heliDown) vehicle.y = Math.max(1, vehicle.y - upRate * dt);
    // FISIKA: akselerasi halus (velocity lerp ke target dari joystick)
    if (!vehicle.vx) { vehicle.vx = 0; vehicle.vz = 0; }
    const targetVx = (vehicle._tx || 0), targetVz = (vehicle._tz || 0);
    const ak = Math.min(1, dt * 4); // akselerasi
    vehicle.vx += (targetVx - vehicle.vx) * ak;
    vehicle.vz += (targetVz - vehicle.vz) * ak;
    // drone bergerak berdasarkan velocity (fisika), bukan teleport ke player
    let nx = V.grp.position.x + vehicle.vx * dt;
    let nz = V.grp.position.z + vehicle.vz * dt;
    // batas dunia
    const WL = 320;
    nx = Math.max(-WL, Math.min(WL, nx));
    nz = Math.max(-WL, Math.min(WL, nz));
    // hover bob (naik-turun halus)
    const bob = Math.sin(performance.now() * 0.003) * 0.15;
    V.grp.position.set(nx, vehicle.y + bob, nz);
    V.grp.rotation.y = player.yaw + Math.PI;
    // TILT: miring ke depan saat maju, miring samping saat belok (fisika drone)
    const speed = Math.hypot(vehicle.vx, vehicle.vz);
    const tiltX = Math.min(0.35, speed * 0.03); // pitch forward
    // yaw rate untuk roll
    if (!vehicle._lastYaw) vehicle._lastYaw = player.yaw;
    let yawRate = player.yaw - vehicle._lastYaw;
    while (yawRate > Math.PI) yawRate -= Math.PI * 2;
    while (yawRate < -Math.PI) yawRate += Math.PI * 2;
    vehicle._lastYaw = player.yaw;
    const tiltZ = Math.max(-0.3, Math.min(0.3, -yawRate * 8)); // roll saat belok
    // smooth tilt
    const tk = Math.min(1, dt * 8);
    V.grp.rotation.x += (tiltX - V.grp.rotation.x) * tk;
    V.grp.rotation.z += (tiltZ - V.grp.rotation.z) * tk;
    // pemain tetap di posko (tidak ikut drone), kamera follow drone
    vehicle.flying = vehicle.y > 1.5;
  }
}
// kecepatan kendaraan
function vehicleSpeed(base) {
  if (!vehicle) return base;
  if (vehicle.type === 'heli') return base * 2.2; // heli lebih cepat
  if (vehicle.type === 'bike') return base * 1.8; // sepeda 1.8x
  if (vehicle.type === 'drone') return base * 2.5; // drone 2.5x, paling lincah
  return base;
}

// ---------- Net ----------
const net = createNet({
  onPlayers: syncPlayers,
  onPos: (m) => {
    const r = remotes.get(m.id);
    if (r) { r.tx = m.x; r.tz = m.z; r.ty = m.y || 0; r.tyaw = m.yaw; }
  },
  onVoiceSignal: (m) => voice.handleSignal(m),
  onChat: (m) => {
    addChatMsg(m.name, m.color, m.msg);
    const r = remotes.get(m.id);
    if (r) r.grp.userData.setBubble(m.msg);
  },
  onCount: (n) => { const b = $('online').querySelector('b'); if (b) b.textContent = n; },
  onQuiz: (m) => {
    // mabar quiz: tampilkan aktivitas pemain lain
    if (m.t === 'question') {
      toast(m.user + ' lagi quiz: ' + String(m.q || '').slice(0, 60));
    } else if (m.t === 'answer') {
      toast(m.user + ' jawab "' + String(m.opt || '').slice(0, 30) + '" — ' + (m.ok ? 'BENAR!' : 'kurang tepat'));
    }
  },
  onStatus: (ok) => {
    const dot = document.querySelector('#online i');
    if (dot) { dot.style.background = ok ? '#2dd4a7' : '#ff5b5b'; dot.style.boxShadow = ok ? '0 0 8px #2dd4a7' : '0 0 8px #ff5b5b'; }
    toast(ok ? 'Terhubung! Selamat mabar mo' : 'Mode offline — main sendiri dulu ya');
    if (!ok) voice.leave();
  },
});

const voice = createVoice({
  net,
  myId: () => net.myInfo().id,
  getRemotes: () => [...remotes.entries()].map(([id, r]) => ({ id, voice: !!r.voice })),
  onConnChange: renderMic,
});

function syncPlayers(list) {
  const seen = new Set();
  const MAXR = 24;
  for (const p of list.slice(0, MAXR)) {
    seen.add(p.id);
    let r = remotes.get(p.id);
    if (!r) {
      // posisi awal: spawn default; posisi real menyusul via broadcast 'pos'
      const sx = 0, sz = 175;
      const grp = world.createAvatar(p.name, p.color);
      grp.position.set(sx, 0, sz);
      world.scene.add(grp);
      const owlMesh = grp.userData.owl;
      owlMesh.userData.playerName = p.name;
      world.clickables.push(owlMesh);
      r = { grp, x: sx, z: sz, y: 0, yaw: 0, tx: sx, tz: sz, ty: 0, tyaw: 0, name: p.name, voice: !!p.voice };
      remotes.set(p.id, r);
      if (!knownIds.has(p.id)) {
        knownIds.add(p.id);
        addChatMsg('', '', `${p.name} bergabung ke dunia`, true);
      }
    }
    r.voice = !!p.voice;
  }
  for (const [id, r] of remotes) {
    if (!seen.has(id)) {
      const idx = world.clickables.indexOf(r.grp.userData.owl);
      if (idx >= 0) world.clickables.splice(idx, 1);
      world.scene.remove(r.grp);
      remotes.delete(id);
      voice.removePeer(id);
      addChatMsg('', '', `${r.name} keluar dari dunia`, true);
    }
  }
  voice.syncRemotes();
}

// ---------- Chat UI ----------
let unread = 0;
function addChatMsg(name, color, msg, sys) {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  if (sys) div.innerHTML = `<span class="sys">${msg.replace(/</g, '&lt;')}</span>`;
  else div.innerHTML = `<b style="color:${color}">${name.replace(/</g, '&lt;')}</b>${msg.replace(/</g, '&lt;')}`;
  log.appendChild(div);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  if ($('chat-panel').classList.contains('hidden') && !sys) {
    unread++;
    const bd = $('chat-badge');
    bd.textContent = unread > 9 ? '9+' : unread;
    bd.classList.remove('hidden');
  }
}
function openChat() {
  $('chat-panel').classList.remove('hidden');
  unread = 0;
  $('chat-badge').classList.add('hidden');
  setTimeout(() => $('chat-input').focus(), 100);
}
$('chat-btn').addEventListener('click', () => {
  $('chat-panel').classList.contains('hidden') ? openChat() : $('chat-panel').classList.add('hidden');
});
$('lift-btn').addEventListener('click', rideLift);
// --- Kontrol kendaraan ---
$('vehicle-exit').addEventListener('click', exitVehicle);
$('board-btn').addEventListener('click', () => {
  if (!boardTarget) return;
  // teropong -> masuk mode zoom (bukan kendaraan)
  if (boardTarget.bid.indexOf('telescope-') === 0) {
    hideBoardBtn();
    enterTelescope();
    return;
  }
  boardVehicle(boardTarget.bid);
});
const bindHold = (id, on, off) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); off(); }, { passive: false });
  el.addEventListener('touchcancel', () => off());
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
};
bindHold('heli-up', () => VEH.heliUp = true, () => VEH.heliUp = false);
bindHold('heli-down', () => VEH.heliDown = true, () => VEH.heliDown = false);
// keyboard: R naik, F turun saat naik heli
addEventListener('keydown', (e) => {
  if (vehicle && vehicle.type === 'heli') {
    if (e.key === 'r' || e.key === 'R') VEH.heliUp = true;
    if (e.key === 'f' || e.key === 'F') VEH.heliDown = true;
    if (e.key === 'x' || e.key === 'X') exitVehicle();
  } else if (vehicle && (e.key === 'x' || e.key === 'X')) exitVehicle();
});
addEventListener('keyup', (e) => {
  if (e.key === 'r' || e.key === 'R') VEH.heliUp = false;
  if (e.key === 'f' || e.key === 'F') VEH.heliDown = false;
});
$('chat-close').addEventListener('click', () => $('chat-panel').classList.add('hidden'));
$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('chat-input');
  const text = inp.value.trim().slice(0, 120);
  if (!text) return;
  inp.value = '';
  if (net.online && net.sendChat(text)) {
    addChatMsg(myName, myColor, text);
    if (myAvatar) myAvatar.userData.setBubble(text);
  } else {
    addChatMsg('', '', 'Belum terhubung — pesan tidak terkirim', true);
  }
  inp.blur();
});

// ---------- Bottom sheet ----------
function showSheet(b) {
  $('sheet-accent').style.background = b.color;
  $('sheet-name').textContent = b.name;
  $('sheet-desc').textContent = b.desc;
  const visit = $('sheet-visit'), soon = $('sheet-soon');
  if (b.url) { visit.href = b.url; visit.classList.remove('hidden'); soon.classList.add('hidden'); }
  else { visit.classList.add('hidden'); soon.classList.remove('hidden'); }
  $('sheet').classList.remove('hidden');
}
function hideSheet() { $('sheet').classList.add('hidden'); }

// ---------- Mode Teropong (zoom kamera) ----------
let telescopeActive = false, savedFov = 62;
function enterTelescope() {
  if (telescopeActive) return;
  telescopeActive = true;
  savedFov = camera.fov;
  camera.fov = 14; // zoom jauh
  camera.updateProjectionMatrix();
  // posisikan kamera di mata pemain (bukan di belakang), agar tidak ketutup karakter
  camera.position.set(player.x, player.y + 1.6, player.z);
  // sembunyikan avatar sendiri agar tidak menghalangi pandangan
  if (myAvatar) myAvatar.visible = false;
  // tampilkan tombol keluar
  let b = $('telescope-exit');
  if (!b) {
    b = document.createElement('button');
    b.id = 'telescope-exit';
    b.innerHTML = '<span>Keluar Teropong</span>';
    b.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:70;background:#0b1526;border:1px solid #39FF14;color:#39FF14;padding:10px 22px;border-radius:999px;font-weight:700;';
    b.addEventListener('click', exitTelescope);
    document.body.appendChild(b);
  }
  b.style.display = 'block';
  toast('Mode teropong — geser layar untuk melihat jauh');
}
function exitTelescope() {
  if (!telescopeActive) return;
  telescopeActive = false;
  camera.fov = savedFov;
  camera.updateProjectionMatrix();
  // tampilkan lagi avatar
  if (myAvatar && !vehicle) myAvatar.visible = true;
  const b = $('telescope-exit');
  if (b) b.style.display = 'none';
}
$('sheet-close').addEventListener('click', hideSheet);

// ---------- Interaksi: ketuk gedung / pemain ----------
const raycaster = new THREE.Raycaster();
function tapOpen(clientX, clientY) {
  if (!world || !world.clickables.length) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera({
    x: ((clientX - r.left) / r.width) * 2 - 1,
    y: -((clientY - r.top) / r.height) * 2 + 1,
  }, camera);
  const hits = raycaster.intersectObjects(world.clickables, false);
  if (!hits.length) return;
  const u = hits[0].object.userData;
  if (u.playerName) { toast(u.playerName + ' sedang mabar juga!'); return; }
  // Kendaraan: helikopter, sepeda & drone -> naik langsung
  if (u.bid === 'heli-ride' || (u.bid && (u.bid.indexOf('bike-') === 0 || u.bid.indexOf('drone-') === 0))) {
    hideSheet();
    boardVehicle(u.bid);
    return;
  }
  // Pusat Belajar & Titik Belajar My Nahwu -> buka panel quiz (bukan sheet biasa)
  if (u.bid === 'pusat-belajar' || (u.bid && u.bid.indexOf('titik-belajar') === 0)) {
    hideSheet();
    if (typeof QuizUI !== 'undefined') QuizUI.open();
    else toast('Modul quiz belum termuat.');
    return;
  }
  // Plang quiz taman -> buka quiz
  if (u.bid && u.bid.indexOf('quiz-taman-') === 0) {
    hideSheet();
    if (typeof QuizUI !== 'undefined') QuizUI.open();
    else toast('Modul quiz belum termuat.');
    return;
  }
  // Teropong -> mode zoom kamera
  if (u.bid && u.bid.indexOf('telescope-') === 0) {
    hideSheet();
    enterTelescope();
    return;
  }
  const b = world.buildings.find((x) => x.id === u.bid);
  if (b) showSheet(b);
}

// ---------- Input ----------
function setupInput() {
  // joystick
  const z = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  z.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.active = true; joy.id = t.identifier;
    base.classList.add('on');
    moveJoy(t);
  }, { passive: false });
  const moveJoy = (t) => {
    const bx = base.getBoundingClientRect();
    let dx = t.clientX - (bx.left + bx.width / 2), dy = t.clientY - (bx.top + bx.height / 2);
    const m = Math.hypot(dx, dy), max = 44;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    joy.x = dx / max; joy.y = dy / max;
    setKnob(dx, dy);
  };
  z.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joy.id) moveJoy(t);
  }, { passive: false });
  const joyEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joy.id) {
      joy.active = false; joy.id = null; joy.x = joy.y = 0;
      setKnob(0, 0); base.classList.remove('on');
    }
  };
  z.addEventListener('touchend', joyEnd); z.addEventListener('touchcancel', joyEnd);

  // kamera orbit: drag area kanan (canvas); ketuk cepat = buka info
  const tap = { id: null, x: 0, y: 0, t: 0 };
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
    tap.id = t.identifier; tap.x = t.clientX; tap.y = t.clientY; tap.t = performance.now();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === look.id) {
      orbit(t.clientX - look.lx, t.clientY - look.ly);
      look.lx = t.clientX; look.ly = t.clientY;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === look.id) look.id = null;
      if (t.identifier === tap.id) {
        const moved = Math.hypot(t.clientX - tap.x, t.clientY - tap.y);
        if (moved < 14 && performance.now() - tap.t < 400) tapOpen(t.clientX, t.clientY);
        tap.id = null;
      }
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // keyboard
  addEventListener('keydown', (e) => {
    if (document.activeElement === $('chat-input') || document.activeElement === $('name-input')) return;
    keys[e.key.toLowerCase()] = true;
    // teleport cepat ke zona (1-4 zona, 5 galeri, 0 spawn)
    if (started && player) {
      const spots = {
        '1': { x: -95, z: -95, n: 'Zona EDUKASI' },
        '2': { x: 95, z: -95, n: 'Zona WEB' },
        '3': { x: -95, z: 95, n: 'Zona TOOLS' },
        '4': { x: 95, z: 95, n: 'Zona AI' },
        '5': { x: 0, z: 58, n: 'Galeri AMOGENZ' },
        '0': { x: 0, z: 175, n: 'Titik awal' },
      };
      const s = spots[e.key];
      if (s) {
        const [nx, nz] = collide(s.x, s.z, 0.5, player.y);
        player.x = nx; player.z = nz; player.y = 0;
        toast('Teleport ke ' + s.n);
      }
    }
  });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // desktop: drag mouse orbit, klik = pointer lock / tembak tengah
  let dragging = false, mx = 0, my = 0;
  if (!isTouch) {
    canvas.addEventListener('mousedown', (e) => { dragging = true; mx = e.clientX; my = e.clientY; });
    addEventListener('mousemove', (e) => {
      if (!dragging) return;
      orbit(e.clientX - mx, e.clientY - my);
      mx = e.clientX; my = e.clientY;
    });
    addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      tapOpen(innerWidth / 2, innerHeight / 2);
    });
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (locked && started) orbit(e.movementX, e.movementY);
    });
  }
}
let locked = false;

function orbit(dx, dy) {
  cam.yaw -= dx * 0.0052;
  cam.pitch = Math.min(1.15, Math.max(0.06, cam.pitch + dy * 0.004));
}

// ---------- Tombol HUD ----------
$('help-btn').addEventListener('click', () => $('help').classList.remove('hidden'));
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
$('orient-btn').addEventListener('click', async () => {
  try {
    if (screen.orientation.type.startsWith('landscape')) {
      screen.orientation.unlock();
      toast('Kunci orientasi dilepas');
    } else {
      await screen.orientation.lock('landscape');
      toast('Terkunci mode landscape');
    }
  } catch (e) { toast('Putar HP ke landscape manual ya'); }
});
const micBtn = $('mic-btn');
function renderMic() {
  if (!micBtn) return;
  const on = voice.micOn;
  const n = voice.connectedCount();
  micBtn.classList.toggle('on', on);
  micBtn.classList.toggle('linked', n > 0);
  micBtn.title = !on ? 'Mic mati — ketuk untuk bicara (kamu tetap dengar)' : (n > 0 ? `Mic nyala — terdengar ${n} pemain` : 'Mic nyala — menghubungkan…');
}
// tiap sentuhan user: buka blokir autoplay audio di HP
addEventListener('pointerdown', () => { try { voice.unlockAudio(); } catch (e) {} }, { passive: true });
// tombol speaker: dengar / bisu suara pemain lain (terpisah dari mic)
const spkBtn = $('spk-btn');
if (spkBtn) spkBtn.addEventListener('click', () => {
  const on = !voice.speakerOn;
  voice.setSpeaker(on);
  spkBtn.classList.toggle('on', on);
  toast(on ? 'Suara pemain lain nyala' : 'Suara pemain lain dibisukan');
});
if (micBtn) micBtn.addEventListener('click', async () => {
  if (voice.micOn) { voice.disableMic(); renderMic(); toast('Mic mati — kamu tetap dengar yang lain'); return; }
  micBtn.classList.add('busy');
  const r = await voice.enableMic();
  micBtn.classList.remove('busy');
  renderMic();
  if (!r.ok) toast(r.error === 'mic' ? 'Izin mic ditolak — cek pengaturan browser' : 'Belum terhubung — mic tidak aktif');
  else toast('Mic nyala — suaramu kedengeran!');
});
$('fs-btn').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { toast('Browser tidak mendukung layar penuh'); }
});
document.addEventListener('fullscreenchange', onResize);

// ---------- Tabrakan lingkaran vs AABB (sadar ketinggian: lewati collider di luar y) ----------
function collide(x, z, r, y) {
  for (const c of world.colliders) {
    if (y !== undefined && (y < c.y0 || y > c.y1)) continue;
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        x += dx * push; z += dz * push;
      } else {
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  const lim = world.worldLimit;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  return [x, z];
}

// ---------- Minimap ----------
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 140, K = S / 720;
  const X = (x) => 70 + x * K, Y = (z) => 70 + z * K;
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = 'rgba(10,25,15,0.85)';
  mm.beginPath(); mm.arc(70, 70, 69, 0, Math.PI * 2); mm.fill();
  mm.save();
  mm.beginPath(); mm.arc(70, 70, 69, 0, Math.PI * 2); mm.clip();
  // jalan
  mm.strokeStyle = 'rgba(234,223,195,0.5)'; mm.lineCap = 'round';
  mm.lineWidth = 9 * K;
  mm.beginPath(); mm.moveTo(X(0), Y(-150)); mm.lineTo(X(0), Y(177)); mm.stroke();
  mm.beginPath(); mm.moveTo(X(-165), Y(0)); mm.lineTo(X(165), Y(0)); mm.stroke();
  // danau
  mm.fillStyle = 'rgba(63,167,214,0.8)';
  mm.beginPath(); mm.arc(X(-52), Y(28), 15.5 * K, 0, Math.PI * 2); mm.fill();
  // HQ (di ujung belakang)
  mm.fillStyle = '#39ff14';
  mm.beginPath(); mm.arc(X(0), Y(-180), 4, 0, Math.PI * 2); mm.fill();
  // paviliun
  for (const b of world.buildings) {
    if (b.id === 'hq') continue;
    // posko drone: marker oranye lebih besar
    if (b.id && b.id.indexOf('drone-') === 0) {
      mm.fillStyle = '#ff9f2e';
      mm.beginPath(); mm.arc(X(b.doorPos.x), Y(b.doorPos.z), 3.5, 0, Math.PI * 2); mm.fill();
      mm.strokeStyle = '#fff'; mm.lineWidth = 1;
      mm.stroke();
      continue;
    }
    mm.fillStyle = b.color;
    mm.beginPath(); mm.arc(X(b.doorPos.x), Y(b.doorPos.z), 2.2, 0, Math.PI * 2); mm.fill();
  }
  // pemain lain
  mm.fillStyle = '#ffffff';
  for (const [, r] of remotes) {
    mm.beginPath(); mm.arc(X(r.x), Y(r.z), 2, 0, Math.PI * 2); mm.fill();
  }
  // diriku
  mm.fillStyle = '#2dd4a7';
  mm.beginPath(); mm.arc(X(player.x), Y(player.z), 3, 0, Math.PI * 2); mm.fill();
  mm.strokeStyle = '#2dd4a7'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(X(player.x), Y(player.z));
  mm.lineTo(X(player.x - Math.sin(player.yaw) * 10), Y(player.z - Math.cos(player.yaw) * 10)); mm.stroke();
  mm.restore();
}

// ---------- Gerak pemain + kamera third-person ----------
const SPEED = 7.5, RADIUS = 0.5;
let liftAnim = null; // {t0, dur, fx, fz, fy, tx, tz, ty}
function stepPlayer(dt) {
  // animasi lift: meluncur mulus ke lantai tujuan
  if (liftAnim) {
    const t = Math.min(1, (performance.now() - liftAnim.t0) / liftAnim.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    player.x = liftAnim.fx + (liftAnim.tx - liftAnim.fx) * e;
    player.z = liftAnim.fz + (liftAnim.tz - liftAnim.fz) * e;
    player.y = liftAnim.fy + (liftAnim.ty - liftAnim.fy) * e;
    player.moving = false;
    if (t >= 1) { liftAnim = null; hideLiftBtn(); }
  } else {
  let ix = 0, iy = 0;
  if (joy.active) { ix = joy.x; iy = -joy.y; }
  if (keys['w'] || keys['arrowup']) iy += 1;
  if (keys['s'] || keys['arrowdown']) iy -= 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  const m = Math.hypot(ix, iy);
  player.moving = m > 0.12;
  if (vehicle && vehicle.type === 'drone' && !player.moving) {
    vehicle._tx = 0; vehicle._tz = 0;
  }
  if (player.moving) {
    if (m > 1) { ix /= m; iy /= m; }
    const sprinting = keys['shift'] || (joy.active && Math.hypot(joy.x, joy.y) > 0.92);
    const spd = vehicleSpeed(SPEED * (sprinting ? 1.9 : 1));
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = -fz, rz = fx;
    const mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    player.yaw = Math.atan2(-mx, -mz);
    if (vehicle && vehicle.type === 'drone') {
      vehicle._tx = mx * spd;
      vehicle._tz = mz * spd;
    } else {
      let nx = player.x + mx * spd * dt, nz = player.z + mz * spd * dt;
      const flyingHigh = vehicle && vehicle.type === 'heli' && vehicle.y > 4;
      if (flyingHigh) {
        const WL = 320;
        nx = Math.max(-WL, Math.min(WL, nx));
        nz = Math.max(-WL, Math.min(WL, nz));
      } else {
        [nx, nz] = collide(nx, nz, RADIUS, player.y);
      }
      player.x = nx; player.z = nz;
    }
  }
  } // tutup else (liftAnim) — blok gerak normal
  // update kendaraan (rotor, roda, posisi 3D)
  updateVehicle(dt);
  // tombol NAIK muncul saat dekat kendaraan (throttled di dalam fungsi)
  checkVehicleProximity(performance.now());
  // saat naik heli, player.y mengikuti ketinggian heli
  if (vehicle && vehicle.type === 'heli') player.y = vehicle.y;
  // cek lift pad terdekat
  checkLiftPad();
  // avatar sendiri (animasi articulated via world.updateAvatar)
  if (myAvatar) {
    if (vehicle && vehicle.type === 'bike') {
      // duduk di sadel: kaki di pedal (y~0.3), badan menempel sadel
      // avatar origin di kaki, jadi y=0.3 agar terlihat duduk bukan berdiri di sadel
      const sx = player.x + 0.35 * Math.sin(player.yaw);
      const sz = player.z + 0.35 * Math.cos(player.yaw);
      myAvatar.position.set(sx, 0.32, sz);
    } else if (vehicle && vehicle.type === 'heli') {
      // di dalam helikopter: sedikit di atas kursi
      myAvatar.position.set(player.x, vehicle.y + 0.6, player.z);
    } else if (vehicle && vehicle.type === 'drone') {
      // kendalikan drone dari darat: avatar tetap di posko (sembunyikan agar tidak bingung)
      myAvatar.visible = false;
    } else {
      myAvatar.position.set(player.x, player.y, player.z);
    }
    const targetRy = player.yaw + Math.PI;
    let d = targetRy - myAvatar.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    myAvatar.rotation.y += d * Math.min(1, dt * 12);
    world.updateAvatar(myAvatar, dt, player.moving);
    if (world.setPlayerPos) world.setPlayerPos(player.x, player.z);
  }
  // kamera follow
  if (telescopeActive) {
    // mode teropong: kamera DIAM di posisi saat ini, hanya rotasi mengikuti input user
    // (tidak follow karakter, agar bisa lihat jarak jauh)
    const lookDist = 100;
    const lx = camera.position.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * lookDist;
    const lz = camera.position.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * lookDist;
    const ly = camera.position.y - Math.sin(cam.pitch) * lookDist;
    camera.lookAt(lx, ly, lz);
  } else if (vehicle && vehicle.type === 'drone') {
    // mode drone: chase-cam halus di belakang-atas drone
    const dp = vehicle.ref.grp.position;
    const dist = 9;
    const tx = dp.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    const tz = dp.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    const ty = dp.y + 2.5 + Math.sin(cam.pitch) * dist;
    // smooth lerp agar nyaman
    const k = Math.min(1, dt * 6);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.lookAt(dp.x, dp.y + 0.5, dp.z);
  } else {
    const cx = player.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cz = player.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    let cy = player.y + 1.6 + Math.sin(cam.pitch) * cam.dist;
    let [qx, qz] = collide(cx, cz, 0.45, player.y);
    cy = Math.max(player.y + 1.1, cy);
    camera.position.set(qx, cy, qz);
    camera.lookAt(player.x, player.y + 1.5, player.z);
  }
}

// ---------- Lift gedung HQ ----------
let activeLift = null;
function checkLiftPad() {
  if (liftAnim || !world || !world.lifts) { hideLiftBtn(); activeLift = null; return; }
  let best = null, bd = 1e9;
  for (const L of world.lifts) {
    if (Math.abs(player.y - L.y) > 3) continue;
    const d = Math.hypot(player.x - L.x, player.z - L.z);
    if (d < L.r && d < bd) { bd = d; best = L; }
  }
  if (best) {
    if (activeLift !== best) { activeLift = best; showLiftBtn(best.label); }
  } else { activeLift = null; hideLiftBtn(); }
}
function showLiftBtn(label) {
  const b = $('lift-btn');
  b.querySelector('span').textContent = label;
  b.classList.remove('hidden');
}
function hideLiftBtn() { $('lift-btn').classList.add('hidden'); }
function rideLift() {
  if (!activeLift || liftAnim) return;
  const L = activeLift;
  hideLiftBtn();
  liftAnim = {
    t0: performance.now(), dur: 1400,
    fx: player.x, fz: player.z, fy: player.y,
    tx: L.toX, tz: L.toZ, ty: L.toY,
  };
  toast(L.label + '…');
}

function stepRemotes(dt) {
  const k = 1 - Math.exp(-9 * dt);
  for (const [, r] of remotes) {
    r.x += (r.tx - r.x) * k;
    r.z += (r.tz - r.z) * k;
    r.y += ((r.ty || 0) - r.y) * k;
    let d = (r.tyaw + Math.PI) - r.grp.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    r.grp.rotation.y += d * Math.min(1, dt * 10);
    const moving = Math.hypot(r.tx - r.x, r.tz - r.z) > 0.05;
    r.grp.position.set(r.x, r.y, r.z);
    world.updateAvatar(r.grp, dt, moving);
  }
}

// ---------- Boot ----------
const LOAD_TIPS = [
  '💡 Tips: ketuk gedung untuk info & tombol kunjungi',
  '🏢 Tips: gedung HQ bisa dimasuki — naik lift sampai puncak!',
  '🗿 Tips: monumen logo AMOGENZ 3D ada di depan HQ',
  '🏛️ Tips: kunjungi Galeri AMOGENZ buat kenal komunitas',
  '🎙️ Tips: voice chat otomatis dengar — mic buat bicara',
  '⌨️ Tips: tekan 1-4 teleport ke zona, 5 galeri, 0 spawn',
];
let tipTimer = null;
function startTips() {
  let i = 0;
  const el = $('load-tip');
  if (!el) return;
  tipTimer = setInterval(() => {
    i = (i + 1) % LOAD_TIPS.length;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = LOAD_TIPS[i]; el.style.opacity = '1'; }, 300);
  }, 3500);
}
function stopTips() { if (tipTimer) { clearInterval(tipTimer); tipTimer = null; } }
(async function boot() {
  setupInput();
  startTips();
  const setP = (p, t) => { $('load-fill').style.width = p + '%'; const pc = $('load-pct'); if (pc) pc.textContent = Math.round(p) + '%'; if (t) $('load-text').textContent = t; };
  try {
    world = await buildWorld(setP);
  } catch (e) {
    setP(100, 'Gagal memuat: ' + e.message);
    return;
  }
  setP(100, 'Dunia siap dijelajahi!');
  stopTips();
  const tipEl = $('load-tip');
  if (tipEl) tipEl.textContent = 'Selamat datang di AMOGENZ LAB!';
  const btn = $('start-btn');
  btn.disabled = false;
  btn.innerHTML = '<span>Mulai Jelajah</span>';
  btn.addEventListener('click', async () => {
    if (started) return;
    started = true;
    // nama + warna
    const raw = $('name-input').value.trim().slice(0, 16) || ('Penjelajah-' + Math.floor(1000 + Math.random() * 9000));
    myName = raw.replace(/[<>&"]/g, '');
    const palette = ['#2dd4a7', '#3b9dff', '#ff9f2e', '#b06eff', '#ff6b8a', '#ffd23e'];
    myColor = palette[myName.length % palette.length];
    $('loading').classList.add('hidden');
    if (!sessionStorage.getItem('amo3d-help')) {
      $('help').classList.remove('hidden');
      sessionStorage.setItem('amo3d-help', '1');
    }
    // avatar sendiri
    myAvatar = world.createAvatar(myName, myColor);
    myAvatar.position.set(player.x, 0, player.z);
    world.scene.add(myAvatar);
    cam.yaw = player.yaw;
    toast('Memuat dunia…');
    // multiplayer
    player.x = world.spawn.x; player.z = world.spawn.z; player.yaw = world.spawn.yaw;
    myAvatar.position.set(player.x, 0, player.z);
    try {
      const ok = await net.start({ name: myName, color: myColor });
      if (!ok) toast('Mode offline — main sendiri dulu ya');
      else {
        voice.join(); // otomatis ikut voice chat (mendengar), mic tetap off
        // hubungkan quiz ke net untuk mabar
        if (typeof QuizUI !== 'undefined' && QuizUI.setNet) QuizUI.setNet(net, () => myName);
      }
    } catch (e) { toast('Mode offline — main sendiri dulu ya'); }
    addChatMsg('', '', 'Selamat datang di AMOGENZ 3D World, ' + myName + '!', true);
    requestAnimationFrame(loop);
  }, { once: true });
})();

let lastT = performance.now();
window._frames = 0;
function loop(now) {
  window._frames++;
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  world.update();
  if (started) {
    stepPlayer(dt);
    stepRemotes(dt);
    world.updateInteriors(player.x, player.z);
    net.update(now, { x: player.x, z: player.z, y: player.y, yaw: player.yaw, moving: player.moving });
    drawMinimap();
  }
  renderer.render(world.scene, camera);
}

// ---------- Debug ----------
window.__AMO3D = {
  pos: () => ({ x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), yaw: +player.yaw.toFixed(2) }),
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  buildings: () => (world ? world.buildings.map((b) => ({
    id: b.id, name: b.name, zone: b.zone,
    door: [+b.doorPos.x.toFixed(1), +b.doorPos.z.toFixed(1)],
  })) : []),
  teleport: (x, z, yaw) => {
    player.x = x; player.z = z; player.y = 0;
    if (yaw !== undefined) { player.yaw = yaw; cam.yaw = yaw; }
    if (myAvatar) myAvatar.position.set(x, 0, z);
  },
  setPitch: (p) => { cam.pitch = p; },
  setY: (y) => { player.y = y; if (myAvatar) myAvatar.position.y = y; },
  setY: (y) => { player.y = y; if (myAvatar) myAvatar.position.y = y; },
  tapBadge: (bid) => {
    const o = world.clickables.find((mm2) => mm2.userData.bid === bid);
    if (!o) return 'no-clickable';
    const v = new THREE.Vector3();
    o.getWorldPosition(v); v.project(camera);
    if (v.z > 1) return 'behind-camera';
    const r = renderer.domElement.getBoundingClientRect();
    tapOpen(r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height);
    return 'tapped';
  },
  players: () => [...remotes.keys()],
  chatCount: () => $('chat-log').children.length,
  sheetVisible: () => !$('sheet').classList.contains('hidden'),
  sheetName: () => $('sheet-name').textContent,
  myName: () => myName,
  dbg: () => ({ started, keysW: !!keys['w'], px: player.x, pz: player.z, camYaw: cam.yaw }),
  netOnline: () => net.online,
  voicePeers: () => voice.peerCount(),
  voiceLinked: () => voice.connectedCount(),
  voiceOn: () => voice.micOn,
  voiceListening: () => voice.listening,
};
