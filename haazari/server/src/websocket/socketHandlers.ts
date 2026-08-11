import type { Server, Socket } from 'socket.io';
import { RoomManager, RoomManagerError } from '../rooms/roomManager.js';
import { hasPendingBotAction, performOneBotAction } from '../rooms/botController.js';
import { HaazariGame } from '../game/gameEngine.js';
import { suggestArrangement, suggestArrangementOptions } from '../game/arrangement.js';
import type { Card, DismissalReason, PlayerId } from '../game/types.js';
import type { ClientToServerEvents, ServerToClientEvents, HaazariPublicStatePayload } from './events.js';

/** Small pause between individual bot actions so play is visible/legible
 *  to human players rather than a whole round resolving instantly. */
const BOT_ACTION_DELAY_MS = 700;

/** Voice notes: cap both duration and encoded size to keep payloads small
 *  over the websocket connection (base64 adds ~33% overhead over raw audio). */
const MAX_VOICE_DURATION_SEC = 10;
const MAX_VOICE_DATA_URL_LENGTH = 700_000; // ~525KB raw audio, comfortably under Socket.IO's 1MB default buffer limit

interface SocketData {
  roomCode?: string;
  playerId?: PlayerId;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function registerSocketHandlers(io: IO, rooms: RoomManager): void {
  io.on('connection', (socket: Sock) => {
    // ------------------------------------------------------------------
    // ROOM LIFECYCLE
    // ------------------------------------------------------------------

    socket.on('room:create', ({ playerName, avatar }, ack) => {
      try {
        const name = sanitizeName(playerName);
        const { room, playerId, token } = rooms.createRoom(name, avatar);
        joinSocketToRoom(socket, room.roomCode, playerId);
        ack({ ok: true, roomCode: room.roomCode, playerId, token, room: rooms.toPublic(room) });
        broadcastRoom(io, rooms, room.roomCode);
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:join', ({ roomCode, playerName, avatar }, ack) => {
      try {
        const name = sanitizeName(playerName);
        const code = roomCode.trim().toUpperCase();
        const { room, playerId, token } = rooms.joinRoom(code, name, avatar);
        joinSocketToRoom(socket, room.roomCode, playerId);
        ack({ ok: true, roomCode: room.roomCode, playerId, token, room: rooms.toPublic(room) });
        broadcastRoom(io, rooms, room.roomCode);
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:quickMatch', ({ playerName, avatar }, ack) => {
      try {
        const name = sanitizeName(playerName);
        const { room, playerId, token } = rooms.quickMatch(name, avatar);
        joinSocketToRoom(socket, room.roomCode, playerId);
        ack({ ok: true, roomCode: room.roomCode, playerId, token, room: rooms.toPublic(room) });
        broadcastRoom(io, rooms, room.roomCode);
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:listTables', (ack) => {
      try {
        ack({ ok: true, tables: rooms.listOpenTables() });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:reconnect', ({ token }, ack) => {
      try {
        const { room, playerId } = rooms.reconnect(token, socket.id);
        joinSocketToRoom(socket, room.roomCode, playerId);
        ack({ ok: true, roomCode: room.roomCode, playerId, room: rooms.toPublic(room) });
        broadcastRoom(io, rooms, room.roomCode);
        if (room.game) {
          sendPrivateHand(io, room.game, playerId);
          sendPrivateArrangement(io, room.game, playerId);
          sendPublicGameState(io, room.roomCode, room.game);
        }
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:ready', ({ ready }) => {
      withRoom(socket, rooms, (room, playerId) => {
        rooms.setReady(room.roomCode, playerId, ready);
        broadcastRoom(io, rooms, room.roomCode);
      });
    });

    socket.on('room:start', () => {
      withRoom(socket, rooms, (room, playerId) => {
        rooms.startGame(room.roomCode, playerId);
        const playerIds = [...room.players.keys()];
        room.game = new HaazariGame(room.roomCode, playerIds);
        broadcastRoom(io, rooms, room.roomCode);
        dealAndBroadcast(io, room.game);
        scheduleBotActions(io, rooms, room.roomCode);
      });
    });

    socket.on('room:addBot', () => {
      withRoom(socket, rooms, (room, playerId) => {
        rooms.addBot(room.roomCode, playerId);
        broadcastRoom(io, rooms, room.roomCode);
      });
    });

    socket.on('room:playAgain', () => {
      withRoom(socket, rooms, (room, playerId) => {
        rooms.resetToLobby(room.roomCode, playerId);
        broadcastRoom(io, rooms, room.roomCode);
      });
    });

    socket.on('room:chat', ({ message, kind, durationSec }) => {
      withRoom(socket, rooms, (room, playerId) => {
        const sender = room.players.get(playerId);
        if (!sender) return;

        let payloadMessage: string;
        let payloadDuration: number | undefined;

        if (kind === 'voice') {
          // message is a base64 data URL (audio/webm or audio/ogg) - never
          // trim it like text (would corrupt the encoding). Cap size/length
          // instead so nobody can send an oversized payload.
          const raw = message ?? '';
          if (!raw.startsWith('data:audio/')) return; // reject anything that isn't actually audio
          if (raw.length > MAX_VOICE_DATA_URL_LENGTH) {
            socket.emit('room:error', { message: 'Voice note is too long - please keep it under 10 seconds.' });
            return;
          }
          payloadMessage = raw;
          payloadDuration = Math.min(Math.max(durationSec ?? 0, 0), MAX_VOICE_DURATION_SEC);
        } else {
          const trimmed = (message ?? '').trim().slice(0, 240);
          if (!trimmed) return;
          payloadMessage = trimmed;
        }

        io.to(room.roomCode).emit('room:chatMessage', {
          playerId,
          name: sender.name,
          avatar: sender.avatar,
          message: payloadMessage,
          kind: kind === 'emoji' ? 'emoji' : kind === 'voice' ? 'voice' : 'text',
          durationSec: payloadDuration,
          timestamp: Date.now(),
        });
      });
    });

    socket.on('game:leaveTable', () => {
      withGame(socket, rooms, (game, playerId) => {
        const room = rooms.getRoomOrThrow(roomCodeOf(socket));
        rooms.convertToBot(room.roomCode, playerId);
        broadcastRoom(io, rooms, room.roomCode);
        scheduleBotActions(io, rooms, room.roomCode);
      });
    });

    // ------------------------------------------------------------------
    // GAMEPLAY - every handler re-validates server-side; client input is
    // never trusted (Section 30).
    // ------------------------------------------------------------------

    socket.on('game:confirmArrangement', ({ cardIdSets }) => {
      withGame(socket, rooms, (game, playerId) => {
        const hand = game.getPlayerHand(playerId);
        const byId = new Map(hand.map((c) => [c.id, c]));
        const resolveSet = (ids: string[]): Card[] =>
          ids.map((id) => {
            const card = byId.get(id);
            if (!card) throw new Error(`Card ${id} is not part of your dealt hand.`);
            return card;
          });

        const sets: [Card[], Card[], Card[], Card[]] = [
          resolveSet(cardIdSets[0]),
          resolveSet(cardIdSets[1]),
          resolveSet(cardIdSets[2]),
          resolveSet(cardIdSets[3]),
        ];

        const result = game.confirmArrangement(playerId, sets);
        if (!result.ok) {
          socket.emit('game:error', { message: result.errors!.join(' ') });
          return;
        }
        sendPrivateArrangement(io, game, playerId);
        sendPublicGameState(io, roomCodeOf(socket), game);
        scheduleBotActions(io, rooms, roomCodeOf(socket));
      });
    });

    socket.on('game:requestSuggestion', (ack) => {
      try {
        const { roomCode, playerId } = socket.data;
        if (!roomCode || !playerId) throw new Error('Not currently in a room.');
        const room = rooms.getRoomOrThrow(roomCode);
        if (!room.game) throw new Error('Game has not started yet.');
        const hand = room.game.getPlayerHand(playerId);
        const cumulativeScore = room.game.cumulativeScores[playerId] ?? 0;
        const suggestion = suggestArrangement(hand, cumulativeScore);
        ack({ ok: true, cardIdSets: suggestion.map((s) => s.map((c) => c.id)) as [string[], string[], string[], string[]] });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('game:requestSuggestionOptions', (ack) => {
      try {
        const { roomCode, playerId } = socket.data;
        if (!roomCode || !playerId) throw new Error('Not currently in a room.');
        const room = rooms.getRoomOrThrow(roomCode);
        if (!room.game) throw new Error('Game has not started yet.');
        const hand = room.game.getPlayerHand(playerId);
        const cumulativeScore = room.game.cumulativeScores[playerId] ?? 0;
        const options = suggestArrangementOptions(hand, cumulativeScore);
        ack({
          ok: true,
          options: options.map((opt) => ({
            label: opt.label,
            description: opt.description,
            cardIdSets: opt.sets.map((s) => s.map((c) => c.id)) as [string[], string[], string[], string[]],
          })),
        });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('game:playSet', () => {
      withGame(socket, rooms, (game, playerId) => {
        game.playSet(playerId);
        sendPublicGameState(io, roomCodeOf(socket), game);
        maybeAnnounceRoundOrGameEnd(io, roomCodeOf(socket), game);
        scheduleBotActions(io, rooms, roomCodeOf(socket));
      });
    });

    socket.on('game:requestDismissal', ({ reason }: { reason: DismissalReason }) => {
      withGame(socket, rooms, (game, playerId) => {
        const outcome = game.requestDismissal(playerId, reason);
        if (!outcome.ok) {
          socket.emit('game:error', { message: outcome.error! });
          return;
        }
        sendPublicGameState(io, roomCodeOf(socket), game);
        const lastRound = game.roundHistory[game.roundHistory.length - 1];
        io.to(roomCodeOf(socket)).emit('game:roundComplete', { result: lastRound });
      });
    });

    socket.on('game:startNextRound', () => {
      withGame(socket, rooms, (game, playerId) => {
        const room = rooms.getRoomOrThrow(roomCodeOf(socket));
        if (room.hostId !== playerId) {
          socket.emit('game:error', { message: 'Only the host can start the next round.' });
          return;
        }
        if (game.state !== 'ROUND_COMPLETE' && game.state !== 'DISMISSED_ROUND') {
          socket.emit('game:error', { message: `Cannot start next round from state ${game.state}` });
          return;
        }
        dealAndBroadcast(io, game);
        scheduleBotActions(io, rooms, room.roomCode);
      });
    });

    // ------------------------------------------------------------------
    // DISCONNECT (Section 42) - preserve state, mark disconnected, allow
    // reconnection within the window; never reveal hidden cards.
    // ------------------------------------------------------------------
    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      rooms.markDisconnected(roomCode, playerId);
      broadcastRoom(io, rooms, roomCode);
    });
  });
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeName(name: string): string {
  const trimmed = (name ?? '').trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : 'Player';
}

function errMessage(err: unknown): string {
  if (err instanceof RoomManagerError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

function joinSocketToRoom(socket: Sock, roomCode: string, playerId: PlayerId): void {
  socket.data.roomCode = roomCode;
  socket.data.playerId = playerId;
  socket.join(roomCode);
  socket.join(privateChannel(roomCode, playerId));
}

function roomCodeOf(socket: Sock): string {
  if (!socket.data.roomCode) throw new Error('Not currently in a room.');
  return socket.data.roomCode;
}

function broadcastRoom(io: IO, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room:update', rooms.toPublic(room));
}

/** Runs `fn` only if the calling socket is validly attached to a room; emits a friendly error otherwise (Section 58). */
function withRoom(
  socket: Sock,
  rooms: RoomManager,
  fn: (room: ReturnType<RoomManager['getRoomOrThrow']>, playerId: PlayerId) => void
): void {
  try {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) throw new Error('Not currently in a room.');
    const room = rooms.getRoomOrThrow(roomCode);
    fn(room, playerId);
  } catch (err) {
    socket.emit('room:error', { message: errMessage(err) });
  }
}

/** Runs `fn` only if there's an active game for this socket's room; emits a game-scoped error otherwise. */
function withGame(socket: Sock, rooms: RoomManager, fn: (game: HaazariGame, playerId: PlayerId) => void): void {
  try {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) throw new Error('Not currently in a room.');
    const room = rooms.getRoomOrThrow(roomCode);
    if (!room.game) throw new Error('Game has not started yet.');
    fn(room.game, playerId);
  } catch (err) {
    socket.emit('game:error', { message: errMessage(err) });
  }
}

/**
 * Hidden-card guarantee (Section 31): a player's hand is emitted ONLY to
 * their own private channel, which is scoped by (roomCode, playerId) - not
 * by socket id - so it survives a reconnect onto a brand-new socket.
 */
function sendPrivateHand(io: IO, game: HaazariGame, playerId: PlayerId): void {
  io.to(privateChannel(game.roomCode, playerId)).emit('game:yourHand', { hand: game.getPlayerHand(playerId) });
}

/** Resends a player's own confirmed arrangement - used after reconnect so a
 *  refreshed/rejoined client can recover which cards are in its own Set 1-4
 *  without ever exposing any other player's hidden cards. No-op if the
 *  player hasn't confirmed an arrangement yet this round. */
function sendPrivateArrangement(io: IO, game: HaazariGame, playerId: PlayerId): void {
  const sets = game.getPlayerArrangement(playerId);
  if (sets) {
    io.to(privateChannel(game.roomCode, playerId)).emit('game:yourArrangement', { sets });
  }
}

function privateChannel(roomCode: string, playerId: PlayerId): string {
  return `${roomCode}:player:${playerId}`;
}

function sendPublicGameState(io: IO, roomCode: string, game: HaazariGame): void {
  const s = game.getPublicState();
  const payload: HaazariPublicStatePayload = {
    roomCode: s.roomCode,
    state: s.state,
    dealerId: s.dealerId,
    roundNumber: s.roundNumber,
    cumulativeScores: s.cumulativeScores,
    currentSetIndex: s.currentSetIndex,
    currentLeader: s.currentLeader,
    currentPlayOrder: s.currentPlayOrder,
    playersPlayedThisSubRound: s.playersPlayedThisSubRound,
    playedSetsThisSubRound: s.playedSetsThisSubRound,
    subRoundResultsThisRound: s.subRoundResultsThisRound,
    winnerId: s.winnerId,
  };
  io.to(roomCode).emit('game:state', payload);
}

function dealAndBroadcast(io: IO, game: HaazariGame): void {
  game.dealNewRound();
  sendPublicGameState(io, game.roomCode, game);
  for (const playerId of game.playersClockwise) {
    sendPrivateHand(io, game, playerId);
  }
}

function maybeAnnounceRoundOrGameEnd(io: IO, roomCode: string, game: HaazariGame): void {
  if (game.state === 'ROUND_COMPLETE') {
    const lastRound = game.roundHistory[game.roundHistory.length - 1];
    io.to(roomCode).emit('game:roundComplete', { result: lastRound });
  }
  if (game.state === 'GAME_COMPLETE') {
    const winnerId = game.getWinner()!;
    io.to(roomCode).emit('game:over', { winnerId, finalScores: game.cumulativeScores });
  }
}

/**
 * Schedules the next pending bot action (if any) after a short delay, then
 * broadcasts the result and chains to check for further pending actions -
 * so a room with several bots plays out one visible action at a time
 * rather than an entire round resolving instantly. Safe to call after any
 * human action; it's a no-op if the room has no bots or nothing is
 * currently actionable by a bot. Re-fetches the room by code on each tick
 * (rather than closing over a stale reference) so it degrades gracefully
 * if the room is torn down while a delay is pending.
 */
function scheduleBotActions(io: IO, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || !room.game || !hasPendingBotAction(room)) return;

  setTimeout(() => {
    const currentRoom = rooms.getRoom(roomCode);
    if (!currentRoom || !currentRoom.game) return;

    const acted = performOneBotAction(currentRoom);
    if (acted) {
      sendPublicGameState(io, roomCode, currentRoom.game);
      maybeAnnounceRoundOrGameEnd(io, roomCode, currentRoom.game);
    }
    // Chain: check again for more pending bot actions (e.g. the next seat
    // is also a bot, or this same bot has another arrangement/turn to take).
    scheduleBotActions(io, rooms, roomCode);
  }, BOT_ACTION_DELAY_MS);
}
