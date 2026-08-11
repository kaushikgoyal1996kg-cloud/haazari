import type { GameState, PlayerId } from '../game/types.js';
import type { HaazariGame } from '../game/gameEngine.js';

export interface PlayerSlot {
  playerId: PlayerId;
  /** Secret token the client stores (e.g. in localStorage) and presents to
   *  reconnect - never sent to other players. Bots have no real token. */
  token: string;
  name: string;
  avatar: string;
  connected: boolean;
  ready: boolean;
  socketId?: string;
  disconnectedAt?: number;
  /** True if this seat is (or has become, via "Leave Table") computer-controlled. */
  isBot: boolean;
}

export interface RoomState {
  roomCode: string;
  hostId: PlayerId;
  players: Map<PlayerId, PlayerSlot>;
  status: 'LOBBY' | 'IN_GAME';
  game?: HaazariGame;
  createdAt: number;
}

/** Safe-to-broadcast player info - never includes the token. */
export interface PublicPlayerInfo {
  playerId: PlayerId;
  name: string;
  avatar: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface PublicRoomInfo {
  roomCode: string;
  status: RoomState['status'];
  players: PublicPlayerInfo[];
  gameState?: GameState;
}

/** Summary shown in the public "Browse Tables" lobby list. */
export interface TableSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}
