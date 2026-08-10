import { describe, it, expect } from 'vitest';
import { classifyFourCardHand, compareFourCardHands, fourCardSetHasRun, validateFourCardSet } from '../src/game/fourCardRanking.js';
import type { Card } from '../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

describe('classifyFourCardHand - best 3-of-4 Teen Patti sub-combo', () => {
  it('finds a Trail among any 3 of the 4 cards', () => {
    const v = classifyFourCardHand([c('9', 'SPADES'), c('9', 'HEARTS'), c('9', 'DIAMONDS'), c('K', 'CLUBS')]);
    expect(v.label).toMatch(/Trail/);
  });

  it('finds a Pure Sequence among any 3 of the 4 cards (straight flush subset)', () => {
    const v = classifyFourCardHand([c('9', 'SPADES'), c('8', 'SPADES'), c('7', 'SPADES'), c('2', 'CLUBS')]);
    expect(v.label).toMatch(/Pure Sequence/);
  });

  it('finds a Sequence among any 3 of the 4 cards (mixed-suit run subset)', () => {
    const v = classifyFourCardHand([c('9', 'CLUBS'), c('8', 'HEARTS'), c('7', 'SPADES'), c('2', 'DIAMONDS')]);
    expect(v.label).toMatch(/Sequence/);
  });

  it('finds a Color (flush) among any 3 of the 4 cards when no better subset exists', () => {
    const v = classifyFourCardHand([c('K', 'SPADES'), c('9', 'SPADES'), c('5', 'SPADES'), c('2', 'CLUBS')]);
    expect(v.label).toMatch(/Color/);
  });

  it('finds a Pair among any 3 of the 4 cards when no run/color/trail exists', () => {
    const v = classifyFourCardHand([c('5', 'SPADES'), c('5', 'HEARTS'), c('K', 'DIAMONDS'), c('2', 'CLUBS')]);
    expect(v.label).toMatch(/Pair/);
  });

  it('falls back to High Card when no 3-card subset forms anything better', () => {
    const v = classifyFourCardHand([c('K', 'SPADES'), c('9', 'HEARTS'), c('5', 'DIAMONDS'), c('2', 'CLUBS')]);
    expect(v.label).toMatch(/High Card/);
  });

  it('uses the excluded 4th card as a kicker to break ties between equal best-subsets', () => {
    const higherKicker = classifyFourCardHand([c('5', 'SPADES'), c('5', 'HEARTS'), c('2', 'DIAMONDS'), c('K', 'CLUBS')]);
    const lowerKicker = classifyFourCardHand([c('5', 'SPADES'), c('5', 'HEARTS'), c('2', 'DIAMONDS'), c('3', 'CLUBS')]);
    expect(compareFourCardHands(higherKicker, lowerKicker)).toBeGreaterThan(0);
  });

  it('full category ordering (same hierarchy as 3-card sets): Trail > Pure Sequence > Sequence > Color > Pair > High Card', () => {
    const trail = classifyFourCardHand([c('9', 'SPADES'), c('9', 'HEARTS'), c('9', 'DIAMONDS'), c('2', 'CLUBS')]);
    const pureSeq = classifyFourCardHand([c('9', 'SPADES'), c('8', 'SPADES'), c('7', 'SPADES'), c('2', 'CLUBS')]);
    const seq = classifyFourCardHand([c('9', 'CLUBS'), c('8', 'HEARTS'), c('7', 'SPADES'), c('2', 'DIAMONDS')]);
    const color = classifyFourCardHand([c('K', 'SPADES'), c('9', 'SPADES'), c('5', 'SPADES'), c('2', 'CLUBS')]);
    const pair = classifyFourCardHand([c('5', 'SPADES'), c('5', 'HEARTS'), c('K', 'DIAMONDS'), c('2', 'CLUBS')]);
    const high = classifyFourCardHand([c('K', 'SPADES'), c('9', 'HEARTS'), c('5', 'DIAMONDS'), c('2', 'CLUBS')]);

    const order = [trail, pureSeq, seq, color, pair, high];
    for (let i = 0; i < order.length - 1; i++) {
      expect(compareFourCardHands(order[i], order[i + 1])).toBeGreaterThan(0);
    }
  });
});

describe('fourCardSetHasRun (used by isNoSequenceHand dismissal check)', () => {
  it('true when a run-based subset (Sequence/Pure Sequence) or Trail exists among any 3 of the 4', () => {
    expect(fourCardSetHasRun([c('9', 'CLUBS'), c('8', 'HEARTS'), c('7', 'SPADES'), c('2', 'DIAMONDS')])).toBe(true);
    expect(fourCardSetHasRun([c('A', 'CLUBS'), c('2', 'HEARTS'), c('3', 'SPADES'), c('K', 'DIAMONDS')])).toBe(true);
    expect(fourCardSetHasRun([c('9', 'SPADES'), c('9', 'HEARTS'), c('9', 'DIAMONDS'), c('K', 'CLUBS')])).toBe(true);
  });
  it('false when no 3-card subset forms a run or trail', () => {
    expect(fourCardSetHasRun([c('K', 'SPADES'), c('9', 'HEARTS'), c('5', 'DIAMONDS'), c('2', 'CLUBS')])).toBe(false);
    expect(fourCardSetHasRun([c('5', 'SPADES'), c('5', 'HEARTS'), c('K', 'DIAMONDS'), c('2', 'CLUBS')])).toBe(false);
  });
});

describe('validateFourCardSet', () => {
  it('requires exactly 4 unique cards', () => {
    expect(validateFourCardSet([c('9', 'CLUBS'), c('8', 'HEARTS'), c('7', 'SPADES')]).valid).toBe(false);
    expect(
      validateFourCardSet([c('9', 'CLUBS'), c('9', 'CLUBS'), c('7', 'SPADES'), c('6', 'DIAMONDS')]).valid
    ).toBe(false);
    expect(
      validateFourCardSet([c('9', 'CLUBS'), c('8', 'HEARTS'), c('7', 'SPADES'), c('6', 'DIAMONDS')]).valid
    ).toBe(true);
  });
});
