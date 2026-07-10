/* =========================================================================
   GBI FAMILY CHURCH TAMAN MODERN — Dashboard Logic
   app.js
   -------------------------------------------------------------------------
   • Supabase  : penyimpanan data jemaat (otomatis fallback ke DEMO bila kosong)
   • Fonnte    : pengiriman WhatsApp Blast (lewat serverless proxy yg aman)
   ========================================================================= */

/* =========================================================================
   0. KONFIGURASI LANDING PAGE
   ========================================================================= */

// ---- FOTO SLIDE (maks 10) ----
// Taruh file foto di folder yg sama dengan index.html (jpg/png/webp).
// Nama file harus PERSIS sama — case sensitive di Linux/Vercel.
// Contoh: lu punya slide.jpg, slide2.jpg, slide3.jpg → isi seperti di bawah.
// Foto yg tidak ditemukan browser skip otomatis (tampil hitam sebentar).
const SLIDE_IMAGES = [
  'slide.JPG',    // ← foto pertama lu
  // tambahkan di sini kalau ada foto berikutnya:
  // 'slide4.jpg',
  // 'slide5.jpg',
  // dst...
];

// ---- LINK SOSIAL MEDIA ----
// Ganti URL di bawah sesuai akun gereja. Kalau belum ada, isi '#'.
const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/gbitamanmodern',
  tiktok:    'https://www.tiktok.com/@gbitamanmodern_',
  youtube:   'https://www.youtube.com/@gbitmofficial',
  whatsapp:  'https://wa.me/6281311332823', // ← ganti nomor WA gereja di sini
};

/* =========================================================================
   1. KONFIGURASI  ——  isi bagian ini saat deploy di Cursor / Vercel
   ========================================================================= */
const CONFIG = {
  // ---- Akun admin (untuk demo / lokal). Saat produksi, pakai tabel `admins` di Supabase.
  admin: { username: 'admin', password: 'gbi2026' },

  // ---- Supabase. Ambil dari Project Settings → API.
  supabase: {
    url: 'https://rhcqjeanqrerdbbhfnds.supabase.co',          // contoh: https://xxxx.supabase.co
    anonKey: 'sb_publishable_KS26LAfmxxZ8p1eOuxYGKw_4R8EqiUw',
  },

  // ---- Fonnte (WhatsApp gateway)
  //  PENTING: JANGAN taruh token Fonnte langsung di sini untuk produksi —
  //  siapa pun bisa melihatnya di browser & memakai device WA Anda.
  //  Mode aman: 'proxy' → frontend memanggil serverless function (/api/blast)
  //  yang menyimpan token sebagai ENV variable di Vercel (lihat file api/blast.js).
  fonnte: {
    mode: 'proxy',          // 'proxy' (aman, disarankan) | 'direct' (hanya tes lokal) | 'demo'
    proxyUrl: '/api/blast', // endpoint serverless Anda
    token: '',              // HANYA untuk mode 'direct' saat ngoprek lokal
  },
};

// Auto-deteksi DEMO: kalau Supabase belum dikonfigurasi → jalan pakai data contoh.
const DEMO_MODE = !CONFIG.supabase.url || CONFIG.supabase.url.startsWith('YOUR_');

/* =========================================================================
   2. STATE
   ========================================================================= */
const state = {
  user: null,
  members: [],
  roles: [],
  messagesSent: 3524,            // angka awal (akan bertambah saat blast)
  // blast targeting
  quick: new Set(),              // 'all' | 'pelayan' | 'jemaat'
  selRoles: new Set(),
  matchMode: 'any',              // 'any' | 'all'
  includeIds: new Set(),
  excludeIds: new Set(),
  templates: [
    { name: 'Undangan Ibadah', text: 'Shalom {nama} 🤍\nMengundang Anda hadir dalam Ibadah Raya Minggu pukul 09.00 WIB di GBI Family Church Taman Modern. Tuhan Yesus memberkati!' },
    { name: 'Latihan Pelayanan', text: 'Halo {panggilan}, reminder latihan {peran} hari Sabtu pukul 16.00. Mohon hadir tepat waktu ya ✨' },
    { name: 'Ucapan Ultah', text: 'Selamat ulang tahun {nama}! ✨ Kiranya kasih dan berkat Tuhan Yesus selalu menyertai. — Keluarga GBI Family Church Taman Modern' },
  ],
};

let sb = null; // supabase client

/* =========================================================================
   3. DATA CONTOH (DEMO)
   ========================================================================= */
const DEFAULT_ROLES = ['Diaken', 'Worship Leader', 'Singer', 'Pemusik', 'Multimedia', 'Tamborin', 'Usher', 'Soundman', 'Lighting', 'Doa Syafaat', 'Guru Sekolah Minggu'];

function demoMembers() {
  const d = [
    ['Andreas Wijaya','Andre','1990-05-31','L','andreas@mail.com','081234500001','Jl. Taman Modern Blok A1, Cakung','pelayan',['Worship Leader','Singer']],
    ['Grace Natalia','Grace','1995-06-02','P','grace@mail.com','081234500002','Jl. Taman Modern Blok B3','pelayan',['Singer','Pemusik']],
    ['Samuel Tanudjaja','Sam','1988-11-20','L','','081234500003','Perumahan Modern Hills C2','pelayan',['Pemusik']],
    ['Mei Lina','Mei','2000-06-05','P','meilina@mail.com','081234500004','Jl. Modern Raya 12','pelayan',['Multimedia']],
    ['Daniel Pratama','Daniel','1992-03-15','L','','081234500005','Jl. Taman Modern Blok D5','pelayan',['Soundman','Pemusik']],
    ['Yohana Sari','Hana','1998-08-09','P','','081234500006','Cluster Modern Garden 8','pelayan',['Tamborin']],
    ['Petrus Halim','Petrus','1985-12-25','L','petrus@mail.com','081234500007','Jl. Modern Indah 22','pelayan',['Diaken','Usher']],
    ['Christine Lukas','Tina','1996-01-18','P','','081234500008','Blok F2 Taman Modern','pelayan',['Multimedia','Lighting']],
    ['Bonar Sianipar','Bonar','1979-07-04','L','','081234500009','Jl. Taman Modern Blok G7','pelayan',['Diaken','Doa Syafaat']],
    ['Felicia Gunawan','Feli','2002-09-12','P','','081234500010','Cluster Modern 14','pelayan',['Guru Sekolah Minggu']],
    ['Markus Wibowo','Markus','1991-04-28','L','','081234500011','Jl. Modern Park 5','jemaat',[]],
    ['Ruth Anggraini','Ruth','1994-10-30','P','ruth@mail.com','081234500012','Blok H3 Taman Modern','jemaat',[]],
    ['Timotius Halawa','Timo','1987-02-14','L','','081234500013','Jl. Taman Modern Blok I1','jemaat',[]],
    ['Sarah Melinda','Sarah','1999-06-08','P','','081234500014','Modern Residence 20','jemaat',[]],
    ['Yosua Pangestu','Yosua','1983-11-11','L','','081234500015','Jl. Modern Asri 9','jemaat',[]],
    ['Debora Kusuma','Debby','2001-12-03','P','','081234500016','Cluster Taman Modern 3','jemaat',[]],
    ['Lukas Saputra','Lukas','1989-05-25','L','','081234500017','Blok J4 Taman Modern','jemaat',[]],
    ['Hana Permata','Hana','1997-07-19','P','','081234500018','Jl. Modern Jaya 11','jemaat',[]],
  ];
  return d.map((r, i) => ({
    id: 'demo-' + (i + 1),
    member_no: 'TM-' + String(i + 1).padStart(4, '0'),
    nama: r[0], panggilan: r[1], ttl: r[2], kelamin: r[3], email: r[4],
    no_hp: r[5], alamat: r[6], tipe: r[7], roles: r[8], foto: null,
    created_at: new Date().toISOString(),
  }));
}

