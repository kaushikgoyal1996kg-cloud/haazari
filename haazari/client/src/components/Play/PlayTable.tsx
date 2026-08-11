import { useEffect, useState } from 'react';
import { useGame } from '../../lib/GameStore';
import { PlayingCard } from '../Card';
import { AvatarBadge } from '../Lobby/AvatarPicker';
import { playCardPlaySound, playRevealSound, playPointsSound } from '../../lib/sound';
import { hapticMedium } from '../../lib/haptics';
import { classifySet, labelFor, setValue } from '../../game/handClassification';
import { useWakeLock } from '../../lib/useWakeLock';
import type { PlayerId } from '../../game/types';
import './Play.css';

const SET_LABELS = ['Set 1', 'Set 2', 'Set 3', 'Set 4'];
// Seats sit at the middle of each of the 4 sides, in clockwise order
// starting from you (bottom) - matches the clockwise turn order (seatOrder).
const SIDE_LABELS = ['bottom', 'left', 'top', 'right'] as const;

export function PlayTable() {
  const { room, gameState, myPlayerId, myArrangedSets, playSet, gameError, clearGameError } = useGame();
  const [dismissedResultKey, setDismissedResultKey] = useState<string | null>(null);

  // Computed safely (never null-unsafe) BEFORE any early return, since
  // hooks must be called unconditionally on every render (Rules of Hooks) -
  // keeps the phone screen from auto-locking while it's actually your turn.
  const safePlayOrder = gameState?.currentPlayOrder ?? [];
  const safePlayedCount = gameState?.playersPlayedThisSubRound.length ?? 0;
  const isMyTurnForWakeLock = !!myPlayerId && safePlayOrder[safePlayedCount] === myPlayerId;
  useWakeLock(isMyTurnForWakeLock);

  if (!room || !gameState || !myPlayerId) return null;

  const allIds = room.players.map((p) => p.playerId);
  const myIndex = allIds.indexOf(myPlayerId);
  const seatOrder: PlayerId[] =
    myIndex === -1
      ? allIds
      : [0, 1, 2, 3].map((offset) => allIds[(myIndex + offset) % allIds.length]);
  const nameOf = (pid: PlayerId) => room.players.find((p) => p.playerId === pid)?.name ?? pid;

  const currentSetIdx = gameState.currentSetIndex;
  const playOrder = gameState.currentPlayOrder ?? [];
  const played = new Set(gameState.playersPlayedThisSubRound);
  const nextToPlay = playOrder[gameState.playersPlayedThisSubRound.length] ?? null;
  const isMyTurn = nextToPlay === myPlayerId && !played.has(myPlayerId);

  // Most recent fully-revealed sub-round result for this round (if any).
  const latestResult = gameState.subRoundResultsThisRound[gameState.subRoundResultsThisRound.length - 1] ?? null;
  const resultKey = latestResult ? `${gameState.roundNumber}-${latestResult.setIndex}` : null;
  const showReveal = !!latestResult && resultKey !== dismissedResultKey;

  useEffect(() => {
    // Auto-advance the reveal panel once the server has moved to the next
    // PLAYING_SET_X state (or round/game end) - keep it up briefly so
    // players can actually read it, per Section 37.
    if (!showReveal) return;
    const t = setTimeout(() => setDismissedResultKey(resultKey), 3200);
    return () => clearTimeout(t);
  }, [showReveal, resultKey]);

  useEffect(() => {
    if (!resultKey || !latestResult) return;
    playRevealSound();
    if (latestResult.winnerId === myPlayerId) playPointsSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  const myCurrentSetCards = myArrangedSets ? myArrangedSets[currentSetIdx] : null;
  const pointsSoFarThisRound = gameState.subRoundResultsThisRound.reduce((s, r) => s + r.pointsAwarded, 0);

  return (
    <div className="play-screen">
      <header className="play-header">
        <div className="play-header__meta">
          <span className="text-muted">Room {room.roomCode}</span>
          <span className="text-muted">Round {gameState.roundNumber}</span>
          <span className="text-muted">Dealer: {nameOf(gameState.dealerId)}</span>
        </div>
        <div className="play-header__progress text-muted">
          {SET_LABELS[currentSetIdx]} of 4 &middot; {pointsSoFarThisRound}/360 pts awarded
        </div>
      </header>

      <ScoreStrip room={room} scores={gameState.cumulativeScores} myPlayerId={myPlayerId} />

      <div className="table-felt">
        <div className="table-felt__base" aria-hidden="true" />
        <div className="table-felt__quilt" aria-hidden="true" />
        <div className="table-felt__vignette" aria-hidden="true" />
        <div className="table-felt__emblem" aria-hidden="true">♠</div>
        {[0, 1, 2, 3].map((corner) => (
          <span key={corner} className={`table-felt__rivet table-felt__rivet--${corner}`} aria-hidden="true" />
        ))}
        {seatOrder.map((pid, i) => {
          const side = SIDE_LABELS[i];
          const isMe = pid === myPlayerId;
          const isDealer = pid === gameState.dealerId;
          const isTurn = pid === nextToPlay;
          const hasPlayed = played.has(pid);
          const playedCards = gameState.playedSetsThisSubRound.find((p) => p.playerId === pid)?.cards;
          const info = room.players.find((p) => p.playerId === pid);
          return (
            <div key={pid} className={`seat seat--${side} ${isMe ? 'seat--me' : ''} ${isTurn ? 'seat--turn' : ''}`}>
              <div className="seat__badge-row">
                {isDealer && <span className="seat__badge">Dealer</span>}
                {info?.isBot && <span className="seat__badge seat__badge--bot">🤖 Bot</span>}
                {info && !info.connected && !info.isBot && <span className="seat__badge seat__badge--warn">Away</span>}
              </div>
              {info && <AvatarBadge avatar={info.avatar} size={isMe ? 'lg' : 'md'} ring />}
              <div className="seat__name">
                {nameOf(pid)}
                {isMe && ' (you)'}
              </div>
              <div className="seat__status">
                {!isMe &&
                  (hasPlayed && playedCards ? (
                    <div className="seat__played-cards">
                      {playedCards.map((c) => (
                        <PlayingCard key={c.id} card={c} size="sm" />
                      ))}
                    </div>
                  ) : isTurn ? (
                    info?.isBot ? (
                      <span className="seat__thinking">
                        Thinking<span className="seat__thinking-dots"><i /><i /><i /></span>
                      </span>
                    ) : (
                      <span className="seat__waiting">Playing…</span>
                    )
                  ) : (
                    <span className="text-muted">Waiting</span>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-hand-panel panel">
        <div className="my-hand-panel__sets">
          {myArrangedSets?.map((set, idx) => (
            <div
              key={idx}
              className={`my-set ${idx === currentSetIdx ? 'my-set--active' : ''} ${idx < currentSetIdx ? 'my-set--done' : ''}`}
            >
              <div className="my-set__label">{SET_LABELS[idx]}</div>
              <div className="my-set__cards">
                {set.map((c) => (
                  <PlayingCard key={c.id} card={c} size="sm" dimmed={idx !== currentSetIdx} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {isMyTurn && myCurrentSetCards && (
          <button className="btn btn-primary play-btn" onClick={() => { playCardPlaySound(); hapticMedium(); playSet(); }}>
            Play {SET_LABELS[currentSetIdx]} ({setValue(myCurrentSetCards)} pts)
          </button>
        )}
        {!isMyTurn && nextToPlay && <div className="text-muted play-waiting">Waiting for {nameOf(nextToPlay)}…</div>}
      </div>

      {gameError && (
        <div className="toast toast--error" onClick={clearGameError}>
          {gameError}
        </div>
      )}

      {showReveal && latestResult && (
        <div className="reveal-overlay">
          <div className="reveal-panel panel">
            <h3>{SET_LABELS[latestResult.setIndex]} Revealed</h3>
            {latestResult.wasTie && <p className="reveal-tie">Tie — last throw wins</p>}
            <div className="reveal-hands">
              {latestResult.playedSets.map((ps) => {
                const isWinner = ps.playerId === latestResult.winnerId;
                const value = classifySet(ps.cards);
                return (
                  <div key={ps.playerId} className={`reveal-hand ${isWinner ? 'reveal-hand--winner' : ''}`}>
                    <div className="reveal-hand__name">
                      {nameOf(ps.playerId)} {isWinner && '🏆'}
                    </div>
                    <div className="reveal-hand__cards">
                      {ps.cards.map((c) => (
                        <PlayingCard key={c.id} card={c} size="sm" />
                      ))}
                    </div>
                    <div className="text-muted reveal-hand__label">{labelFor(value)}</div>
                  </div>
                );
              })}
            </div>
            <div className="reveal-points">
              +{latestResult.pointsAwarded} points to {nameOf(latestResult.winnerId)}
            </div>
            <button className="btn btn-ghost" onClick={() => setDismissedResultKey(resultKey)}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreStrip({
  room,
  scores,
  myPlayerId,
}: {
  room: { players: { playerId: string; name: string; avatar: string }[] };
  scores: Record<string, number>;
  myPlayerId: string;
}) {
  return (
    <div className="score-strip">
      {room.players.map((p) => (
        <div key={p.playerId} className={`score-strip__item ${p.playerId === myPlayerId ? 'score-strip__item--me' : ''}`}>
          <AvatarBadge avatar={p.avatar} size="sm" />
          <span className="score-strip__name">{p.name}</span>
          <span className="score-strip__value">{scores[p.playerId] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}
