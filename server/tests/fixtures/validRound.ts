import type { Card, PlayerId } from '../../src/game/types.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit, id: `${suit}_${rank}` };
}

/**
 * Four hand-verified, VALID (strongest->weakest) 3+3+3+4 arrangements that
 * together use all 52 unique cards exactly once. Designed so each player's
 * own sets are correctly ordered per validatePlayerArrangement, including
 * the unified Set3-vs-Set4 comparison (best 3-of-4 sub-combo methodology).
 *
 * Known sub-round outcomes for this fixed deal (verified by hand, and
 * re-verified by the tests themselves):
 *   Set 1: P1 wins (Trail of Aces beats everything)          -> 110 pts
 *   Set 2: P4 wins (Color A-9-8 clubs beats P3's Color 9-5-4) ->  85 pts
 *   Set 3: P4 wins (Color 9-8-6 diamonds, only Color present) ->  75 pts
 *   Set 4: P4 wins (best-3-of-4 Color 7-3-2 hearts)           ->  90 pts
 * Round total: 110 + 85 + 75 + 90 = 360 (matches ROUND_POINTS invariant).
 * Per-round score: P1 +110, P2 +0, P3 +0, P4 +250.
 */
export const PLAYERS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

export const ARRANGED_SETS: Record<PlayerId, [Card[], Card[], Card[], Card[]]> = {
  P1: [
    [c('A', 'SPADES'), c('A', 'HEARTS'), c('A', 'DIAMONDS')], // Trail A
    [c('K', 'SPADES'), c('K', 'HEARTS'), c('5', 'DIAMONDS')], // Pair K, kicker 5
    [c('Q', 'SPADES'), c('9', 'HEARTS'), c('4', 'DIAMONDS')], // High Card Q,9,4
    [c('8', 'SPADES'), c('6', 'HEARTS'), c('3', 'DIAMONDS'), c('2', 'CLUBS')], // best3of4: High Card 8,6,3 kicker2
  ],
  P2: [
    [c('K', 'DIAMONDS'), c('K', 'CLUBS'), c('5', 'CLUBS')], // Pair K, kicker 5
    [c('Q', 'DIAMONDS'), c('Q', 'CLUBS'), c('4', 'CLUBS')], // Pair Q, kicker 4
    [c('J', 'DIAMONDS'), c('J', 'CLUBS'), c('3', 'CLUBS')], // Pair J, kicker 3
    [c('10', 'DIAMONDS'), c('10', 'CLUBS'), c('7', 'CLUBS'), c('6', 'SPADES')], // best3of4: Pair 10 kicker7,6
  ],
  P3: [
    [c('J', 'SPADES'), c('10', 'SPADES'), c('7', 'SPADES')], // Color (spades) J,10,7
    [c('9', 'SPADES'), c('5', 'SPADES'), c('4', 'SPADES')], // Color (spades) 9,5,4
    [c('3', 'SPADES'), c('2', 'SPADES'), c('8', 'HEARTS')], // High Card 8,3,2
    [c('7', 'DIAMONDS'), c('5', 'HEARTS'), c('4', 'HEARTS'), c('2', 'DIAMONDS')], // best3of4: High Card 7,5,4 kicker2
  ],
  P4: [
    [c('Q', 'HEARTS'), c('J', 'HEARTS'), c('10', 'HEARTS')], // Pure Sequence Q-J-10 hearts
    [c('A', 'CLUBS'), c('9', 'CLUBS'), c('8', 'CLUBS')], // Color (clubs) A,9,8
    [c('9', 'DIAMONDS'), c('8', 'DIAMONDS'), c('6', 'DIAMONDS')], // Color (diamonds) 9,8,6
    [c('7', 'HEARTS'), c('3', 'HEARTS'), c('2', 'HEARTS'), c('6', 'CLUBS')], // best3of4: Color (hearts) 7,3,2 kicker6
  ],
};

export const PLAYER_HANDS: Record<PlayerId, Card[]> = Object.fromEntries(
  PLAYERS.map((p) => [p, ARRANGED_SETS[p].flat()])
);

/**
 * Builds a 52-card "test deck" ordered so that, when dealt round-robin via
 * dealCards() in the given seating order, each player ends up with exactly
 * their PLAYER_HANDS[player] cards (order within a hand doesn't matter -
 * confirmArrangement selects specific card objects, not positions).
 */
export function buildDeckForSeating(seatingOrderClockwise: PlayerId[]): Card[] {
  const deck: Card[] = [];
  for (let i = 0; i < 13; i++) {
    for (const pid of seatingOrderClockwise) {
      deck.push(PLAYER_HANDS[pid][i]);
    }
  }
  return deck;
}
