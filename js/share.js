/* ============================================================
   SHARE — public showcase URLs (no backend) + CSV import/export.

   Showcase: encode a portfolio's cards into URL fragment (#) using
   base64. URL fragments aren't sent to the server and have generous
   length limits, so we can fit hundreds of cards.

   QR: generate a data-URL QR using the open qrserver.com endpoint
   for instant in-store sharing.
   ============================================================ */

const Share = (function () {

  function _b64encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }
  function _b64decode(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return null; }
  }

  /* Build a self-contained read-only showcase URL */
  function buildShowcaseUrl(portfolio, ownerName) {
    const payload = {
      v: 1,
      name: portfolio.name,
      color: portfolio.color,
      icon: portfolio.icon,
      owner: ownerName,
      ts: Date.now(),
      cards: portfolio.cards.map(c => ({
        id: c.cardId, n: c.name, s: c.set, num: c.number, i: c.image,
        c: c.condition, q: c.qty || 1, v: c.currentValue || 0,
      })),
    };
    const encoded = _b64encode(payload);
    const base = `${location.origin}${location.pathname}`;
    return `${base}#showcase=${encoded}`;
  }

  function parseShowcase(hash) {
    if (!hash) return null;
    const m = hash.match(/showcase=([^&]+)/);
    if (!m) return null;
    return _b64decode(m[1]);
  }

  function clearShowcase() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* QR code via qrserver.com (free, no key) */
  function qrCodeUrl(text, size = 240) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=0e2a5c&margin=8`;
  }

  /* ============================================================
     CSV — export portfolio rows
     ============================================================ */
  function exportCSV(portfolio) {
    const headers = ['Name','Set','Number','TCG','Condition','Finish','Qty','Purchase Price','Current Value','Added'];
    const rows = portfolio.cards.map(c => [
      c.name, c.set, c.number || '', c.tcg || '',
      c.condition?.kind === 'graded' ? `${c.condition.grader} ${c.condition.grade}` : (c.condition?.value || ''),
      c.finish || '',
      c.qty || 1,
      (c.purchasePrice || 0).toFixed(2),
      (c.currentValue || 0).toFixed(2),
      new Date(c.addedAt || Date.now()).toISOString().slice(0, 10),
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n');
    return csv;
  }
  function escapeCSV(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCSV(filename, csv) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ============================================================
     CSV — import rows (best-effort; expects Name + Condition + Qty)
     ============================================================ */
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = parseRow(lines[0]).map(h => h.toLowerCase());
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      const row = {};
      headers.forEach((h, j) => row[h] = cells[j] || '');
      out.push(row);
    }
    return out;
  }
  function parseRow(line) {
    const out = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i+1] === '"' && inQuotes) { cur += '"'; i++; continue; }
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  return { buildShowcaseUrl, parseShowcase, clearShowcase, qrCodeUrl, exportCSV, downloadCSV, parseCSV };
})();
