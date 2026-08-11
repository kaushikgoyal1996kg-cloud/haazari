import { useGame } from '../../lib/GameStore';
import { PlayingCard } from '../Card';
import './Play.css';

const SET_LABELS = ['Set 1', 'Set 2', 'Set 3', 'Set 4'];

export function RoundSummary() {
  const { room, lastRoundResult, gameState, myPlayerId, startNextRound } = useGame();
  if (!room || !lastRoundResult || !gameState) return null;

  const nameOf = (pid: string) => room.players.find((p) => p.playerId === pid)?.name ?? pid;
  const isHost = room.players.find((p) => p.playerId === myPlayerId)?.isHost ?? false;
  const total = Object.values(lastRoundResult.pointsThisRound).reduce((a, b) => a + b, 0);

  return (
    <div className="reveal-overlay">
      <div className="reveal-panel panel round-summary-panel">
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

            {/* Full breakdown of every sub-round, including Set 4 - this is
                the permanent record of who won each set and what was
                played, so it's never missed even if someone looks away
                during the brief live reveal. */}
            <div className="set-breakdown">
              {lastRoundResult.subRounds.map((sr) => (
                <div key={sr.setIndex} className="set-breakdown__row">
                  <div className="set-breakdown__header">
                    <span className="set-breakdown__label">{SET_LABELS[sr.setIndex]}</span>
                    <span className="set-breakdown__winner">
                      {sr.wasTie && <span className="set-breakdown__tie-tag">TIE — last played wins</span>}
                      Winner: <strong>{nameOf(sr.winnerId)}</strong> (+{sr.pointsAwarded} pts)
                    </span>
                  </div>
                  <div className="set-breakdown__players">
                    {sr.playedSets.map((ps) => (
                      <div key={ps.playerId} className="set-breakdown__player">
                        <span
                          className={`set-breakdown__player-name ${
                            ps.playerId === sr.winnerId ? 'set-breakdown__player-name--winner' : ''
                          }`}
                        >
                          {nameOf(ps.playerId)}
                        </span>
                        <div className="set-breakdown__cards">
                          {ps.cards.map((c) => (
                            <PlayingCard key={c.id} card={c} size="sm" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

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
