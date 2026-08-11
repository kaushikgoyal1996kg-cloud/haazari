import type { Card, Rank, ThreeCardHandValue } from './types.js';
import { ThreeCardCategory } from './types.js';
import { RANK_VALUE, GAME_RULES } from './rules.js';

function sortedValues(cards: Card[]): number[] {
  return cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
}

function isSameSuit(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

/**
 * Detects a 3-card run, including the special Ace-low A-2-3 case. Returns
 * the value to use for tie-breaking against other sequences, or null if
 * not a sequence.
 *
 * RULE CLARIFICATION: sequence order from strongest to weakest is
 * A-K-Q, then A-2-3, then K-Q-J, Q-J-10, ... down to 4-3-2. A-2-3 sits
 * just below A-K-Q (still showcasing the Ace) but above every other run.
 * Represented as 13.5 - strictly between the K-Q-J value (13) and the
 * A-K-Q value (14) - so ordinary numeric comparison places it correctly
 * without needing a separate category.
 */
function threeCardRunHighValue(cards: Card[]): number | null {
  const values = sortedValues(cards); // descending, e.g. [14, 13, 12]
  const [a, b, c] = values;
  if (a === b || b === c) return null; // pairs/trails aren't sequences
  if (a - b === 1 && b - c === 1) return a; // normal run, e.g. K-Q-J -> 13, A-K-Q -> 14
  // Ace-low straight: A,3,2 sorted desc = [14,3,2] - second-strongest sequence.
  if (a === 14 && b === 3 && c === 2) return 13.5;
  return null;
}

/**
 * Classifies a 3-card Teen Patti hand into its category plus tiebreak ranks.
 * Category order (weakest to strongest): High Card < Pair < Color < Sequence
 * < Pure Sequence < Trail.
 */
export function classifyThreeCardHand(cards: Card[]): ThreeCardHandValue {
  if (cards.length !== 3) {
    throw new Error(`classifyThreeCardHand requires exactly 3 cards, got ${cards.length}`);
  }
  const values = sortedValues(cards);
  const [a, b, c] = values;
  const sameSuit = isSameSuit(cards);
  const runHigh = threeCardRunHighValue(cards);

  // Trail (three of a kind)
  if (a === b && b === c) {
    return { category: ThreeCardCategory.TRAIL, tiebreakRanks: [a] };
  }

  // Pure Sequence (straight flush)
  if (runHigh !== null && sameSuit) {
    return { category: ThreeCardCategory.PURE_SEQUENCE, tiebreakRanks: [runHigh] };
  }

  // Sequence (straight, mixed suits)
  if (runHigh !== null) {
    return { category: ThreeCardCategory.SEQUENCE, tiebreakRanks: [runHigh] };
  }

  // Color (flush, non-sequential)
  if (sameSuit) {
    return { category: ThreeCardCategory.COLOR, tiebreakRanks: [a, b, c] };
  }

  // Pair
  if (a === b || b === c) {
    const pairValue = a === b ? a : b;
    const kicker = a === b ? c : a;
    return { category: ThreeCardCategory.PAIR, tiebreakRanks: [pairValue, kicker] };
  }

  // High Card
  return { category: ThreeCardCategory.HIGH_CARD, tiebreakRanks: [a, b, c] };
}

/**
 * Compares two 3-card hands. Returns positive if A>B, negative if A<B, 0 if
 * EXACTLY equal strength (caller must apply the last-throw tie rule on 0 -
 * this function never breaks ties by suit).
 */
export function compareThreeCardHands(a: ThreeCardHandValue, b: ThreeCardHandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreakRanks.length, b.tiebreakRanks.length); i++) {
    const av = a.tiebreakRanks[i] ?? 0;
    const bv = b.tiebreakRanks[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function validateThreeCardSet(cards: Card[]): { valid: boolean; error?: string } {
  if (cards.length !== 3) return { valid: false, error: 'Set must contain exactly 3 cards.' };
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== 3) return { valid: false, error: 'Duplicate card in set.' };
  return { valid: true };
}

// ============================================================================
// Dismissal rule detection (Sections 23-24). See rules.ts header comment for
// the documented assumption behind each of these.
// ============================================================================

/**
 * hasSixPairs(): true if the raw 13-card hand contains >= SIX_PAIRS_THRESHOLD
 * distinct-rank pairs. A rank held 3-4 times still only counts floor(n/2)
 * pairs (e.g. four Kings = 2 pairs, not 4).
 */
export function hasSixPairs(hand: Card[]): boolean {
  if (hand.length !== GAME_RULES.CARDS_PER_PLAYER) {
    throw new Error(`hasSixPairs requires a full ${GAME_RULES.CARDS_PER_PLAYER}-card hand`);
  }
  const counts = new Map<Rank, number>();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let pairCount = 0;
  for (const n of counts.values()) pairCount += Math.floor(n / 2);
  return pairCount >= GAME_RULES.SIX_PAIRS_THRESHOLD;
}

/**
 * isNoSequenceHand(): true if the player's confirmed 4-set arrangement
 * contains NO Sequence, Pure Sequence, or Trail in any of its three-card
 * sets, AND the 4-card set contains no run-based combination either (per
 * the documented assumption in rules.ts). Must be called on a CONFIRMED
 * arrangement (post set-building), not the raw hand, since "sequence"
 * requires 3+ consecutive cards to evaluate.
 */
export function isNoSequenceHand(
  threeCardSets: [Card[], Card[], Card[]],
  fourCardSetHasRun: boolean
): boolean {
  const strongCategories = new Set([
    ThreeCardCategory.SEQUENCE,
    ThreeCardCategory.PURE_SEQUENCE,
    ThreeCardCategory.TRAIL,
  ]);
  const anyThreeCardRunOrTrail = threeCardSets.some((set) =>
    strongCategories.has(classifyThreeCardHand(set).category)
  );
  return !anyThreeCardRunOrTrail && !fourCardSetHasRun;
}
