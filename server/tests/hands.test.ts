import { describe, it, expect } from 'vitest';
import { classifyThreeCardHand, compareThreeCardHands, hasSixPairs, isNoSequenceHand } from '../src/game/hands.js';
import { ThreeCardCategory } from '../src/game/types.js';
import type { Card } from '../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

describe('classifyThreeCardHand', () => {
  it('detects Trail', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS')]);
    expect(v.category).toBe(ThreeCardCategory.TRAIL);
  });

  it('detects Pure Sequence', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('K', 'SPADES'), c('Q', 'SPADES')]);
    expect(v.category).toBe(ThreeCardCategory.PURE_SEQUENCE);
  });

  it('detects ace-low pure sequence (A-2-3 same suit)', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('2', 'SPADES'), c('3', 'SPADES')]);
    expect(v.category).toBe(ThreeCardCategory.PURE_SEQUENCE);
  });

  it('detects Sequence (mixed suit run)', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('K', 'HEARTS'), c('Q', 'DIAMONDS')]);
    expect(v.category).toBe(ThreeCardCategory.SEQUENCE);
  });

  it('detects Color (flush)', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('8', 'SPADES'), c('3', 'SPADES')]);
    expect(v.category).toBe(ThreeCardCategory.COLOR);
  });

  it('detects Pair', () => {
    const v = classifyThreeCardHand([c('K', 'SPADES'), c('K', 'DIAMONDS'), c('5', 'HEARTS')]);
    expect(v.category).toBe(ThreeCardCategory.PAIR);
  });

  it('detects High Card', () => {
    const v = classifyThreeCardHand([c('A', 'SPADES'), c('9', 'DIAMONDS'), c('4', 'CLUBS')]);
    expect(v.category).toBe(ThreeCardCategory.HIGH_CARD);
  });

  it('throws on non-3-card input', () => {
    expect(() => classifyThreeCardHand([c('A', 'SPADES'), c('9', 'DIAMONDS')])).toThrow();
  });
});

