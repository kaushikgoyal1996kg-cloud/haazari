import { customAlphabet } from 'nanoid';
import type { PlayerId } from '../game/types.js';
import { GAME_RULES } from '../game/rules.js';
import type { PlayerSlot, PublicPlayerInfo, PublicRoomInfo, RoomState, TableSummary } from './types.js';
import { DEFAULT_AVATAR, isValidAvatar } from './avatars.js';

// Room codes look like "HZR482" - a fixed "HZR" prefix + 3 random digits/letters
// (Section 28 example). Excludes ambiguous chars (0/O, 1/I).
const codeSuffix = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 3);
const playerIdGen = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12);
const tokenGen = customAlphabet('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', 32);

export class RoomManagerError extends Error {}

/**
 * In-memory room registry. One process = one authoritative source of truth
 * for all currently-active rooms. (A production deployment with multiple
 * server instances would back this with shared storage - out of scope for
 * this reference implementation, called out explicitly rather than silently
 * assumed away.)
 */
export class RoomManager {
  private rooms = new Map<string, RoomState>();
  /** token -> {roomCode, playerId} for fast reconnect lookups. */
  private tokenIndex = new Map<string, { roomCode: string; playerId: PlayerId }>();

  private generateRoomCode(): string {
    let code: string;
    do {
      code = `HZR${codeSuffix()}`;
    } while (this.rooms.has(code));
    return code;
  }

  /** Creates a new room. The creator becomes the host (Section 28). */
  createRoom(hostName: string, avatar?: string): { room: RoomState; playerId: PlayerId; token: string } {
    const roomCode = this.generateRoomCode();
    const playerId = playerIdGen();
    const token = tokenGen();

    const hostSlot: PlayerSlot = {
      playerId,
      token,
      name: hostName,
      avatar: isValidAvatar(avatar) ? avatar : DEFAULT_AVATAR,
      connected: true,
      ready: false,
    };

    const room: RoomState = {
      roomCode,
      hostId: playerId,
      players: new Map([[playerId, hostSlot]]),
      status: 'LOBBY',
      createdAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    this.tokenIndex.set(token, { roomCode, playerId });
    return { room, playerId, token };
  }

  /** Joins an existing room by code. Max 4 players; rejected once the game has started. */
  joinRoom(roomCode: string, playerName: string, avatar?: string): { room: RoomState; playerId: PlayerId; token: string } {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomManagerError('This room does not exist.');
    if (room.status === 'IN_GAME') throw new RoomManagerError('Game has already started.');
    if (room.players.size >= GAME_RULES.PLAYER_COUNT) throw new RoomManagerError('This room is full.');

    const playerId = playerIdGen();
    const token = tokenGen();
    const slot: PlayerSlot = {
      playerId,
      token,
      name: playerName,
      avatar: isValidAvatar(avatar) ? avatar : DEFAULT_AVATAR,
      connected: true,
      ready: false,
    };
    room.players.set(playerId, slot);
    this.tokenIndex.set(token, { roomCode, playerId });
    return { room, playerId, token };
  }

  /** Reconnects a previously-joined player using their persistent token (Section 42). */
  reconnect(token: string, newSocketId: string): { room: RoomState; playerId: PlayerId } {
    const entry = this.tokenIndex.get(token);
    if (!entry) throw new RoomManagerError('Invalid or expired session token.');
    const room = this.rooms.get(entry.roomCode);
    if (!room) throw new RoomManagerError('Room no longer exists.');
    const slot = room.players.get(entry.playerId);
    if (!slot) throw new RoomManagerError('Player no longer in this room.');

    const elapsedSinceDisconnect = slot.disconnectedAt ? Date.now() - slot.disconnectedAt : 0;
    if (!slot.connected && slot.disconnectedAt && elapsedSinceDisconnect > GAME_RULES.RECONNECT_WINDOW_MS) {
      throw new RoomManagerError('Reconnection window has expired.');
    }

    slot.connected = true;
    slot.socketId = newSocketId;
    slot.disconnectedAt = undefined;
    return { room, playerId: entry.playerId };
  }

  markDisconnected(roomCode: string, playerId: PlayerId): void {
    const room = this.rooms.get(roomCode);
    const slot = room?.players.get(playerId);
    if (!slot) return;
    slot.connected = false;
    slot.disconnectedAt = Date.now();
    slot.socketId = undefined;
  }

  setReady(roomCode: string, playerId: PlayerId, ready: boolean): RoomState {
    const room = this.getRoomOrThrow(roomCode);
    const slot = room.players.get(playerId);
    if (!slot) throw new RoomManagerError('Player not in this room.');
    if (room.status === 'IN_GAME') throw new RoomManagerError('Game has already started.');
    slot.ready = ready;
    return room;
  }

  /** Only the host can start, and only once all 4 seats are filled and ready (Section 28). */
  startGame(roomCode: string, requestingPlayerId: PlayerId): RoomState {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== requestingPlayerId) {
      throw new RoomManagerError('Only the host can start the game.');
    }
    if (room.players.size !== GAME_RULES.PLAYER_COUNT) {
      throw new RoomManagerError(`Need exactly ${GAME_RULES.PLAYER_COUNT} players to start.`);
    }
    const allReady = [...room.players.values()].every((p) => p.ready);
    if (!allReady) {
      throw new RoomManagerError('All players must be ready before starting.');
    }
    room.status = 'IN_GAME';
    return room;
  }

  getRoomOrThrow(roomCode: string): RoomState {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomManagerError('This room does not exist.');
    return room;
  }

  getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode);
  }

  toPublic(room: RoomState): PublicRoomInfo {
    const players: PublicPlayerInfo[] = [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      ready: p.ready,
      isHost: p.playerId === room.hostId,
    }));
    return {
      roomCode: room.roomCode,
      status: room.status,
      players,
      gameState: room.game?.state,
    };
  }

  /**
   * Lists currently-joinable tables for the public "Browse Tables" lobby
   * (Section 28-style casino browsing, in addition to the private
   * room-code flow) - only rooms still in LOBBY status with an open seat.
   */
  listOpenTables(): TableSummary[] {
    const tables: TableSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'LOBBY') continue;
      if (room.players.size >= GAME_RULES.PLAYER_COUNT) continue;
      const host = room.players.get(room.hostId);
      tables.push({
        roomCode: room.roomCode,
        hostName: host?.name ?? 'Unknown',
        playerCount: room.players.size,
        maxPlayers: GAME_RULES.PLAYER_COUNT,
      });
    }
    // Most recently created first, so new tables are easy to find.
    tables.sort((a, b) => (this.rooms.get(b.roomCode)?.createdAt ?? 0) - (this.rooms.get(a.roomCode)?.createdAt ?? 0));
    return tables;
  }

  /** Removes rooms that have sat empty (all disconnected) past the reconnect window. Call periodically. */
  sweepStaleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyoneConnected = [...room.players.values()].some((p) => p.connected);
      if (anyoneConnected) continue;
      const allExpired = [...room.players.values()].every(
        (p) => p.disconnectedAt && now - p.disconnectedAt > GAME_RULES.RECONNECT_WINDOW_MS
      );
      if (allExpired) {
        for (const p of room.players.values()) this.tokenIndex.delete(p.token);
        this.rooms.delete(code);
      }
    }
  }
}
