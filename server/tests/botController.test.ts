import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../src/rooms/roomManager.js';
import { runBotActions } from '../src/rooms/botController.js';
import { HaazariGame } from '../src/game/gameEngine.js';
import { GAME_RULES } from '../src/game/rules.js';
import type { RoomState, PlayerSlot } from '../src/rooms/types.js';
import type { PlayerId } from '../src/game/types.js';

describe('RoomManager bot methods', () => {
  it('addBot fills an empty seat, auto-ready, marked isBot', () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom('Alice');
    const bot = rooms.addBot(room.roomCode, [...room.players.keys()][0]);
    expect(bot.isBot).toBe(true);
    expect(bot.ready).toBe(true);
    expect(room.players.size).toBe(2);
  });

  it('only the host can add a bot', () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom('Alice');
    const bob = rooms.joinRoom(room.roomCode, 'Bob');
    expect(() => rooms.addBot(room.roomCode, bob.playerId)).toThrow(/host/);
  });

  it('refuses to add a bot once the room is full', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    expect(room.players.size).toBe(4);
    expect(() => rooms.addBot(room.roomCode, playerId)).toThrow(/full/);
  });

  it('convertToBot marks a seat bot-controlled and invalidates its reconnect token', () => {
    const rooms = new RoomManager();
    const { room, playerId, token } = rooms.createRoom('Alice');
    rooms.convertToBot(room.roomCode, playerId);
    expect(room.players.get(playerId)!.isBot).toBe(true);
    expect(() => rooms.reconnect(token, 'new-socket')).toThrow();
  });

  it('sweepStaleRooms ignores bots when deciding if a room is abandoned', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    rooms.addBot(room.roomCode, playerId);
    rooms.markDisconnected(room.roomCode, playerId);
    room.players.get(playerId)!.disconnectedAt = Date.now() - GAME_RULES.RECONNECT_WINDOW_MS - 1000;
    rooms.sweepStaleRooms();
    expect(rooms.getRoom(room.roomCode)).toBeUndefined();
  });
});

describe('runBotActions - full bots-only game simulation', () => {
  beforeEach(() => {
    GAME_RULES.TEST_MODE = false;
  });
  afterEach(() => {
    GAME_RULES.TEST_MODE = false;
  });

  function makeAllBotRoom(): RoomState {
    const playerIds: PlayerId[] = ['bot1', 'bot2', 'bot3', 'bot4'];
    const players = new Map<PlayerId, PlayerSlot>(
      playerIds.map((id) => [
        id,
        {
          playerId: id,
          token: `tok-${id}`,
          name: id,
          avatar: '🦁',
          connected: true,
          ready: true,
          isBot: true,
        },
      ])
    );
    const game = new HaazariGame('TESTROOM', playerIds, 'bot1');
    game.dealNewRound();
    return {
      roomCode: 'TESTROOM',
      hostId: 'bot1',
      players,
      status: 'IN_GAME',
      game,
      createdAt: Date.now(),
      voiceCallParticipants: new Set(),
    };
  }

  it('plays entire rounds - arranging and every sub-round - without any human input', () => {
    const room = makeAllBotRoom();
    const acted = runBotActions(room);
    expect(acted).toBe(true);
    expect(['ROUND_COMPLETE', 'GAME_COMPLETE']).toContain(room.game!.state);
    expect(room.game!.roundHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('plays a complete multi-round game to a valid 1000+ winner, fully bot-driven', () => {
    const room = makeAllBotRoom();
    let rounds = 0;
    const MAX_ROUNDS = 20;

    while (room.game!.state !== 'GAME_COMPLETE' && rounds < MAX_ROUNDS) {
      runBotActions(room);
      rounds++;
      if (room.game!.state === 'ROUND_COMPLETE' || room.game!.state === 'DISMISSED_ROUND') {
        room.game!.dealNewRound();
        runBotActions(room);
      }
    }

    expect(room.game!.state).toBe('GAME_COMPLETE');
    const winner = room.game!.getWinner();
    expect(winner).not.toBeNull();
    expect(room.game!.cumulativeScores[winner!]).toBeGreaterThanOrEqual(GAME_RULES.WINNING_SCORE);

    for (const pid of Object.keys(room.game!.cumulativeScores)) {
      if (pid !== winner) {
        expect(room.game!.cumulativeScores[winner!]).toBeGreaterThan(room.game!.cumulativeScores[pid]);
      }
    }
  });

  it('is a no-op when there are no bots in the room', () => {
    const playerIds: PlayerId[] = ['h1', 'h2', 'h3', 'h4'];
    const players = new Map<PlayerId, PlayerSlot>(
      playerIds.map((id) => [
        id,
        { playerId: id, token: `tok-${id}`, name: id, avatar: '🦁', connected: true, ready: true, isBot: false },
      ])
    );
    const game = new HaazariGame('R2', playerIds, 'h1');
    game.dealNewRound();
    const room: RoomState = { roomCode: 'R2', hostId: 'h1', players, status: 'IN_GAME', game, createdAt: Date.now(), voiceCallParticipants: new Set() };
    const acted = runBotActions(room);
    expect(acted).toBe(false);
    expect(room.game!.state).toBe('ARRANGING_HANDS');
  });

  it('a mid-game leave-table conversion lets the bot immediately continue for that seat', () => {
    const playerIds: PlayerId[] = ['h1', 'h2', 'h3', 'h4'];
    const players = new Map<PlayerId, PlayerSlot>(
      playerIds.map((id) => [
        id,
        { playerId: id, token: `tok-${id}`, name: id, avatar: '🦁', connected: true, ready: true, isBot: false },
      ])
    );
    const game = new HaazariGame('R3', playerIds, 'h1');
    game.dealNewRound();
    const room: RoomState = { roomCode: 'R3', hostId: 'h1', players, status: 'IN_GAME', game, createdAt: Date.now(), voiceCallParticipants: new Set() };

    players.get('h1')!.isBot = true;
    const acted = runBotActions(room);
    expect(acted).toBe(true);
    expect(game.getPlayerArrangement('h1')).not.toBeNull();
    expect(game.getPlayerArrangement('h2')).toBeNull();
  });
});
