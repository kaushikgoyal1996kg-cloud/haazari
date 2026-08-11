import type { PlayerId, SubRoundResult } from './types.js';
import { GAME_RULES } from './rules.js';

/**
 * Sums the total points a player earned across the sub-rounds of a single
 * 360-point round.
 */
export function calculateRoundScores(
  subRounds: SubRoundResult[],
  allPlayerIds: PlayerId[]
): Record<PlayerId, number> {
  const totals: Record<PlayerId, number> = {};
  for (const pid of allPlayerIds) totals[pid] = 0;
  for (const sr of subRounds) {
    totals[sr.winnerId] = (totals[sr.winnerId] ?? 0) + sr.pointsAwarded;
  }
  return totals;
}

/**
 * Round scores when the round was DISMISSED under one of the two conditions
 * (no sequence / six pairs). Dismissal voids the round for every player -
 * everyone scores exactly 0 for this round, regardless of who triggered
 * the dismissal. Cumulative scores from prior rounds are untouched by the
 * caller (this function only produces the per-round contribution).
 */
export function calculateDismissedRoundScores(allPlayerIds: PlayerId[]): Record<PlayerId, number> {
  const totals: Record<PlayerId, number> = {};
  for (const pid of allPlayerIds) totals[pid] = 0;
  return totals;
}

/**
 * Verifies the four sub-rounds of a completed round sum to exactly
 * ROUND_POINTS (360). Throws/logs an internal error if not, per Section 22
 * ("there is a scoring or card-value bug"). Not applicable to a dismissed
 * round, which intentionally awards 0 points to everyone.
 */
export function verifyRoundPointsInvariant(subRounds: SubRoundResult[]): void {
  if (subRounds.length !== 4) return; // round not complete yet (or was dismissed) - nothing to verify
  const total = subRounds.reduce((sum, sr) => sum + sr.pointsAwarded, 0);
  if (total !== GAME_RULES.ROUND_POINTS) {
    throw new Error(
      `INTERNAL ERROR: round point invariant failed - sub-rounds summed to ${total}, expected ${GAME_RULES.ROUND_POINTS}. This indicates a scoring or card-value bug.`
    );
  }
}

export interface WinCheckResult {
  gameOver: boolean;
  winnerId?: PlayerId;
  qualifyingPlayerIds: PlayerId[];
}

/**
 * Checks the overall 1000+ win condition. Per Section 26-27, the current
 * 360-point round is always allowed to finish before declaring a winner
 * (END_GAME_IMMEDIATELY_AT_1000 = false by default). If multiple players
 * are at/above WINNING_SCORE at the end of the SAME completed round, the
 * highest cumulative score wins (ties beyond that are not specified by the
 * spec and are surfaced as a shared qualifying list for the caller/UI to
 * handle, e.g. declare a shared victory or sudden-death round).
 */
export function checkGameWinner(cumulativeScores: Record<PlayerId, number>): WinCheckResult {
  const qualifying = Object.entries(cumulativeScores)
    .filter(([, score]) => score >= GAME_RULES.WINNING_SCORE)
    .map(([pid]) => pid);

  if (qualifying.length === 0) {
    return { gameOver: false, qualifyingPlayerIds: [] };
  }

  const winnerId = qualifying.reduce((best, pid) =>
    cumulativeScores[pid] > cumulativeScores[best] ? pid : best
  , qualifying[0]);

  return { gameOver: true, winnerId, qualifyingPlayerIds: qualifying };
}
