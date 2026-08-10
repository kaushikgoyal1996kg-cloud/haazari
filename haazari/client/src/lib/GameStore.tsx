import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getSocket, type RoomAck, type TablesAck } from './socket';
import type {
  Card,
  DismissalReason,
  FourSets,
  HaazariPublicStatePayload,
  PublicRoomInfo,
  RoundResult,
  TableSummary,
} from '../game/types';
import { DEFAULT_AVATAR } from '../game/avatars';

const SESSION_KEY = 'haazari_session_v1';

interface StoredSession {
  token: string;
  roomCode: string;
  playerName: string;
}

interface GameContextValue {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  room: PublicRoomInfo | null;
  myPlayerId: string | null;
  myName: string;
  myHand: Card[];
  myArrangedSets: FourSets | null;
  gameState: HaazariPublicStatePayload | null;
  lastRoundResult: RoundResult | null;
  winnerInfo: { winnerId: string; finalScores: Record<string, number> } | null;
  roomError: string | null;
  gameError: string | null;

  createRoom: (playerName: string, avatar?: string) => Promise<RoomAck>;
  joinRoom: (roomCode: string, playerName: string, avatar?: string) => Promise<RoomAck>;
  listTables: () => Promise<TableSummary[]>;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  confirmArrangement: (sets: FourSets) => void;
  playSet: () => void;
  requestDismissal: (reason: DismissalReason) => void;
  startNextRound: () => void;
  clearGameError: () => void;
  leaveSession: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef(getSocket());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [room, setRoom] = useState<PublicRoomInfo | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>('');
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [myArrangedSets, setMyArrangedSets] = useState<FourSets | null>(null);
  const [gameState, setGameState] = useState<HaazariPublicStatePayload | null>(null);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [winnerInfo, setWinnerInfo] = useState<{ winnerId: string; finalScores: Record<string, number> } | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => {
      setConnectionStatus('connected');
      const stored = readSession();
      if (stored) {
        socket.emit('room:reconnect', { token: stored.token }, (res: RoomAck) => {
          if (res.ok && res.room) {
            setRoom(res.room);
            setMyPlayerId(res.playerId ?? null);
            setMyName(stored.playerName);
          } else {
            clearSession();
          }
        });
      }
    };
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onRoomUpdate = (r: PublicRoomInfo) => setRoom(r);
    const onRoomError = ({ message }: { message: string }) => setRoomError(message);
    const onYourHand = ({ hand }: { hand: Card[] }) => {
      setMyHand(hand);
      setMyArrangedSets(null); // a fresh hand means a fresh round - any prior arrangement is stale
    };
    const onYourArrangement = ({ sets }: { sets: FourSets }) => setMyArrangedSets(sets);
    const onGameState = (s: HaazariPublicStatePayload) => setGameState(s);
    const onGameError = ({ message }: { message: string }) => setGameError(message);
    const onRoundComplete = ({ result }: { result: RoundResult }) => setLastRoundResult(result);
    const onGameOver = (payload: { winnerId: string; finalScores: Record<string, number> }) => setWinnerInfo(payload);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:update', onRoomUpdate);
    socket.on('room:error', onRoomError);
    socket.on('game:yourHand', onYourHand);
    socket.on('game:yourArrangement', onYourArrangement);
    socket.on('game:state', onGameState);
    socket.on('game:error', onGameError);
    socket.on('game:roundComplete', onRoundComplete);
    socket.on('game:over', onGameOver);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:update', onRoomUpdate);
      socket.off('room:error', onRoomError);
      socket.off('game:yourHand', onYourHand);
      socket.off('game:yourArrangement', onYourArrangement);
      socket.off('game:state', onGameState);
      socket.off('game:error', onGameError);
      socket.off('game:roundComplete', onRoundComplete);
      socket.off('game:over', onGameOver);
    };
  }, []);

  const createRoom = useCallback((playerName: string, avatar: string = DEFAULT_AVATAR) => {
    return new Promise<RoomAck>((resolve) => {
      socketRef.current.emit('room:create', { playerName, avatar }, (res) => {
        if (res.ok && res.roomCode && res.playerId && res.token && res.room) {
          storeSession({ token: res.token, roomCode: res.roomCode, playerName });
          setRoom(res.room);
          setMyPlayerId(res.playerId);
          setMyName(playerName);
        } else {
          setRoomError(res.error ?? 'Could not create room.');
        }
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string, avatar: string = DEFAULT_AVATAR) => {
    return new Promise<RoomAck>((resolve) => {
      socketRef.current.emit('room:join', { roomCode, playerName, avatar }, (res) => {
        if (res.ok && res.roomCode && res.playerId && res.token && res.room) {
          storeSession({ token: res.token, roomCode: res.roomCode, playerName });
          setRoom(res.room);
          setMyPlayerId(res.playerId);
          setMyName(playerName);
        } else {
          setRoomError(res.error ?? 'Could not join room.');
        }
        resolve(res);
      });
    });
  }, []);

  const listTables = useCallback(() => {
    return new Promise<TableSummary[]>((resolve) => {
      socketRef.current.emit('room:listTables', (res: TablesAck) => {
        resolve(res.ok && res.tables ? res.tables : []);
      });
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socketRef.current.emit('room:ready', { ready });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current.emit('room:start');
  }, []);

  const confirmArrangement = useCallback((sets: FourSets) => {
    const cardIdSets: [string[], string[], string[], string[]] = [
      sets[0].map((c) => c.id),
      sets[1].map((c) => c.id),
      sets[2].map((c) => c.id),
      sets[3].map((c) => c.id),
    ];
    socketRef.current.emit('game:confirmArrangement', { cardIdSets });
    setMyArrangedSets(sets); // optimistic; server echoes 'game:yourArrangement' to confirm/correct
  }, []);

  const playSet = useCallback(() => {
    socketRef.current.emit('game:playSet');
  }, []);

  const requestDismissal = useCallback((reason: DismissalReason) => {
    socketRef.current.emit('game:requestDismissal', { reason });
  }, []);

  const startNextRound = useCallback(() => {
    setLastRoundResult(null);
    socketRef.current.emit('game:startNextRound');
  }, []);

  const clearGameError = useCallback(() => setGameError(null), []);

  const leaveSession = useCallback(() => {
    clearSession();
    setRoom(null);
    setMyPlayerId(null);
    setMyHand([]);
    setMyArrangedSets(null);
    setGameState(null);
    setLastRoundResult(null);
    setWinnerInfo(null);
  }, []);

  const value: GameContextValue = {
    connectionStatus,
    room,
    myPlayerId,
    myName,
    myHand,
    myArrangedSets,
    gameState,
    lastRoundResult,
    winnerInfo,
    roomError,
    gameError,
    createRoom,
    joinRoom,
    listTables,
    setReady,
    startGame,
    confirmArrangement,
    playSet,
    requestDismissal,
    startNextRound,
    clearGameError,
    leaveSession,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function storeSession(s: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore storage failures (private browsing etc.) */
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
