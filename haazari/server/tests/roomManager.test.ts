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
