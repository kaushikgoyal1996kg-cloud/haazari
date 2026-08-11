import type { Card, PlayerArrangement } from './types.js';
import { GAME_RULES } from './rules.js';
import { classifyThreeCardHand, compareThreeCardHands, validateThreeCardSet } from './hands.js';
import { classifyFourCardHand, validateFourCardSet } from './fourCardRanking.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a full 13-card arrangement:
 * - exactly 13 cards used, no duplicates, no cards outside the player's hand
 * - split is exactly 3 + 3 + 3 + 4
 * - each individual set is internally valid
 * - sets are ordered strongest -> weakest across ALL FOUR sets. Set 4 (the
 *   4-card set) is scored via its best 3-card sub-combination (see
 *   fourCardRanking.ts), which puts it on the SAME comparison scale as
 *   Sets 1-3 - so Set 4 must not out-rank Set 3, exactly like Set 3 must
 *   not out-rank Set 2, etc.
 */
export function validatePlayerArrangement(
  originalHand: Card[],
  sets: [Card[], Card[], Card[], Card[]]
): ValidationResult {
  const errors: string[] = [];

  const allPlayed = sets.flat();
  if (allPlayed.length !== GAME_RULES.CARDS_PER_PLAYER) {
    errors.push(`All ${GAME_RULES.CARDS_PER_PLAYER} cards must be used (found ${allPlayed.length}).`);
  }
  const playedIds = new Set(allPlayed.map((c) => c.id));
  if (playedIds.size !== allPlayed.length) {
    errors.push('No card can appear twice across your sets.');
  }
  const handIds = new Set(originalHand.map((c) => c.id));
  for (const c of allPlayed) {
    if (!handIds.has(c.id)) errors.push(`Card ${c.id} is not part of your dealt hand.`);
  }

  const expectedSizes = GAME_RULES.SET_SIZES;
  sets.forEach((set, i) => {
    if (set.length !== expectedSizes[i]) {
      errors.push(`Set ${i + 1} must contain exactly ${expectedSizes[i]} cards (found ${set.length}).`);
    }
  });

  // Only continue to per-set + ordering validation if sizes are right, to
  // avoid noisy secondary errors.
  const sizesOk = sets.every((s, i) => s.length === expectedSizes[i]);
  if (sizesOk) {
    const threeCardResults = [0, 1, 2].map((i) => validateThreeCardSet(sets[i]));
    threeCardResults.forEach((r, i) => {
      if (!r.valid) errors.push(`Set ${i + 1}: ${r.error}`);
    });
    const fourCardResult = validateFourCardSet(sets[3]);
    if (!fourCardResult.valid) errors.push(`Set 4: ${fourCardResult.error}`);

    if (threeCardResults.every((r) => r.valid) && fourCardResult.valid) {
      // All four sets on one unified comparison scale: [Set1, Set2, Set3, Set4].
      const values = [
        classifyThreeCardHand(sets[0]),
        classifyThreeCardHand(sets[1]),
        classifyThreeCardHand(sets[2]),
        classifyFourCardHand(sets[3]),
      ];
      for (let i = 0; i < values.length - 1; i++) {
        if (compareThreeCardHands(values[i], values[i + 1]) < 0) {
          errors.push('Your sets must be arranged from strongest to weakest.');
          break;
        }
      }
    }
  }

  if (GAME_RULES.REQUIRE_PURE_SEQUENCE) {
    // Disabled by default per spec Section 9, kept here for completeness /
    // future configurability.
    const hasPure = [0, 1, 2].some(
      (i) => sets[i].length === 3 && classifyThreeCardHand(sets[i]).category === 4
    );
    if (!hasPure) errors.push('A pure sequence is required somewhere in your hand.');
  }

  return { valid: errors.length === 0, errors };
}

export interface ArrangementSummary {
  setLabels: [string, string, string, string];
}

