// ============================================================================
// HAAZARI - Core Types
// ============================================================================

export type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS';

export type Rank =
  | 'A' | 'K' | 'Q' | 'J' | '10'
  | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface Card {
  suit: Suit;
  rank: Rank;
  /** Stable unique id, e.g. "SPADES_A" - useful for dedupe checks and client diffing */
  id: string;
}

export type PlayerId = string;

/** Which of the 4 sets a card belongs to (0-indexed: 0,1,2 are 3-card sets, 3 is the 4-card set) */
export type SetIndex = 0 | 1 | 2 | 3;

export interface PlayerArrangement {
  playerId: PlayerId;
  /** Exactly 4 sets: [3 cards, 3 cards, 3 cards, 4 cards] */
  sets: [Card[], Card[], Card[], Card[]];
  confirmed: boolean;
}

// ---- Three-card (Teen Patti) hand categories, weakest(0) to strongest(5) ----
export enum ThreeCardCategory {
  HIGH_CARD = 0,
  PAIR = 1,
  COLOR = 2,        // Flush
  SEQUENCE = 3,      // Straight (impure)
  PURE_SEQUENCE = 4, // Straight flush
  TRAIL = 5,         // Three of a kind
}

export interface ThreeCardHandValue {
  category: ThreeCardCategory;
  /** Rank values used for tie-breaking WITHIN the same category, most significant first.
   *  e.g. Trail of Kings -> [13]. Pair of 5s with kicker Ace -> [5, 14]. */
  tiebreakRanks: number[];
}

// Note: FourCardHandValue lives in fourCardRanking.ts (it's shape-compatible
// with ThreeCardHandValue since the 4-card set is ranked using the same
// Teen Patti hierarchy applied to its best 3-card sub-combination).

export interface PlayedSet {
  playerId: PlayerId;
  cards: Card[];
  /** Order in which this set was thrown within the sub-round (0 = first) */
  throwOrder: number;
}

export interface SubRoundResult {
  setIndex: SetIndex;
  playedSets: PlayedSet[];
  winnerId: PlayerId;
  pointsAwarded: number;
  wasTie: boolean;
  tiedPlayerIds: PlayerId[];
}

export interface RoundResult {
  roundNumber: number;
  dealerId: PlayerId;
  subRounds: SubRoundResult[];
  pointsThisRound: Record<PlayerId, number>;
  cumulativeScores: Record<PlayerId, number>;
  dismissed: boolean;
  dismissalReason?: DismissalReason;
}

export type DismissalReason = 'NO_SEQUENCE' | 'SIX_PAIRS';

export type GameState =
  | 'LOBBY'
  | 'WAITING_FOR_PLAYERS'
  | 'READY'
  | 'DEALING'
  | 'ARRANGING_HANDS'
  | 'WAITING_FOR_HAND_CONFIRMATION'
  | 'ROUND_READY'
  | 'PLAYING_SET_1'
  | 'REVEALING_SET_1'
  | 'PLAYING_SET_2'
  | 'REVEALING_SET_2'
  | 'PLAYING_SET_3'
  | 'REVEALING_SET_3'
  | 'PLAYING_SET_4'
  | 'REVEALING_SET_4'
  | 'ROUND_COMPLETE'
  | 'DEALER_ROTATION'
  | 'GAME_COMPLETE'
  | 'DISMISSED_ROUND';
