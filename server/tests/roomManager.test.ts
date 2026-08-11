import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/rooms/roomManager.js';
import { AVATAR_OPTIONS, DEFAULT_AVATAR } from '../src/rooms/avatars.js';

describe('RoomManager avatars', () => {
  it('uses the requested avatar when it is a valid preset', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice', AVATAR_OPTIONS[3]);
    expect(room.players.get(playerId)!.avatar).toBe(AVATAR_OPTIONS[3]);
  });

  it('falls back to the default avatar when none is given', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    expect(room.players.get(playerId)!.avatar).toBe(DEFAULT_AVATAR);
  });

  it('falls back to the default avatar when an invalid value is given (never trust client input)', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice', '<script>evil()</script>');
    expect(room.players.get(playerId)!.avatar).toBe(DEFAULT_AVATAR);
  });

  it('applies the same validation on join as on create', () => {
    const rooms = new RoomManager();
    const created = rooms.createRoom('Alice', AVATAR_OPTIONS[0]);
    const joined = rooms.joinRoom(created.room.roomCode, 'Bob', 'not-a-real-avatar');
    expect(joined.room.players.get(joined.playerId)!.avatar).toBe(DEFAULT_AVATAR);
  });

  it('includes avatar in the public room broadcast shape', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice', AVATAR_OPTIONS[1]);
    const pub = rooms.toPublic(room);
    expect(pub.players.find((p) => p.playerId === playerId)!.avatar).toBe(AVATAR_OPTIONS[1]);
  });
});

describe('RoomManager.listOpenTables', () => {
  it('lists a freshly created room with an open seat', () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom('Alice');
    const tables = rooms.listOpenTables();
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ roomCode: room.roomCode, hostName: 'Alice', playerCount: 1, maxPlayers: 4 });
  });

  it('excludes a table once it is full', () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom('Alice');
    rooms.joinRoom(room.roomCode, 'Bob');
    rooms.joinRoom(room.roomCode, 'Carol');
    rooms.joinRoom(room.roomCode, 'Dave');
    expect(rooms.listOpenTables()).toHaveLength(0);
  });

  it('excludes a table once the game has started', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    rooms.joinRoom(room.roomCode, 'Bob');
    rooms.joinRoom(room.roomCode, 'Carol');
    rooms.joinRoom(room.roomCode, 'Dave');
    for (const p of room.players.values()) rooms.setReady(room.roomCode, p.playerId, true);
    rooms.startGame(room.roomCode, playerId);
    expect(rooms.listOpenTables()).toHaveLength(0);
  });

  it('lists multiple open tables, most recent first', async () => {
    const rooms = new RoomManager();
    const first = rooms.createRoom('Alice');
    await new Promise((r) => setTimeout(r, 5));
    const second = rooms.createRoom('Bob');
    const tables = rooms.listOpenTables();
    expect(tables.map((t) => t.roomCode)).toEqual([second.room.roomCode, first.room.roomCode]);
  });
});

describe('RoomManager.resetToLobby (Play Again)', () => {
  it('resets a finished game back to LOBBY with the same players, bots stay ready', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    for (const p of room.players.values()) rooms.setReady(room.roomCode, p.playerId, true);
    rooms.startGame(room.roomCode, playerId);
    // Fake a finished game state for this unit test (full game completion is covered elsewhere).
    (room.game as any) = { state: 'GAME_COMPLETE' };

    rooms.resetToLobby(room.roomCode, playerId);
    expect(room.status).toBe('LOBBY');
    expect(room.game).toBeUndefined();
    expect(room.players.size).toBe(4);
    const host = room.players.get(playerId)!;
    expect(host.ready).toBe(false); // human reset to not-ready
    const bots = [...room.players.values()].filter((p) => p.isBot);
    expect(bots.every((b) => b.ready)).toBe(true); // bots stay auto-ready
  });

  it('refuses to reset if the game has not finished', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    for (const p of room.players.values()) rooms.setReady(room.roomCode, p.playerId, true);
    rooms.startGame(room.roomCode, playerId);
    (room.game as any) = { state: 'PLAYING_SET_2' };
    expect(() => rooms.resetToLobby(room.roomCode, playerId)).toThrow(/finished/);
  });

  it('only the host can trigger Play Again', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Alice');
    const bob = rooms.joinRoom(room.roomCode, 'Bob');
    rooms.addBot(room.roomCode, playerId);
    rooms.addBot(room.roomCode, playerId);
    for (const p of room.players.values()) rooms.setReady(room.roomCode, p.playerId, true);
    rooms.startGame(room.roomCode, playerId);
    (room.game as any) = { state: 'GAME_COMPLETE' };
    expect(() => rooms.resetToLobby(room.roomCode, bob.playerId)).toThrow(/host/);
  });
});

describe('RoomManager.quickMatch', () => {
  it('creates a fresh room when no open tables exist', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.quickMatch('Alice');
    expect(room.players.size).toBe(1);
    expect(room.hostId).toBe(playerId);
  });

  it('joins the most-full existing open table rather than creating a new one', () => {
    const rooms = new RoomManager();
    const empty = rooms.createRoom('Solo'); // 1 player
    const fuller = rooms.createRoom('Host2');
    rooms.joinRoom(fuller.room.roomCode, 'Bob'); // 2 players - closer to full

    const result = rooms.quickMatch('Carol');
    expect(result.room.roomCode).toBe(fuller.room.roomCode);
    expect(rooms.getRoom(empty.room.roomCode)!.players.size).toBe(1); // untouched
  });

  it('creates a new room once all existing tables are full', () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom('Host');
    rooms.joinRoom(room.roomCode, 'P2');
    rooms.joinRoom(room.roomCode, 'P3');
    rooms.joinRoom(room.roomCode, 'P4'); // now full

    const result = rooms.quickMatch('Dave');
    expect(result.room.roomCode).not.toBe(room.roomCode);
    expect(result.room.players.size).toBe(1);
  });

  it('never joins a room whose game has already started', () => {
    const rooms = new RoomManager();
    const { room, playerId } = rooms.createRoom('Host');
    rooms.joinRoom(room.roomCode, 'P2');
    rooms.joinRoom(room.roomCode, 'P3');
    rooms.joinRoom(room.roomCode, 'P4');
    for (const p of room.players.values()) rooms.setReady(room.roomCode, p.playerId, true);
    rooms.startGame(room.roomCode, playerId);

    const result = rooms.quickMatch('Eve');
    expect(result.room.roomCode).not.toBe(room.roomCode);
  });
});