/** Human-readable labels for the real-time validation UI (Section 34). */
export function describeArrangement(sets: [Card[], Card[], Card[], Card[]]): string[] {
  const labels: string[] = [];
  const catNames = ['High Card', 'Pair', 'Color', 'Sequence', 'Pure Sequence', 'Trail'];
  for (let i = 0; i < 3; i++) {
    if (sets[i].length === 3) {
      labels.push(catNames[classifyThreeCardHand(sets[i]).category]);
    } else {
      labels.push('Incomplete');
    }
  }
  labels.push(sets[3].length === 4 ? classifyFourCardHand(sets[3]).label : 'Incomplete');
  return labels;
}

// ============================================================================
// AUTO-ARRANGE HELPER (balanced strategy)
//
// Haazari points come from winning INDIVIDUAL sub-rounds (your Set i vs
// each opponent's Set i), not from having the single strongest 13-card
// hand overall. Concentrating all your strength into Set 1 while leaving
// Sets 2-4 as scraps gives you a realistic shot at winning only ONE
// sub-round out of four. A more even spread - while still respecting the
// mandatory strongest->weakest ordering rule - gives a real shot at
// winning several, which is usually worth more total points.
//
// This searches a bounded set of VALID strongest->weakest splits (never
// violates the ordering rule) and picks the one that scores best on a
// balance-first objective: primarily maximize the WEAKEST set's category
// (don't leave any one set as a total throwaway), with total combined
// strength across all 4 sets as the tiebreaker.
//
// The search is bounded (top-K candidates at each step, not exhaustive
// over all ~1.2M possible splits) to stay fast enough for real-time bot
// play. It provably always finds at least one valid candidate - the old
// pure-greedy "maximize Set 1 first" construction (see
// greedyMaxFirstArrangement below) is always itself a member of this
// search space, so the search can never come up empty - but a small
// direct fallback is kept anyway as a defensive safety net.
// ============================================================================

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

function bestThreeCardSubset(cards: Card[]): Card[] {
  let best: Card[] | null = null;
  let bestValue: ReturnType<typeof classifyThreeCardHand> | null = null;
  for (const combo of combinations(cards, 3)) {
    const value = classifyThreeCardHand(combo);
    if (!bestValue || compareThreeCardHands(value, bestValue) > 0) {
      best = combo;
      bestValue = value;
    }
  }
  return best!;
}

interface RankedSubset {
  combo: Card[];
  value: ReturnType<typeof classifyThreeCardHand>;
}

/** All 3-card subsets of `cards`, sorted strongest-first, capped to `limit`. */
function rankedThreeCardSubsets(cards: Card[], limit: number): RankedSubset[] {
  const scored: RankedSubset[] = [];
  for (const combo of combinations(cards, 3)) {
    scored.push({ combo, value: classifyThreeCardHand(combo) });
  }
  scored.sort((a, b) => compareThreeCardHands(b.value, a.value));
  return scored.slice(0, limit);
}

/** Balance-first score for a complete, already-valid arrangement: weakest
 *  set's category dominates, total combined category is the tiebreaker,
 *  and the weakest set's own tiebreak rank breaks any remaining ties. */
function balanceScore(sets: [Card[], Card[], Card[], Card[]]): number {
  const values = [
    classifyThreeCardHand(sets[0]),
    classifyThreeCardHand(sets[1]),
    classifyThreeCardHand(sets[2]),
    classifyFourCardHand(sets[3]),
  ];
  const categories = values.map((v) => v.category);
  const weakest = Math.min(...categories);
  const sum = categories.reduce((a, b) => a + b, 0);
  const weakestIdx = categories.indexOf(weakest);
  const fineTiebreak = (values[weakestIdx].tiebreakRanks[0] ?? 0) / 100;
  return weakest * 1000 + sum + fineTiebreak;
}

const SET1_CANDIDATES = 20;
const SET2_CANDIDATES = 10;
const SET3_CANDIDATES = 6;

