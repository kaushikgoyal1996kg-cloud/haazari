import { describe, it, expect } from 'vitest';
import { getDismissalEligibility, processDismissalRequest } from '../src/game/dismissal.js';
import { calculateDismissedRoundScores } from '../src/game/scoring.js';
import type { Card } from '../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

const sixPairHand: Card[] = [
  c('A', 'SPADES'), c('A', 'HEARTS'),
  c('K', 'SPADES'), c('K', 'HEARTS'),
  c('Q', 'SPADES'), c('Q', 'HEARTS'),
  c('J', 'SPADES'), c('J', 'HEARTS'),
  c('10', 'SPADES'), c('10', 'HEARTS'),
  c('9', 'SPADES'), c('9', 'HEARTS'),
  c('8', 'SPADES'),
];

const normalHand: Card[] = [
  c('A', 'SPADES'), c('K', 'HEARTS'), c('Q', 'DIAMONDS'), c('J', 'CLUBS'), c('9', 'SPADES'),
  c('7', 'HEARTS'), c('5', 'DIAMONDS'), c('3', 'CLUBS'), c('2', 'SPADES'), c('4', 'HEARTS'),
  c('6', 'DIAMONDS'), c('8', 'CLUBS'), c('10', 'SPADES'),
];

describe('getDismissalEligibility', () => {
  it('is eligible via SIX_PAIRS on the raw hand', () => {
    const result = getDismissalEligibility(sixPairHand);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain('SIX_PAIRS');
  });

  it('is NOT eligible for a normal hand with no arrangement given', () => {
    const result = getDismissalEligibility(normalHand);
    expect(result.eligible).toBe(false);
  });

  it('dismissal is NOT automatic - eligibility alone does not force any state change', () => {
    const result = getDismissalEligibility(sixPairHand);
    expect(result.eligible).toBe(true);
    const result2 = getDismissalEligibility(sixPairHand);
    expect(result2).toEqual(result);
  });
});

describe('processDismissalRequest', () => {
  it('accepts a valid dismissal claim matching real eligibility, voiding round for all', () => {
    const outcome = processDismissalRequest({ playerId: 'P1', claimedReason: 'SIX_PAIRS' }, sixPairHand, undefined);
    expect(outcome.accepted).toBe(true);
    expect(outcome.action).toBe('VOID_ROUND_ROTATE_DEALER');
  });

  it('rejects a dismissal claim when the player is not actually eligible (never trust client)', () => {
    const outcome = processDismissalRequest({ playerId: 'P1', claimedReason: 'SIX_PAIRS' }, normalHand, undefined);
    expect(outcome.accepted).toBe(false);
  });

  it('rejects a mismatched reason even if some other reason would be valid', () => {
    const outcome = processDismissalRequest({ playerId: 'P1', claimedReason: 'NO_SEQUENCE' }, sixPairHand, undefined);
    expect(outcome.accepted).toBe(false);
  });

  it('a dismissed round awards exactly 0 points to every player, including the one who dismissed', () => {
    const totals = calculateDismissedRoundScores(['P1', 'P2', 'P3', 'P4']);
    expect(totals).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 });
  });
});
