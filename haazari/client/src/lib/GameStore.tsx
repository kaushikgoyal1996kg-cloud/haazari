import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getSocket, type RoomAck, type TablesAck } from './socket';
import type {
  Card,
  ChatMessage,
  DismissalReason,
  FourSets,
  HaazariPublicStatePayload,
  PublicRoomInfo,
  RoundResult,
  TableSummary,
} from '../game/types';
import { DEFAULT_AVATAR } from '../game/avatars';
import { playDealSound, playChatSound, playErrorSound, playRoundCompleteSound, playVictorySound } from './sound';
import { hapticMedium, hapticError, hapticSuccess, hapticVictory } from './haptics';
import { recordGameResult, getAllStats, type PlayerStats } from './stats';
import { friendlyGameError } from './errorMessages';

const SESSION_KEY = 'haazari_session_v1';

interface StoredSession {
  token: string;
  roomCode: string;
  playerName: string;
}

interface GameContextValue {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  hasConnectedOnce: boolean;
  room: PublicRoomInfo | null;
  myPlayerId: string | null;
  myName: string;
  myHand: Card[];
  myArrangedSets: FourSets | null;
  gameState: HaazariPublicStatePayload | null;
  lastRoundResult: RoundResult | null;
  roundHistory: RoundResult[];
  winnerInfo: { winnerId: string; finalScores: Record<string, number> } | null;
  roomError: string | null;
  gameError: string | null;
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  markChatRead: () => void;
  viewMode: 'active' | 'home';
  goToHomeScreen: () => void;
  returnToGame: () => void;

