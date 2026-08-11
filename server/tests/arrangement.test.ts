import { describe, it, expect } from 'vitest';
import { validatePlayerArrangement, suggestArrangement, greedyMaxFirstArrangement, suggestArrangementOptions } from '../src/game/arrangement.js';
import { createDeck } from '../src/game/deck.js';
import { classifyThreeCardHand } from '../src/game/hands.js';
import { classifyFourCardHand } from '../src/game/fourCardRanking.js';
import { GAME_RULES } from '../src/game/rules.js';
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
    const result = validatePlayerArrangement(hand, [s1, s2, s3, s4]);
    expect(result.valid).toBe(true);
  });

  it('prefers a BALANCED arrangement over concentrating strength into Set 1 alone', () => {
    // A hand where naively maximizing Set 1 (the old behavior) would trail
    // all 4 aces together and leave Sets 2-4 as scraps - but spreading the
    // aces one-per-set (each with same-suit company) yields a much
    // stronger MINIMUM set across the board. The balanced algorithm should
    // find and prefer that spread.
    const hand: Card[] = [
      c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), c('A', 'CLUBS'),
      c('K', 'SPADES'), c('K', 'HEARTS'),
      c('Q', 'SPADES'), c('J', 'DIAMONDS'), c('9', 'CLUBS'),
      c('7', 'HEARTS'), c('5', 'SPADES'), c('3', 'DIAMONDS'), c('2', 'CLUBS'),
    ];

    const balanced = suggestArrangement(hand);
    const greedy = greedyMaxFirstArrangement(hand);

    const catsOf = (sets: [Card[], Card[], Card[], Card[]]) => [
      classifyThreeCardHand(sets[0]).category,
      classifyThreeCardHand(sets[1]).category,
      classifyThreeCardHand(sets[2]).category,
      classifyFourCardHand(sets[3]).category,
    ];

    const balancedCats = catsOf(balanced);
    const greedyCats = catsOf(greedy);
    const balancedWeakest = Math.min(...balancedCats);
    const greedyWeakest = Math.min(...greedyCats);

    // The whole point: the balanced result's weakest set must be at least
    // as strong as the greedy result's weakest set (and strictly stronger
    // for this specific hand, where greedy's leftover cards are weak).
    expect(balancedWeakest).toBeGreaterThan(greedyWeakest);

    // Still a fully valid arrangement.
    expect(validatePlayerArrangement(hand, balanced).valid).toBe(true);
  });

  it('the balanced arrangement never scores worse (by weakest-set + total) than the plain greedy one, across many random hands', () => {
    let seed = 7;
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
    const catsOf = (sets: [Card[], Card[], Card[], Card[]]) => [
      classifyThreeCardHand(sets[0]).category,
      classifyThreeCardHand(sets[1]).category,
      classifyThreeCardHand(sets[2]).category,
      classifyFourCardHand(sets[3]).category,
    ];

    for (let t = 0; t < 25; t++) {
      const hand = shuffledDeck().slice(0, 13);
      const balanced = suggestArrangement(hand);
      const greedy = greedyMaxFirstArrangement(hand);
      const balancedCats = catsOf(balanced);
      const greedyCats = catsOf(greedy);
      const balancedScore = Math.min(...balancedCats) * 1000 + balancedCats.reduce((a, b) => a + b, 0);
      const greedyScore = Math.min(...greedyCats) * 1000 + greedyCats.reduce((a, b) => a + b, 0);
      expect(balancedScore).toBeGreaterThanOrEqual(greedyScore);
      expect(validatePlayerArrangement(hand, balanced).valid).toBe(true);
    }
  });
});

