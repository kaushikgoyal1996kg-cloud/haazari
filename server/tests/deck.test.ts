import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealCards, calculateCardValue, calculateSetValue, verifyDeckInvariant, seatingOrderFromDealer } from '../src/game/deck.js';

describe('createDeck', () => {
  it('creates exactly 52 unique cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });

  it('has correct ranks and suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS']));
    const spadesRanks = deck.filter((c) => c.suit === 'SPADES').map((c) => c.rank);
    expect(spadesRanks.length).toBe(13);
  });

  it('totals exactly 360 points', () => {
    const deck = createDeck();
    expect(calculateSetValue(deck)).toBe(360);
  });

  it('passes the deck invariant check', () => {
    expect(() => verifyDeckInvariant(createDeck())).not.toThrow();
  });
});

describe('calculateCardValue', () => {
  it('assigns 10 points to A,K,Q,J,10', () => {
    for (const rank of ['A', 'K', 'Q', 'J', '10'] as const) {
      expect(calculateCardValue({ suit: 'SPADES', rank, id: `x_${rank}` })).toBe(10);
    }
  });
  it('assigns 5 points to 2-9', () => {
    for (const rank of ['9', '8', '7', '6', '5', '4', '3', '2'] as const) {
      expect(calculateCardValue({ suit: 'SPADES', rank, id: `x_${rank}` })).toBe(5);
    }
  });
});

describe('shuffleDeck', () => {
  it('preserves all 52 cards, just reordered', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(52);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(deck.map((c) => c.id)));
  });

  it('actually changes order (statistically, with a fixed rng it must differ from identity for non-trivial input)', () => {
    const deck = createDeck();
    let call = 0;
    const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.05, 0.99, 0.4];
    const rng = () => seq[call++ % seq.length];
    const shuffled = shuffleDeck(deck, rng);
    expect(shuffled.map((c) => c.id)).not.toEqual(deck.map((c) => c.id));
  });
});

describe('dealCards', () => {
  const players = ['P1', 'P2', 'P3', 'P4'];

  it('deals exactly 13 cards to each of 4 players with no duplicates, all 52 distributed', () => {
    const deck = shuffleDeck(createDeck());
    const { hands } = dealCards(deck, players, 13);
    for (const p of players) expect(hands[p].length).toBe(13);
    const all = Object.values(hands).flat();
    expect(all.length).toBe(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });

  it('deals sequentially clockwise (round-robin), not sliced blocks', () => {
    const deck = createDeck(); // unshuffled, deterministic
    const { dealSequence } = dealCards(deck, players, 13);
    // First 4 events should be one card to each player in order, cycling
    expect(dealSequence.slice(0, 4).map((e) => e.playerId)).toEqual(players);
    expect(dealSequence.slice(4, 8).map((e) => e.playerId)).toEqual(players);
    // The very first card dealt should be the very first card of the deck
    expect(dealSequence[0].card.id).toBe(deck[0].id);
    expect(dealSequence[1].card.id).toBe(deck[1].id);
  });

  it('throws if not enough cards', () => {
    const shortDeck = createDeck().slice(0, 10);
    expect(() => dealCards(shortDeck, players, 13)).toThrow();
  });
});

describe('seatingOrderFromDealer', () => {
  it('rotates the seating list to start at the dealer', () => {
    const players = ['P1', 'P2', 'P3', 'P4'];
    expect(seatingOrderFromDealer(players, 'P3')).toEqual(['P3', 'P4', 'P1', 'P2']);
  });
});
