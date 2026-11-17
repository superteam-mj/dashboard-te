/* Pengendalian Susut > Laporan Susut: menampilkan sheet Excel sebagai tabel.
   Data: tabel Supabase susut_reports & susut_sheets (diisi otomatis oleh sync_drive.py). Navigasi lewat hash: #susut/<sheet>  */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CH = 7.2; // px per karakter lebar kolom Excel
  let DATA = null, loading = null, TOTAL = 0;
  const S = { rep: 0, sheet: 0 };

  function setView(v) {
    document.body.dataset.view = v;
    document.querySelectorAll('#sections button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    $('subtitle').textContent = v === 'susut' ? 'Pengendalian Susut · Laporan Susut' : 'Laporan TUL III-09';
    document.title = v === 'susut' ? 'Laporan Susut — Dashboard TE' : 'Dashboard Penjualan Listrik';
  }

  const sheetCache = new Map();
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (!loading) {
      loading = DashAuth.ready
        .then(() => DashAuth.sb.from('susut_reports').select('file,title,modified,sheets').order('file'))
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          if (!data.length) throw new Error('belum ada laporan');
          return (DATA = { path: ['Pengendalian Susut', 'Laporan Susut'], reports: data });
        });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  async function loadSheet(file, idx) {
    const key = file + '|' + idx;
    if (!sheetCache.has(key)) {
      const { data, error } = await DashAuth.sb.from('susut_sheets').select('data').eq('file', file).eq('idx', idx).maybeSingle();
      if (error || !data) throw new Error(error ? error.message : 'sheet tidak ditemukan');
      sheetCache.set(key, data.data);
    }
    return sheetCache.get(key);
  }

  function cssFor(st, i) {
    const p = [];
    if (st.b) p.push('font-weight:650');
    if (st.i) p.push('font-style:italic');
    if (st.bg) p.push('background:#' + st.bg);
    if (st.fg) p.push('color:#' + st.fg);
    if (st.al) p.push('text-align:' + { c: 'center', r: 'right', l: 'left' }[st.al]);
    if (st.w) p.push('white-space:normal');
    if (st.in) p.push('padding-left:' + (6 + st.in * 9) + 'px');
    if (st.bd) p.push('border-bottom-color:var(--axis)');
    return `.x${i}{${p.join(';')}}`;
  }

  function tableHtml(sh) {
    const [, fc] = sh.freeze;
    const frozen = fc > 0 && fc <= 4 ? fc : 0;
    const left = [];
    let acc = 0;
    for (let i = 0; i < frozen; i++) { left.push(acc); acc += Math.max(Math.round(sh.widths[i] * CH + 10), 18); }

    const px = sh.widths.map((w) => Math.max(Math.round(w * CH + 10), 18));
    TOTAL = px.reduce((a, b) => a + b, 0);
    let h = `<colgroup>${px.map((w) => `<col style="width:${w}px">`).join('')}</colgroup><tbody>`;
    for (const row of sh.rows) {
      h += '<tr>';
      let col = 0;
      for (let k = 0; k < row.length; k++) {
        const c = row[k];
        if (c === null) { h += '<td class="e"></td>'; col++; continue; }
        const [txt, sid, cs, rs, num, err] = c;
        const cls = [`x${sid}`];
        if (num) cls.push('n');
        if (err) cls.push('err');
        if (txt == null) cls.push('e');
        else if (!num && !err && cs === 1 && (k + 1 >= row.length || row[k + 1] === null || row[k + 1][0] == null)) cls.push('o');
        if (col < frozen && cs === 1) cls.push('fz');
        const st = col < frozen && cs === 1 ? ` style="left:${left[col]}px"` : '';
        h += `<td class="${cls.join(' ')}"${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${st}>${txt == null ? '' : esc(txt)}</td>`;
        col += cs;
      }
      h += '</tr>';
    }
    return h + '</tbody>';
  }

  let renderTok = 0;
  async function renderSheet() {
    const rep = DATA.reports[S.rep];
    const tok = ++renderTok;
    $('sTabs').innerHTML = rep.sheets
      .map((n, i) => `<button type="button" role="tab" aria-selected="${i === S.sheet}" data-i="${i}">${esc(n)}</button>`).join('');
    const active = $('sTabs').querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('sMeta').textContent = 'Memuat sheet…';
    let sh;
    try { sh = await loadSheet(rep.file, S.sheet); } catch (e) {
      if (tok === renderTok) $('sMeta').textContent = 'Gagal memuat sheet: ' + e.message;
      return;
    }
    if (tok !== renderTok) return;  // pengguna sudah pindah tab
    $('sStyle').textContent = sh.styles.map(cssFor).join('');
    const t = $('sTbl');
    t.innerHTML = tableHtml(sh);
    t.style.width = TOTAL + 'px';
    $('sWrap').scrollTo(0, 0);
    $('sMeta').textContent = `Sheet ${S.sheet + 1} dari ${rep.sheets.length} · ${sh.rows.length} baris`;
  }

  function renderHead() {
    const rep = DATA.reports[S.rep];
    const [a, b] = DATA.path;
    $('sCrumb').innerHTML = `<span>${esc(a)}</span><i>›</i><span>${esc(b)}</span><i>›</i><b>${esc(rep.title)}</b>`;
    const sel = $('sRep');
    sel.hidden = DATA.reports.length < 2;
    sel.innerHTML = DATA.reports.map((r, i) => `<option value="${i}"${i === S.rep ? ' selected' : ''}>${esc(r.title)}</option>`).join('');
    const upd = new Date(DATA.reports[S.rep].modified);
    $('sFoot').textContent = `Sumber: ${rep.file} · file Excel diperbarui ${upd.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
  }

  function writeHash() {
    const rep = DATA.reports[S.rep];
    const parts = ['susut'];
    if (DATA.reports.length > 1) parts.push(encodeURIComponent(rep.file));
    parts.push(encodeURIComponent(rep.sheets[S.sheet]));
    history.replaceState(null, '', '#' + parts.join('/'));
  }

  function applyHash() {
    const m = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
    if (m[0] !== 'susut' || !DATA) return;
    let rest = m.slice(1);
    if (DATA.reports.length > 1 && rest.length > 1) {
      const i = DATA.reports.findIndex((r) => r.file === rest[0]);
      if (i >= 0) S.rep = i;
      rest = rest.slice(1);
    }
    const j = DATA.reports[S.rep].sheets.indexOf(rest[0]);
    S.sheet = j >= 0 ? j : 0;
  }

  async function show() {
    setView('susut');
    $('sMsg').hidden = false; $('sMsg').textContent = 'Memuat laporan…';
    try {
      await load();
    } catch (e) {
      $('sMsg').textContent = 'Laporan susut belum tersedia (' + e.message + ').';
      return;
    }
    $('sMsg').hidden = true;
    applyHash();
    renderHead(); renderSheet(); writeHash();
  }

  function showTransaksi() {
    setView('transaksi');
    if (location.hash.startsWith('#susut')) history.replaceState(null, '', location.pathname + location.search);
    // ukuran grafik perlu dihitung ulang setelah kembali tampil
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }

  function init() {
    document.querySelectorAll('#sections button').forEach((b) => {
      b.onclick = () => (b.dataset.v === 'susut' ? show() : showTransaksi());
    });
    $('sTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      S.sheet = +b.dataset.i; renderSheet(); writeHash();
    });
    $('sRep').onchange = (e) => { S.rep = +e.target.value; S.sheet = 0; renderHead(); renderSheet(); writeHash(); };
    window.addEventListener('hashchange', () => {
      if (location.hash.startsWith('#susut')) { if (document.body.dataset.view !== 'susut') show(); else { applyHash(); renderHead(); renderSheet(); } }
    });
    if (location.hash.startsWith('#susut')) show(); else setView('transaksi');
  }

  init();
})();
