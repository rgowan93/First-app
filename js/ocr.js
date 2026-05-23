/* ============================================================
   OCR — lazy-load Tesseract.js the first time we scan.
   Reads card name text from photo, returns top guesses.
   ============================================================ */

const OCR = (function () {
  let _loadPromise = null;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = window.__TESSERACT_CDN__;
      s.async = true;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Failed to load OCR engine'));
      document.head.appendChild(s);
    });
    return _loadPromise;
  }

  /* Crop the top portion of the image where card name typically sits */
  function cropTopBand(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Use just the top 25% — that's where the card name usually is
        const W = img.width, H = img.height;
        const cropH = Math.floor(H * 0.28);
        canvas.width = W; canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, W, cropH, 0, 0, W, cropH);
        canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function recognize(file, onProgress) {
    const T = await loadTesseract();
    const blob = await cropTopBand(file);
    const { data } = await T.recognize(blob, 'eng', {
      logger: (m) => { if (onProgress) onProgress(m); },
    });
    const raw = (data.text || '').trim();
    return { raw, lines: raw.split(/\n/).map(l => l.trim()).filter(Boolean) };
  }

  /* Heuristic: pick the best candidate phrase from OCR lines */
  function extractCandidates(lines) {
    const cleaned = lines
      .map(l => l.replace(/[^A-Za-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(l => l.length >= 3);

    const scored = cleaned.map(l => {
      let score = 0;
      // Reasonable length window
      if (l.length >= 4 && l.length <= 30) score += 2;
      // Capitalized words look like card names
      const words = l.split(' ');
      score += words.filter(w => /^[A-Z][a-zA-Z]+$/.test(w)).length;
      // Penalize all-caps lines (usually attack/text)
      if (l === l.toUpperCase() && l.length > 4) score -= 1;
      // Penalize digits-heavy lines (HP, stats, set codes)
      score -= (l.match(/\d/g) || []).length * 0.5;
      return { line: l, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map(s => s.line);
  }

  return { recognize, extractCandidates };
})();
