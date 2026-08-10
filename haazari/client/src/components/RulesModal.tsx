import './RulesModal.css';

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel__header">
          <h2>Rules</h2>
          <button className="btn btn-ghost rules-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="rules-list">
          <dt>Players</dt>
          <dd>4 players, one 52-card deck, no jokers.</dd>

          <dt>Cards per player</dt>
          <dd>13, dealt one at a time, clockwise from the dealer.</dd>

          <dt>Card values</dt>
          <dd>A, K, Q, J, 10 = 10 points. 2–9 = 5 points. The full deck totals 360 points.</dd>

          <dt>Your sets</dt>
          <dd>Arrange your 13 cards into 4 sets: three sets of 3 cards, one set of 4 cards.</dd>

          <dt>Set order</dt>
          <dd>
            Sets must run strongest to weakest, Set 1 → Set 4. The 4-card set's strength is the best
            3-card combination found among its 4 cards, so it's compared the same way as the others.
          </dd>

          <dt>Hand ranking (weakest → strongest)</dt>
          <dd>High Card, Pair, Color (flush), Sequence, Pure Sequence, Trail (three of a kind). A pure sequence is not required.</dd>

          <dt>How a round works</dt>
          <dd>
            Each round is worth 360 points, split across 4 sub-rounds — one per set. The sub-round
            leader plays first, then the rest follow clockwise. Once all four sets are revealed, the
            strongest wins the points of every card played that sub-round. That winner leads the next
            set.
          </dd>

          <dt>Ties</dt>
          <dd>If two or more sets are exactly equal, whoever played last among them wins. Suit never breaks a tie.</dd>

          <dt>Dismissal</dt>
          <dd>
            If your hand has no sequence anywhere, or contains six pairs, you may choose to dismiss —
            this voids the round for all four players (everyone scores 0) and the deal passes to the
            next dealer. It's optional, never automatic.
          </dd>

          <dt>Dealer</dt>
          <dd>Rotates clockwise after every completed round.</dd>

          <dt>Winning</dt>
          <dd>
            The game continues until a completed round leaves one or more players at 1000+ points.
            The highest cumulative score wins.
          </dd>
        </dl>
      </div>
    </div>
  );
}