/* =========================================================================
   4. UTIL
   ========================================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const AVATAR_COLORS = [
  ['#F26B1F','#D9550A'], ['#2F6FED','#1E4FB8'], ['#18A971','#0E7A50'],
  ['#F4B400','#C98A00'], ['#9B5DE5','#6E3CB0'], ['#EE5A8C','#C23A6B'],
  ['#15B5B0','#0C7A77'], ['#EF6F53','#C9492E'],
];
function avatarColor(name) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}
function avatarHTML(m, cls = 'avatar') {
  if (m.foto) return `<img class="${cls}" src="${esc(m.foto)}" alt="${esc(m.nama)}" />`;
  const [c1, c2] = avatarColor(m.nama);
  return `<div class="${cls}" style="background:linear-gradient(135deg,${c1},${c2})">${initials(m.nama)}</div>`;
}
function age(ttl) { if (!ttl) return null; const b = new Date(ttl), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
function fmtDate(ttl) { if (!ttl) return '—'; return new Date(ttl).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }); }
function normPhone(p) { let s = String(p || '').replace(/[^\d]/g, ''); if (s.startsWith('0')) s = '62' + s.slice(1); else if (s.startsWith('8')) s = '62' + s; else if (s.startsWith('620')) s = '62' + s.slice(3); return s; }
function genderLabel(g) { return g === 'L' ? 'Laki-laki' : g === 'P' ? 'Perempuan' : '—'; }
function firstName(m) { return m.panggilan || m.nama.split(/\s+/)[0]; }
function memberPeran(m) { return m.tipe === 'pelayan' && m.roles?.length ? m.roles[0] : 'Jemaat'; }

/* =========================================================================
   5. SUPABASE / DATA LAYER
   ========================================================================= */
async function initData() {
  if (DEMO_MODE) {
    state.roles = [...DEFAULT_ROLES];
    state.members = demoMembers();
    return;
  }
  sb = supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
  try {
    const [{ data: roles }, { data: members }] = await Promise.all([
      sb.from('roles').select('*').order('nama'),
      sb.from('members').select('*').order('nama'),
    ]);
    state.roles = (roles?.length ? roles.map(r => r.nama) : [...DEFAULT_ROLES]);
    state.members = members || [];
  } catch (e) {
    console.error('Supabase error, fallback ke demo:', e);
    state.roles = [...DEFAULT_ROLES];
    state.members = demoMembers();
  }
}

async function dbAddMember(m) {
  if (DEMO_MODE) { m.id = 'local-' + Date.now(); state.members.push(m); return m; }
  const { data, error } = await sb.from('members').insert(m).select().single();
  if (error) throw error; state.members.push(data); return data;
}
async function dbUpdateMember(id, patch) {
  if (DEMO_MODE) { Object.assign(state.members.find(x => x.id === id), patch); return; }
  const { error } = await sb.from('members').update(patch).eq('id', id); if (error) throw error;
  Object.assign(state.members.find(x => x.id === id), patch);
}
async function dbDeleteMember(id) {
  if (DEMO_MODE) { state.members = state.members.filter(x => x.id !== id); return; }
  const { error } = await sb.from('members').delete().eq('id', id); if (error) throw error;
  state.members = state.members.filter(x => x.id !== id);
}
async function dbAddRole(nama) {
  if (!DEMO_MODE) { try { await sb.from('roles').insert({ nama }); } catch (e) {} }
  if (!state.roles.includes(nama)) state.roles.push(nama);
}
async function dbDeleteRole(nama) {
  if (!DEMO_MODE) { try { await sb.from('roles').delete().eq('nama', nama); } catch (e) {} }
  state.roles = state.roles.filter(r => r !== nama);
  state.members.forEach(m => { m.roles = (m.roles || []).filter(r => r !== nama); });
}

/* =========================================================================
   6. SPLASH + AUTH
   ========================================================================= */
function fillEmblems() {
  const tpl = $('#emblem-svg').content;
  $$('[data-emblem]').forEach(el => { if (!el.children.length) el.appendChild(tpl.cloneNode(true)); });
}

function initBrandLogos(scope) {
  const root = scope || document;
  const targets = [...root.querySelectorAll('.brand-emblem[data-emblem], .splash-emblem[data-emblem]')];
  if (!targets.length) return;

  const probe = new Image();
  probe.onload = () => {
    targets.forEach(el => {
      const img = document.createElement('img');
      img.src = 'logo.png';
      img.alt = 'GBI Family Church Taman Modern';
      img.className = el.classList.contains('splash-emblem') ? 'splash-logo-img' : 'brand-logo-img';
      el.replaceWith(img);
    });
  };
  probe.onerror = () => fillEmblems();
  probe.src = 'logo.png';
}

function startSplash() {
  initBrandLogos();
  setTimeout(() => {
    $('#splash').classList.add('out');
    setTimeout(() => { $('#splash').remove(); $('#login').classList.remove('hidden'); $('#login-user').focus(); }, 700);
  }, 2600);
}

function doLogin() {
  const u = $('#login-user').value.trim(), p = $('#login-pass').value;
  if (u === CONFIG.admin.username && p === CONFIG.admin.password) {
    state.user = { name: u };
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#user-name').textContent = u.charAt(0).toUpperCase() + u.slice(1);
    $('#user-ava').textContent = u.charAt(0).toUpperCase();
    bootDashboard();
  } else {
    toast('Username atau password salah', 'err');
    $('#login-pass').value = '';
    const card = document.querySelector('.login-card');
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  }
}

/* =========================================================================
   7. NAVIGATION
   ========================================================================= */
