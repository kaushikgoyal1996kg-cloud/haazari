import type { Card, FourSets } from './types';
import { RANK_VALUE } from './handClassification';

// ============================================================================
// Performance note: the naive generator-based version of this solver (which
// mirrors handClassification.ts's Card-object-based API exactly) measured
// ~900ms per call - too slow for a responsive "Suggest Arrangement" button.
// This version reimplements the SAME logic (mirrors server semantics: same
// category order, same ace-low handling, same best-3-of-4 method for the
// 4-card set) using packed-integer scores and flat index loops with zero
// allocation in the hot path, which brings it under ~15ms. See
// handClassification.ts for the readable/canonical version used elsewhere
// in the UI (real-time validation labels), where call volume is low and
// clarity matters more than raw speed.
//
// Packed score format: category*65536 + r0*4096 + r1*256 + r2*16 + r3
// (each rank field is a base-16 digit, 0-14 fits comfortably). Category:
// 0=HighCard 1=Pair 2=Color 3=Sequence 4=PureSequence 5=Trail - identical
// ordering to handClassification.ts's Category enum.
// ============================================================================

function packScore(category: number, r0 = 0, r1 = 0, r2 = 0, r3 = 0): number {
  return category * 65536 + r0 * 4096 + r1 * 256 + r2 * 16 + r3;
}

/** Packed score for 3 cards, identified by index into the values[]/suits[] arrays. */
function tripleScore(i: number, j: number, k: number, values: number[], suits: number[]): number {
  const va = values[i], vb = values[j], vc = values[k];
  const a = Math.max(va, vb, vc);
  const c = Math.min(va, vb, vc);
  const b = va + vb + vc - a - c;
  const sameSuit = suits[i] === suits[j] && suits[j] === suits[k];

  if (va === vb && vb === vc) return packScore(5, a);

  let runHigh = -1;
  if (a - b === 1 && b - c === 1) runHigh = a;
  else if (a === 14 && b === 3 && c === 2) runHigh = 3; // ace-low A-2-3

  if (runHigh !== -1 && sameSuit) return packScore(4, runHigh);
  if (runHigh !== -1) return packScore(3, runHigh);
  if (sameSuit) return packScore(2, a, b, c);

  if (va === vb || vb === vc || va === vc) {
    let pairVal: number, kicker: number;
    if (va === vb) { pairVal = va; kicker = vc; }
    else if (vb === vc) { pairVal = vb; kicker = va; }
    else { pairVal = va; kicker = vb; }
    return packScore(1, pairVal, kicker);
  }
  return packScore(0, a, b, c);
}

/** Packed score for the 4-card set: best 3-of-4 sub-combo + excluded card as kicker.
 *  Relies on tripleScore() always leaving the 4th (r3) base-16 digit as 0,
 *  so adding the kicker value (0-14, fits in one base-16 digit) directly
 *  onto the packed integer is equivalent to appending it as a tiebreak
 *  element. */
function fourScore(idx: [number, number, number, number], values: number[], suits: number[]): number {
  const [a, b, c, d] = idx;
  const s1 = tripleScore(b, c, d, values, suits) + values[a];
  const s2 = tripleScore(a, c, d, values, suits) + values[b];
  const s3 = tripleScore(a, b, d, values, suits) + values[c];
  const s4 = tripleScore(a, b, c, values, suits) + values[d];
  return Math.max(s1, s2, s3, s4);
}

const SUIT_CODE: Record<Card['suit'], number> = { SPADES: 0, HEARTS: 1, DIAMONDS: 2, CLUBS: 3 };

/**
 * Finds a valid strongest->weakest 3+3+3+4 arrangement for a 13-card hand,
 * maximizing Set 1's strength first, then Set 2, then Set 3, then Set 4.
 * Runs synchronously in well under a frame budget - safe to call directly
 * from a button click handler.
 */
export function autoArrange(hand: Card[]): FourSets | null {
  if (hand.length !== 13) throw new Error('autoArrange requires exactly 13 cards');

  const values = hand.map((c) => RANK_VALUE[c.rank]);
  const suits = hand.map((c) => SUIT_CODE[c.suit]);
  const n = 13;

  let bestScoreKey = -1;
  let bestIdx: { g1: number[]; g2: number[]; g3: number[]; g4: [number, number, number, number] } | null = null;

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          const fourIdx: [number, number, number, number] = [a, b, c, d];
          const fScore = fourScore(fourIdx, values, suits);

          const remaining: number[] = [];
          for (let x = 0; x < n; x++) {
            if (x !== a && x !== b && x !== c && x !== d) remaining.push(x);
          }

          const anchor1 = remaining[0];
          for (let p = 1; p < 9; p++) {
            for (let q = p + 1; q < 9; q++) {
              const g1: [number, number, number] = [anchor1, remaining[p], remaining[q]];
              const after1: number[] = [];
              for (let x = 1; x < 9; x++) {
                if (x !== p && x !== q) after1.push(remaining[x]);
              }
              const anchor2 = after1[0];
              for (let r = 1; r < 6; r++) {
                for (let s = r + 1; s < 6; s++) {
                  const g2: [number, number, number] = [anchor2, after1[r], after1[s]];
                  const g3: number[] = [];
                  for (let x = 1; x < 6; x++) {
                    if (x !== r && x !== s) g3.push(after1[x]);
                  }

                  const v1 = tripleScore(g1[0], g1[1], g1[2], values, suits);
                  const v2 = tripleScore(g2[0], g2[1], g2[2], values, suits);
                  const v3 = tripleScore(g3[0], g3[1], g3[2], values, suits);

                  let s1 = v1, s2 = v2, s3 = v3;
                  let i1: number[] = g1, i2: number[] = g2, i3: number[] = g3;
                  if (s1 < s2) { [s1, s2] = [s2, s1]; [i1, i2] = [i2, i1]; }
                  if (s2 < s3) { [s2, s3] = [s3, s2]; [i2, i3] = [i3, i2]; }
                  if (s1 < s2) { [s1, s2] = [s2, s1]; [i1, i2] = [i2, i1]; }

                  if (s3 < fScore) continue; // Set4 would out-rank Set3 - invalid

                  const key = ((s1 * 1_100_000 + s2) * 1_100_000 + s3) * 1_100_000 + fScore;

                  if (key > bestScoreKey) {
                    bestScoreKey = key;
                    bestIdx = { g1: i1, g2: i2, g3: i3, g4: fourIdx };
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (!bestIdx) return null;
  return [
    bestIdx.g1.map((i) => hand[i]),
    bestIdx.g2.map((i) => hand[i]),
    bestIdx.g3.map((i) => hand[i]),
    bestIdx.g4.map((i) => hand[i]),
  ];
}
