// ============================================================================
// HAAZARI - Central Rules Configuration
//
// ALL configurable/ambiguous rules live here. Do not hard-code rule values
// anywhere else in the codebase - import GAME_RULES instead.
//
// AMBIGUOUS-RULE ASSUMPTIONS (documented per spec Section 52 / 24):
// These traditional Haazari rules have regional variation. Sensible defaults
// are used below and isolated behind config + dedicated functions so they
// can be changed in one place without touching engine/UI code.
//
// 1. "No sequence" dismissal (NO_SEQUENCE_DISMISSAL):
//    Assumption used: a hand is ELIGIBLE to be dismissed if NONE of its four
//    sets contains a Sequence, Pure Sequence, or Trail (i.e. every set is
//    Pair/Color/High Card or worse) AND the 4-card set also has no run-based
//    combination. See isNoSequenceHand() in hands.ts.
//
// 2. "Six pairs" dismissal (SIX_PAIRS_DISMISSAL):
//    Assumption used: a hand is ELIGIBLE to be dismissed if the raw 13-card
//    hand (before arrangement) contains six or more distinct rank-pairs (two
//    cards of the same rank count as one pair; a rank appearing 3-4 times
//    still only contributes floor(n/2) pairs). See hasSixPairs() in hands.ts.
//
//    IMPORTANT: Dismissal is NOT automatic/compulsory. Meeting condition 1
//    or 2 only makes the player ELIGIBLE to dismiss their own hand for that
//    round if they choose to. The server verifies eligibility server-side
//    before honoring a dismiss action; a player who is eligible may still
//    choose to play the round normally instead. See dismissal.ts.
//
// 3. Four-card set ranking methodology (fourCardRanking.ts):
//    Assumption used: a Teen-Patti-inspired extension -
//      Four of a Kind > Straight Flush (4-run, one suit) > Flush (4 same
//      suit) > Straight (4-run, mixed suits) > Three of a Kind + kicker >
//      Two Pair > One Pair > High Card, with rank-based tiebreaks within
//      category. Fully isolated in fourCardRanking.ts so the methodology
//      can be swapped without touching anything else.
//
// 4. Starting player / leader for the very first sub-round of a round
//    (STARTING_PLAYER_RULE):
//    Assumption used: 'LEFT_OF_DEALER' - the player seated immediately
//    clockwise of the dealer leads Set 1. Configurable to 'DEALER' if
//    your table's tradition instead has the dealer lead.
//
// 5. What happens when a round is dismissed (DISMISSED_ROUND_ACTION):
//    Dismissal is WHOLE-ROUND, not per-player - nobody can fold mid-round;
//    every player always plays every set. If any player is eligible under
//    condition 1 or 2 and chooses to invoke dismissal, the ENTIRE round is
//    voided for ALL FOUR players: no sub-rounds are scored, every player
//    receives 0 points for that round (cumulative scores are untouched),
//    and the dealer STILL rotates clockwise before the next dealer deals a
//    fresh round. This is the only supported action - VOID_ROUND_ROTATE_DEALER.
//
// 6. Endgame arrangement strategy switch (CLOSE_TO_WINNING_THRESHOLD):
//    When a player's cumulative score is within this many points of
//    WINNING_SCORE, the auto-arrange suggestion (and bot hands) switch
//    from the default BALANCED strategy (maximize the weakest set, so you
//    have a realistic shot at winning several sub-rounds) to a
//    CONCENTRATED strategy (maximize Set 1 alone) - reasoning: this close
//    to the finish line, one big near-certain win is worth more than
//    several moderate chances, since a single strong sub-round is often
//    enough to cross the line outright. Assumption used: 150 points
//    (roughly the size of a strong single sub-round's point pool).
// ============================================================================

import type { Rank, Suit } from './types.js';

export const SUITS: Suit[] = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/** Numeric rank value for sequence/comparison math. Ace is high (14) by default;
 *  Ace-low straights (A-2-3) are also checked explicitly in hands.ts. */
export const RANK_VALUE: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, '10': 10,
  '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

export const TEN_POINT_CARDS: Rank[] = ['A', 'K', 'Q', 'J', '10'];
export const LOW_POINT_CARDS: Rank[] = ['9', '8', '7', '6', '5', '4', '3', '2'];

export type StartingPlayerRule = 'LEFT_OF_DEALER' | 'DEALER';
export type DismissedRoundAction = 'VOID_ROUND_ROTATE_DEALER';
export type TieBreaker = 'LAST_THROW'; // no other value is permitted per spec

export interface GameRulesConfig {
  PLAYER_COUNT: number;
  CARDS_PER_PLAYER: number;
  SET_SIZES: [number, number, number, number];
  ROUND_POINTS: number;
  WINNING_SCORE: number;
  TEN_POINT_VALUE: number;
  LOW_POINT_VALUE: number;
  DEAL_DIRECTION: 'CLOCKWISE';
  DEALER_ROTATION: 'CLOCKWISE';
  REQUIRE_PURE_SEQUENCE: boolean;
  SIX_PAIRS_DISMISSAL: boolean;
  NO_SEQUENCE_DISMISSAL: boolean;
  END_GAME_IMMEDIATELY_AT_1000: boolean;
  TIE_BREAKER: TieBreaker;
  STARTING_PLAYER_RULE: StartingPlayerRule;
  DISMISSED_ROUND_ACTION: DismissedRoundAction;
  SIX_PAIRS_THRESHOLD: number;
  RECONNECT_WINDOW_MS: number;
  TEST_MODE: boolean;
  CLOSE_TO_WINNING_THRESHOLD: number;
}

export const GAME_RULES: GameRulesConfig = {
  PLAYER_COUNT: 4,
  CARDS_PER_PLAYER: 13,
  SET_SIZES: [3, 3, 3, 4],
  ROUND_POINTS: 360,
  WINNING_SCORE: 1000,
  TEN_POINT_VALUE: 10,
  LOW_POINT_VALUE: 5,
  DEAL_DIRECTION: 'CLOCKWISE',
  DEALER_ROTATION: 'CLOCKWISE',
  REQUIRE_PURE_SEQUENCE: false,
  SIX_PAIRS_DISMISSAL: true,
  NO_SEQUENCE_DISMISSAL: true,
  END_GAME_IMMEDIATELY_AT_1000: false,
  TIE_BREAKER: 'LAST_THROW',
  STARTING_PLAYER_RULE: 'LEFT_OF_DEALER',
  DISMISSED_ROUND_ACTION: 'VOID_ROUND_ROTATE_DEALER',
  SIX_PAIRS_THRESHOLD: 6,
  RECONNECT_WINDOW_MS: 3 * 60 * 1000, // 3 minutes
  TEST_MODE: false,
  CLOSE_TO_WINNING_THRESHOLD: 150,
};
