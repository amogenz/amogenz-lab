// js/voice.js — Voice chat mesh via WebRTC, signaling lewat Supabase broadcast (v3)
// LOGIKA GAME (bukan telepon):
// - Semua pemain OTOMATIS mendengar (speaker selalu nyala) begitu masuk dunia.
// - Tombol mic hanya mengatur MENGIRIM suara (bicara). Mic off = tetap dengar orang lain.
// - Topologi mesh: tiap pasangan pemain punya 1 RTCPeerConnection.
// - Anti-glare: hanya pemilik id terkecil yang mengirim offer.
// - STUN publik Google (gratis). Di NAT simetris tertentu suara bisa gagal tersambung.

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export function createVoice(deps) {
  // deps: { net, myId(), getRemotes() -> [{id}], onConnChange() }
  let stream = null;       // local mic stream (null jika mic off / belum diizinkan)
  let micOn = false;       // apakah saya sedang mengirim suara
  let listening = false;   // apakah saya ikut voice chat (auto-true saat join)
  let speakerOn = true;    // apakah saya mendengar suara orang lain
  const pcs = new Map();   // remoteId -> { pc, audio, connected, hasLocalTrack }

  function ensureAudioHost() {
    let host = document.getElementById('voice-audio-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'voice-audio-host';
      host.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;bottom:0;left:0;';
      document.body.appendChild(host);
    }
    return host;
  }

  function attachAudio(remoteId, s) {
    const p = pcs.get(remoteId);
    if (!p) return;
    if (!p.audio) {
      const a = document.createElement('audio');
      a.autoplay = true;
      a.playsInline = true;
      a.volume = 1.0;
      a.muted = !speakerOn;
      ensureAudioHost().appendChild(a);
      p.audio = a;
    }
    p.audio.srcObject = s;
    p.audio.play().catch(() => {});
  }

  function setSpeaker(on) {
    speakerOn = !!on;
    for (const [, q] of pcs) {
      if (q.audio) q.audio.muted = !speakerOn;
    }
  }

  function unlockAudio() {
    for (const [, p] of pcs) {
      if (p.audio && p.audio.srcObject && p.audio.paused) {
        p.audio.play().catch(() => {});
      }
    }
  }

  function setConn(remoteId, connected) {
    const p = pcs.get(remoteId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    deps.onConnChange && deps.onConnChange();
  }

  function newPC(remoteId) {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    let hasLocalTrack = false;
    if (stream && micOn) {
      stream.getTracks().forEach((t) => { pc.addTrack(t, stream); });
      hasLocalTrack = true;
    } else {
      // mic off: tetap minta terima audio (recvonly) agar bisa MENDENGAR tanpa harus bicara
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) {}
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) deps.net.send('voice-signal', { from: deps.myId(), to: remoteId, type: 'ice', data: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => attachAudio(remoteId, e.streams[0]);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      setConn(remoteId, st === 'connected');
      if (st === 'failed' || st === 'closed') {
        setTimeout(() => {
          const q = pcs.get(remoteId);
          if (q && q.pc === pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
            removePeer(remoteId);
            deps.onConnChange && deps.onConnChange();
          }
        }, 4000);
      }
    };
    const entry = { pc, audio: null, connected: false, hasLocalTrack };
    pcs.set(remoteId, entry);
    deps.onConnChange && deps.onConnChange();
    return entry;
  }

  async function offerTo(remoteId) {
    if (pcs.has(remoteId)) return;
    try {
      const { pc } = newPC(remoteId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      deps.net.send('voice-signal', { from: deps.myId(), to: remoteId, type: 'offer', data: offer });
    } catch (e) { removePeer(remoteId); }
  }

  async function handleSignal(m) {
    if (!listening || !m) return;
    try {
      if (m.type === 'offer') {
        let p = pcs.get(m.from);
        if (!p) p = newPC(m.from);
        if (p.pc.signalingState !== 'stable') return;
        await p.pc.setRemoteDescription(new RTCSessionDescription(m.data));
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        deps.net.send('voice-signal', { from: deps.myId(), to: m.from, type: 'answer', data: answer });
      } else if (m.type === 'answer') {
        const p = pcs.get(m.from);
        if (p && p.pc.signalingState === 'have-local-offer') {
          await p.pc.setRemoteDescription(new RTCSessionDescription(m.data));
        }
      } else if (m.type === 'ice') {
        const p = pcs.get(m.from);
        if (p && m.data) {
          try { await p.pc.addIceCandidate(new RTCIceCandidate(m.data)); } catch (e) {}
        }
      } else if (m.type === 'bye') {
        removePeer(m.from);
        deps.onConnChange && deps.onConnChange();
      } else if (m.type === 'need-offer') {
        // peer minta offer ulang (biasanya karena mereka baru nyalakan mic)
        // hanya offerer (id terkecil) yang boleh kirim offer
        if (deps.myId() < m.from) {
          removePeer(m.from);
          offerTo(m.from);
        }
      }
    } catch (e) {}
  }

  function removePeer(id) {
    const p = pcs.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (e) {}
    if (p.audio) {
      try { p.audio.srcObject = null; p.audio.remove(); } catch (e) {}
    }
    pcs.delete(id);
  }

  // Sambungkan ke semua pemain (untuk mendengar). Dipanggil saat daftar pemain berubah.
  function syncRemotes() {
    if (!listening) return;
    const remotes = deps.getRemotes();
    const ids = new Set(remotes.map((r) => r.id));
    for (const r of remotes) {
      if (deps.myId() < r.id && !pcs.has(r.id)) offerTo(r.id);
    }
    for (const id of [...pcs.keys()]) {
      if (!ids.has(id)) removePeer(id);
    }
  }

  // Dipanggil sekali saat masuk dunia: otomatis ikut mendengar.
  function join() {
    if (listening) return;
    listening = true;
    deps.net.setVoice(true); // presence: saya ikut voice (mendengar)
    syncRemotes();
  }

  // Mic ON: minta izin mic, kirim suara ke semua peer (bangun ulang koneksi + track).
  async function enableMic() {
    if (micOn) return { ok: true };
    if (!deps.net.online) return { ok: false, error: 'offline' };
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } else {
        stream.getTracks().forEach((t) => { t.enabled = true; });
      }
    } catch (e) {
      return { ok: false, error: 'mic' };
    }
    micOn = true;
    deps.net.setMic(true);
    // bangun ulang semua PC agar membawa track mic
    for (const id of [...pcs.keys()]) removePeer(id);
    syncRemotes();
    // FIX: untuk peer di mana SAYA bukan offerer (id mereka lebih kecil),
    // minta mereka kirim ulang offer agar renegosiasi terjadi dan suara terkirim
    const myId = deps.myId();
    for (const r of deps.getRemotes()) {
      if (r.id < myId) {
        deps.net.send('voice-signal', { from: myId, to: r.id, type: 'need-offer' });
      }
    }
    deps.onConnChange && deps.onConnChange();
    return { ok: true };
  }

  // Mic OFF: setop kirim suara, tapi TETAP dengar (PC tidak ditutup).
  function disableMic() {
    if (!micOn) return;
    micOn = false;
    if (stream) stream.getTracks().forEach((t) => { t.enabled = false; });
    deps.net.setMic(false);
    deps.onConnChange && deps.onConnChange();
  }

  function leave() {
    listening = false;
    micOn = false;
    try { deps.net.setVoice(false); } catch (e) {}
    for (const r of deps.getRemotes()) {
      deps.net.send('voice-signal', { from: deps.myId(), to: r.id, type: 'bye' });
    }
    for (const id of [...pcs.keys()]) removePeer(id);
    if (stream) { stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); stream = null; }
  }

  return {
    join, enableMic, disableMic, handleSignal, syncRemotes, removePeer, unlockAudio, leave, setSpeaker,
    get micOn() { return micOn; },
    get listening() { return listening; },
    get speakerOn() { return speakerOn; },
    // backward compat
    get enabled() { return micOn; },
    enable: enableMic,
    disable: disableMic,
    peerCount: () => pcs.size,
    connectedCount: () => [...pcs.values()].filter((p) => p.connected).length,
  };
}
