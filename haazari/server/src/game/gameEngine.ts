import type {
  Card,
  GameState,
  PlayedSet,
  PlayerArrangement,
  PlayerId,
  RoundResult,
  SetIndex,
  SubRoundResult,
} from './types.js';
import { GAME_RULES } from './rules.js';
import { createDeck, shuffleDeck, dealCards, seatingOrderFromDealer, calculateSetValue, verifyDeckInvariant, determineInitialDealer } from './deck.js';
import { validatePlayerArrangement } from './arrangement.js';
import {
  getClockwisePlayOrder,
  getFirstSubRoundLeader,
  getNextLeader,
  rotateDealer,
  determineSubRoundWinner,
} from './turnOrder.js';
import { calculateRoundScores, calculateDismissedRoundScores, verifyRoundPointsInvariant, checkGameWinner } from './scoring.js';
import { getDismissalEligibility, processDismissalRequest, type DismissalRequest } from './dismissal.js';

/**
 * HaazariGame - a pure, server-authoritative, in-memory state machine for
 * one table of 4 players. No networking/IO here; server.ts / websocket
 * handlers call these methods in response to socket events and broadcast
 * the resulting state. Keeping it framework-free makes it directly unit-
 * testable (see tests/gameEngine.test.ts and the full simulation test).
 */
export class HaazariGame {
  readonly roomCode: string;
  readonly playersClockwise: PlayerId[];

  state: GameState = 'WAITING_FOR_PLAYERS';
  dealerId: PlayerId;
  roundNumber = 1;
  cumulativeScores: Record<PlayerId, number> = {};
  roundHistory: RoundResult[] = [];
  /** Populated only when the initial dealer was determined by dealing one
   *  card each (not when a deterministic dealer was supplied) - exposed so
   *  the UI can show a "dealing for dealer" reveal if desired. */
  readonly initialDealerRounds: { playerId: PlayerId; card: Card }[][] | null = null;

  private hands: Record<PlayerId, Card[]> = {};
  private arrangements: Record<PlayerId, PlayerArrangement | undefined> = {};
  private currentLeader: PlayerId | null = null;
  private currentSetIndex: SetIndex = 0;
  private playedThisSubRound: PlayedSet[] = [];
  private subRoundResults: SubRoundResult[] = [];
  private winnerId: PlayerId | null = null;

  constructor(roomCode: string, playersClockwise: PlayerId[], initialDealerId?: PlayerId) {
    if (playersClockwise.length !== GAME_RULES.PLAYER_COUNT) {
      throw new Error(`Haazari requires exactly ${GAME_RULES.PLAYER_COUNT} players, got ${playersClockwise.length}`);
    }
    this.roomCode = roomCode;
    this.playersClockwise = [...playersClockwise];
    for (const pid of this.playersClockwise) this.cumulativeScores[pid] = 0;
    // Dealer for the very first round is determined by dealing one card to
    // each player - whoever draws highest deals (Section 6) - unless a
    // deterministic dealer is supplied (e.g. for TEST_MODE).
    if (initialDealerId) {
      this.dealerId = initialDealerId;
    } else {
      const result = determineInitialDealer(this.playersClockwise);
      this.dealerId = result.dealerId;
      this.initialDealerRounds = result.rounds;
    }
  }

  // --------------------------------------------------------------------
  // DEALING
  // --------------------------------------------------------------------

  /** Shuffles and deals a fresh 13-card hand to each player, clockwise from the dealer. */
  dealNewRound(testDeck?: Card[]): void {
    if (this.state !== 'WAITING_FOR_PLAYERS' && this.state !== 'ROUND_COMPLETE' && this.state !== 'DISMISSED_ROUND' && this.state !== 'READY') {
      throw new Error(`Cannot deal a new round from state ${this.state}`);
    }
    this.state = 'DEALING';

    const deck = testDeck ?? createDeck();
    verifyDeckInvariant(deck);
    const shuffled = GAME_RULES.TEST_MODE && testDeck ? testDeck : shuffleDeck(deck);

    const seating = seatingOrderFromDealer(this.playersClockwise, this.dealerId);
    const { hands } = dealCards(shuffled, seating, GAME_RULES.CARDS_PER_PLAYER);
    this.hands = hands;
    this.arrangements = {};
    this.subRoundResults = [];
    this.playedThisSubRound = [];
    this.currentSetIndex = 0;
    this.winnerId = null;

    this.state = 'ARRANGING_HANDS';
  }