/**
 * Suggests a valid strongest->weakest 3+3+3+4 arrangement for a 13-card
 * hand, preferring a BALANCED split over one that just maximizes Set 1
 * (see module header). Always returns a result that passes
 * validatePlayerArrangement, so it's safe to offer as a one-tap
 * "Auto-arrange" action, and it's what bots use to arrange their own
 * hands too.
 *
 * ENDGAME OVERRIDE: if `cumulativeScore` is provided and is within
 * GAME_RULES.CLOSE_TO_WINNING_THRESHOLD points of WINNING_SCORE, this
 * switches to the CONCENTRATED strategy (maximize Set 1 alone) instead -
 * see rules.ts assumption #6 for the reasoning. Omit `cumulativeScore`
 * (or pass a score not yet close to winning) to always get the balanced
 * default.
 */
export function suggestArrangement(hand: Card[], cumulativeScore?: number): [Card[], Card[], Card[], Card[]] {
  if (hand.length !== GAME_RULES.CARDS_PER_PLAYER) {
    throw new Error(`suggestArrangement requires a full ${GAME_RULES.CARDS_PER_PLAYER}-card hand`);
  }

  if (
    cumulativeScore !== undefined &&
    GAME_RULES.WINNING_SCORE - cumulativeScore <= GAME_RULES.CLOSE_TO_WINNING_THRESHOLD
  ) {
    return greedyMaxFirstArrangement(hand);
  }

  let best: [Card[], Card[], Card[], Card[]] | null = null;
  let bestScore = -Infinity;

  for (const { combo: set1, value: set1Value } of rankedThreeCardSubsets(hand, SET1_CANDIDATES)) {
    const afterSet1 = [...hand];
    removeCards(afterSet1, set1);

    const set2Candidates = rankedThreeCardSubsets(afterSet1, SET2_CANDIDATES).filter(
      ({ value }) => compareThreeCardHands(value, set1Value) <= 0
    );

    for (const { combo: set2, value: set2Value } of set2Candidates) {
      const afterSet2 = [...afterSet1];
      removeCards(afterSet2, set2);

      const set3Candidates = rankedThreeCardSubsets(afterSet2, SET3_CANDIDATES).filter(
        ({ value }) => compareThreeCardHands(value, set2Value) <= 0
      );

      for (const { combo: set3, value: set3Value } of set3Candidates) {
        const set4 = [...afterSet2];
        removeCards(set4, set3);
        if (compareThreeCardHands(classifyFourCardHand(set4), set3Value) > 0) continue; // set4 can't out-rank set3

        const candidate: [Card[], Card[], Card[], Card[]] = [set1, set2, set3, set4];
        const score = balanceScore(candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
  }

  return best ?? greedyMaxFirstArrangement(hand);
}

/**
 * Fallback only: the original "maximize Set 1, then Set 2, then Set 3"
 * construction. Mathematically guaranteed to produce a valid arrangement,
 * used only if the bounded balanced search above somehow finds nothing -
 * which shouldn't happen in practice, since this exact construction is
 * always itself a member of that search space. Exported (in addition to
 * being used internally as a fallback) so tests/tools can directly compare
 * "balanced" vs "maximize Set 1 only" behavior.
 */
export function greedyMaxFirstArrangement(hand: Card[]): [Card[], Card[], Card[], Card[]] {
  const remaining = [...hand];
  const set1 = bestThreeCardSubset(remaining);
  removeCards(remaining, set1);
  const set2 = bestThreeCardSubset(remaining);
  removeCards(remaining, set2);
  const set3 = bestThreeCardSubset(remaining);
  removeCards(remaining, set3);
  const set4 = remaining;
  return [set1, set2, set3, set4];
}

function removeCards(pool: Card[], toRemove: Card[]): void {
  const removeIds = new Set(toRemove.map((c) => c.id));
  for (let i = pool.length - 1; i >= 0; i--) {
    if (removeIds.has(pool[i].id)) pool.splice(i, 1);
  }
}