function switchPage(page) {
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#page-dashboard').classList.toggle('hidden', page !== 'dashboard');
  $('#page-members').classList.toggle('hidden', page !== 'members');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================================
   8. DASHBOARD: STATS + CHARTS + BIRTHDAYS
   ========================================================================= */
const ICONS = {
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
};
function statCard(cls, icon, num, lbl, trend) {
  return `<div class="stat ${cls}"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg></div>
    <div class="num">${num}</div><div class="lbl">${lbl}</div>${trend ? `<div class="trend">${trend}</div>` : ''}</div>`;
}
function renderStats() {
  const total = state.members.length;
  const pelayan = state.members.filter(m => m.tipe === 'pelayan').length;
  const jemaat = total - pelayan;
  $('#stat-grid').innerHTML =
    statCard('', ICONS.users, total, 'Total Anggota', '↗ Jemaat aktif') +
    statCard('green', ICONS.heart, pelayan, 'Pelayan Tuhan', `${total ? Math.round(pelayan / total * 100) : 0}% dari jemaat`) +
    statCard('gold', ICONS.layers, jemaat, 'Jemaat Biasa', '') +
    statCard('blue', ICONS.send, state.messagesSent.toLocaleString('id-ID'), 'Pesan Terkirim', '');
  $$('#stat-grid .stat').forEach((el, i) => el.style.animationDelay = (i * 0.07) + 's');
}

function renderDonut() {
  const pelayan = state.members.filter(m => m.tipe === 'pelayan').length;
  const jemaat = state.members.length - pelayan;
  const total = pelayan + jemaat || 1;
  const segs = [
    { label: 'Pelayan Tuhan', value: pelayan, color: '#111111' },
    { label: 'Jemaat Biasa', value: jemaat, color: '#cccccc' },
  ];
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const circles = segs.map(s => {
    const len = (s.value / total) * C;
    const el = `<circle cx="84" cy="84" r="${R}" fill="none" stroke="${s.color}" stroke-width="22"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 84 84)"
      style="transition:stroke-dasharray 1s var(--ease)"/>`;
    off += len; return el;
  }).join('');
  $('#donut-wrap').innerHTML =
    `<svg viewBox="0 0 168 168" width="168" height="168"><circle cx="84" cy="84" r="${R}" fill="none" stroke="#e8e8e8" stroke-width="22"/>${circles}</svg>
     <div class="donut-center"><div class="v">${total}</div><div class="l">Total Anggota</div></div>`;
  $('#donut-legend').innerHTML = segs.map(s =>
    `<div class="legend-item"><span class="sw" style="background:${s.color}"></span><span class="nm">${s.label}</span><span class="ct">${s.value}</span></div>`).join('');
}

function renderRoleBars() {
  const counts = {};
  state.roles.forEach(r => counts[r] = 0);
  state.members.forEach(m => (m.roles || []).forEach(r => { counts[r] = (counts[r] || 0) + 1; }));
  const arr = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...arr.map(a => a[1]));
  if (!arr.length) { $('#role-bars').innerHTML = `<p style="color:var(--ink-3); font-size:.88rem;">Belum ada data pelayan.</p>`; return; }
  $('#role-bars').innerHTML = arr.map(([name, v]) =>
    `<div class="bar-row"><div class="top"><span class="n">${esc(name)}</span><span class="c">${v}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:0"></div></div></div>`).join('');
  requestAnimationFrame(() => $$('#role-bars .bar-fill').forEach((el, i) => el.style.width = (arr[i][1] / max * 100) + '%'));
}

function upcomingBirthdays(n = 5) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return state.members.filter(m => m.ttl).map(m => {
    const b = new Date(m.ttl); const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const days = Math.round((next - today) / 86400000);
    return { m, days, next };
  }).sort((a, b) => a.days - b.days).slice(0, n);
}
function renderBirthdays() {
  const list = upcomingBirthdays();
  $('#bday-list').innerHTML = list.map(({ m, days, next }) => {
    const when = days === 0 ? 'Hari ini! ✨' : days === 1 ? 'Besok' : next.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return `<div class="bday-item">${avatarHTML(m, 'avatar')}
      <div><div class="nm">${esc(m.nama)}</div><div class="ro">${esc(memberPeran(m))} · ${age(m.ttl) + 1} thn</div></div>
      <span class="when">${when}</span></div>`;
  }).join('') || `<p style="color:var(--ink-3); font-size:.88rem;">Belum ada data tanggal lahir.</p>`;
  $$('#bday-list .avatar').forEach(a => { a.style.width = '40px'; a.style.height = '40px'; a.style.borderRadius = '12px'; a.style.fontSize = '.9rem'; });
}

/* =========================================================================
   9. BLAST COMPOSER
   ========================================================================= */
function renderQuickTargets() {
  const total = state.members.length;
  const pel = state.members.filter(m => m.tipe === 'pelayan').length;
  const jem = total - pel;
  const items = [
    { key: 'all', label: 'Semua Anggota', count: total },
    { key: 'pelayan', label: 'Semua Pelayan', count: pel },
    { key: 'jemaat', label: 'Jemaat Biasa', count: jem },
  ];
  $('#quick-targets').innerHTML = items.map(it =>
    `<button class="chip ${state.quick.has(it.key) ? 'sel' : ''}" data-quick="${it.key}">
       ${it.label} <span class="ct">${it.count}</span></button>`).join('');
}
function renderRoleTargets() {
  const counts = {};
  state.members.forEach(m => (m.roles || []).forEach(r => counts[r] = (counts[r] || 0) + 1));
  $('#role-targets').innerHTML = state.roles.map(r =>
    `<button class="chip ${state.selRoles.has(r) ? 'sel' : ''}" data-role="${esc(r)}">
       ${esc(r)} <span class="ct">${counts[r] || 0}</span></button>`).join('') +
    `<button class="chip" id="manage-roles-chip" style="border-style:dashed;">+ Kelola Peran</button>`;
}
function renderTemplates() {
  $('#template-bar').innerHTML = state.templates.map((t, i) =>
    `<button class="tpl-chip" data-tpl="${i}">${esc(t.name)}</button>`).join('');
}

function resolveRecipients() {
  const map = new Map();
  const add = (m) => map.set(m.id, m);
  if (state.quick.has('all')) state.members.forEach(add);
  if (state.quick.has('pelayan')) state.members.filter(m => m.tipe === 'pelayan').forEach(add);
  if (state.quick.has('jemaat')) state.members.filter(m => m.tipe === 'jemaat').forEach(add);
  if (state.selRoles.size) {
    const want = [...state.selRoles];
    state.members.forEach(m => {
      const has = m.roles || [];
      const ok = state.matchMode === 'all' ? want.every(r => has.includes(r)) : want.some(r => has.includes(r));
      if (ok) add(m);
    });
  }
  state.includeIds.forEach(id => { const m = state.members.find(x => x.id === id); if (m) add(m); });
  state.excludeIds.forEach(id => map.delete(id));
  return [...map.values()];
}
function renderRecipients() {
  const r = resolveRecipients();
  $('#recip-count').innerHTML = `${r.length} <span>penerima</span>`;
  $('#recipients-list').innerHTML = r.map(m =>
    `<span class="recip-tag">${esc(firstName(m))}<button data-remove="${m.id}" title="Hapus dari daftar">×</button></span>`).join('');
}