describe('compareThreeCardHands', () => {
  it('ranks Trail above Pure Sequence above Sequence above Color above Pair above High Card', () => {
    const trail = classifyThreeCardHand([c('2', 'SPADES'), c('2', 'HEARTS'), c('2', 'DIAMONDS')]);
    const pureSeq = classifyThreeCardHand([c('A', 'SPADES'), c('K', 'SPADES'), c('Q', 'SPADES')]);
    const seq = classifyThreeCardHand([c('A', 'HEARTS'), c('K', 'SPADES'), c('Q', 'DIAMONDS')]);
    const color = classifyThreeCardHand([c('A', 'CLUBS'), c('8', 'CLUBS'), c('3', 'CLUBS')]);
    const pair = classifyThreeCardHand([c('9', 'SPADES'), c('9', 'HEARTS'), c('4', 'DIAMONDS')]);
    const high = classifyThreeCardHand([c('A', 'SPADES'), c('9', 'DIAMONDS'), c('4', 'CLUBS')]);

    expect(compareThreeCardHands(trail, pureSeq)).toBeGreaterThan(0);
    expect(compareThreeCardHands(pureSeq, seq)).toBeGreaterThan(0);
    expect(compareThreeCardHands(seq, color)).toBeGreaterThan(0);
    expect(compareThreeCardHands(color, pair)).toBeGreaterThan(0);
    expect(compareThreeCardHands(pair, high)).toBeGreaterThan(0);
  });

  it('returns 0 for genuinely equal-strength hands (no suit tiebreak)', () => {
    const a = classifyThreeCardHand([c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')]);
    const b = classifyThreeCardHand([c('K', 'CLUBS'), c('K', 'DIAMONDS'), c('5', 'SPADES')]);
    expect(compareThreeCardHands(a, b)).toBe(0);
  });

  it('breaks ties within Pair category by kicker', () => {
    const a = classifyThreeCardHand([c('K', 'SPADES'), c('K', 'HEARTS'), c('9', 'DIAMONDS')]);
    const b = classifyThreeCardHand([c('K', 'CLUBS'), c('K', 'DIAMONDS'), c('5', 'SPADES')]);
    expect(compareThreeCardHands(a, b)).toBeGreaterThan(0);
  });
});

describe('hasSixPairs', () => {
  it('detects a 13-card hand with exactly six pairs', () => {
    const hand: Card[] = [
      c('A', 'SPADES'), c('A', 'HEARTS'),
      c('K', 'SPADES'), c('K', 'HEARTS'),
      c('Q', 'SPADES'), c('Q', 'HEARTS'),
      c('J', 'SPADES'), c('J', 'HEARTS'),
      c('10', 'SPADES'), c('10', 'HEARTS'),
      c('9', 'SPADES'), c('9', 'HEARTS'),
      c('8', 'SPADES'), // 13th card, unpaired
    ];
    expect(hasSixPairs(hand)).toBe(true);
  });

  it('does not flag five pairs', () => {
    const hand: Card[] = [
      c('A', 'SPADES'), c('A', 'HEARTS'),
      c('K', 'SPADES'), c('K', 'HEARTS'),
      c('Q', 'SPADES'), c('Q', 'HEARTS'),
      c('J', 'SPADES'), c('J', 'HEARTS'),
      c('10', 'SPADES'), c('10', 'HEARTS'),
      c('9', 'SPADES'), c('8', 'HEARTS'), c('7', 'CLUBS'),
    ];
    expect(hasSixPairs(hand)).toBe(false);
  });

  it('counts four-of-a-kind as only 2 pairs, not 4', () => {
    const hand: Card[] = [
      c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), c('A', 'CLUBS'), // 2 pairs
      c('K', 'SPADES'), c('K', 'HEARTS'),
      c('Q', 'SPADES'), c('Q', 'HEARTS'),
      c('J', 'SPADES'), c('J', 'HEARTS'),
      c('10', 'SPADES'), c('9', 'HEARTS'), c('8', 'CLUBS'),
    ];
    // pairs: A(2) + K(1) + Q(1) + J(1) = 5, not >= 6
    expect(hasSixPairs(hand)).toBe(false);
  });

  it('throws if hand is not 13 cards', () => {
    expect(() => hasSixPairs([c('A', 'SPADES')])).toThrow();
  });
});

describe('isNoSequenceHand', () => {
  it('is true when no set has a sequence/pure-sequence/trail and 4-set has no run', () => {
    const sets: [Card[], Card[], Card[]] = [
      [c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')], // pair
      [c('9', 'CLUBS'), c('9', 'SPADES'), c('2', 'HEARTS')], // pair
      [c('A', 'SPADES'), c('8', 'SPADES'), c('3', 'SPADES')], // color
    ];
    expect(isNoSequenceHand(sets, false)).toBe(true);
  });

  it('is false if any 3-card set is a Sequence/Pure Sequence/Trail', () => {
    const sets: [Card[], Card[], Card[]] = [
      [c('A', 'SPADES'), c('K', 'SPADES'), c('Q', 'SPADES')], // pure sequence
      [c('9', 'CLUBS'), c('9', 'SPADES'), c('2', 'HEARTS')],
      [c('A', 'HEARTS'), c('8', 'SPADES'), c('3', 'CLUBS')],
    ];
    expect(isNoSequenceHand(sets, false)).toBe(false);
  });

  it('is false if the 4-card set has a run', () => {
    const sets: [Card[], Card[], Card[]] = [
      [c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')],
      [c('9', 'CLUBS'), c('9', 'SPADES'), c('2', 'HEARTS')],
      [c('A', 'SPADES'), c('8', 'SPADES'), c('3', 'SPADES')],
    ];
    expect(isNoSequenceHand(sets, true)).toBe(false);
  });
});

describe('Sequence ordering: A-K-Q > A-2-3 > K-Q-J > ... > 4-3-2', () => {
  it('A-K-Q beats A-2-3', () => {
    const akq = classifyThreeCardHand([c('A', 'SPADES'), c('K', 'HEARTS'), c('Q', 'DIAMONDS')]);
    const a23 = classifyThreeCardHand([c('A', 'SPADES'), c('2', 'HEARTS'), c('3', 'DIAMONDS')]);
    expect(compareThreeCardHands(akq, a23)).toBeGreaterThan(0);
  });

  it('A-2-3 beats K-Q-J', () => {
    const a23 = classifyThreeCardHand([c('A', 'SPADES'), c('2', 'HEARTS'), c('3', 'DIAMONDS')]);
    const kqj = classifyThreeCardHand([c('K', 'SPADES'), c('Q', 'HEARTS'), c('J', 'DIAMONDS')]);
    expect(compareThreeCardHands(a23, kqj)).toBeGreaterThan(0);
  });

  it('K-Q-J beats Q-J-10, which beats J-10-9, and so on down to 4-3-2', () => {
    const runs: [string, [any, any, any]][] = [
      ['K-Q-J', ['K', 'Q', 'J']],
      ['Q-J-10', ['Q', 'J', '10']],
      ['J-10-9', ['J', '10', '9']],
      ['10-9-8', ['10', '9', '8']],
      ['9-8-7', ['9', '8', '7']],
      ['8-7-6', ['8', '7', '6']],
      ['7-6-5', ['7', '6', '5']],
      ['6-5-4', ['6', '5', '4']],
      ['5-4-3', ['5', '4', '3']],
      ['4-3-2', ['4', '3', '2']],
    ];
    const values = runs.map(([, ranks]) =>
      classifyThreeCardHand([c(ranks[0], 'SPADES'), c(ranks[1], 'HEARTS'), c(ranks[2], 'DIAMONDS')])
    );
    for (let i = 0; i < values.length - 1; i++) {
      expect(compareThreeCardHands(values[i], values[i + 1])).toBeGreaterThan(0);
    }
  });

  it('this holds for Pure Sequences (same suit) too, not just mixed-suit Sequences', () => {
    const akq = classifyThreeCardHand([c('A', 'SPADES'), c('K', 'SPADES'), c('Q', 'SPADES')]);
    const a23 = classifyThreeCardHand([c('A', 'SPADES'), c('2', 'SPADES'), c('3', 'SPADES')]);
    const kqj = classifyThreeCardHand([c('K', 'SPADES'), c('Q', 'SPADES'), c('J', 'SPADES')]);
    expect(compareThreeCardHands(akq, a23)).toBeGreaterThan(0);
    expect(compareThreeCardHands(a23, kqj)).toBeGreaterThan(0);
  });
});
