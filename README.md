# AMOGENZ LAB — web

Situs resmi **AMOGENZ LAB** — divisi riset & eksperimen dari AMOGENZ
("Research and Experiment Division from AMOGENZ").

- **Live:** https://lab.amogenz.xyz/
- **Vercel project:** `amogenz-lab` (deploy non-git via `~/workspace/lab-deploy/deploy.py`)
- **Repo ini:** kode sumber web (tanpa kunci rahasia — semua kredensial via environment variable)

## Fitur

- **Splash + menu ala game** — layar pembuka poster resmi, navigasi gaya game
- **Proyek Riset** — kartu status proyek: AMOGENZ 3D World (RILIS), Naruto War (RILIS),
  AMO Downloader (BETA), slot "Eksperimen Berikutnya" (terkunci → generator Zero)
- **Zero AI** — asisten AI lab (mode `tanya`) + **Generator Usulan Eksperimen**
  (mode `usulkan`: merumuskan ide jadi proposal mini)
- **Papan Usulan** — proposal komunitas: terbit, dukung (vote), komentar realtime
- **Log Riset, Arsip Lab** (ammo ai, web MQSD, web aksara lama), **Tentang** (3 divisi + Alumni)
- **SEO + AI-crawler:** JSON-LD terstruktur, `robots.txt`, `sitemap.xml`, `llms.txt`;
  terdaftar & terverifikasi di Google Search Console

## Struktur

```
index.html              splash + menu + semua layar (proyek, zero, log, arsip, tentang)
css/lab.css             tema HUD game (slate gelap + aksen hijau)
js/lab.js               router layar, chat Zero, generator usulan, papan usulan, komentar
api/zero.js             serverless: Zero AI multi-model (tanya | usulkan)
api/config.js           serverless: menyajikan kredensial Supabase dari env ke browser
assets/                 logo-lab.jpg, favicon.jpg, poster-lab.jpg (tidak ikut push binary)
vercel.json             HTML no-cache; aset berversi cache lama
version.json            WAJIB update tiap deploy (banner "Pembaruan tersedia")
robots.txt / sitemap.xml / llms.txt   SEO & crawler AI
supabase-lab.sql        migrasi tabel lab_usulan (sekali saja via dashboard)
firebase-rules-lab.json rules komentar lab_komen (GABUNG ke rules Firebase yg ada!)
```

## Kredensial & environment variable (Vercel → production)

> Tidak ada kunci di repo ini. Semua via env var.

| Key | Dipakai | Sifat |
|---|---|---|
| `GOOGLE_API_KEY` | `api/zero.js` (server) | rahasia |
| `GROQ_API_KEY` | `api/zero.js` (server) | rahasia |
| `OPENROUTER_API_KEY` | `api/zero.js` (server) | rahasia |
| `SUPABASE_URL` | `api/config.js` → browser | publik |
| `SUPABASE_ANON_KEY` | `api/config.js` → browser | publik (proteksi via RLS) |

Zero AI memakai rantai fallback multi-model (semua gratis):
Groq `llama-3.3-70b-versatile` → Groq `gemma2-9b-it` →
OpenRouter `google/gemma-3-27b-it:free` → OpenRouter `meta-llama/llama-3.3-70b-instruct:free` →
Gemini 2.5 Flash (terakhir).

## Backend

- **Supabase** (`lab_usulan`): jalankan `supabase-lab.sql` sekali di SQL Editor.
  Policy: baca publik, tambah publik, update (dukung) publik. Tanpa policy delete.
- **Firebase RTDB** (project `amogenz-inc`, path `lab_komen/<id-usulan>/<pushId>`):
  GABUNGKAN isi `firebase-rules-lab.json` ke rules console yang sudah ada
  (jangan replace rules Aksara!). Aturan: insert-only, validasi nama ≤30 char,
  teks ≤400 char, tepat 3 field.

## Deploy

```bash
python3 ~/workspace/lab-deploy/deploy.py
```

## SOP (PROJECT GUARD — harga mati)

1. Cek sinkron sebelum kerja: `python3 ~/workspace/tools/project_guard.py --check lab`
2. Tiap ubah isi file → naikkan nomor `?v=` (tidak boleh pakai ulang)
3. Tiap deploy → update `version.json` (build timestamp baru)
4. HTML selalu no-cache (sudah di `vercel.json`)

## Catatan

- Copy/teks konten: seluruhnya di `index.html` (mudah diedit).
- Knowledge base Zero: konstanta `KNOWLEDGE` di `api/zero.js` — update bila proyek/status berubah.
- Tanpa infrastruktur berbayar.