function renderPersonResults(q) {
  if (!q) { $('#person-results').innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const hits = state.members.filter(m => m.nama.toLowerCase().includes(ql) || (m.no_hp || '').includes(q)).slice(0, 8);
  $('#person-results').innerHTML = hits.map(m =>
    `<button class="chip" data-add="${m.id}">+ ${esc(m.nama)}</button>`).join('') ||
    `<span style="font-size:.84rem; color:var(--ink-3);">Tidak ditemukan.</span>`;
}

function updateCharCount() { $('#char-count').textContent = $('#blast-message').value.length; }

function personalize(text, m) {
  return text.replace(/\{nama\}/g, m.nama).replace(/\{panggilan\}/g, firstName(m)).replace(/\{peran\}/g, memberPeran(m));
}

async function sendBlast() {
  const recipients = resolveRecipients().filter(m => m.no_hp);
  const msg = $('#blast-message').value.trim();
  if (!recipients.length) return toast('Pilih minimal satu penerima dulu ya', 'err');
  if (!msg) return toast('Pesannya masih kosong', 'err');

  const btn = $('#send-blast'); const orig = btn.innerHTML;
  btn.disabled = true;
  const delay = Math.max(0, parseInt($('#blast-delay').value) || 0);
  const payload = recipients.map(m => ({ phone: normPhone(m.no_hp), message: personalize(msg, m), nama: m.nama }));

  try {
    if (DEMO_MODE || CONFIG.fonnte.mode === 'demo') {
      for (let i = 0; i < payload.length; i++) {
        btn.innerHTML = `<span class="spin"></span> Mengirim ${i + 1}/${payload.length}`;
        await new Promise(r => setTimeout(r, Math.min(120, delay * 60) || 120));
      }
      finishBlast(payload.length, btn, orig, true);
    } else if (CONFIG.fonnte.mode === 'proxy') {
      btn.innerHTML = `<span class="spin"></span> Mengirim…`;
      const res = await fetch(CONFIG.fonnte.proxyUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: payload, delay }),
      });
      if (!res.ok) throw new Error('Proxy error ' + res.status);
      finishBlast(payload.length, btn, orig, true);
    } else { // direct (tes lokal saja)
      btn.innerHTML = `<span class="spin"></span> Mengirim…`;
      const targets = payload.map(p => p.phone).join(',');
      const fd = new FormData();
      fd.append('target', targets); fd.append('message', msg); fd.append('delay', String(delay || 1));
      const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: CONFIG.fonnte.token }, body: fd });
      const j = await res.json();
      finishBlast(payload.length, btn, orig, j.status !== false);
    }
  } catch (e) {
    console.error(e); btn.disabled = false; btn.innerHTML = orig;
    toast('Gagal mengirim: ' + e.message, 'err');
  }
}
function finishBlast(n, btn, orig, ok) {
  btn.disabled = false; btn.innerHTML = orig;
  if (ok) {
    state.messagesSent += n; renderStats();
    toast(`${n} pesan berhasil dikirim ${DEMO_MODE ? '(mode demo)' : ''}`, 'ok');
  } else toast('Pengiriman gagal — cek koneksi Fonnte', 'err');
}

/* =========================================================================
   10. MEMBERS PAGE
   ========================================================================= */
let memberFilters = { q: '', type: '', role: '' };

function infoRow(icon, val) {
  return `<div class="row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg><span>${esc(val)}</span></div>`;
}
const IC = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  cake: '<path d="M2 21h20M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M12 7V3M9 5h6M7 11v-1M12 11v-1M17 11v-1"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

function memberMatchesFilter(m) {
  const { q, type, role } = memberFilters;
  if (type && m.tipe !== type) return false;
  if (role && !(m.roles || []).includes(role)) return false;
  if (q) {
    const hay = `${m.nama} ${m.no_hp} ${m.alamat} ${m.email} ${(m.roles || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  return true;
}

function renderMembers() {
  const list = state.members.filter(memberMatchesFilter);
  $('#member-total').textContent = state.members.length;
  $('#member-shown').textContent = list.length;
  const grid = $('#member-grid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <h4>Tidak ada anggota ditemukan</h4><p>Coba ubah kata kunci atau filter.</p></div>`;
    return;
  }
  grid.innerHTML = list.map((m, i) => {
    const badges = [`<span class="badge ${m.tipe}">${m.tipe === 'pelayan' ? 'Pelayan' : 'Jemaat'}</span>`]
      .concat((m.roles || []).slice(0, 3).map(r => `<span class="badge role">${esc(r)}</span>`)).join('');
    const a = age(m.ttl);
    return `<article class="mcard" data-id="${m.id}" style="animation-delay:${Math.min(i * 0.03, 0.4)}s">
      <div class="mcard-top">${avatarHTML(m)}
        <div style="min-width:0;"><div class="mcard-id">${esc(m.member_no || '')}</div>
          <div class="mcard-name">${esc(m.nama)}</div><div class="mcard-badges">${badges}</div></div>
      </div>
      <div class="mcard-info">
        ${infoRow(IC.phone, m.no_hp || '—')}
        ${infoRow(IC.cake, m.ttl ? `${fmtDate(m.ttl)}${a != null ? ' · ' + a + ' thn' : ''}` : '—')}
        ${infoRow(IC.pin, m.alamat || '—')}
      </div>
      <div class="mcard-foot">
        <button class="btn btn-sm btn-soft" data-wa="${m.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.send}</svg> WA</button>
        <button class="btn btn-sm btn-ghost" data-edit="${m.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-detail="${m.id}">Detail</button>
      </div>
    </article>`;
  }).join('');
}

function renderRoleFilterOptions() {
  $('#filter-role').innerHTML = `<option value="">Semua Peran</option>` +
    state.roles.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
}

/* =========================================================================
   11. MODALS  (member form, detail, id-card, role manager, import, settings)
   ========================================================================= */
function openModal(html) {
  $('#modal-host').innerHTML = `<div class="overlay" data-overlay>${html}</div>`;
  const ov = $('[data-overlay]');
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
}
function closeModal() { $('#modal-host').innerHTML = ''; }

