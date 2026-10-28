// AMOGENZ LAB — /api/config : menyajikan kredensial publik Supabase dari environment.
// Dibaca browser saat init agar kunci tidak hard-code di JS.
// Catatan: yang disajikan hanya ANON key (publik, aman di client — proteksinya via RLS).
// Service-role key TIDAK PERNAH diekspos di sini.
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) return res.status(500).json({ error: "SUPABASE_CONFIG_MISSING" });
  return res.status(200).json({ url, anonKey });
}
