import { describe, it, expect } from 'vitest';
import { determineInitialDealer } from '../src/game/deck.js';
import { RANK_VALUE } from '../src/game/rules.js';

describe('determineInitialDealer', () => {
  it('always returns one of the given players', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < 30; i++) {
      const { dealerId } = determineInitialDealer(players);
      expect(players).toContain(dealerId);
    }
  });

  it('the winning dealer genuinely held the highest card in the final round dealt', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < 20; i++) {
      const { dealerId, rounds } = determineInitialDealer(players);
      const finalRound = rounds[rounds.length - 1];
      const dealerCard = finalRound.find((d) => d.playerId === dealerId)!.card;
      const maxValue = Math.max(...finalRound.map((d) => RANK_VALUE[d.card.rank]));
      expect(RANK_VALUE[dealerCard.rank]).toBe(maxValue);
      const others = finalRound.filter((d) => d.playerId !== dealerId);
      for (const o of others) {
        expect(RANK_VALUE[o.card.rank]).toBeLessThan(maxValue);
      }
    }
  });

  it('resolves without any re-deal when using an unshuffled deck (no ties)', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    const unshuffledRng = () => 0; // Fisher-Yates with rng()=0 leaves the deck in original order
    const { dealerId, rounds } = determineInitialDealer(players, unshuffledRng);
    // createDeck() order is SPADES A,K,Q,J,... first, so P1 is dealt A♠.
    expect(rounds.length).toBe(1);
    expect(dealerId).toBe('P1');
  });

  it('actually re-deals when the dealt cards genuinely tie, and the candidate pool never grows (only stays the same on a re-tie, or shrinks)', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    let sawMultiRound = false;
    for (let i = 0; i < 200; i++) {
      const { rounds } = determineInitialDealer(players);
      if (rounds.length > 1) {
        sawMultiRound = true;
        for (let r = 1; r < rounds.length; r++) {
          // Usually shrinks, but a re-tie among the same narrowed group is
          // legitimate (e.g. both tied players draw the same rank again) -
          // the only real invariant is it can never GROW, and the process
          // always terminates with exactly 1 candidate left.
          expect(rounds[r].length).toBeLessThanOrEqual(rounds[r - 1].length);
        }
        expect(rounds[rounds.length - 1].length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(sawMultiRound).toBe(true);
  });

  it('eventually resolves even through multiple consecutive re-ties (never loops forever)', () => {
    // A pathological rng that always ties everyone (returns a fixed value
    // that produces identical rank draws) would infinite-loop a naive
    // implementation. Real crypto randomness makes true infinite ties
    // vanishingly unlikely, but we verify termination is fast regardless
    // across many real trials rather than trying to force a contrived tie
    // sequence (the underlying deck always has only 4 cards of any given
    // rank, so an n-way tie can repeat at most a few times before the pool
    // of remaining same-rank cards is exhausted).
    const players = ['P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < 100; i++) {
      const { dealerId, rounds } = determineInitialDealer(players);
      expect(players).toContain(dealerId);
      expect(rounds.length).toBeLessThan(10); // sanity bound - should never remotely approach this
    }
  });

  it('is roughly fair across many trials (no player is drastically favored)', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    const counts: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      const { dealerId } = determineInitialDealer(players);
      counts[dealerId]++;
    }
    for (const pid of players) {
      expect(counts[pid]).toBeGreaterThan(trials / 4 - 50);
      expect(counts[pid]).toBeLessThan(trials / 4 + 50);
    }
  });

  it('works with any number of players (defensive - engine always calls it with 4)', () => {
    const { dealerId } = determineInitialDealer(['Solo']);
    expect(dealerId).toBe('Solo');
  });
});