function memberFormModal(m = null) {
  const e = m || { nama:'', panggilan:'', ttl:'', kelamin:'', email:'', no_hp:'', alamat:'', tipe:'jemaat', roles:[], foto:'' };
  const roleOpts = state.roles.map(r =>
    `<span class="role-opt ${e.roles?.includes(r) ? 'on' : ''}" data-roleopt="${esc(r)}">${esc(r)}</span>`).join('');
  openModal(`<div class="modal">
    <div class="modal-head"><h3>${m ? 'Edit' : 'Tambah'} Anggota</h3><span class="spacer"></span>
      <button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Tipe Anggota</label>
        <div class="type-radio" id="type-radio">
          <label class="${e.tipe==='jemaat'?'on':''}"><input type="radio" name="tipe" value="jemaat" ${e.tipe==='jemaat'?'checked':''}><span><span class="t">Jemaat Biasa</span><br><span class="d">Anggota jemaat</span></span></label>
          <label class="${e.tipe==='pelayan'?'on':''}"><input type="radio" name="tipe" value="pelayan" ${e.tipe==='pelayan'?'checked':''}><span><span class="t">Pelayan Tuhan</span><br><span class="d">Pengerja / melayani</span></span></label>
        </div>
      </div>
      <div class="form-2col">
        <div class="field full"><label>Nama Lengkap *</label><input class="input" id="f-nama" value="${esc(e.nama)}" placeholder="Nama lengkap"></div>
        <div class="field"><label>Nama Panggilan</label><input class="input" id="f-panggilan" value="${esc(e.panggilan)}" placeholder="opsional"></div>
        <div class="field"><label>Jenis Kelamin</label><select class="select" id="f-kelamin">
          <option value="">—</option><option value="L" ${e.kelamin==='L'?'selected':''}>Laki-laki</option><option value="P" ${e.kelamin==='P'?'selected':''}>Perempuan</option></select></div>
        <div class="field"><label>Tanggal Lahir</label><input class="input" id="f-ttl" type="date" value="${esc(e.ttl)}"></div>
        <div class="field"><label>No. WhatsApp *</label><input class="input" id="f-hp" value="${esc(e.no_hp)}" placeholder="0812xxxxxxxx"></div>
        <div class="field full"><label>Email (opsional)</label><input class="input" id="f-email" type="email" value="${esc(e.email)}" placeholder="email@contoh.com"></div>
        <div class="field full"><label>Alamat</label><input class="input" id="f-alamat" value="${esc(e.alamat)}" placeholder="Alamat tempat tinggal"></div>
        <div class="field full"><label>URL Foto (opsional)</label><input class="input" id="f-foto" value="${esc(e.foto||'')}" placeholder="https://… atau kosongkan"></div>
      </div>
      <div class="field full" id="roles-field" style="${e.tipe==='pelayan'?'':'display:none'}">
        <label>Peran Pelayanan</label><div class="role-select-box" id="role-select">${roleOpts}</div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button>
      <button class="btn btn-primary" id="save-member">${m?'Simpan Perubahan':'Tambah Anggota'}</button></div>
  </div>`);

  // type toggle
  $$('#type-radio input').forEach(r => r.addEventListener('change', () => {
    $$('#type-radio label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    $('#roles-field').style.display = $('#type-radio input[value="pelayan"]').checked ? '' : 'none';
  }));
  // role multiselect
  $('#role-select').addEventListener('click', e => { const o = e.target.closest('[data-roleopt]'); if (o) o.classList.toggle('on'); });

  $('#save-member').addEventListener('click', async () => {
    const nama = $('#f-nama').value.trim(), hp = $('#f-hp').value.trim();
    if (!nama) return toast('Nama wajib diisi', 'err');
    if (!hp) return toast('No. WhatsApp wajib diisi', 'err');
    const tipe = $('#type-radio input:checked').value;
    const roles = tipe === 'pelayan' ? $$('#role-select .role-opt.on').map(x => x.dataset.roleopt) : [];
    const patch = {
      nama, panggilan: $('#f-panggilan').value.trim(), kelamin: $('#f-kelamin').value,
      ttl: $('#f-ttl').value || null, no_hp: hp, email: $('#f-email').value.trim(),
      alamat: $('#f-alamat').value.trim(), foto: $('#f-foto').value.trim() || null, tipe, roles,
    };
    try {
      if (m) { await dbUpdateMember(m.id, patch); toast('Data anggota diperbarui', 'ok'); }
      else {
        patch.member_no = 'TM-' + String(state.members.length + 1).padStart(4, '0');
        await dbAddMember(patch); toast('Anggota baru ditambahkan', 'ok');
      }
      closeModal(); refreshAll();
    } catch (err) { toast('Gagal menyimpan: ' + err.message, 'err'); }
  });
}

function detailModal(m) {
  const rolesTxt = m.roles?.length ? m.roles.join(', ') : '—';
  openModal(`<div class="modal wide">
    <div class="modal-head"><h3>Detail Anggota</h3><span class="spacer"></span><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="detail-head">${avatarHTML(m)}
        <div><div class="mcard-id">${esc(m.member_no||'')}</div><h3>${esc(m.nama)}</h3>
          <div class="mcard-badges">${m.tipe==='pelayan'?'<span class="badge pelayan">Pelayan Tuhan</span>':'<span class="badge jemaat">Jemaat Biasa</span>'} ${(m.roles||[]).map(r=>`<span class="badge role">${esc(r)}</span>`).join('')}</div>
        </div></div>
      <div class="detail-rows">
        <div class="drow"><span class="k">Nama Panggilan</span><span class="v">${esc(m.panggilan||'—')}</span></div>
        <div class="drow"><span class="k">Jenis Kelamin</span><span class="v">${genderLabel(m.kelamin)}</span></div>
        <div class="drow"><span class="k">Tanggal Lahir</span><span class="v">${fmtDate(m.ttl)} ${age(m.ttl)!=null?'· '+age(m.ttl)+' tahun':''}</span></div>
        <div class="drow"><span class="k">No. WhatsApp</span><span class="v">${esc(m.no_hp||'—')}</span></div>
        <div class="drow"><span class="k">Email</span><span class="v">${esc(m.email||'—')}</span></div>
        <div class="drow"><span class="k">Alamat</span><span class="v">${esc(m.alamat||'—')}</span></div>
        <div class="drow"><span class="k">Peran</span><span class="v">${esc(rolesTxt)}</span></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Tutup</button>
      <button class="btn btn-soft" data-edit2="${m.id}">Edit</button>
      <button class="btn btn-primary" data-card="${m.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> Kartu Anggota</button>
    </div>
  </div>`);
}

function cardModal(m) {
  const [c1] = avatarColor(m.nama);
  const cardHTML = `<div class="id-card" id="print-card">
    <div class="id-card-head"><span class="e"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v6" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M9 5h6" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M5 13c0 4 3 6 7 6s7-2 7-6H5z" fill="#fff"/></svg></span>
      <span class="tt">GBI <em>Family Church</em><small>TAMAN MODERN · RAYON 1D</small></span></div>
    <div class="id-card-body">
      ${m.foto?`<img class="ava" src="${esc(m.foto)}">`:`<div class="ava">${initials(m.nama)}</div>`}
      <div><div class="nm">${esc(m.nama)}</div><div class="rl">${esc(m.tipe==='pelayan'?(m.roles?.join(' · ')||'Pelayan'):'Jemaat')}</div></div>
    </div>
    <div class="id-card-foot"><div><div class="lab">No. Anggota</div><div class="val">${esc(m.member_no||'-')}</div></div>
      <div style="text-align:right;"><div class="lab">Kartu Anggota Jemaat</div><div class="val">${new Date().getFullYear()}</div></div></div>
  </div>`;
  openModal(`<div class="modal">
    <div class="modal-head"><h3>Kartu Anggota</h3><span class="spacer"></span><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">${cardHTML}
      <p style="text-align:center; color:var(--ink-2); font-size:.85rem; margin-top:18px;">Pratinjau kartu anggota gereja. Klik cetak untuk menyimpan sebagai PDF / mencetak.</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Tutup</button>
      <button class="btn btn-primary" id="print-card-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg> Cetak Kartu</button></div>
  </div>`);
  $('#print-card-btn').addEventListener('click', () => printCard(cardHTML));
}
function printCard(cardHTML) {
  const w = window.open('', '_blank', 'width=420,height=320');
  w.document.write(`<html><head><title>Kartu Anggota GBI</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
    <style>${cardCSS()}</style></head><body style="margin:0;padding:24px;display:grid;place-items:center;font-family:'Plus Jakarta Sans',sans-serif;">
    ${cardHTML}</body><script>setTimeout(()=>{window.print()},400)<\/script></html>`);
  w.document.close();
}
function cardCSS() {
  // inline subset of id-card styles so the print window is self-contained
  return `:root{--brand:#F26B1F;--brand-strong:#D9550A;--brand-deep:#B8470A;--gold:#F4B400;}
  .id-card{width:340px;border-radius:18px;overflow:hidden;color:#fff;position:relative;background:linear-gradient(150deg,var(--brand),var(--brand-strong) 60%,var(--brand-deep));box-shadow:0 18px 50px rgba(120,72,24,.25);}
  .id-card::before{content:'';position:absolute;right:-50px;top:-50px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.12);}
  .id-card-head{display:flex;align-items:center;gap:10px;padding:16px 18px 0;position:relative;z-index:2;}
  .id-card-head .e{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fff 0 52%,var(--gold) 53% 100%);display:grid;place-items:center;}
  .id-card-head .e svg{width:60%;height:60%;}
  .id-card-head .tt{font-weight:800;font-style:italic;font-size:.95rem;line-height:1;}
  .id-card-head .tt em{color:var(--gold);} .id-card-head .tt small{display:block;font-style:normal;font-weight:600;font-size:.6rem;letter-spacing:.18em;opacity:.85;margin-top:3px;}
  .id-card-body{display:flex;gap:14px;padding:16px 18px;position:relative;z-index:2;align-items:center;}
  .id-card-body .ava{width:66px;height:66px;border-radius:14px;background:rgba(255,255,255,.9);color:var(--brand-strong);display:grid;place-items:center;font-weight:800;font-size:1.4rem;object-fit:cover;}
  .id-card-body .nm{font-weight:800;font-size:1.1rem;line-height:1.15;} .id-card-body .rl{font-size:.8rem;opacity:.9;margin-top:3px;}
  .id-card-foot{display:flex;justify-content:space-between;align-items:flex-end;padding:0 18px 16px;position:relative;z-index:2;}
  .id-card-foot .lab{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;opacity:.75;} .id-card-foot .val{font-weight:800;font-size:.95rem;letter-spacing:.04em;}`;
}

function roleManagerModal() {
  openModal(`<div class="modal">
    <div class="modal-head"><h3>Kelola Peran Pelayanan</h3><span class="spacer"></span><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">
      <p style="color:var(--ink-2); font-size:.9rem; margin-bottom:16px;">Tambah peran baru (misal: <b>Lighting</b>, <b>Sound System</b>, <b>Penerima Tamu</b>) atau hapus yang tidak terpakai.</p>
      <div class="role-manage-list" id="rm-list"></div>
      <div style="display:flex; gap:10px;">
        <input class="input" id="rm-input" placeholder="Nama peran baru…" style="flex:1;">
        <button class="btn btn-primary" id="rm-add">Tambah</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Selesai</button></div>
  </div>`);
  const draw = () => $('#rm-list').innerHTML = state.roles.map(r =>
    `<span class="role-tag">${esc(r)}<button data-delrole="${esc(r)}" title="Hapus">✕</button></span>`).join('');
  draw();
  $('#rm-add').addEventListener('click', async () => {
    const v = $('#rm-input').value.trim(); if (!v) return;
    if (state.roles.includes(v)) return toast('Peran sudah ada', 'err');
    await dbAddRole(v); $('#rm-input').value = ''; draw(); refreshAll(); toast('Peran ditambahkan', 'ok');
  });
  $('#rm-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#rm-add').click(); });
  $('#rm-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-delrole]'); if (!b) return;
    if (!confirm(`Hapus peran "${b.dataset.delrole}"? Peran ini akan dilepas dari semua anggota.`)) return;
    await dbDeleteRole(b.dataset.delrole); draw(); refreshAll(); toast('Peran dihapus', 'ok');
  });
}

