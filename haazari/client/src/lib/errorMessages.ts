import type { PublicPlayerInfo } from '../game/types';

/**
 * The game engine's raw error strings are written to be precise for
 * debugging/tests (e.g. "Not m24tsk72rwtw's turn - waiting on qyrzfy96r3ch",
 * using internal player IDs, or "Cannot play a set from state PLAYING_SET_2",
 * exposing the internal state machine). This translates the known patterns
 * into something a player actually wants to read, using the room's player
 * list to swap IDs for names. Falls back to the raw message unchanged for
 * anything it doesn't recognize (e.g. arrangement validation errors and
 * dismissal errors, which are already written to be player-facing) - never
 * hides information, only rephrases what's already there.
 */
export function friendlyGameError(rawMessage: string, players: PublicPlayerInfo[], myPlayerId: string | null): string {
  const nameOf = (id: string) => players.find((p) => p.playerId === id)?.name ?? 'that player';

  const turnMatch = rawMessage.match(/^Not (\S+)'s turn - waiting on (\S+)$/);
  if (turnMatch) {
    const [, actor, waitingOn] = turnMatch;
    if (actor === myPlayerId) {
      return `It's not your turn yet — waiting for ${nameOf(waitingOn)} to play.`;
    }
    return `It's ${nameOf(actor)}'s turn, not yours — waiting for ${nameOf(waitingOn)} to play.`;
  }

  const alreadyPlayedMatch = rawMessage.match(/^(\S+) has already played this set$/);
  if (alreadyPlayedMatch) {
    return "You've already played this set — just wait for the other players.";
  }

  const noArrangementMatch = rawMessage.match(/^(\S+) has no confirmed arrangement$/);
  if (noArrangementMatch) {
    return 'Please confirm your hand arrangement before playing.';
  }

  if (/^Cannot play a set from state /.test(rawMessage)) {
    return "You can't play right now — the table isn't ready for that yet.";
  }

  if (/^Cannot confirm arrangement from state /.test(rawMessage)) {
    return "You can't confirm your hand right now — please wait for the round to be ready.";
  }

  if (/^Cannot dismiss from state /.test(rawMessage)) {
    return "You can't dismiss right now — that's only available while hands are being arranged.";
  }

  if (/^Cannot start next round from state /.test(rawMessage)) {
    return "Can't start the next round yet — the current round isn't finished.";
  }

  if (/^Card .* is not part of your dealt hand\.$/.test(rawMessage)) {
    return 'Something went wrong with your card selection — please try again.';
  }

  if (rawMessage === 'Not currently in a room.') {
    return "You're not in a game right now.";
  }
  if (rawMessage === 'Game has not started yet.') {
    return 'The game has not started yet.';
  }

  // Anything else (arrangement validation errors, dismissal eligibility
  // errors, room errors) is already written to be player-facing - pass it
  // through unchanged.
  return rawMessage;
}
