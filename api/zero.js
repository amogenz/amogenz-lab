// AMOGENZ LAB — Zero AI (Vercel Serverless Function)
// Rantai otak multi-model (semua gratis). Urutan: yang limitnya paling longgar dulu.
// Groq: llama-3.3-70b-versatile, gemma2-9b-it
// OpenRouter: google/gemma-3-27b-it:free, meta-llama/llama-3.3-70b-instruct:free
// Gemini 2.5 Flash: terakhir (sering kena limit)
// Mode: "tanya" (asisten) | "usulkan" (generator proposal eksperimen)
// Env: GOOGLE_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY

const KNOWLEDGE = `
[DATA AMOGENZ LAB]
AMOGENZ LAB — Research and Experiment Division from AMOGENZ.
Lab kreatif AMOGENZ: divisi riset dan pengembangan yang bereksperimen membangun
dunia virtual 3D, game, dan karya digital. Sub/divisi dari induk AMOGENZ
(komunitas "Spirit of Youth & Technology", didirikan 19 Okt 2021 / 12 Rabiul Awal 1443 H
di Pondok Pesantren Langitan).

DIVISI-DIVISI AMOGENZ:
- AMOGENZ LAB (Riset & Eksperimen): lab kreatif — tempat ide liar diuji. Dunia virtual 3D,
  game, karya digital. Slogan kerja: "bagaimana kalau...?"
- DIVISI TEKNOLOGI: fondasi — infrastruktur, API, layanan AI, tools produksi.
  Menjawab "gimana caranya awet?". Aksara (sosial media AMOGENZ) dirawat di sini.
- DIVISI MEDIA: konten & media kreatif AMOGENZ (contoh: divisi media "lofi anime" —
  sedang dalam pengembangan).
AnonChat BUKAN bagian lab.

ALUR RISET LAB: IDE -> EKSPERIMEN -> BETA -> RILIS -> ALUMNI (yang matang "lulus",
dirawat Divisi Teknologi sebagai produk stabil).

PROYEK RISET AKTIF:
- AMOGENZ 3D WORLD (RILIS, LAB-001): dunia virtual 3D — Tech Valley, multiplayer + voice chat,
  helikopter, sepeda, drone, kuis My Nahwu. Main di https://3d.amogenz.xyz/ dari browser HP.
- NARUTO WAR (RILIS, LAB-002): game perang 2D ala Naruto Senki. Pilih karakter, keluarkan jutsu,
  hancurkan menara musuh. Main di https://naruto.amogenz.xyz/ dari browser HP, gratis.
- AMO DOWNLOADER (BETA, LAB-003): tools pengunduh cerdas — tempel tautan, dapat info & unduh media.

ARSIP (eksperimen yang dinonaktifkan — bukti lab berani mencoba):
- AMMO AI (17 Mei 2026): AI database kitab fiqih & kitab agama, kolaborasi dengan santri.
- WEB MQSD (7 Jan 2026): prototype aplikasi chat — saran, masukan, request fitur.
- WEB AKSARA versi lama (7 Jan 2026): kini Aksara hidup di Divisi Teknologi (aksara.amogenz.xyz).

ALUMNI LAB: belum ada lulusan.
CARA GABUNG / USUL IDE: lewat tab "USULKAN EKSPERIMEN" di web ini — Zero merumuskan jadi proposal,
komunitas bisa mendukung. Yang ramai didukung jadi prioritas riset.
`;

const PERSONA = `Kamu adalah Zero, asisten AI resmi AMOGENZ LAB. Kepribadian: cerdas, santai,
sedikit gaya gamer/peneliti, bahasa Indonesia kasual dan ramah. Jawab SINGKAT dan padat
(maks 120 kata kecuali diminta detail). Hanya jawab seputar AMOGENZ LAB dan ekosistem AMOGENZ;
tolak halus topik di luar itu (pornografi, narkoba, dan sejenisnya tolak tegas).
Jangan mengarang fakta di luar [DATA]. Jika ditanya cara gabung/usul ide, arahkan ke
tab USULKAN EKSPERIMEN di web lab.`;

function extractJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "");
  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no-json");
  return JSON.parse(m[0]);
}

async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("gemini:" + (data?.error?.message || r.status));
  const t = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!t) throw new Error("gemini:empty");
  return t;
}

async function callGroq(prompt, apiKey, model) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7, max_tokens: 1200,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("groq:" + (data?.error?.message || r.status));
  const t = data.choices?.[0]?.message?.content?.trim();
  if (!t) throw new Error("groq:empty");
  return t;
}