function importModal() {
  openModal(`<div class="modal">
    <div class="modal-head"><h3>Import Data dari Excel</h3><span class="spacer"></span><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="dropzone" id="dropzone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        <h4>Klik atau seret file Excel ke sini</h4><p>Format .xlsx, .xls, atau .csv</p>
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" hidden>
      </div>
      <div class="import-note">
        <b>Kolom yang dikenali:</b> <code>nama</code>, <code>panggilan</code>, <code>ttl</code> (YYYY-MM-DD), <code>kelamin</code> (L/P),
        <code>email</code>, <code>no_hp</code>, <code>alamat</code>, <code>tipe</code> (jemaat/pelayan), <code>roles</code> (pisahkan dengan koma).<br>
        <button class="tpl-chip" id="dl-template" style="margin-top:10px;">⬇ Unduh template Excel</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Batal</button></div>
  </div>`);
  const dz = $('#dropzone'), fi = $('#file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleImport(e.dataTransfer.files[0]); });
  fi.addEventListener('change', e => { if (e.target.files[0]) handleImport(e.target.files[0]); });
  $('#dl-template').addEventListener('click', downloadTemplate);
}

async function handleImport(file) {
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Coba lagi.', 'err');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let added = 0;
    for (const r of rows) {
      const get = (k) => r[k] ?? r[k.toUpperCase()] ?? r[k[0].toUpperCase() + k.slice(1)] ?? '';
      const nama = String(get('nama')).trim(); if (!nama) continue;
      const rolesRaw = String(get('roles') || '').trim();
      const roles = rolesRaw ? rolesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      roles.forEach(r => { if (!state.roles.includes(r)) dbAddRole(r); });
      const tipe = String(get('tipe')).toLowerCase().includes('pelayan') || roles.length ? 'pelayan' : 'jemaat';
      await dbAddMember({
        member_no: 'TM-' + String(state.members.length + 1).padStart(4, '0'),
        nama, panggilan: String(get('panggilan')).trim(),
        ttl: String(get('ttl')).trim() || null, kelamin: String(get('kelamin')).trim().toUpperCase().slice(0, 1),
        email: String(get('email')).trim(), no_hp: String(get('no_hp') || get('hp') || get('whatsapp')).trim(),
        alamat: String(get('alamat')).trim(), tipe, roles, foto: String(get('foto')).trim() || null,
      });
      added++;
    }
    closeModal(); refreshAll();
    toast(`${added} anggota berhasil diimport`, 'ok');
  } catch (e) { console.error(e); toast('Gagal membaca file: ' + e.message, 'err'); }
}
function downloadTemplate() {
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Coba lagi.', 'err');
  const ws = XLSX.utils.json_to_sheet([
    { nama:'Contoh Jemaat', panggilan:'Contoh', ttl:'1995-01-20', kelamin:'L', email:'contoh@mail.com', no_hp:'081200000000', alamat:'Jl. Contoh No.1', tipe:'pelayan', roles:'Pemusik, Singer' },
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Jemaat');
  XLSX.writeFile(wb, 'template_jemaat_gbi.xlsx');
}
function exportData() {
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat.', 'err');
  const ws = XLSX.utils.json_to_sheet(state.members.map(m => ({
    member_no: m.member_no, nama: m.nama, panggilan: m.panggilan, ttl: m.ttl, kelamin: m.kelamin,
    email: m.email, no_hp: m.no_hp, alamat: m.alamat, tipe: m.tipe, roles: (m.roles || []).join(', '),
  })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data Jemaat');
  XLSX.writeFile(wb, `data_jemaat_gbi_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Data diekspor ke Excel', 'ok');
}

function settingsModal() {
  const f = CONFIG.fonnte;
  openModal(`<div class="modal">
    <div class="modal-head"><h3>Pengaturan Koneksi Fonnte</h3><span class="spacer"></span><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">
      <div class="import-note" style="margin-top:0;">${DEMO_MODE ? '✦ Saat ini berjalan dalam <b>mode demo</b> (Supabase belum dikonfigurasi). Pengiriman hanya simulasi.' : 'Terhubung ke database.'}</div>
      <div class="field" style="margin-top:16px;"><label>Mode Pengiriman</label>
        <select class="select" id="set-mode">
          <option value="proxy" ${f.mode==='proxy'?'selected':''}>Proxy (aman — disarankan)</option>
          <option value="direct" ${f.mode==='direct'?'selected':''}>Direct (tes lokal saja)</option>
          <option value="demo" ${f.mode==='demo'?'selected':''}>Demo (simulasi)</option>
        </select></div>
      <div class="field"><label>URL Proxy Serverless</label><input class="input" id="set-proxy" value="${esc(f.proxyUrl)}" placeholder="/api/blast"></div>
      <div class="field"><label>Token Fonnte (hanya untuk mode direct)</label><input class="input" id="set-token" value="${esc(f.token)}" placeholder="token device Fonnte"></div>
      <p style="font-size:.82rem; color:var(--ink-2);">Token disimpan hanya di sesi ini. Untuk produksi, simpan token sebagai ENV di Vercel dan pakai mode <b>proxy</b>.</p>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Tutup</button><button class="btn btn-primary" id="save-set">Simpan</button></div>
  </div>`);
  $('#save-set').addEventListener('click', () => {
    CONFIG.fonnte.mode = $('#set-mode').value;
    CONFIG.fonnte.proxyUrl = $('#set-proxy').value.trim();
    CONFIG.fonnte.token = $('#set-token').value.trim();
    updateFonteStatus(); closeModal(); toast('Pengaturan disimpan', 'ok');
  });
}
function updateFonteStatus() {
  const el = $('#fonte-status'), t = $('#fonte-status-text');
  const connected = !DEMO_MODE && CONFIG.fonnte.mode !== 'demo' && (CONFIG.fonnte.mode === 'proxy' ? !!CONFIG.fonnte.proxyUrl : !!CONFIG.fonnte.token);
  el.classList.toggle('on', connected); el.classList.toggle('off', !connected);
  t.textContent = connected ? `Fonnte: terhubung (${CONFIG.fonnte.mode})` : (DEMO_MODE ? 'Mode demo' : 'Fonnte: belum terhubung');
}

/* =========================================================================
   12. TOAST
   ========================================================================= */
let toastT;
function toast(msg, type = '') {
  const ic = type === 'ok' ? '<path d="M20 6L9 17l-5-5"/>' : type === 'err' ? '<path d="M18 6L6 18M6 6l12 12"/>' : '<path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="10"/>';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${ic}</svg> ${esc(msg)}`;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(40px)'; setTimeout(() => el.remove(), 300); }, 3200);
}

/* =========================================================================
   13. WA single quick-send (from member card)
   ========================================================================= */
function quickWA(m) {
  state.quick.clear(); state.selRoles.clear(); state.includeIds = new Set([m.id]); state.excludeIds.clear();
  switchPage('dashboard'); refreshBlastUI();
  $('#blast-message').focus();
  toast(`${firstName(m)} ditambahkan ke daftar penerima`, 'ok');
}

/* =========================================================================
   14. REFRESH ORCHESTRATION
   ========================================================================= */
function refreshBlastUI() { renderQuickTargets(); renderRoleTargets(); renderRecipients(); }
function refreshDashboard() { renderStats(); renderDonut(); renderRoleBars(); renderBirthdays(); refreshBlastUI(); }
function refreshMembers() { renderRoleFilterOptions(); renderMembers(); }
function refreshAll() { refreshDashboard(); refreshMembers(); }

function bootDashboard() {
  renderTemplates();
  refreshAll();
  updateFonteStatus();
}

/* =========================================================================
   15. EVENT WIRING
   ========================================================================= */
function wire() {
  // login
  $('#login-btn').addEventListener('click', doLogin);
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#login-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-pass').focus(); });

  // nav + logout
  $$('.nav button').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
  $('#logout-btn').addEventListener('click', () => location.reload());
  $('#fonte-status').addEventListener('click', settingsModal);

  // modal host delegation (close buttons)
  $('#modal-host').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeModal();
    const ce = e.target.closest('[data-edit2]'); if (ce) { const m = state.members.find(x => x.id === ce.dataset.edit2); closeModal(); memberFormModal(m); return; }
    const cc = e.target.closest('[data-card]'); if (cc) { const m = state.members.find(x => x.id === cc.dataset.card); cardModal(m); return; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ---- BLAST controls ----
  $('#quick-targets').addEventListener('click', e => {
    const b = e.target.closest('[data-quick]'); if (!b) return;
    const k = b.dataset.quick;
    state.quick.has(k) ? state.quick.delete(k) : state.quick.add(k);
    state.excludeIds.clear(); refreshBlastUI();
  });
  $('#role-targets').addEventListener('click', e => {
    if (e.target.closest('#manage-roles-chip')) return roleManagerModal();
    const b = e.target.closest('[data-role]'); if (!b) return;
    const r = b.dataset.role;
    state.selRoles.has(r) ? state.selRoles.delete(r) : state.selRoles.add(r);
    state.excludeIds.clear(); refreshBlastUI();
  });
  $('#match-toggle').addEventListener('click', e => {
    const b = e.target.closest('[data-match]'); if (!b) return;
    state.matchMode = b.dataset.match;
    $$('#match-toggle button').forEach(x => x.classList.toggle('on', x === b));
    renderRecipients();
  });
  $('#person-search').addEventListener('input', e => renderPersonResults(e.target.value.trim()));
  $('#person-results').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    state.includeIds.add(b.dataset.add); state.excludeIds.delete(b.dataset.add);
    $('#person-search').value = ''; $('#person-results').innerHTML = ''; renderRecipients();
  });
  $('#recipients-list').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    state.excludeIds.add(b.dataset.remove); state.includeIds.delete(b.dataset.remove); renderRecipients();
  });
  $('#clear-recip').addEventListener('click', () => {
    state.quick.clear(); state.selRoles.clear(); state.includeIds.clear(); state.excludeIds.clear(); refreshBlastUI();
  });
  $('#blast-message').addEventListener('input', updateCharCount);
  $('#template-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-tpl]'); if (!b) return;
    $('#blast-message').value = state.templates[+b.dataset.tpl].text; updateCharCount();
  });
  $$('.var-pill').forEach(p => p.addEventListener('click', () => {
    const ta = $('#blast-message'); const v = p.dataset.var;
    ta.value = ta.value.slice(0, ta.selectionStart) + v + ta.value.slice(ta.selectionEnd); updateCharCount(); ta.focus();
  }));
  $('#save-tpl').addEventListener('click', () => {
    const t = $('#blast-message').value.trim(); if (!t) return toast('Tulis pesan dulu', 'err');
    const name = prompt('Nama template:'); if (!name) return;
    state.templates.push({ name, text: t }); renderTemplates(); toast('Template disimpan', 'ok');
  });
  $('#send-blast').addEventListener('click', sendBlast);
  $('#bday-blast').addEventListener('click', () => {
    const todays = upcomingBirthdays(10).filter(x => x.days === 0).map(x => x.m);
    state.quick.clear(); state.selRoles.clear(); state.excludeIds.clear();
    state.includeIds = new Set(todays.length ? todays.map(m => m.id) : upcomingBirthdays(3).map(x => x.m.id));
    $('#blast-message').value = state.templates.find(t => t.name.includes('Ultah'))?.text || 'Selamat ulang tahun {nama}! ✨';
    updateCharCount(); refreshBlastUI();
    toast('Penerima & template ucapan ultah disiapkan', 'ok');
  });

  // ---- MEMBERS controls ----
  $('#member-search').addEventListener('input', e => { memberFilters.q = e.target.value; renderMembers(); });
  $('#filter-type').addEventListener('change', e => { memberFilters.type = e.target.value; renderMembers(); });
  $('#filter-role').addEventListener('change', e => { memberFilters.role = e.target.value; renderMembers(); });
  $('#add-member-btn').addEventListener('click', () => memberFormModal());
  $('#import-btn').addEventListener('click', importModal);
  $('#export-btn').addEventListener('click', exportData);
  $('#member-grid').addEventListener('click', e => {
    const id = e.target.closest('[data-wa]')?.dataset.wa
      || e.target.closest('[data-edit]')?.dataset.edit
      || e.target.closest('[data-detail]')?.dataset.detail;
    const card = e.target.closest('.mcard');
    if (e.target.closest('[data-wa]')) return quickWA(state.members.find(m => m.id === e.target.closest('[data-wa]').dataset.wa));
    if (e.target.closest('[data-edit]')) return memberFormModal(state.members.find(m => m.id === e.target.closest('[data-edit]').dataset.edit));
    if (e.target.closest('[data-detail]')) return detailModal(state.members.find(m => m.id === e.target.closest('[data-detail]').dataset.detail));
    if (card) return detailModal(state.members.find(m => m.id === card.dataset.id));
  });
}

