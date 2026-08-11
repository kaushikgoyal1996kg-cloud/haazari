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
  'game:requestDismissal': (payload: {
    reason: DismissalReason;
    /** For a NO_SEQUENCE claim made before the player has formally
     *  confirmed their arrangement (e.g. clicking "Dismiss Hand" directly
     *  from the arrangement screen) - lets the server evaluate eligibility
     *  against this draft without a separate prior confirm step, avoiding
     *  a race where confirming could move the game straight into play
     *  before the dismiss request arrives. */
    proposedCardIdSets?: [string[], string[], string[], string[]];
  }) => void;
  'game:startNextRound': () => void;
  'game:leaveTable': () => void;

  // -------------------------------------------------------------------
  // VOICE CALL (WebRTC signaling relay only - the server never touches
  // actual audio; it just introduces peers to each other and forwards
  // opaque SDP/ICE payloads between them).
  // -------------------------------------------------------------------
  /** Announces intent to join the room's live voice call. */
  'voice:join': () => void;
  /** Leaves the voice call (distinct from leaving the table/game). */
  'voice:leave': () => void;
  /** Relays an opaque WebRTC signaling payload (SDP offer/answer or ICE
   *  candidate) to one specific peer, identified by their playerId. */
  'voice:signal': (payload: { toPlayerId: PlayerId; data: unknown }) => void;
  /** Announces this player's own mute state, for others' UI indicators. */
  'voice:mute': (payload: { muted: boolean }) => void;
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

  // -------------------------------------------------------------------
  // VOICE CALL
  // -------------------------------------------------------------------
  /** Sent ONLY to a newly-joining client: who's already in the call, so
   *  the UI can show it immediately (actual connections are initiated by
   *  the existing members via 'voice:peerJoined' below, not by the new
   *  joiner, to avoid duplicate/glare offers between the same pair). */
  'voice:participants': (payload: { playerIds: PlayerId[] }) => void;
  /** Broadcast to existing call members when someone new joins - each
   *  existing member should create a peer connection and send an SDP
   *  offer to the new peer via 'voice:signal'. */
  'voice:peerJoined': (payload: { playerId: PlayerId }) => void;
  /** Broadcast when someone leaves the call (voluntarily or via
   *  disconnect) - other members should tear down that peer connection. */
  'voice:peerLeft': (payload: { playerId: PlayerId }) => void;
  /** An opaque SDP/ICE payload relayed from another peer. */
  'voice:signal': (payload: { fromPlayerId: PlayerId; data: unknown }) => void;
  /** Another player's mute state changed. */
  'voice:muteChanged': (payload: { playerId: PlayerId; muted: boolean }) => void;
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
  /** Who has confirmed their hand arrangement so far this round - never
   *  includes the actual cards, only the fact of confirmation. */
  playersConfirmedArrangement: PlayerId[];
  /** Actual cards played so far in the current sub-round - once thrown,
   *  a set is committed and visible to everyone immediately. */
  playedSetsThisSubRound: { playerId: PlayerId; cards: Card[] }[];
  subRoundResultsThisRound: SubRoundResult[];
  winnerId: PlayerId | null;
}
