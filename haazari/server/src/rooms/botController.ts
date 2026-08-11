import { suggestArrangement } from '../game/arrangement.js';
import type { PlayerId } from '../game/types.js';
import type { RoomState } from './types.js';

type PendingBotAction = { kind: 'arrange'; botId: PlayerId } | { kind: 'play'; botId: PlayerId };

const PLAYABLE_STATES = ['PLAYING_SET_1', 'PLAYING_SET_2', 'PLAYING_SET_3', 'PLAYING_SET_4'];

/**
 * Finds the single next thing a bot needs to do right now, or null if
 * nothing is pending. This is the shared logic behind both the paced
 * (delayed, one-at-a-time) socket flow and the synchronous "do everything
 * now" helper used by tests.
 */
function findPendingBotAction(room: RoomState): PendingBotAction | null {
  const game = room.game;
  if (!game) return null;

  const bots = new Set([...room.players.values()].filter((p) => p.isBot).map((p) => p.playerId));
  if (bots.size === 0) return null;

  if (game.state === 'ARRANGING_HANDS' || game.state === 'WAITING_FOR_HAND_CONFIRMATION') {
    for (const botId of bots) {
      if (game.getPlayerArrangement(botId)) continue;
      const hand = game.getPlayerHand(botId);
      if (hand.length === 0) continue;
      return { kind: 'arrange', botId };
    }
  }

  if (PLAYABLE_STATES.includes(game.state)) {
    let order: PlayerId[] = [];
    try {
      order = game.getCurrentPlayOrder();
    } catch {
      order = [];
    }
    const publicState = game.getPublicState();
    const nextPlayerId = order[publicState.playersPlayedThisSubRound.length];
    if (nextPlayerId && bots.has(nextPlayerId)) {
      return { kind: 'play', botId: nextPlayerId };
    }
  }

  return null;
}

/** True if some bot in this room has something to do right now. Used to
 *  decide whether it's worth scheduling a delayed action at all. */
export function hasPendingBotAction(room: RoomState): boolean {
  return findPendingBotAction(room) !== null;
}

/**
 * Performs exactly ONE bot action (either confirming one bot's hand
 * arrangement using the same suggestArrangement() solver real players get,
 * or playing one bot's current turn) and returns whether it succeeded.
 * Intended to be called with a small delay between calls so bot play
 * doesn't resolve an entire round instantly (see socketHandlers.ts).
 */
export function performOneBotAction(room: RoomState): boolean {
  const action = findPendingBotAction(room);
  if (!action || !room.game) return false;
  const game = room.game;

  if (action.kind === 'arrange') {
    const hand = game.getPlayerHand(action.botId);
    const cumulativeScore = game.cumulativeScores[action.botId] ?? 0;
    const sets = suggestArrangement(hand, cumulativeScore);
    const result = game.confirmArrangement(action.botId, sets);
    return result.ok;
  }

  try {
    game.playSet(action.botId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronously performs EVERY currently-pending bot action back-to-back
 * with no delay, looping because one bot's action can immediately make it
 * another bot's turn. Useful for tests and fully-simulated bots-only
 * games; the real-time socket flow uses performOneBotAction() with a
 * delay between calls instead, so human players can actually see bots
 * "thinking" rather than a round resolving instantly.
 */
export function runBotActions(room: RoomState): boolean {
  let actedAtLeastOnce = false;
  let safetyCounter = 0;
  while (performOneBotAction(room) && safetyCounter < 200) {
    actedAtLeastOnce = true;
    safetyCounter++;
  }
  return actedAtLeastOnce;
}
