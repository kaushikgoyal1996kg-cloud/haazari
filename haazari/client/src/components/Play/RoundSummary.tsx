import { useGame } from '../../lib/GameStore';
import './Play.css';

export function RoundSummary() {
  const { room, lastRoundResult, gameState, myPlayerId, startNextRound } = useGame();
  if (!room || !lastRoundResult || !gameState) return null;

  const nameOf = (pid: string) => room.players.find((p) => p.playerId === pid)?.name ?? pid;
  const isHost = room.players.find((p) => p.playerId === myPlayerId)?.isHost ?? false;
  const total = Object.values(lastRoundResult.pointsThisRound).reduce((a, b) => a + b, 0);

  return (
    <div className="reveal-overlay">
      <div className="reveal-panel panel">
        {lastRoundResult.dismissed ? (
          <>
            <h2>Round Dismissed</h2>
            <p className="text-muted">
              {lastRoundResult.dismissalReason === 'SIX_PAIRS'
                ? 'A player held six pairs.'
                : 'A player held no sequence.'}{' '}
              No points awarded this round.
            </p>
          </>
        ) : (
          <>
            <h2>Round {lastRoundResult.roundNumber} Complete</h2>
            <div className="reveal-hands">
              {room.players.map((p) => (
                <div key={p.playerId} className="reveal-hand">
                  <span className="reveal-hand__name">{p.name}</span>
                  <span>{lastRoundResult.pointsThisRound[p.playerId] ?? 0} pts</span>
                </div>
              ))}
            </div>
            <div className="text-muted">Total: {total}</div>
          </>
        )}

        <hr className="gold-rule" />
        <h3 style={{ fontSize: '0.95rem' }}>Cumulative Score</h3>
        <div className="reveal-hands">
          {room.players.map((p) => (
            <div key={p.playerId} className="reveal-hand">
              <span className="reveal-hand__name">{p.name}</span>
              <span className="reveal-points" style={{ fontSize: '1rem' }}>
                {lastRoundResult.cumulativeScores[p.playerId] ?? 0}
              </span>
            </div>
          ))}
        </div>

        <div className="text-muted">Next dealer: {nameOf(gameState.dealerId)}</div>

        {isHost ? (
          <button className="btn btn-primary" onClick={startNextRound}>
            Next Round
          </button>
        ) : (
          <p className="text-muted">Waiting for the host to start the next round…</p>
        )}
      </div>
    </div>
  );
}
