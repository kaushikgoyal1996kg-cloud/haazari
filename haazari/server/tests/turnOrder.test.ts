import { describe, it, expect } from 'vitest';
import {
  getClockwisePlayOrder,
  getFirstSubRoundLeader,
  getNextLeader,
  rotateDealer,
  determineSubRoundWinner,
} from '../src/game/turnOrder.js';
import type { Card, PlayedSet } from '../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

const players = ['P1', 'P2', 'P3', 'P4'];

describe('getClockwisePlayOrder', () => {
  it('never hard-codes P1 first - starts from whichever leader is given', () => {
    expect(getClockwisePlayOrder(players, 'P2')).toEqual(['P2', 'P3', 'P4', 'P1']);
    expect(getClockwisePlayOrder(players, 'P4')).toEqual(['P4', 'P1', 'P2', 'P3']);
  });
});

describe('dealer rotation', () => {
  it('rotates P1 -> P2 -> P3 -> P4 -> P1', () => {
    let dealer = 'P1';
    const seq = [dealer];
    for (let i = 0; i < 4; i++) {
      dealer = rotateDealer(players, dealer);
      seq.push(dealer);
    }
    expect(seq).toEqual(['P1', 'P2', 'P3', 'P4', 'P1']);
  });
});

describe('leader progression', () => {
  it('Set1 winner leads Set2, Set2 winner leads Set3, Set3 winner leads Set4', () => {
    expect(getNextLeader('P3')).toBe('P3');
  });

  it('getFirstSubRoundLeader defaults to LEFT_OF_DEALER', () => {
    expect(getFirstSubRoundLeader(players, 'P1')).toBe('P2');
    expect(getFirstSubRoundLeader(players, 'P4')).toBe('P1');
  });
});

