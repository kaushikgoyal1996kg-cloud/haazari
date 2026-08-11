export type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export type PlayerId = string;
export type DismissalReason = 'NO_SEQUENCE' | 'SIX_PAIRS';

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
  status: 'LOBBY' | 'IN_GAME';
  players: PublicPlayerInfo[];
  gameState?: string;
}

export interface TableSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
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
  subRoundResultsThisRound: SubRoundResult[];
  winnerId: PlayerId | null;
}

export interface PlayedSet {
  playerId: PlayerId;
  cards: Card[];
  throwOrder: number;
}

export interface SubRoundResult {
  setIndex: number;
  playedSets: PlayedSet[];
  winnerId: PlayerId;
  pointsAwarded: number;
  wasTie: boolean;
  tiedPlayerIds: PlayerId[];
}

export interface RoundResult {
  roundNumber: number;
  dealerId: PlayerId;
  subRounds: SubRoundResult[];
  pointsThisRound: Record<PlayerId, number>;
  cumulativeScores: Record<PlayerId, number>;
  dismissed: boolean;
  dismissalReason?: DismissalReason;
}

export type FourSets = [Card[], Card[], Card[], Card[]];
