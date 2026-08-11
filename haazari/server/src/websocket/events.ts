import type { Card, DismissalReason, PlayerId, RoundResult, SubRoundResult } from '../game/types.js';
import type { PublicRoomInfo, TableSummary } from '../rooms/types.js';

// ============================================================================
// CLIENT -> SERVER events
// ============================================================================
export interface ClientToServerEvents {
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
  'game:requestSuggestionOptions': (ack: (res: SuggestionOptionsAck) => void) => void;
  'game:playSet': () => void;
  'game:requestDismissal': (payload: { reason: DismissalReason }) => void;
  'game:startNextRound': () => void;
  'game:leaveTable': () => void;
}

export interface RoomAck {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: PlayerId;
  token?: string;
  room?: PublicRoomInfo;
}

export interface SuggestionAck {
  ok: boolean;
  error?: string;
  cardIdSets?: [string[], string[], string[], string[]];
}

export interface SuggestionOptionAck {
  label: string;
  description: string;
  cardIdSets: [string[], string[], string[], string[]];
}

export interface SuggestionOptionsAck {
  ok: boolean;
  error?: string;
  options?: SuggestionOptionAck[];
}

export interface TablesAck {
  ok: boolean;
  error?: string;
  tables?: TableSummary[];
}

// ============================================================================
// SERVER -> CLIENT events
// ============================================================================
export interface ServerToClientEvents {
  'room:update': (room: PublicRoomInfo) => void;
  'room:error': (payload: { message: string }) => void;
  'room:chatMessage': (payload: ChatMessage) => void;

  /** Sent ONLY to the individual player's own socket - never broadcast. */
  'game:yourHand': (payload: { hand: Card[] }) => void;
  'game:yourArrangement': (payload: { sets: [Card[], Card[], Card[], Card[]] }) => void;
  'game:state': (publicState: HaazariPublicStatePayload) => void;
  'game:error': (payload: { message: string }) => void;
  'game:roundComplete': (payload: { result: RoundResult }) => void;
  'game:over': (payload: { winnerId: PlayerId; finalScores: Record<PlayerId, number> }) => void;
}

export interface ChatMessage {
  playerId: PlayerId;
  name: string;
  avatar: string;
  message: string;
  kind: 'text' | 'emoji' | 'voice';
  durationSec?: number;
  timestamp: number;
}

export interface HaazariPublicStatePayload {
  roomCode: string;
  state: string;
  dealerId: PlayerId;
  roundNumber: number;
  cumulativeScores: Record<PlayerId, number>;
  currentSetIndex: number;
  currentLeader: PlayerId | null;
  currentPlayOrder: PlayerId[] | null;
  playersPlayedThisSubRound: PlayerId[];
  /** Actual cards played so far in the current sub-round - once thrown,
   *  a set is committed and visible to everyone immediately. */
  playedSetsThisSubRound: { playerId: PlayerId; cards: Card[] }[];
  subRoundResultsThisRound: SubRoundResult[];
  winnerId: PlayerId | null;
}