  /** Returns a player's own 13-card hand only - never call this for another player's client. */
  getPlayerHand(playerId: PlayerId): Card[] {
    return [...(this.hands[playerId] ?? [])];
  }

  /** Returns a player's own confirmed arrangement (their 4 sets), or null if not yet confirmed.
   *  Safe to send back to that player only - lets the client display "which cards are in my
   *  Set N" during play, and lets a reconnecting player recover their own view. */
  getPlayerArrangement(playerId: PlayerId): [Card[], Card[], Card[], Card[]] | null {
    const arrangement = this.arrangements[playerId];
    if (!arrangement?.confirmed) return null;
    return [...arrangement.sets] as [Card[], Card[], Card[], Card[]];
  }

  // --------------------------------------------------------------------
  // HAND ARRANGEMENT
  // --------------------------------------------------------------------

  /** Validates and, if valid, confirms a player's 3+3+3+4 arrangement. */
  confirmArrangement(playerId: PlayerId, sets: [Card[], Card[], Card[], Card[]]): { ok: boolean; errors?: string[] } {
    if (this.state !== 'ARRANGING_HANDS' && this.state !== 'WAITING_FOR_HAND_CONFIRMATION') {
      throw new Error(`Cannot confirm arrangement from state ${this.state}`);
    }
    const hand = this.hands[playerId];
    if (!hand) throw new Error(`Unknown player ${playerId}`);

    const result = validatePlayerArrangement(hand, sets);
    if (!result.valid) return { ok: false, errors: result.errors };

    this.arrangements[playerId] = { playerId, sets, confirmed: true };

    const allConfirmed = this.playersClockwise.every((pid) => this.arrangements[pid]?.confirmed);
    this.state = allConfirmed ? 'ROUND_READY' : 'WAITING_FOR_HAND_CONFIRMATION';
    if (allConfirmed) this.beginSubRounds();

    return { ok: true };
  }

  // --------------------------------------------------------------------
  // DISMISSAL (voluntary, whole-round, per updated rule)
  // --------------------------------------------------------------------

  /**
   * A player invokes dismissal. If eligible, the ENTIRE round is voided for
   * ALL players: everyone scores 0 for this round, and the dealer still
   * rotates before the next dealer deals a fresh round. Must be called
   * before/at the point sub-rounds begin (i.e. while hands are still being
   * arranged/confirmed) - once card play starts, dismissal no longer applies.
   */
  requestDismissal(playerId: PlayerId, claimedReason: DismissalRequest['claimedReason']): { ok: boolean; error?: string } {
    if (this.state !== 'ARRANGING_HANDS' && this.state !== 'WAITING_FOR_HAND_CONFIRMATION' && this.state !== 'ROUND_READY') {
      return { ok: false, error: `Cannot dismiss from state ${this.state}` };
    }
    const hand = this.hands[playerId];
    const arrangement = this.arrangements[playerId]?.sets;
    const outcome = processDismissalRequest({ playerId, claimedReason }, hand, arrangement);
    if (!outcome.accepted) return { ok: false, error: outcome.error };

    // Void the whole round for everyone.
    const zeroScores = calculateDismissedRoundScores(this.playersClockwise);
    this.roundHistory.push({
      roundNumber: this.roundNumber,
      dealerId: this.dealerId,
      subRounds: [],
      pointsThisRound: zeroScores,
      cumulativeScores: { ...this.cumulativeScores },
      dismissed: true,
      dismissalReason: claimedReason,
    });
    this.state = 'DISMISSED_ROUND';

    // Dealer still rotates clockwise; roundNumber advances for the redeal.
    this.dealerId = rotateDealer(this.playersClockwise, this.dealerId);
    this.roundNumber += 1;

    return { ok: true };
  }

  // --------------------------------------------------------------------
  // SUB-ROUND PLAY
  // --------------------------------------------------------------------

  private beginSubRounds(): void {
    this.currentSetIndex = 0;
    this.currentLeader = getFirstSubRoundLeader(this.playersClockwise, this.dealerId);
    this.playedThisSubRound = [];
    this.state = 'PLAYING_SET_1';
  }

  /** The current clockwise play order for the active sub-round, starting from the leader. */
  getCurrentPlayOrder(): PlayerId[] {
    if (!this.currentLeader) throw new Error('No active sub-round');
    return getClockwisePlayOrder(this.playersClockwise, this.currentLeader);
  }

