import type { Card, Rank } from './types';

// ============================================================================
// Mirrors server/src/game/hands.ts + fourCardRanking.ts exactly (category
// order, tiebreak semantics, ace-low straight handling, best-3-of-4 method
// for the 4-card set). Client-side only - used for instant UI feedback
// (the checkmarks/labels on the arrangement screen and the auto-arrange
// solver). The server is the sole source of truth and re-validates every
// submission from scratch; if this ever drifts from the server, worst case
// is a momentarily wrong UI hint, never an accepted-but-invalid hand.
// ============================================================================

export enum Category {
  HIGH_CARD = 0,
  PAIR = 1,
  COLOR = 2,
  SEQUENCE = 3,
  PURE_SEQUENCE = 4,
  TRAIL = 5,
}

export const CATEGORY_NAMES = ['High Card', 'Pair', 'Color', 'Sequence', 'Pure Sequence', 'Trail'];

export const RANK_VALUE: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, '10': 10,
  '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

export const TEN_POINT_RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10'];

export function cardValue(card: Card): number {
  return TEN_POINT_RANKS.includes(card.rank) ? 10 : 5;
}

export function setValue(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardValue(c), 0);
}

export interface HandValue {
  category: Category;
  tiebreakRanks: number[];
}

function sortedValues(cards: Card[]): number[] {
  return cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
}

function isSameSuit(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

function threeCardRunHigh(cards: Card[]): number | null {
  const [a, b, c] = sortedValues(cards);
  if (a === b || b === c) return null;
  if (a - b === 1 && b - c === 1) return a;
  if (a === 14 && b === 3 && c === 2) return 3; // ace-low A-2-3
  return null;
}

export function classifyThree(cards: Card[]): HandValue {
  const [a, b, c] = sortedValues(cards);
  const sameSuit = isSameSuit(cards);
  const runHigh = threeCardRunHigh(cards);

  if (a === b && b === c) return { category: Category.TRAIL, tiebreakRanks: [a] };
  if (runHigh !== null && sameSuit) return { category: Category.PURE_SEQUENCE, tiebreakRanks: [runHigh] };
  if (runHigh !== null) return { category: Category.SEQUENCE, tiebreakRanks: [runHigh] };
  if (sameSuit) return { category: Category.COLOR, tiebreakRanks: [a, b, c] };
  if (a === b || b === c) {
    const pairValue = a === b ? a : b;
    const kicker = a === b ? c : a;
    return { category: Category.PAIR, tiebreakRanks: [pairValue, kicker] };
  }
  return { category: Category.HIGH_CARD, tiebreakRanks: [a, b, c] };
}

export function compareHand(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreakRanks.length, b.tiebreakRanks.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakRanks[i] ?? 0;
    const bv = b.tiebreakRanks[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Best 3-of-4 Teen Patti sub-combo methodology for the 4-card set. */
export function classifyFour(cards: Card[]): HandValue {
  const candidates: HandValue[] = cards.map((excluded, i) => {
    const subset = cards.filter((_, j) => j !== i);
    const base = classifyThree(subset);
    return { category: base.category, tiebreakRanks: [...base.tiebreakRanks, RANK_VALUE[excluded.rank]] };
  });
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (compareHand(c, best) > 0) best = c;
  }
  return best;
}

export function classifySet(cards: Card[]): HandValue {
  return cards.length === 4 ? classifyFour(cards) : classifyThree(cards);
}

export function labelFor(value: HandValue): string {
  return CATEGORY_NAMES[value.category];
}

// ---- Dismissal eligibility hints (mirrors server hands.ts/dismissal.ts) ----

export function hasSixPairs(hand: Card[]): boolean {
  const counts = new Map<Rank, number>();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let pairs = 0;
  for (const n of counts.values()) pairs += Math.floor(n / 2);
  return pairs >= 6;
}

/** Requires all four sets filled (3,3,3,4). */
export function isNoSequenceHand(sets: [Card[], Card[], Card[], Card[]]): boolean {
  if (sets[0].length !== 3 || sets[1].length !== 3 || sets[2].length !== 3 || sets[3].length !== 4) {
    return false;
  }
  const strong = new Set([Category.SEQUENCE, Category.PURE_SEQUENCE, Category.TRAIL]);
  const anyThreeCardRunOrTrail = [sets[0], sets[1], sets[2]].some((s) => strong.has(classifyThree(s).category));
  const fourHasRun = strong.has(classifyFour(sets[3]).category);
  return !anyThreeCardRunOrTrail && !fourHasRun;
}
