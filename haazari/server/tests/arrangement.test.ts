import { describe, it, expect } from 'vitest';
import { validatePlayerArrangement, suggestArrangement } from '../src/game/arrangement.js';
import { createDeck } from '../src/game/deck.js';
import type { Card } from '../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

// Set1: Trail (strongest) | Set2: Pair | Set3: High Card (Q,9,4)
// Set4: 4 cards, all distinct suits/no run, best 3-of-4 subset is High Card
// (8,6,3 + kicker 2) which is deliberately weaker than Set3's (Q,9,4) so the
// unified strongest->weakest ordering (Set4 must rank below Set3) holds.
const fullHand: Card[] = [
  c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), // set1 trail
  c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS'), // set2 pair
  c('Q', 'CLUBS'), c('9', 'SPADES'), c('4', 'HEARTS'), // set3 high card (Q,9,4)
  c('8', 'CLUBS'), c('6', 'HEARTS'), c('3', 'SPADES'), c('2', 'DIAMONDS'), // set4 (4 cards, best subset High Card 8,6,3)
];

describe('validatePlayerArrangement', () => {
  it('accepts a valid strongest-to-weakest arrangement using all 13 cards', () => {
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], fullHand[2]], // trail
      [fullHand[3], fullHand[4], fullHand[5]], // pair
      [fullHand[6], fullHand[7], fullHand[8]], // high card (Q,9,4)
      [fullHand[9], fullHand[10], fullHand[11], fullHand[12]], // 4-card set, best subset High Card (8,6,3), weaker than Set3
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(true);
  });

  it('rejects when a later set is stronger than an earlier set', () => {
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[3], fullHand[4], fullHand[5]], // pair (set1)
      [fullHand[0], fullHand[1], fullHand[2]], // trail (set2) - stronger than set1!
      [fullHand[6], fullHand[7], fullHand[8]],
      [fullHand[9], fullHand[10], fullHand[11], fullHand[12]],
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('strongest to weakest'))).toBe(true);
  });

  it('rejects when Set 4 (4-card set) out-ranks Set 3, using the unified comparison scale', () => {
    // Swap Set3 (high card) and Set4 (which, by itself moved to position 3,
    // would need to beat a stronger Set3) - here we directly construct a
    // case where the 4-card set's best 3-of-4 subset (Trail) is stronger
    // than Set3 (Pair), which must be rejected.
    const strongFourCardSet: Card[] = [c('9', 'CLUBS'), c('9', 'HEARTS'), c('9', 'DIAMONDS'), c('2', 'SPADES')]; // trail subset
    const handWithStrongSet4 = [...fullHand.slice(0, 9), ...strongFourCardSet];
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], fullHand[2]], // trail (set1)
      [fullHand[3], fullHand[4], fullHand[5]], // pair (set2)
      [fullHand[6], fullHand[7], fullHand[8]], // high card (set3)
      strongFourCardSet, // best subset = Trail -> stronger than set3's High Card
    ];
    const result = validatePlayerArrangement(handWithStrongSet4, sets);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('strongest to weakest'))).toBe(true);
  });

  it('rejects duplicate cards across sets', () => {
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], fullHand[2]],
      [fullHand[2], fullHand[4], fullHand[5]], // fullHand[2] reused
      [fullHand[6], fullHand[7], fullHand[8]],
      [fullHand[9], fullHand[10], fullHand[11], fullHand[12]],
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('twice'))).toBe(true);
  });

  it('rejects incomplete hands (missing cards)', () => {
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], fullHand[2]],
      [fullHand[3], fullHand[4], fullHand[5]],
      [fullHand[6], fullHand[7], fullHand[8]],
      [fullHand[9], fullHand[10], fullHand[11]], // only 3, should be 4
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(false);
  });

  it('rejects cards not in the original hand', () => {
    const foreignCard = c('7', 'CLUBS');
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], foreignCard],
      [fullHand[3], fullHand[4], fullHand[5]],
      [fullHand[6], fullHand[7], fullHand[8]],
      [fullHand[9], fullHand[10], fullHand[11], fullHand[12]],
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(false);
  });

  it('does NOT require a pure sequence (Section 9)', () => {
    // fullHand's arrangement above has zero pure sequences and is still valid.
    const sets: [Card[], Card[], Card[], Card[]] = [
      [fullHand[0], fullHand[1], fullHand[2]],
      [fullHand[3], fullHand[4], fullHand[5]],
      [fullHand[6], fullHand[7], fullHand[8]],
      [fullHand[9], fullHand[10], fullHand[11], fullHand[12]],
    ];
    const result = validatePlayerArrangement(fullHand, sets);
    expect(result.valid).toBe(true);
  });
});

describe('suggestArrangement (auto-arrange helper)', () => {
  it('always produces a valid arrangement, verified across many random hands', () => {
    // Deterministic PRNG so failures are reproducible.
    let seed = 42;
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    function shuffledDeck(): Card[] {
      const deck = createDeck();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    }

    const TRIALS = 40;
    for (let t = 0; t < TRIALS; t++) {
      const deck = shuffledDeck();
      const hand = deck.slice(0, 13);
      const suggestion = suggestArrangement(hand);

      // All 13 cards used, no duplicates, correct sizes.
      expect(suggestion.flat().length).toBe(13);
      expect(new Set(suggestion.flat().map((c) => c.id)).size).toBe(13);
      expect(suggestion.map((s) => s.length)).toEqual([3, 3, 3, 4]);

      const result = validatePlayerArrangement(hand, suggestion);
      if (!result.valid) {
        throw new Error(
          `suggestArrangement produced an INVALID arrangement on trial ${t}: ${result.errors.join('; ')}\nHand: ${hand.map((c) => c.id).join(',')}`
        );
      }
      expect(result.valid).toBe(true);
    }
  });

  it('produces a strictly non-increasing strength arrangement (Set1 >= Set2 >= Set3 >= Set4)', () => {
    const hand: Card[] = [
      c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), c('A', 'CLUBS'),
      c('K', 'SPADES'), c('K', 'HEARTS'),
      c('Q', 'SPADES'), c('J', 'DIAMONDS'), c('9', 'CLUBS'),
      c('7', 'HEARTS'), c('5', 'SPADES'), c('3', 'DIAMONDS'), c('2', 'CLUBS'),
    ];
    const [s1, s2, s3, s4] = suggestArrangement(hand);
    // Best possible: should find the Trail of Aces for Set1.
    expect(s1.filter((c) => c.rank === 'A').length).toBe(3);
    const result = validatePlayerArrangement(hand, [s1, s2, s3, s4]);
    expect(result.valid).toBe(true);
  });
});
