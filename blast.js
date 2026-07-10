/* =============================================================================
   /api/blast  —  Serverless proxy untuk Fonnte (Vercel)
   -----------------------------------------------------------------------------
   Kenapa pakai proxy?
   Token Fonnte JANGAN pernah ditaruh di frontend (app.js), karena siapa pun
   bisa lihat & nyalahgunain. Jadi token disimpan aman sebagai Environment
   Variable di Vercel (FONNTE_TOKEN), dan frontend cukup nembak endpoint ini.

   Cara set token di Vercel:
   Project  →  Settings  →  Environment Variables
     Name  : FONNTE_TOKEN
     Value : <token device dari dashboard Fonnte>
   Lalu Redeploy.

   Body yang dikirim frontend (lihat sendBlast di app.js):
     {
       recipients: [{ phone: "628xxx", message: "Halo Budi ...", nama: "Budi" }],
       delay: 2            // jeda antar pesan (detik), opsional
     }
   ============================================================================= */

const FONNTE_URL = 'https://api.fonnte.com/send';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  // --- CORS (kalau frontend & API beda origin saat dev) ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const TOKEN = process.env.FONNTE_TOKEN;
  if (!TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'FONNTE_TOKEN belum di-set di Environment Variables Vercel.',
    });
  }

  // Body bisa sudah object (Vercel auto-parse) atau masih string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  const delaySec = Math.max(0, parseInt(body?.delay, 10) || 0);

  if (!recipients.length) {
    return res.status(400).json({ ok: false, error: 'recipients kosong' });
  }

  const results = [];
  let sent = 0;
  let failed = 0;

  // Kirim satu per satu supaya pesan bisa dipersonalisasi ({nama}, dll)
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const phone = String(r?.phone || '').replace(/[^0-9]/g, '');
    const message = String(r?.message || '');

    if (!phone || !message) {
      failed++;
      results.push({ phone, ok: false, error: 'phone/message kosong' });
      continue;
    }

    try {
      const form = new URLSearchParams();
      form.append('target', phone);
      form.append('message', message);
      form.append('countryCode', '62');

      const resp = await fetch(FONNTE_URL, {
        method: 'POST',
        headers: {
          Authorization: TOKEN, // Fonnte: TANPA "Bearer"
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      const data = await resp.json().catch(() => ({}));
      const ok = data?.status !== false;
      ok ? sent++ : failed++;
      results.push({ phone, ok, detail: data });
    } catch (err) {
      failed++;
      results.push({ phone, ok: false, error: String(err?.message || err) });
    }

    // Jeda antar pesan biar nomor aman dari spam-flag WhatsApp
    if (delaySec && i < recipients.length - 1) {
      await sleep(delaySec * 1000);
    }
  }

  return res.status(200).json({
    ok: failed === 0,
    total: recipients.length,
    sent,
    failed,
    results,
  });
}
