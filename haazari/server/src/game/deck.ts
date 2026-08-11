import type { Card, Rank, Suit } from './types.js';
import { SUITS, RANKS, TEN_POINT_CARDS, RANK_VALUE, GAME_RULES } from './rules.js';

/** Creates one standard 52-card deck, unshuffled, in a fixed deterministic order. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}_${rank}` });
    }
  }
  if (deck.length !== 52) {
    throw new Error(`Deck creation invariant failed: expected 52 cards, got ${deck.length}`);
  }
  return deck;
}

/** Point value of a single card per GAME_RULES. */
export function calculateCardValue(card: Card): number {
  return TEN_POINT_CARDS.includes(card.rank)
    ? GAME_RULES.TEN_POINT_VALUE
    : GAME_RULES.LOW_POINT_VALUE;
}

/** Sum of point values for a set of cards. */
export function calculateSetValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + calculateCardValue(c), 0);
}

/** Verifies the full-deck invariant: 52 cards summing to exactly 360 points. */
export function verifyDeckInvariant(deck: Card[]): void {
  if (deck.length !== 52) {
    throw new Error(`Deck invariant failed: expected 52 cards, got ${deck.length}`);
  }
  const total = calculateSetValue(deck);
  if (total !== 360) {
    throw new Error(`Deck invariant failed: expected 360 total points, got ${total}`);
  }
  const uniqueIds = new Set(deck.map((c) => c.id));
  if (uniqueIds.size !== 52) {
    throw new Error(`Deck invariant failed: duplicate cards detected`);
  }
}

/**
 * Fisher-Yates shuffle using a secure random source (crypto.getRandomValues).
 * Never shuffle on the client - this must only run server-side.
 */
export function shuffleDeck(deck: Card[], rng: () => number = secureRandom): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function secureRandom(): number {
  // Uniform [0,1) using a cryptographically secure 32-bit integer.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 4294967296;
}

export interface DealForDealerResult {
  dealerId: string;
  /** Every round of one-card-each dealt during the process, in order - the
   *  final round (index length-1) is the one that produced a unique
   *  highest card. Useful if the UI ever wants to show a "dealing for
   *  dealer" animation/reveal rather than just announcing the result. */
  rounds: { playerId: string; card: Card }[][];
}

/**
 * Determines the very first dealer of a game the traditional way: deal one
 * card to each player, whoever gets the highest card deals (Ace high). If
 * two or more players tie for highest, only those tied players are dealt
 * to again (repeat until a single winner emerges) - matching the game's
 * established principle elsewhere that ties are NEVER broken by suit
 * (Section 12-13), so this never falls back to a suit ranking either, no
 * matter how many re-deals it takes.
 */
export function determineInitialDealer(
  playerIdsClockwise: string[],
  rng: () => number = secureRandom
): DealForDealerResult {
  if (playerIdsClockwise.length === 0) {
    throw new Error('determineInitialDealer requires at least one player');
  }

  let candidates = [...playerIdsClockwise];
  const rounds: { playerId: string; card: Card }[][] = [];

  while (candidates.length > 1) {
    const deck = shuffleDeck(createDeck(), rng);
    const dealt = candidates.map((playerId, i) => ({ playerId, card: deck[i] }));
    rounds.push(dealt);

    const maxValue = Math.max(...dealt.map((d) => RANK_VALUE[d.card.rank]));
    candidates = dealt.filter((d) => RANK_VALUE[d.card.rank] === maxValue).map((d) => d.playerId);
  }

  return { dealerId: candidates[0], rounds };
}

/**
 * Deals a shuffled deck to N players, `cardsPerPlayer` each, dealt
 * sequentially ONE CARD AT A TIME in clockwise order (so a real dealing
 * animation can replay the sequence) rather than sliced in blocks.
 *
 * Returns both the final hands AND the ordered sequence of deal events
 * (playerId + card) for animation replay.
 */
export interface DealEvent {
  playerId: string;
  card: Card;
  cardIndexForPlayer: number; // 0-based, which card # this is for that player
}

export function dealCards(
  shuffledDeck: Card[],
  playerIdsClockwise: string[],
  cardsPerPlayer: number = GAME_RULES.CARDS_PER_PLAYER
): { hands: Record<string, Card[]>; dealSequence: DealEvent[] } {
  const expectedTotal = playerIdsClockwise.length * cardsPerPlayer;
  if (shuffledDeck.length < expectedTotal) {
    throw new Error(
      `Not enough cards to deal: need ${expectedTotal}, have ${shuffledDeck.length}`
    );
  }

  const hands: Record<string, Card[]> = {};
  for (const pid of playerIdsClockwise) hands[pid] = [];

  const dealSequence: DealEvent[] = [];
  let cardCursor = 0;

  // Deal round-robin, one card per player per pass, clockwise - this is the
  // "sequential clockwise" dealing pattern (not sliced blocks per player).
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const pid of playerIdsClockwise) {
      const card = shuffledDeck[cardCursor++];
      hands[pid].push(card);
      dealSequence.push({ playerId: pid, card, cardIndexForPlayer: round });
    }
  }

  // Invariant checks
  for (const pid of playerIdsClockwise) {
    if (hands[pid].length !== cardsPerPlayer) {
      throw new Error(`Dealing invariant failed: ${pid} received ${hands[pid].length} cards`);
    }
  }
  const allDealt = Object.values(hands).flat();
  if (allDealt.length !== expectedTotal) {
    throw new Error('Dealing invariant failed: total dealt card count mismatch');
  }
  const uniqueIds = new Set(allDealt.map((c) => c.id));
  if (uniqueIds.size !== allDealt.length) {
    throw new Error('Dealing invariant failed: duplicate card dealt to players');
  }

  return { hands, dealSequence };
}

/**
 * Given the current dealer and full clockwise seating order, returns the
 * seating order STARTING FROM the dealer (used to drive clockwise dealing).
 */
export function seatingOrderFromDealer(
  allPlayersClockwise: string[],
  dealerId: string
): string[] {
  const idx = allPlayersClockwise.indexOf(dealerId);
  if (idx === -1) throw new Error(`Dealer ${dealerId} not found in player list`);
  return [
    ...allPlayersClockwise.slice(idx),
    ...allPlayersClockwise.slice(0, idx),
  ];
}
