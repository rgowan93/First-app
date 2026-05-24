/* ============================================================
   OCR — lazy-load Tesseract.js the first time we scan.
   Reads card name + detects which TCG, returns top guesses.
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

  /* Render the image to a canvas at higher contrast for better OCR.
     Crops top portion so we focus on the name (most TCG cards put it up top). */
  function preprocess(file, cropPct = 0.45) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const W = img.width, H = img.height;
        const cropH = Math.floor(H * cropPct);
        // Upscale small images for better OCR
        const scale = W < 800 ? 2 : 1;
        const canvas = document.createElement('canvas');
        canvas.width = W * scale; canvas.height = cropH * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, W, cropH, 0, 0, W * scale, cropH * scale);
        // Boost contrast a bit to help with translucent text overlays on Pokémon cards
        try {
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const boosted = lum > 140 ? Math.min(255, lum + 30) : Math.max(0, lum - 30);
            px[i] = px[i + 1] = px[i + 2] = boosted;
          }
          ctx.putImageData(d, 0, 0);
        } catch { /* CORS-tainted canvas — skip contrast boost */ }
        canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function recognize(file, onProgress) {
    const T = await loadTesseract();
    // Scan top 45% — captures name AND key TCG signals (HP, Stage, mana cost).
    const blob = await preprocess(file, 0.45);
    const { data } = await T.recognize(blob, 'eng', {
      logger: (m) => { if (onProgress) onProgress(m); },
    });
    const raw = (data.text || '').trim();
    return { raw, lines: raw.split(/\n/).map(l => l.trim()).filter(Boolean) };
  }

  /* Detect which TCG the card is from by looking for signature keywords. */
  function detectTCG(rawText) {
    const t = (rawText || '').toUpperCase();
    if (/\bHP\s*\d+/.test(t) || /\bSTAGE\s*\d/.test(t) || /\bEVOLVES\b/.test(t) ||
        /POK[EÉ]MON/.test(t) || /\bRETREAT\b/.test(t) || /\bBASIC\b.*\bPOK/.test(t) ||
        /\bWEAKNESS\b/.test(t) || /\bILLUS\b/.test(t) && /\bGAME FREAK\b/.test(t)) return 'pokemon';
    if (/\bCREATURE\b|\bSORCERY\b|\bINSTANT\b|\bPLANESWALKER\b|\bENCHANTMENT\b|\bARTIFACT\b/.test(t)) return 'mtg';
    if (/\bATK\b.*\bDEF\b|\bEFFECT MONSTER\b|\bTRAP CARD\b|\bSPELL CARD\b/.test(t)) return 'ygo';
    return null;
  }

  /* Heuristic: pick the best candidate phrase from OCR lines. */
  function extractCandidates(lines) {
    const cleaned = lines
      .map(l => l.replace(/[^A-Za-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(l => l.length >= 3);

    const scored = cleaned.map(l => {
      let score = 0;
      const words = l.split(' ');
      // Reasonable length window
      if (l.length >= 4 && l.length <= 30) score += 2;
      // Capitalized words look like card names
      score += words.filter(w => /^[A-Z][a-zA-Z]{2,}$/.test(w)).length * 2;
      // STRONGLY penalize fragmented lines (mostly single-character "words")
      const singles = words.filter(w => w.length === 1).length;
      if (singles >= 2) score -= singles * 2;
      if (singles / Math.max(words.length, 1) > 0.4) score -= 5;
      // Penalize lines that contain known non-name keywords
      if (/\b(HP|STAGE|BASIC|EVOLVES|FROM|WEAKNESS|RESISTANCE|RETREAT|ILLUS|ATK|DEF|CREATURE|INSTANT|SORCERY)\b/i.test(l)) score -= 4;
      // Penalize all-caps long lines (usually flavor text shouted in caps)
      if (l === l.toUpperCase() && l.length > 12) score -= 1;
      // Penalize digit-heavy lines (HP, stats, set codes)
      score -= (l.match(/\d/g) || []).length * 0.4;
      // Penalize set-code looking text (XXX/YYY)
      if (/\d+\/\d+/.test(l)) score -= 3;
      return { line: l, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, 5).map(s => s.line);
  }

  /* Try to find a "XX/YY" pattern in OCR text — useful for adding to query */
  function extractNumber(rawText) {
    const m = (rawText || '').match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    return m ? { number: m[1], total: m[2] } : null;
  }

  return { recognize, extractCandidates, detectTCG, extractNumber };
})();
