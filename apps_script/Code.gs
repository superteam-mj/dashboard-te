/**
 * Jembatan Google Drive untuk Dashboard TE (dijalankan di akun Google Anda).
 * Dibaca oleh sync_drive.py (GitHub Actions) lewat alamat web app.
 *
 * ISI DUA BARIS DI BAWAH, lalu Deploy sebagai Web app
 * (Execute as: Me, Who has access: Anyone). Lihat SETUP.md.
 */
const TOKEN = 'GANTI-DENGAN-KATA-ACAK-PANJANG';   // sama persis dengan secret GDRIVE_BRIDGE_TOKEN
const ROOT_ID = 'GANTI-DENGAN-ID-FOLDER-DASHBOARD-TE';

const TOPS = ['transaksi energi', 'pengendalian susut'];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.token || p.token !== TOKEN) return out({ error: 'unauthorized' });
  try {
    if (p.action === 'list') return out({ files: listAll() });
    if (p.action === 'get') return out(getFile(p.id));
    return out({ error: 'aksi tidak dikenal' });
  } catch (err) {
    return out({ error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function listAll() {
  const res = [];
  const root = DriveApp.getFolderById(ROOT_ID);
  const tops = root.getFolders();
  while (tops.hasNext()) {
    const f = tops.next();
    if (TOPS.indexOf(f.getName().trim().toLowerCase()) >= 0) walk(f, [f.getName()], res);
  }
  return res;
}

function walk(folder, path, res) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (!/\.xlsx$/i.test(name) || name.indexOf('~$') === 0) continue;
    res.push({ path: path.concat(name), id: f.getId(), mark: f.getLastUpdated().getTime() + '-' + f.getSize() });
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const s = subs.next();
    walk(s, path.concat(s.getName()), res);
  }
}

// Hanya file di dalam folder induk yang boleh diambil.
function isUnderRoot(file) {
  let level = [file];
  for (let depth = 0; depth < 12 && level.length; depth++) {
    const next = [];
    for (const item of level) {
      const parents = item.getParents();
      while (parents.hasNext()) {
        const par = parents.next();
        if (par.getId() === ROOT_ID) return true;
        next.push(par);
      }
    }
    level = next;
  }
  return false;
}

function getFile(id) {
  if (!id) return { error: 'id kosong' };
  const f = DriveApp.getFileById(id);
  if (!isUnderRoot(f)) return { error: 'di luar folder induk' };
  return { name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}