  createRoom: (playerName: string, avatar?: string) => Promise<RoomAck>;
  joinRoom: (roomCode: string, playerName: string, avatar?: string) => Promise<RoomAck>;
  quickMatch: (playerName: string, avatar?: string) => Promise<RoomAck>;
  listTables: () => Promise<TableSummary[]>;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  addBot: () => void;
  playAgain: () => void;
  confirmArrangement: (sets: FourSets) => void;
  playSet: () => void;
  requestDismissal: (reason: DismissalReason) => void;
  startNextRound: () => void;
  leaveTable: () => void;
  sendChat: (message: string, kind: 'text' | 'emoji' | 'voice', durationSec?: number) => void;
  getStats: () => { name: string; stats: PlayerStats }[];
  clearGameError: () => void;
  leaveSession: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef(getSocket());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [room, setRoom] = useState<PublicRoomInfo | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>('');
  // Refs mirroring the above, so the socket listener effect below (which
  // only runs once on mount) can always read the LATEST values instead of
  // a stale closure over whatever they were at mount time.
  const myPlayerIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>('');
  const roomRef = useRef<PublicRoomInfo | null>(null);
  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [myArrangedSets, setMyArrangedSets] = useState<FourSets | null>(null);
  const [gameState, setGameState] = useState<HaazariPublicStatePayload | null>(null);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundResult[]>([]);
  const [winnerInfo, setWinnerInfo] = useState<{ winnerId: string; finalScores: Record<string, number> } | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [viewMode, setViewMode] = useState<'active' | 'home'>('active');

  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => {
      setConnectionStatus('connected');
      setHasConnectedOnce(true);
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
    const onRoomUpdate = (r: PublicRoomInfo) => {
      setRoom((prev) => {
        // Going back to LOBBY (Play Again) - clear stale game-over/round data
        // from the previous game so RoomLobby renders cleanly.
        if (prev?.status === 'IN_GAME' && r.status === 'LOBBY') {
          setGameState(null);
          setLastRoundResult(null);
          setWinnerInfo(null);
          setMyHand([]);
          setMyArrangedSets(null);
          setRoundHistory([]);
        }
        return r;
      });
    };
    const onRoomError = ({ message }: { message: string }) => setRoomError(message);
    const onYourHand = ({ hand }: { hand: Card[] }) => {
      setMyHand(hand);
      setMyArrangedSets(null); // a fresh hand means a fresh round - any prior arrangement is stale
      playDealSound();
    };
    const onYourArrangement = ({ sets }: { sets: FourSets }) => setMyArrangedSets(sets);
    const onGameState = (s: HaazariPublicStatePayload) => setGameState(s);
    const onGameError = ({ message }: { message: string }) => {
      const players = roomRef.current?.players ?? [];
      setGameError(friendlyGameError(message, players, myPlayerIdRef.current));
      playErrorSound();
      hapticError();
    };
    const onRoundComplete = ({ result }: { result: RoundResult }) => {
      setLastRoundResult(result);
      setRoundHistory((prev) => [...prev, result]);
      playRoundCompleteSound();
      hapticSuccess();
    };
    const onGameOver = (payload: { winnerId: string; finalScores: Record<string, number> }) => {
      setWinnerInfo(payload);
      playVictorySound();
      hapticVictory();
      const pid = myPlayerIdRef.current;
      const name = myNameRef.current;
      if (pid && name) {
        recordGameResult(name, pid === payload.winnerId, payload.finalScores[pid] ?? 0);
      }
    };
    const onChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev.slice(-99), msg]); // keep last 100
      setUnreadChatCount((n) => n + 1);
      playChatSound();
    };

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
    socket.on('room:chatMessage', onChatMessage);

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
      socket.off('room:chatMessage', onChatMessage);
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

  const quickMatch = useCallback((playerName: string, avatar: string = DEFAULT_AVATAR) => {
    return new Promise<RoomAck>((resolve) => {
      socketRef.current.emit('room:quickMatch', { playerName, avatar }, (res) => {
        if (res.ok && res.roomCode && res.playerId && res.token && res.room) {
          storeSession({ token: res.token, roomCode: res.roomCode, playerName });
          setRoom(res.room);
          setMyPlayerId(res.playerId);
          setMyName(playerName);
        } else {
          setRoomError(res.error ?? 'Could not find a match.');
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

  const addBot = useCallback(() => {
    socketRef.current.emit('room:addBot');
  }, []);

  const playAgain = useCallback(() => {
    socketRef.current.emit('room:playAgain');
  }, []);

  const sendChat = useCallback((message: string, kind: 'text' | 'emoji' | 'voice', durationSec?: number) => {
    if (!message) return;
    if (kind !== 'voice' && !message.trim()) return;
    socketRef.current.emit('room:chat', { message, kind, durationSec });
  }, []);

  const markChatRead = useCallback(() => setUnreadChatCount(0), []);
  const getStats = useCallback(() => getAllStats(), []);

  const goToHomeScreen = useCallback(() => setViewMode('home'), []);
  const returnToGame = useCallback(() => setViewMode('active'), []);

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

  const leaveTable = useCallback(() => {
    socketRef.current.emit('game:leaveTable');
    // This seat is now bot-controlled for the rest of the game - the local
    // player has no further part in it, so clear their session the same
    // way leaveSession() does and send them back to the landing screen.
    clearSession();
    setRoom(null);
    setMyPlayerId(null);
    setMyHand([]);
    setMyArrangedSets(null);
    setGameState(null);
    setLastRoundResult(null);
    setWinnerInfo(null);
    setViewMode('active');
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
    setViewMode('active');
  }, []);

  const value: GameContextValue = {
    connectionStatus,
    hasConnectedOnce,
    room,
    myPlayerId,
    myName,
    myHand,
    myArrangedSets,
    gameState,
    lastRoundResult,
    roundHistory,
    winnerInfo,
    roomError,
    gameError,
    chatMessages,
    unreadChatCount,
    markChatRead,
    viewMode,
    goToHomeScreen,
    returnToGame,
    createRoom,
    joinRoom,
    quickMatch,
    listTables,
    setReady,
    startGame,
    addBot,
    playAgain,
    confirmArrangement,
    playSet,
    requestDismissal,
    startNextRound,
    leaveTable,
    sendChat,
    getStats,
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
