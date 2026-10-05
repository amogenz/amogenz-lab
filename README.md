# AMOGENZ LAB

Dunia 3D open-world AMOGENZ — dijelajahi langsung dari HP.

**Live:** https://3d.amogenz.xyz/

## Struktur
- `index.html` — halaman utama
- `css/style.css` — styling
- `js/main-fixed.js` — entry point aktif (di-load index.html)
- `js/main.js`, `js/main-v60.js` — varian main (arsip)
- `js/world.js` — builder dunia 3D (Three.js via CDN)
- `js/world-extra*.js` — modul tambahan dunia
- `js/net.js` — multiplayer (Supabase Realtime)
- `js/voice.js` — voice chat (WebRTC)
- `js/quiz.js` — kuis My Nahwu
- `js/data.js` — data statis
- `assets/` — gambar & logo

## Catatan
- Three.js di-load dari CDN (jsdelivr), bukan file lokal.
- Deploy produksi: non-git via Vercel API (script deploy terpisah).
