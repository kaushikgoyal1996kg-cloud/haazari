import { describe, it, expect } from 'vitest';
import { calculateRoundScores, verifyRoundPointsInvariant, checkGameWinner } from '../src/game/scoring.js';
import type { SubRoundResult } from '../src/game/types.js';

const players = ['P1', 'P2', 'P3', 'P4'];

function subRound(setIndex: 0 | 1 | 2 | 3, winnerId: string, pointsAwarded: number): SubRoundResult {
  return { setIndex, playedSets: [], winnerId, pointsAwarded, wasTie: false, tiedPlayerIds: [] };
}

describe('calculateRoundScores', () => {
  it('sums points per winner across sub-rounds, per Section 21 example', () => {
    const subRounds = [subRound(0, 'P3', 25), subRound(1, 'P3', 15), subRound(2, 'P1', 20), subRound(3, 'P2', 25)];
    // Note: the spec's Section 21 example gives Player 3 85 points for winning
    // one sub-round outright (25+15+25+20 = 85, awarded entirely to the winner
    // of that one sub-round). Here we verify per-sub-round attribution.
    const scores = calculateRoundScores(subRounds, players);
    expect(scores.P3).toBe(40);
    expect(scores.P1).toBe(20);
    expect(scores.P2).toBe(25);
    expect(scores.P4).toBe(0);
  });

  it('matches the Section 21 worked example exactly', () => {
    // Sub-round total = 85; P3 has the strongest set and takes all 85; others get 0.
    const subRounds = [subRound(0, 'P3', 85)];
    const scores = calculateRoundScores(subRounds, players);
    expect(scores.P3).toBe(85);
    expect(scores.P1).toBe(0);
    expect(scores.P2).toBe(0);
    expect(scores.P4).toBe(0);
  });
});

describe('verifyRoundPointsInvariant', () => {
  it('passes when 4 sub-rounds sum to exactly 360', () => {
    const subRounds = [subRound(0, 'P1', 85), subRound(1, 'P2', 95), subRound(2, 'P3', 100), subRound(3, 'P4', 80)];
    expect(() => verifyRoundPointsInvariant(subRounds)).not.toThrow();
  });

  it('throws when the total is not 360 (scoring bug)', () => {
    const subRounds = [subRound(0, 'P1', 85), subRound(1, 'P2', 95), subRound(2, 'P3', 100), subRound(3, 'P4', 79)];
    expect(() => verifyRoundPointsInvariant(subRounds)).toThrow();
  });

  it('is a no-op for an incomplete round', () => {
    const subRounds = [subRound(0, 'P1', 85)];
    expect(() => verifyRoundPointsInvariant(subRounds)).not.toThrow();
  });
});

describe('checkGameWinner', () => {
  it('999 + 1 = winner', () => {
    const result = checkGameWinner({ P1: 1000, P2: 500, P3: 400, P4: 300 });
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBe('P1');
  });

  it('999 + 100 = winner', () => {
    const result = checkGameWinner({ P1: 1099, P2: 500, P3: 400, P4: 300 });
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBe('P1');
  });

  it('985 + 75 = winner (1060)', () => {
    const result = checkGameWinner({ P1: 1060, P2: 500, P3: 400, P4: 300 });
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBe('P1');
  });

  it('no winner below 1000', () => {
    const result = checkGameWinner({ P1: 999, P2: 500, P3: 400, P4: 300 });
    expect(result.gameOver).toBe(false);
  });

  it('if multiple reach 1000+ in the same round, highest cumulative wins', () => {
    const result = checkGameWinner({ P1: 1050, P2: 1200, P3: 400, P4: 300 });
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBe('P2');
    expect(result.qualifyingPlayerIds.sort()).toEqual(['P1', 'P2']);
  });
});