describe('determineSubRoundWinner - TIE BREAKING (critical, no suit tiebreak)', () => {
  it('single highest hand wins outright, no tie', () => {
    const played: PlayedSet[] = [
      { playerId: 'P1', throwOrder: 0, cards: [c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS')] }, // trail
      { playerId: 'P2', throwOrder: 1, cards: [c('9', 'CLUBS'), c('4', 'SPADES'), c('2', 'HEARTS')] },
      { playerId: 'P3', throwOrder: 2, cards: [c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')] },
      { playerId: 'P4', throwOrder: 3, cards: [c('Q', 'CLUBS'), c('9', 'HEARTS'), c('3', 'DIAMONDS')] },
    ];
    const result = determineSubRoundWinner(0, played);
    expect(result.winnerId).toBe('P1');
    expect(result.wasTie).toBe(false);
  });

  it('play order P2->P3->P4->P1, P2 and P4 tie exactly -> P4 wins (played later)', () => {
    const played: PlayedSet[] = [
      { playerId: 'P2', throwOrder: 0, cards: [c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')] }, // pair K, kicker 5
      { playerId: 'P3', throwOrder: 1, cards: [c('9', 'CLUBS'), c('4', 'SPADES'), c('2', 'HEARTS')] }, // high card
      { playerId: 'P4', throwOrder: 2, cards: [c('K', 'CLUBS'), c('K', 'DIAMONDS'), c('5', 'SPADES')] }, // pair K, kicker 5 - identical strength
      { playerId: 'P1', throwOrder: 3, cards: [c('Q', 'CLUBS'), c('9', 'HEARTS'), c('3', 'DIAMONDS')] }, // high card
    ];
    const result = determineSubRoundWinner(0, played);
    expect(result.wasTie).toBe(true);
    expect(result.tiedPlayerIds.sort()).toEqual(['P2', 'P4']);
    expect(result.winnerId).toBe('P4');
  });

  it('play order P1->P2->P3->P4, P1 and P3 tie exactly -> P3 wins (played later)', () => {
    const played: PlayedSet[] = [
      { playerId: 'P1', throwOrder: 0, cards: [c('9', 'SPADES'), c('9', 'HEARTS'), c('2', 'DIAMONDS')] }, // pair 9, kicker 2
      { playerId: 'P2', throwOrder: 1, cards: [c('4', 'CLUBS'), c('8', 'SPADES'), c('2', 'HEARTS')] }, // high card, no sequence
      { playerId: 'P3', throwOrder: 2, cards: [c('9', 'CLUBS'), c('9', 'DIAMONDS'), c('2', 'SPADES')] }, // pair 9, kicker 2 - identical strength
      { playerId: 'P4', throwOrder: 3, cards: [c('7', 'CLUBS'), c('K', 'HEARTS'), c('3', 'DIAMONDS')] }, // high card, no sequence
    ];
    const result = determineSubRoundWinner(0, played);
    expect(result.wasTie).toBe(true);
    expect(result.winnerId).toBe('P3');
  });

  it('play order P3->P4->P1->P2, P1 and P2 tie exactly -> P2 wins (played later)', () => {
    const played: PlayedSet[] = [
      { playerId: 'P3', throwOrder: 0, cards: [c('4', 'CLUBS'), c('9', 'SPADES'), c('2', 'HEARTS')] }, // high card, no sequence
      { playerId: 'P4', throwOrder: 1, cards: [c('6', 'CLUBS'), c('K', 'SPADES'), c('3', 'HEARTS')] }, // high card, no sequence
      { playerId: 'P1', throwOrder: 2, cards: [c('J', 'SPADES'), c('J', 'HEARTS'), c('8', 'DIAMONDS')] },
      { playerId: 'P2', throwOrder: 3, cards: [c('J', 'CLUBS'), c('J', 'DIAMONDS'), c('8', 'SPADES')] },
    ];
    const result = determineSubRoundWinner(0, played);
    expect(result.wasTie).toBe(true);
    expect(result.winnerId).toBe('P2');
  });

  it('never uses suit ranking to break ties (Spades>Hearts>Diamonds>Clubs must NOT apply)', () => {
    // P1 (Spades pair) thrown FIRST, P4 (Clubs pair, "weakest suit") thrown LAST - equal strength.
    // A suit-based tiebreak would wrongly pick P1; the correct last-throw rule picks P4.
    const played: PlayedSet[] = [
      { playerId: 'P1', throwOrder: 0, cards: [c('9', 'SPADES'), c('9', 'HEARTS'), c('2', 'DIAMONDS')] },
      { playerId: 'P2', throwOrder: 1, cards: [c('4', 'CLUBS'), c('8', 'SPADES'), c('2', 'HEARTS')] },
      { playerId: 'P3', throwOrder: 2, cards: [c('6', 'HEARTS'), c('K', 'SPADES'), c('3', 'DIAMONDS')] },
      { playerId: 'P4', throwOrder: 3, cards: [c('9', 'CLUBS'), c('9', 'DIAMONDS'), c('2', 'SPADES')] },
    ];
    const result = determineSubRoundWinner(0, played);
    expect(result.winnerId).toBe('P4');
  });

  it('handles 4-card set (setIndex 3) using the isolated ranking system', () => {
    const played: PlayedSet[] = [
      { playerId: 'P1', throwOrder: 0, cards: [c('9', 'SPADES'), c('9', 'HEARTS'), c('9', 'DIAMONDS'), c('9', 'CLUBS')] }, // 4 of a kind
      { playerId: 'P2', throwOrder: 1, cards: [c('4', 'CLUBS'), c('3', 'SPADES'), c('2', 'HEARTS'), c('K', 'DIAMONDS')] },
      { playerId: 'P3', throwOrder: 2, cards: [c('6', 'HEARTS'), c('5', 'SPADES'), c('3', 'DIAMONDS'), c('Q', 'CLUBS')] },
      { playerId: 'P4', throwOrder: 3, cards: [c('J', 'CLUBS'), c('8', 'SPADES'), c('2', 'DIAMONDS'), c('K', 'HEARTS')] },
    ];
    const result = determineSubRoundWinner(3, played);
    expect(result.winnerId).toBe('P1');
    expect(result.wasTie).toBe(false);
  });

  it('requires exactly 4 played sets - nobody can fold mid-round', () => {
    const played: PlayedSet[] = [
      { playerId: 'P1', throwOrder: 0, cards: [c('9', 'SPADES'), c('9', 'HEARTS'), c('2', 'DIAMONDS')] },
      { playerId: 'P3', throwOrder: 1, cards: [c('4', 'CLUBS'), c('3', 'SPADES'), c('2', 'HEARTS')] },
    ];
    expect(() => determineSubRoundWinner(0, played)).toThrow(/Expected exactly 4/);
  });
});