describe('suggestArrangement - endgame strategy switch (close to WINNING_SCORE)', () => {
  const hand: Card[] = [
    c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), c('A', 'CLUBS'),
    c('K', 'SPADES'), c('K', 'HEARTS'),
    c('Q', 'SPADES'), c('J', 'DIAMONDS'), c('9', 'CLUBS'),
    c('7', 'HEARTS'), c('5', 'SPADES'), c('3', 'DIAMONDS'), c('2', 'CLUBS'),
  ];

  it('uses the balanced strategy when far from winning (no score given)', () => {
    const [s1] = suggestArrangement(hand);
    // Balanced strategy spreads the aces (Pure Sequence, not a Trail).
    expect(s1.filter((c) => c.rank === 'A').length).toBeLessThan(3);
  });

  it('uses the balanced strategy when score is well below the threshold', () => {
    const [s1] = suggestArrangement(hand, 500); // 500 points needed - far from 150 threshold
    expect(s1.filter((c) => c.rank === 'A').length).toBeLessThan(3);
  });

  it('switches to the concentrated strategy once within CLOSE_TO_WINNING_THRESHOLD of winning', () => {
    const cumulativeScore = GAME_RULES.WINNING_SCORE - GAME_RULES.CLOSE_TO_WINNING_THRESHOLD; // exactly at the boundary
    const [s1] = suggestArrangement(hand, cumulativeScore);
    // Concentrated (greedy) strategy hoards all 3 spare aces into the Trail for Set 1.
    expect(s1.filter((c) => c.rank === 'A').length).toBe(3);
  });

  it('still switches to concentrated when already past the threshold (e.g. 950/1000)', () => {
    const [s1] = suggestArrangement(hand, 950);
    expect(s1.filter((c) => c.rank === 'A').length).toBe(3);
  });

  it('the concentrated result is still a fully valid arrangement', () => {
    const arrangement = suggestArrangement(hand, 950);
    expect(validatePlayerArrangement(hand, arrangement).valid).toBe(true);
  });
});

describe('suggestArrangementOptions - multiple choices', () => {
  const acesHand: Card[] = [
    c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS'), c('A', 'CLUBS'),
    c('K', 'SPADES'), c('K', 'HEARTS'),
    c('Q', 'SPADES'), c('J', 'DIAMONDS'), c('9', 'CLUBS'),
    c('7', 'HEARTS'), c('5', 'SPADES'), c('3', 'DIAMONDS'), c('2', 'CLUBS'),
  ];

  it('returns between 2 and 3 options, each a fully valid arrangement', () => {
    const options = suggestArrangementOptions(acesHand);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(3);
    for (const opt of options) {
      expect(validatePlayerArrangement(acesHand, opt.sets).valid).toBe(true);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('every option uses a genuinely different card grouping (no duplicates)', () => {
    const options = suggestArrangementOptions(acesHand);
    const fingerprints = options.map((o) => o.sets.map((s) => s.map((c) => c.id).sort().join(',')).join('|'));
    const uniqueFingerprints = new Set(fingerprints);
    expect(uniqueFingerprints.size).toBe(options.length);
  });

  it('includes a distinctly "Aggressive" option that concentrates strength (matches greedyMaxFirstArrangement)', () => {
    const options = suggestArrangementOptions(acesHand);
    const aggressiveOption = options.find((o) => o.label === 'Aggressive');
    expect(aggressiveOption).toBeDefined();
    const greedy = greedyMaxFirstArrangement(acesHand);
    expect(aggressiveOption!.sets.map((s) => s.map((c) => c.id).sort().join(','))).toEqual(
      greedy.map((s) => s.map((c) => c.id).sort().join(','))
    );
  });

  it('near the winning threshold, the Aggressive option is listed first', () => {
    const closeScore = GAME_RULES.WINNING_SCORE - GAME_RULES.CLOSE_TO_WINNING_THRESHOLD;
    const options = suggestArrangementOptions(acesHand, closeScore);
    expect(options[0].label).toBe('Aggressive');
  });

  it('far from winning, a Balanced option is listed first', () => {
    const options = suggestArrangementOptions(acesHand, 200);
    expect(options[0].label).toBe('Balanced');
  });

  it('works across many random hands without ever throwing or returning zero options', () => {
    let seed = 42;
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (let t = 0; t < 20; t++) {
      const deck = createDeck();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const hand = deck.slice(0, 13);
      const options = suggestArrangementOptions(hand);
      expect(options.length).toBeGreaterThan(0);
      for (const opt of options) {
        expect(validatePlayerArrangement(hand, opt.sets).valid).toBe(true);
      }
    }
  });
});
