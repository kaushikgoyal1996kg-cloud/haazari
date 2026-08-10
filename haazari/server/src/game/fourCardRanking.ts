import type { Card, ThreeCardHandValue } from './types.js';
import { RANK_VALUE } from './rules.js';
import { classifyThreeCardHand, compareThreeCardHands } from './hands.js';

// ============================================================================
// FOUR-CARD SET RANKING - isolated module (Section 11 / 52.3).
//
// CONFIRMED methodology: the 4-card set's strength is the BEST 3-CARD TEEN
// PATTI COMBINATION found among any 3 of its 4 cards, using the exact same
// hierarchy as the three-card sets (Trail > Pure Sequence > Sequence >
// Color > Pair > High Card). The leftover (4th, excluded) card is used
// purely as a kicker to break ties between two 4-card sets whose best
// 3-card sub-combo lands in the same category/rank.
//
// Because this reuses the 3-card hierarchy directly, a FourCardHandValue is
// shape-compatible with ThreeCardHandValue (category + tiebreakRanks, with
// the kicker appended as the final tiebreak element) and can be compared
// with the same compareThreeCardHands() function.
//
// ORDERING RULE: Set 4 must still rank WEAKER than Set 3 in a player's
// arrangement (see arrangement.ts) - even though both now sit on the same
// comparison scale, Set 4 is never allowed to out-rank Set 3.
//
// This file is still the single place to change if the 4-card methodology
// is ever revised - nothing outside this file needs to know how the score
// is derived, only how to compare it.
// ============================================================================

export type FourCardHandValue = ThreeCardHandValue & { label: string };

const CATEGORY_NAMES = ['High Card', 'Pair', 'Color', 'Sequence', 'Pure Sequence', 'Trail'];

/** All four ways to choose 3-of-4 cards, paired with the excluded (kicker) card. */
function threeCardSubsets(cards: Card[]): { subset: Card[]; kicker: Card }[] {
  return cards.map((excluded, i) => ({
    subset: cards.filter((_, j) => j !== i),
    kicker: excluded,
  }));
}

export function classifyFourCardHand(cards: Card[]): FourCardHandValue {
  if (cards.length !== 4) {
    throw new Error(`classifyFourCardHand requires exactly 4 cards, got ${cards.length}`);
  }

  const candidates = threeCardSubsets(cards).map(({ subset, kicker }) => {
    const base = classifyThreeCardHand(subset);
    return {
      category: base.category,
      tiebreakRanks: [...base.tiebreakRanks, RANK_VALUE[kicker.rank]],
    };
  });

  // Pick the best candidate (best 3-card sub-combo, kicker breaking ties
  // between equally-strong sub-combos) using the same comparator as the
  // three-card sets.
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (compareThreeCardHands(c, best) > 0) best = c;
  }

  return {
    category: best.category,
    tiebreakRanks: best.tiebreakRanks,
    label: `${CATEGORY_NAMES[best.category]} (+ kicker)`,
  };
}

/** Compares two 4-card hands using the identical Teen Patti comparator.
 *  Positive = a wins, negative = b wins, 0 = tie (caller applies last-throw
 *  tie rule; suit is never a tiebreaker). */
export function compareFourCardHands(a: FourCardHandValue, b: FourCardHandValue): number {
  return compareThreeCardHands(a, b);
}

/** Does this 4-card set's best 3-card sub-combo contain a Sequence, Pure
 *  Sequence, or Trail? Used by isNoSequenceHand() dismissal check - kept
 *  consistent with how "no sequence" is evaluated for the three-card sets. */
export function fourCardSetHasRun(cards: Card[]): boolean {
  const value = classifyFourCardHand(cards);
  return value.category === 3 || value.category === 4 || value.category === 5; // SEQUENCE, PURE_SEQUENCE, TRAIL
}

export function validateFourCardSet(cards: Card[]): { valid: boolean; error?: string } {
  if (cards.length !== 4) return { valid: false, error: 'The fourth set must contain exactly 4 cards.' };
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== 4) return { valid: false, error: 'Duplicate card in set.' };
  return { valid: true };
}
