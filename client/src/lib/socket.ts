import { io, Socket } from 'socket.io-client';
import type { Card, ChatMessage, DismissalReason, HaazariPublicStatePayload, PlayerId, PublicRoomInfo, RoundResult, TableSummary } from '../game/types';

export interface RoomAck {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: PlayerId;
  token?: string;
  room?: PublicRoomInfo;
}

interface ClientToServerEvents {
  'room:create': (payload: { playerName: string; avatar?: string }, ack: (res: RoomAck) => void) => void;
  'room:join': (payload: { roomCode: string; playerName: string; avatar?: string }, ack: (res: RoomAck) => void) => void;
  'room:quickMatch': (payload: { playerName: string; avatar?: string }, ack: (res: RoomAck) => void) => void;
  'room:reconnect': (payload: { token: string }, ack: (res: RoomAck) => void) => void;
  'room:ready': (payload: { ready: boolean }) => void;
  'room:start': () => void;
  'room:listTables': (ack: (res: TablesAck) => void) => void;
  'room:addBot': () => void;
  'room:playAgain': () => void;
  'room:chat': (payload: { message: string; kind: 'text' | 'emoji' | 'voice'; durationSec?: number }) => void;
  'game:confirmArrangement': (payload: { cardIdSets: [string[], string[], string[], string[]] }) => void;
  'game:requestSuggestion': (ack: (res: SuggestionAck) => void) => void;
  'game:playSet': () => void;
  'game:requestDismissal': (payload: {
    reason: DismissalReason;
    proposedCardIdSets?: [string[], string[], string[], string[]];
  }) => void;
  'game:startNextRound': () => void;
  'game:leaveTable': () => void;

  'voice:join': () => void;
  'voice:leave': () => void;
  'voice:signal': (payload: { toPlayerId: PlayerId; data: unknown }) => void;
  'voice:mute': (payload: { muted: boolean }) => void;
}

export interface SuggestionAck {
  ok: boolean;
  error?: string;
  cardIdSets?: [string[], string[], string[], string[]];
}

export interface TablesAck {
  ok: boolean;
  error?: string;
  tables?: TableSummary[];
}

interface ServerToClientEvents {
  'room:update': (room: PublicRoomInfo) => void;
  'room:error': (payload: { message: string }) => void;
  'room:chatMessage': (payload: ChatMessage) => void;
  'game:yourHand': (payload: { hand: Card[] }) => void;
  'game:yourArrangement': (payload: { sets: [Card[], Card[], Card[], Card[]] }) => void;
  'game:state': (publicState: HaazariPublicStatePayload) => void;
  'game:error': (payload: { message: string }) => void;
  'game:roundComplete': (payload: { result: RoundResult }) => void;
  'game:over': (payload: { winnerId: PlayerId; finalScores: Record<PlayerId, number> }) => void;

  'voice:participants': (payload: { playerIds: PlayerId[] }) => void;
  'voice:peerJoined': (payload: { playerId: PlayerId }) => void;
  'voice:peerLeft': (payload: { playerId: PlayerId }) => void;
  'voice:signal': (payload: { fromPlayerId: PlayerId; data: unknown }) => void;
  'voice:muteChanged': (payload: { playerId: PlayerId; muted: boolean }) => void;
}

export type HaazariSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

let socketInstance: HaazariSocket | null = null;

export function getSocket(): HaazariSocket {
  if (!socketInstance) {
    socketInstance = io(SERVER_URL, { autoConnect: true }) as unknown as HaazariSocket;
  }
  return socketInstance;
}