/* =========================================================================
   15c. SCROLL FADE-IN (Landing Page)
   — Intersection Observer: elemen muncul smooth saat di-scroll
   ========================================================================= */
function initScrollFade() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const delay = parseInt(e.target.dataset.delay || '0', 10);
      setTimeout(() => e.target.classList.add('visible'), delay);
      obs.unobserve(e.target); // animasi sekali aja
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -48px 0px'
  });

  document.querySelectorAll('#landing .fade-up, #landing .fade-left, #landing .fade-right')
    .forEach(el => obs.observe(el));
}

/* =========================================================================
   15b. SLIDESHOW (Landing Page)
   — Direct inject, no async preload; foto langsung muncul tanpa nunggu load
   ========================================================================= */
function initSlideshow() {
  const container = document.getElementById('lp-slides');
  const dotsEl    = document.getElementById('lp-slide-dots');
  const prevBtn   = document.getElementById('lp-slide-prev');
  const nextBtn   = document.getElementById('lp-slide-next');
  if (!container) return;

  const srcs = SLIDE_IMAGES.slice(0, 10);
  if (!srcs.length) { prevBtn?.remove(); nextBtn?.remove(); dotsEl?.remove(); return; }

  // Langsung buat slide divs — tanpa preload, tanpa nunggu async
  container.innerHTML = '';
  const slides = srcs.map((src, i) => {
    const div = document.createElement('div');
    div.className = 'lp-slide' + (i === 0 ? ' active' : '');
    // background-image set langsung; kalau file ga ada browser skip aja
    div.style.cssText = `background-image:url('${src}');background-size:cover;background-position:center;`;
    container.appendChild(div);
    return div;
  });

  // Dots (hanya kalau lebih dari 1 slide)
  if (dotsEl && slides.length > 1) {
    dotsEl.innerHTML = slides.map((_, i) =>
      `<button class="lp-slide-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></button>`
    ).join('');
    dotsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-idx]');
      if (b) goTo(+b.dataset.idx);
    });
  } else if (dotsEl) {
    dotsEl.remove();
  }

  if (slides.length <= 1) { prevBtn?.remove(); nextBtn?.remove(); return; }

  let cur = 0, timer;

  function goTo(n) {
    slides[cur].classList.remove('active');
    dotsEl?.children[cur]?.classList.remove('active');
    cur = (n + slides.length) % slides.length;
    slides[cur].classList.add('active');
    dotsEl?.children[cur]?.classList.add('active');
    resetTimer();
  }
  function resetTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(cur + 1), 5000);
  }

  prevBtn?.addEventListener('click', () => goTo(cur - 1));
  nextBtn?.addEventListener('click', () => goTo(cur + 1));

  const hero = document.getElementById('lp-hero');
  hero?.addEventListener('mouseenter', () => clearInterval(timer));
  hero?.addEventListener('mouseleave', resetTimer);

  resetTimer();
}

