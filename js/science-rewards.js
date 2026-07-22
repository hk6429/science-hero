// 科學史收藏與答對奇遇：純邏輯、所有機率都由 seed/rng 注入，方便測試。
const SciScienceRewards = (() => {
  const SURPRISE_RATE = 0.04;
  const SURPRISE_CRYSTALS = 2;

  function hashSeed(value) {
    let hash = 0x811c9dc5;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6D2B79F5) | 0;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function validateLore(cards) {
    return Array.isArray(cards) && cards.every((card) =>
      ['id', 'subject', 'unit', 'title', 'who', 'year', 'blurb', 'icon'].every((key) => typeof card[key] === 'string' && card[key].trim()),
    );
  }

  function unlockLore(state, cards, subject, unit) {
    state.stats = state.stats || {};
    state.stats.scienceLore = Array.isArray(state.stats.scienceLore) ? state.stats.scienceLore : [];
    const card = cards.find((entry) => entry.subject === subject && entry.unit === unit);
    if (!card || state.stats.scienceLore.includes(card.id)) return null;
    state.stats.scienceLore.push(card.id);
    return card;
  }

  function unlockedLore(state, cards) {
    const ids = new Set(state?.stats?.scienceLore || []);
    return cards.filter((card) => ids.has(card.id));
  }

  function unlockForMasteredUnit(state, cards, subject, unit, terms, maxBox) {
    const unitTerms = terms.filter((term) => term.unit === unit);
    if (!unitTerms.length || !unitTerms.every((term) => (state.cards?.[term.id]?.box || 0) >= maxBox)) return null;
    return unlockLore(state, cards, subject, unit);
  }

  function triggerSurprise({ correct, rng, facts, economy, allowCrystalReward = true }) {
    if (!correct || typeof rng !== 'function' || rng() >= SURPRISE_RATE) return { hit: false };
    if (rng() < 0.5 && allowCrystalReward) {
      const reward = economy.earnCrystals(SURPRISE_CRYSTALS, 'science-surprise');
      return { hit: true, type: 'crystals', ...reward };
    }
    if (!Array.isArray(facts) || !facts.length) return { hit: false };
    const fact = facts[Math.min(facts.length - 1, Math.floor(rng() * facts.length))];
    return { hit: true, type: 'fact', fact };
  }

  return { SURPRISE_RATE, SURPRISE_CRYSTALS, hashSeed, mulberry32, validateLore, unlockLore, unlockForMasteredUnit, unlockedLore, triggerSurprise };
})();