  /**
   * A player plays (throws) their pre-arranged set for the current
   * sub-round. Server validates it's their turn and that they haven't
   * already played this sub-round.
   */
  playSet(playerId: PlayerId): void {
    const validStates: GameState[] = ['PLAYING_SET_1', 'PLAYING_SET_2', 'PLAYING_SET_3', 'PLAYING_SET_4'];
    if (!validStates.includes(this.state)) {
      throw new Error(`Cannot play a set from state ${this.state}`);
    }

    const order = this.getCurrentPlayOrder();
    const alreadyPlayed = new Set(this.playedThisSubRound.map((p) => p.playerId));
    if (alreadyPlayed.has(playerId)) {
      throw new Error(`${playerId} has already played this set`);
    }
    const nextExpected = order[this.playedThisSubRound.length];
    if (nextExpected !== playerId) {
      throw new Error(`Not ${playerId}'s turn - waiting on ${nextExpected}`);
    }

    const arrangement = this.arrangements[playerId];
    if (!arrangement) throw new Error(`${playerId} has no confirmed arrangement`);
    const cards = arrangement.sets[this.currentSetIndex];

    this.playedThisSubRound.push({
      playerId,
      cards,
      throwOrder: this.playedThisSubRound.length,
    });

    if (this.playedThisSubRound.length === GAME_RULES.PLAYER_COUNT) {
      this.revealAndScoreSubRound();
    }
  }

  private revealAndScoreSubRound(): void {
    this.state = (`REVEALING_SET_${this.currentSetIndex + 1}` as GameState);

    const { winnerId, wasTie, tiedPlayerIds } = determineSubRoundWinner(this.currentSetIndex, this.playedThisSubRound);
    const pointsAwarded = this.playedThisSubRound.reduce(
      (sum, ps) => sum + calculateSetValue(ps.cards),
      0
    );

    const result: SubRoundResult = {
      setIndex: this.currentSetIndex,
      playedSets: this.playedThisSubRound,
      winnerId,
      pointsAwarded,
      wasTie,
      tiedPlayerIds,
    };
    this.subRoundResults.push(result);

    if (this.currentSetIndex < 3) {
      // Winner of this set leads the next set.
      this.currentLeader = getNextLeader(winnerId);
      this.currentSetIndex = (this.currentSetIndex + 1) as SetIndex;
      this.playedThisSubRound = [];
      this.state = (`PLAYING_SET_${this.currentSetIndex + 1}` as GameState);
    } else {
      this.completeRound();
    }
  }

  private completeRound(): void {
    verifyRoundPointsInvariant(this.subRoundResults);
    const pointsThisRound = calculateRoundScores(this.subRoundResults, this.playersClockwise);

    for (const pid of this.playersClockwise) {
      this.cumulativeScores[pid] += pointsThisRound[pid];
    }

    this.roundHistory.push({
      roundNumber: this.roundNumber,
      dealerId: this.dealerId,
      subRounds: this.subRoundResults,
      pointsThisRound,
      cumulativeScores: { ...this.cumulativeScores },
      dismissed: false,
    });

    this.state = 'ROUND_COMPLETE';

    const winCheck = checkGameWinner(this.cumulativeScores);
    if (winCheck.gameOver) {
      this.winnerId = winCheck.winnerId!;
      this.state = 'GAME_COMPLETE';
      return;
    }

    // Nobody has won yet - rotate dealer and prepare for the next round.
    this.dealerId = rotateDealer(this.playersClockwise, this.dealerId);
    this.roundNumber += 1;
    this.state = 'ROUND_COMPLETE'; // caller triggers dealNewRound() to proceed
  }

  getWinner(): PlayerId | null {
    return this.winnerId;
  }

  /** Public snapshot of state safe to broadcast (does NOT include hidden hands). */
  getPublicState() {
    let currentPlayOrder: PlayerId[] | null = null;
    try {
      currentPlayOrder = this.currentLeader ? this.getCurrentPlayOrder() : null;
    } catch {
      currentPlayOrder = null;
    }
    return {
      roomCode: this.roomCode,
      state: this.state,
      dealerId: this.dealerId,
      roundNumber: this.roundNumber,
      cumulativeScores: { ...this.cumulativeScores },
      currentSetIndex: this.currentSetIndex,
      currentLeader: this.currentLeader,
      currentPlayOrder,
      playersPlayedThisSubRound: this.playedThisSubRound.map((p) => p.playerId),
      subRoundResultsThisRound: this.subRoundResults,
      winnerId: this.winnerId,
    };
  }
}