/* =========================================================================
   16. INIT
   ========================================================================= */
(async function init() {
  // --- Routing: tampilkan landing di "/" — panel admin di "/adminblast" ---
  const isAdmin = window.location.pathname.replace(/\/$/, '').endsWith('adminblast') ||
                  window.location.pathname.includes('adminblast');

  if (!isAdmin) {
    // Sembunyikan splash (default visible di HTML), tampilkan landing
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hidden');
    const landing = document.getElementById('landing');
    if (landing) landing.classList.remove('hidden');

    // Fill emblems di landing
    fillEmblems();

    // Auto-load logo.png kalau ada — gantiin emblem CSS
    const logoImg = new Image();
    logoImg.onload = () => {
      document.querySelectorAll('#landing .brand-emblem[data-emblem]').forEach(el => {
        const img = document.createElement('img');
        img.src = 'logo.png';
        img.alt = 'GBI Family Church Taman Modern';
        img.style.cssText = 'height:40px;width:auto;object-fit:contain;display:block;';
        el.replaceWith(img);
      });
    };
    logoImg.src = 'logo.png';

    // Navbar scroll effect + mobile menu
    const nav = document.getElementById('lp-nav');
    const navToggle = document.getElementById('lp-nav-toggle');
    const navMobile = document.getElementById('lp-nav-mobile');
    const closeMobileNav = () => {
      navMobile?.classList.remove('open');
      navToggle?.setAttribute('aria-expanded', 'false');
    };
    if (nav) {
      window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 30);
      }, { passive: true });
    }
    navToggle?.addEventListener('click', () => {
      const open = navMobile?.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navMobile?.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', closeMobileNav);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMobileNav();
    });

    // Social link injection (update hrefs from config)
    document.querySelectorAll('[href*="gbifamilychurchtamanmodern"]').forEach(a => { a.href = SOCIAL_LINKS.instagram; });
    document.querySelectorAll('[href*="tiktok.com/@gbifamilychurch"]').forEach(a => { a.href = SOCIAL_LINKS.tiktok; });
    document.querySelectorAll('[href*="youtube.com/@gbifamilychurch"]').forEach(a => { a.href = SOCIAL_LINKS.youtube; });
    document.querySelectorAll('[href*="wa.me"]').forEach(a => { a.href = SOCIAL_LINKS.whatsapp; });

    // Init slideshow
    initSlideshow();

    // Scroll fade-in
    initScrollFade();

    // Smooth scroll untuk anchor link
    document.querySelectorAll('#landing a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });

    return; // jangan lanjutkan ke splash/app
  }

  // --- Admin panel flow ---
  wire();
  startSplash();
  await initData();   // siapkan data sambil splash berjalan
})();