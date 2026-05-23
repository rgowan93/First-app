/* ============================================================
   SOCIAL — referrals, share, leaderboard
   ============================================================ */

const Social = (function () {

  function shareUrl(referralCode) {
    const u = new URL(window.location.href);
    u.searchParams.set('ref', referralCode);
    u.hash = ''; // clean
    return u.toString();
  }

  async function share(state, opts = {}) {
    const url = shareUrl(state.referralCode);
    const title = opts.title || 'HOUSE OF CARDS: Booster Tycoon';
    const text  = opts.text  || `Join me on HOUSE OF CARDS — rip your first pack and we both earn 💎 gems! Use code ${state.referralCode}`;

    // Try native share first
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return { ok: true, method: 'native' };
      } catch (e) {
        if (e?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
        // fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return { ok: true, method: 'clipboard' };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }

  function parseReferralFromURL() {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get('ref') || null;
    } catch { return null; }
  }

  // Procedural-but-believable leaderboard built around player's progress
  function buildLeaderboard(state, names) {
    const totalEarn = state.metrics?.total_earned || 0;
    const players = names.map((n, i) => ({
      name: n,
      score: Math.floor(totalEarn * (2 + Math.random() * 6) * (1 + i / 30)),
    }));
    players.push({ name: state.name || 'You', score: totalEarn, you: true });
    players.sort((a, b) => b.score - a.score);
    return players.slice(0, 20);
  }

  return { share, shareUrl, copyText, parseReferralFromURL, buildLeaderboard };
})();
