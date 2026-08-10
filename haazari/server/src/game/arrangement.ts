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
// AUTO-ARRANGE HELPER
//
// Solving "the best possible 3+3+3+4 split" in general is a large
// combinatorial search. This uses a greedy algorithm that is provably
// guaranteed to satisfy the strongest->weakest ordering constraint by
// construction (not just "usually"):
//
//   1. Find the single BEST 3-card hand among all 13 cards -> Set 1.
//   2. Remove those 3 cards. Find the best 3-card hand among the
//      remaining 10 -> Set 2.
//   3. Remove those 3. Find the best 3-card hand among the remaining 7
//      -> Set 3.
//   4. The remaining 4 cards become Set 4.
//
// Why this always satisfies the ordering rule: Set2 is chosen from a
// STRICT SUBSET of the cards Set1 was chosen from, so the best achievable
// 3-card hand from that subset can never exceed Set1's value (any hand
// buildable from the subset was already a candidate when picking Set1).
// The same logic applies Set2->Set3. Set 4's four leftover cards are a
// subset of the exact same 7-card pool Set3 was chosen from, so Set4's
// best-3-of-4 sub-combo (which is itself just a 3-card hand drawn from
// that pool) can never exceed Set3's value either. No search/backtracking
// needed - this is a mathematical guarantee, not a heuristic that
// "usually" works.
//
// This is a suggestion, not the only valid arrangement - players remain
// free to build any other valid split by hand (Section 33).
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

/**
 * Suggests a valid strongest->weakest 3+3+3+4 arrangement for a 13-card
 * hand. Always returns a result that passes validatePlayerArrangement
 * (guaranteed by construction - see algorithm note above), so it's safe to
 * offer as a one-tap "Auto-arrange" action in the UI.
 */
export function suggestArrangement(hand: Card[]): [Card[], Card[], Card[], Card[]] {
  if (hand.length !== GAME_RULES.CARDS_PER_PLAYER) {
    throw new Error(`suggestArrangement requires a full ${GAME_RULES.CARDS_PER_PLAYER}-card hand`);
  }
  const remaining = [...hand];

  const set1 = bestThreeCardSubset(remaining);
  removeCards(remaining, set1);

  const set2 = bestThreeCardSubset(remaining);
  removeCards(remaining, set2);

  const set3 = bestThreeCardSubset(remaining);
  removeCards(remaining, set3);

  const set4 = remaining; // whatever's left (exactly 4 cards)

  return [set1, set2, set3, set4];
}

function removeCards(pool: Card[], toRemove: Card[]): void {
  const removeIds = new Set(toRemove.map((c) => c.id));
  for (let i = pool.length - 1; i >= 0; i--) {
    if (removeIds.has(pool[i].id)) pool.splice(i, 1);
  }
}
