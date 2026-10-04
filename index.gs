/**
 * SINKRON CATATAN & TUGAS PENAGIHAN — Google Apps Script (PT Perintis Perkasa)
 *
 * Langkah (sekali saja):
 *  1) Buka script.google.com > Proyek baru  (atau dari sheet: Ekstensi > Apps Script). Hapus isinya, tempel seluruh file ini, Save.
 *  2) Pilih fungsi "setup" di bar atas > Run > setujui izin (Review permissions > Allow).
 *  3) Deploy > New deployment > jenis "Web app":
 *       Execute as: Me   |   Who has access: Anyone   > Deploy
 *  4) Salin "Web app URL" (berakhiran /exec) lalu kirim ke Claude / tempel ke SYNC_URL di file dashboard.
 *
 * SYNC_KEY di bawah SUDAH sama dengan yang ada di file dashboard — jangan diubah
 * (kalau diubah, ubah juga SYNC_KEY di keenam file dashboard).
 */
var SYNC_KEY = 'pp-Fnf_3aQWRDr1AtzjBjfS';
var SHEET_NAME = 'Catatan Penagihan';
// ID spreadsheet "Laporan Piutang Showroom" (dari URL-nya). Dengan ini skrip bisa dipasang lewat script.google.com
// (Proyek baru) TANPA harus dibuka dari menu Ekstensi di sheet.
var SPREADSHEET_ID = '1ul2WqwEb4X66Q6CYdycNvtyaLu08axFkZL75FI-qdmM';

/* ===== Aturan penggabungan catatan/tugas (SAMA persis di dashboard dan di Apps Script) ===== */
function ppMergeRec(a, b) {
  a = a || {}; b = b || {};
  const out = { nama: a.nama || b.nama || '', jumlah: a.jumlah || b.jumlah || 0, leasing: a.leasing || b.leasing || '', jto: a.jto || b.jto || '' };
  out.delAt = [a.delAt, b.delAt].filter(Boolean).sort().pop() || null;             // hapus-riwayat: yang terbaru menang
  const pick = (b.lu || '') > (a.lu || '') ? b : a;                                  // status lunas: perubahan terbaru menang
  out.lunasAt = pick.lunasAt || null; out.lu = pick.lu || null;
  const notes = {};                                                                  // catatan: gabungan semua perangkat (hanya bertambah)
  [a, b].forEach(r => (r.notes || []).forEach(n => { const id = n.id || ('L' + (n.t || '') + '|' + n.x); notes[id] = Object.assign({}, n, { id: id }); }));
  out.notes = Object.keys(notes).map(k => notes[k]).filter(n => !out.delAt || (n.t && n.t > out.delAt))
    .sort((p, q) => String(p.t || '').localeCompare(String(q.t || '')));
  const tasks = {};                                                                  // tugas: versi dengan waktu ubah terbaru menang
  [a, b].forEach(r => (r.tasks || []).forEach(t => { const p = tasks[t.id]; if (!p || (t.u || t.t || '') > (p.u || p.t || '')) tasks[t.id] = t; }));
  out.tasks = Object.keys(tasks).map(k => tasks[k]).filter(t => !out.delAt || (t.t && t.t > out.delAt));
  return out;
}

/* ===== Server: simpan satu baris per faktur di tab "Catatan" ===== */
function sheet_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  var first = sh.getLastRow() ? String(sh.getRange(1, 1).getValue()) : '';
  if (first !== 'divisi') {                                   // tab kosong / belum ada header -> buat otomatis
    if (sh.getLastRow()) sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, 4).setValues([['divisi', 'faktur', 'data (JSON)', 'diubah']]);
  }
  return sh;
}
/** Jalankan SEKALI dari editor (tombol Run) untuk menyiapkan tab dan memberi izin. */
function setup() {
  sheet_();
  Logger.log('Siap. Sekarang Deploy > New deployment > Web app.');
  try { SpreadsheetApp.getActive().toast('Siap. Sekarang Deploy > New deployment > Web app.', 'Sinkron catatan', 8); } catch (e) {}
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return out_({ ok: true, info: 'Sinkron catatan penagihan aktif' }); }
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.key !== SYNC_KEY) return out_({ ok: false, error: 'Kunci salah' });
    var div = String(req.divisi || '');
    if (!div) return out_({ ok: false, error: 'Divisi kosong' });
    var sh = sheet_(), last = sh.getLastRow();
    var data = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    var rowOf = {}, db = {};
    data.forEach(function (r, i) { if (r[0] === div) { rowOf[r[1]] = i + 2; try { db[r[1]] = JSON.parse(r[2]); } catch (x) {} } });
    var inc = req.db || {};
    Object.keys(inc).forEach(function (f) {
      var m = ppMergeRec(db[f], inc[f]), json = JSON.stringify(m);
      db[f] = m;
      if (json.length > 45000) return;                       // batas isi satu sel Google Sheets
      if (rowOf[f]) sh.getRange(rowOf[f], 3, 1, 2).setValues([[json, new Date()]]);
      else { sh.appendRow([div, f, json, new Date()]); rowOf[f] = sh.getLastRow(); }
    });
    return out_({ ok: true, db: db });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
