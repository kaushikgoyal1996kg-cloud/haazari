import type { PlayedSet, PlayerId, SetIndex } from './types.js';
import { classifyThreeCardHand, compareThreeCardHands } from './hands.js';
import { classifyFourCardHand, compareFourCardHands } from './fourCardRanking.js';
import { GAME_RULES } from './rules.js';

/**
 * Returns the clockwise play order for a sub-round STARTING FROM the given
 * leader. Never hard-codes any particular player as first (Section 16).
 */
export function getClockwisePlayOrder(
  allPlayersClockwise: PlayerId[],
  leaderId: PlayerId
): PlayerId[] {
  const idx = allPlayersClockwise.indexOf(leaderId);
  if (idx === -1) throw new Error(`Leader ${leaderId} not found in player list`);
  return [
    ...allPlayersClockwise.slice(idx),
    ...allPlayersClockwise.slice(0, idx),
  ];
}

/**
 * Determines the leader for Set 1 of a fresh round, per the configurable
 * STARTING_PLAYER_RULE (documented in rules.ts).
 */
export function getFirstSubRoundLeader(
  allPlayersClockwise: PlayerId[],
  dealerId: PlayerId
): PlayerId {
  if (GAME_RULES.STARTING_PLAYER_RULE === 'DEALER') return dealerId;
  // LEFT_OF_DEALER: player immediately clockwise of the dealer
  const idx = allPlayersClockwise.indexOf(dealerId);
  if (idx === -1) throw new Error(`Dealer ${dealerId} not found in player list`);
  return allPlayersClockwise[(idx + 1) % allPlayersClockwise.length];
}

/** The winner of a set always becomes leader for the next set (Section 15). */
export function getNextLeader(previousSubRoundWinner: PlayerId): PlayerId {
  return previousSubRoundWinner;
}

/** Rotates the dealer clockwise to the next player (Section 6). */
export function rotateDealer(allPlayersClockwise: PlayerId[], currentDealerId: PlayerId): PlayerId {
  const idx = allPlayersClockwise.indexOf(currentDealerId);
  if (idx === -1) throw new Error(`Dealer ${currentDealerId} not found in player list`);
  return allPlayersClockwise[(idx + 1) % allPlayersClockwise.length];
}

export interface SubRoundWinnerResult {
  winnerId: PlayerId;
  wasTie: boolean;
  tiedPlayerIds: PlayerId[];
}

/**
 * Determines the winner of a sub-round.
 * - Sets index 0,1,2 (3-card sets) use the Teen Patti hierarchy.
 * - Set index 3 (4-card set) uses the isolated 4-card ranking system.
 * - Ties are ALWAYS broken by throw order: the tied player who threw LAST
 *   wins. Suit is NEVER used as a tiebreaker (Section 12-13, 50).
 *
 * `playedSets` must each carry the `throwOrder` in which they were played
 * (0 = thrown first). `playOrder` (clockwise order starting from the
 * sub-round leader) is accepted for cross-validation but throwOrder is
 * authoritative for "who played last."
 */
export function determineSubRoundWinner(
  setIndex: SetIndex,
  playedSets: PlayedSet[]
): SubRoundWinnerResult {
  // Every player always plays every set - nobody can fold mid-round. The
  // only way a player contributes no score is a whole-round dismissal
  // (see dismissal.ts), which voids the round for all players before any
  // sets are scored, so this function is never called for a dismissed round.
  if (playedSets.length !== GAME_RULES.PLAYER_COUNT) {
    throw new Error(
      `Expected exactly ${GAME_RULES.PLAYER_COUNT} played sets (all players must play), got ${playedSets.length}`
    );
  }

  // 1. Score every played set using the correct comparator for this set index.
  const scored = playedSets.map((ps) => {
    if (setIndex === 3) {
      return { playerId: ps.playerId, throwOrder: ps.throwOrder, value: classifyFourCardHand(ps.cards) };
    }
    return { playerId: ps.playerId, throwOrder: ps.throwOrder, value: classifyThreeCardHand(ps.cards) };
  });

  const compare = (x: (typeof scored)[number], y: (typeof scored)[number]) =>
    setIndex === 3
      ? compareFourCardHands(x.value as ReturnType<typeof classifyFourCardHand>, y.value as ReturnType<typeof classifyFourCardHand>)
      : compareThreeCardHands(x.value as ReturnType<typeof classifyThreeCardHand>, y.value as ReturnType<typeof classifyThreeCardHand>);

  // 2. Find the highest strength.
  let best = scored[0];
  for (const s of scored.slice(1)) {
    if (compare(s, best) > 0) best = s;
  }

  // 3. Find all players sharing that highest strength.
  const tiedCandidates = scored.filter((s) => compare(s, best) === 0);

  // 4. Single highest -> that player wins outright.
  if (tiedCandidates.length === 1) {
    return { winnerId: tiedCandidates[0].playerId, wasTie: false, tiedPlayerIds: [] };
  }

  // 5. Multiple tied -> the one with the HIGHEST throwOrder (played last) wins.
  //    No suit-based or random tiebreak, ever.
  const winner = tiedCandidates.reduce((latest, cur) =>
    cur.throwOrder > latest.throwOrder ? cur : latest
  );

  return {
    winnerId: winner.playerId,
    wasTie: true,
    tiedPlayerIds: tiedCandidates.map((c) => c.playerId),
  };
}
