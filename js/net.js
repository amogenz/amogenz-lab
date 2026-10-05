// js/net.js — Multiplayer AMOGENZ 3D World via Supabase Realtime (v2)
// ARSITEKTUR:
// - presence: DAFTAR pemain saja (id, nama, warna, flag voice). Track SEKALI saat join,
//   dan hanya diulang saat flag voice berubah. JANGAN track posisi di sini —
//   Supabase presence rusak (pemain saling tak terlihat) jika di-track >2Hz!
// - broadcast 'pos': posisi/arah tiap pemain, 5Hz. Broadcast tahan rate tinggi.
// - broadcast 'chat-msg': pesan chat teks.
// - broadcast 'voice-signal': signaling WebRTC.
// Tanpa tabel database; butuh koneksi internet. Gagal -> mode offline (single player).

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tufpeldlgzdkojxruzrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZnBlbGRsZ3pka29qeHJ1enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTgxNzgsImV4cCI6MjEwNjI3NDE3OH0.LC3MjMx4O6e2F2qrdlbQMERz5w-5_iWHn2fVXG-cv9A';

const CHANNEL = 'amogenz-3d-world';
const POS_MS = 200;      // broadcast posisi 5Hz — aman untuk broadcast
const HEARTBEAT_MS = 1500;

export function createNet(cbs) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  const myId = 'p_' + Math.random().toString(36).slice(2, 10);
  let channel = null, online = false;
  let lastSent = 0;
  let profile = { name: 'Penjelajah', color: '#2dd4a7' };
  let voiceOn = false;  // ikut voice chat (mendengar)
  let micOn = false;    // mic nyala (bicara)

  function trackPresence() {
    if (!online || !channel) return;
    // presence HANYA untuk keanggotaan — tanpa posisi!
    channel.track({ id: myId, name: profile.name, color: profile.color, voice: voiceOn, mic: micOn }).catch(() => {});
  }

  function emitPlayers() {
    if (!channel) return;
    const state = channel.presenceState();
    const list = [];
    for (const key of Object.keys(state)) {
      if (key === myId) continue;
      const p = state[key][0];
      if (!p) continue;
      list.push({
        id: key,
        name: String(p.name || 'Penjelajah'),
        color: String(p.color || '#2dd4a7'),
        voice: !!p.voice,
        mic: !!p.mic,
      });
    }
    cbs.onPlayers && cbs.onPlayers(list);
    cbs.onCount && cbs.onCount(list.length + 1);
  }

  async function start(myProfile) {
    profile = myProfile;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        online = ok;
        cbs.onStatus && cbs.onStatus(ok);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 12000);
      try {
        channel = supabase.channel(CHANNEL, { config: { presence: { key: myId } } });
        channel.on('presence', { event: 'sync' }, emitPlayers);
        channel.on('presence', { event: 'join' }, emitPlayers);
        channel.on('presence', { event: 'leave' }, emitPlayers);
        channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
          if (!payload || payload.id === myId) return;
          cbs.onPos && cbs.onPos({
            id: payload.id,
            x: +payload.x || 0, z: +payload.z || 0, yaw: +payload.yaw || 0,
          });
        });
        channel.on('broadcast', { event: 'chat-msg' }, ({ payload }) => {
          if (!payload || payload.id === myId) return;
          cbs.onChat && cbs.onChat({
            id: payload.id, name: String(payload.name || 'Penjelajah'),
            color: String(payload.color || '#2dd4a7'), msg: String(payload.msg || '').slice(0, 120),
          });
        });
        channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
          if (!payload || payload.to !== myId) return;
          cbs.onVoiceSignal && cbs.onVoiceSignal(payload);
        });
        channel.on('broadcast', { event: 'quiz-activity' }, ({ payload }) => {
          if (!payload || payload.user === profile.name) return; // abaikan sendiri
          cbs.onQuiz && cbs.onQuiz(payload);
        });
        // subscribe() me-return channel (bukan promise); status lewat callback
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel.track({ id: myId, name: profile.name, color: profile.color, voice: voiceOn, mic: micOn });
              finish(true);
            } catch (e) { finish(false); }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            finish(false);
          }
        });
      } catch (e) {
        finish(false);
      }
    });
  }

  function update(now, s) {
    if (!online || !channel) return;
    const moving = !!s.moving;
    const due = moving ? POS_MS : HEARTBEAT_MS;
    if (now - lastSent < due) return;
    lastSent = now;
    // posisi via BROADCAST (tahan 5Hz), bukan presence!
    channel.send({
      type: 'broadcast', event: 'pos',
      payload: { id: myId, x: +s.x.toFixed(1), z: +s.z.toFixed(1), y: +(s.y || 0).toFixed(1), yaw: +s.yaw.toFixed(2) },
    });
  }

  function sendChat(msg) {
    if (!online || !channel) return false;
    const text = String(msg || '').trim().slice(0, 120);
    if (!text) return false;
    channel.send({ type: 'broadcast', event: 'chat-msg', payload: { id: myId, name: profile.name, color: profile.color, msg: text } });
    return true;
  }

  function myInfo() { return { id: myId, name: profile.name, color: profile.color }; }

  function setVoice(on) {
    voiceOn = !!on;
    trackPresence(); // presence diulang HANYA saat voice berubah (jarang)
  }

  function setMic(on) {
    micOn = !!on;
    trackPresence();
  }

  function send(event, payload) {
    if (!online || !channel) return false;
    channel.send({ type: 'broadcast', event, payload });
    return true;
  }

  return { start, update, sendChat, myInfo, setVoice, setMic, send, get online() { return online; } };
}
