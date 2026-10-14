// Island names as people type them: atoll codes or names, loose spelling.

// Atolls are written by code (the islands' own atoll codes: AA, ADh, Dh, F,
// K, M, Th, V...) or by name; 'T' is an old spelling of Kaafu in reports.
export const ATOLL_NAMES = { T: 'K', ALIFALIF: 'AA', ALIFDHAAL: 'ADh', ALIFDHAALU: 'ADh', DHAALU: 'Dh', FAAFU: 'F',
  KAAFU: 'K', MEEMU: 'M', THAA: 'Th', VAAVU: 'V' };
const letters = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');

function distance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// 'AA. FERIDHOO', 'K.GAAFARU', 'Th Omadhoo', 'Thaa Omadhoo', 'BODUFOLHUDHOO' -> { atoll, name }
function splitName(text, codes) {
  const s = String(text || '').toUpperCase().replace(/POWER\s*HOUSE|ENGINE CONDITION REPORTS?|\d{4}/g, ' ').trim();
  const words = s.split(/[\s.]+/).filter(Boolean);
  // The atoll is the first word, or the first two ("Alif Alif").
  for (const n of [2, 1]) {
    if (words.length <= n) continue;
    const key = letters(words.slice(0, n).join(''));
    const atoll = codes.get(key) || ATOLL_NAMES[key];
    if (atoll) return { atoll, name: letters(words.slice(n).join('')) };
  }
  return { atoll: null, name: letters(s) };
}

/**
 * Finds an island from how people write it ("ADh. Fenfushi", "K.Gaafaru",
 * "Thaa Omadhoo", loose spelling), trying each text in turn.
 * Returns { island, candidates }.
 */
export function matchIsland(islands, ...texts) {
  const codes = new Map(islands.map((i) => [letters(i.atoll_code), i.atoll_code]));
  for (const text of texts.filter(Boolean)) {
    const { atoll, name } = splitName(text, codes);
    if (name.length < 3) continue;
    const scored = islands
      .map((i) => {
        const target = letters(i.name);
        let d = distance(name, target);
        if (name.includes(target) || target.includes(name)) d = Math.min(d, Math.abs(name.length - target.length) ? 1 : 0);
        return { ...i, d: d + (atoll && atoll !== i.atoll_code ? 2 : 0) };
      })
      .sort((a, b) => a.d - b.d);
    const best = scored[0];
    const limit = Math.max(2, Math.floor(letters(best?.name).length * 0.2));
    if (best && best.d <= limit && (scored.length < 2 || scored[1].d > best.d)) {
      return { island: strip(best), candidates: [] };
    }
    // Equally good matches (Omadhoo in ADh and Th), else the near misses.
    const near = (best && best.d <= limit ? scored.filter((s) => s.d === best.d) : scored.filter((s) => s.d <= limit + 2)).slice(0, 5).map(strip);
    if (near.length) return { island: null, candidates: near };
  }
  return { island: null, candidates: [] };
}
const strip = ({ d, ...i }) => i;