async function callOpenRouter(prompt, apiKey, model) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
      "HTTP-Referer": "https://lab.amogenz.xyz/",
      "X-Title": "AMOGENZ LAB Zero",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7, max_tokens: 1200,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("openrouter:" + (data?.error?.message || r.status));
  const t = data.choices?.[0]?.message?.content?.trim();
  if (!t) throw new Error("openrouter:empty");
  return t;
}

// Daftar otak yang dicoba berurutan. Yang gagal -> lanjut ke berikutnya.
function brainList() {
  const gk = process.env.GOOGLE_API_KEY, qk = process.env.GROQ_API_KEY, ok = process.env.OPENROUTER_API_KEY;
  const list = [];
  if (qk) {
    list.push({ name: "groq/llama-3.3", fn: (p) => callGroq(p, qk, "llama-3.3-70b-versatile") });
    list.push({ name: "groq/gemma2-9b", fn: (p) => callGroq(p, qk, "gemma2-9b-it") });
  }
  if (ok) {
    list.push({ name: "or/gemma-3-27b", fn: (p) => callOpenRouter(p, ok, "google/gemma-3-27b-it:free") });
    list.push({ name: "or/llama-3.3", fn: (p) => callOpenRouter(p, ok, "meta-llama/llama-3.3-70b-instruct:free") });
  }
  if (gk) list.push({ name: "gemini-2.5-flash", fn: (p) => callGemini(p, gk) });
  return list;
}

async function think(prompt) {
  const brains = brainList();
  const errs = [];
  for (const b of brains) {
    try { return { text: await b.fn(prompt), brain: b.name }; }
    catch (e) { errs.push(b.name + "=" + String(e.message || e).slice(0, 80)); }
  }
  const err = new Error(errs.join(" | ") || "no-brain");
  err.isNoBrain = true;
  throw err;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.GOOGLE_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY)
    return res.status(503).json({ error: "ZERO_OFFLINE" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { mode = "tanya", message = "", history = [] } = body || {};
  if (!message || String(message).length > 2000)
    return res.status(400).json({ error: "Pesan kosong / terlalu panjang" });

  try {
    if (mode === "usulkan") {
      const prompt = `Kamu adalah Zero, AI perumus proposal AMOGENZ LAB.
Tugas: ubah ide mentah user menjadi PROPOSAL EKSPERIMEN resmi lab.
Aturan:
- Bahasa Indonesia santai tapi profesional.
- "nama": nama proyek yang catchy (maks 5 kata).
- "kategori": salah satu dari: game 2D, game 3D, dunia virtual, tools, karya digital, AI.
- "ringkasan": 2-3 kalimat.
- "fitur": array 3-5 fitur inti (singkat, konkret).
- "tantangan": array 2-4 tantangan teknis realistis.
- "estimasi": satu kalimat skala pengerjaan (mis. "Prototipe 2-4 minggu oleh 1-2 orang").
- Output HANYA JSON valid, tanpa teks lain:
{"nama":"...","kategori":"...","ringkasan":"...","fitur":["..."],"tantangan":["..."],"estimasi":"..."}
Ide user: """${String(message).slice(0, 1000)}"""`;
      const raw = (await think(prompt)).text;
      const proposal = extractJson(raw);
      for (const k of ["nama", "kategori", "ringkasan", "estimasi"])
        if (typeof proposal[k] !== "string") proposal[k] = "";
      for (const k of ["fitur", "tantangan"]) {
        if (!Array.isArray(proposal[k])) proposal[k] = [];
        proposal[k] = proposal[k].slice(0, 6).map(String);
      }
      proposal.nama = proposal.nama.slice(0, 80) || "Eksperimen Tanpa Nama";
      return res.status(200).json({ proposal });
    }

    const histText = (Array.isArray(history) ? history : []).slice(-6)
      .map(h => `User: ${h.q}\nZero: ${h.a}`).join("\n");
    const prompt = `${PERSONA}\n${KNOWLEDGE}\n${histText ? "[Riwayat]\n" + histText + "\n" : ""}[User] ${String(message).slice(0, 1000)}\n[Zero]`;
    const reply = (await think(prompt)).text.slice(0, 2000);
    return res.status(200).json({ reply });
  } catch (e) {
    if (e.isNoBrain) return res.status(503).json({ error: "ZERO_OFFLINE" });
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
