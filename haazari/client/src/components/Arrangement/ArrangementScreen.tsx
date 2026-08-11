import { useEffect, useMemo, useState } from 'react';
import type { Card, DismissalReason, FourSets } from '../../game/types';
import { PlayingCard } from '../Card';
import { autoArrange } from '../../game/autoArrange';
import {
  classifyThree,
  classifyFour,
  compareHand,
  labelFor,
  hasSixPairs,
  isNoSequenceHand,
  RANK_VALUE,
} from '../../game/handClassification';
import './Arrangement.css';
import { playSelectSound } from '../../lib/sound';

type Location = 'pool' | 0 | 1 | 2 | 3;
interface Selected {
  location: Location;
  cardId: string;
}
type SortMode = 'dealt' | 'rank' | 'suit';

const SET_SIZES = [3, 3, 3, 4];
const SET_LABELS = ['Set 1 — Best', 'Set 2', 'Set 3', 'Set 4 — Weakest'];
const SUIT_ORDER: Record<Card['suit'], number> = { SPADES: 0, HEARTS: 1, DIAMONDS: 2, CLUBS: 3 };

function sortCards(cards: Card[], mode: SortMode): Card[] {
  if (mode === 'dealt') return cards;
  const sorted = [...cards];
  if (mode === 'rank') {
    sorted.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  } else {
    sorted.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  }
  return sorted;
}

interface Props {
  hand: Card[];
  onConfirm: (sets: FourSets) => void;
  onDismiss: (reason: DismissalReason) => void;
  submitError: string | null;
  cumulativeScore?: number;
}

export function ArrangementScreen({ hand, onConfirm, onDismiss, submitError, cumulativeScore }: Props) {
  const [pool, setPool] = useState<Card[]>(hand);
  const [slots, setSlots] = useState<[Card[], Card[], Card[], Card[]]>([[], [], [], []]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [justDealt, setJustDealt] = useState(true);
  const isCloseToWinning = cumulativeScore !== undefined && 1000 - cumulativeScore <= 150;

  // Reset the board whenever a genuinely new hand arrives (new round dealt).
  const handFingerprint = hand.map((c) => c.id).sort().join(',');
  useEffect(() => {
    setPool(hand);
    setSlots([[], [], [], []]);
    setSelected(null);
    setJustDealt(true); // play the deal-in animation for this fresh hand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handFingerprint]);

  function findLocation(cardId: string): Location {
    if (pool.some((c) => c.id === cardId)) return 'pool';
    for (let i = 0; i < 4; i++) {
      if (slots[i].some((c) => c.id === cardId)) return i as Location;
    }
    return 'pool';
  }

  function getArray(loc: Location): Card[] {
    return loc === 'pool' ? pool : slots[loc];
  }
  function setArray(loc: Location, arr: Card[]) {
    if (loc === 'pool') setPool(arr);
    else setSlots((prev) => {
      const next = [...prev] as [Card[], Card[], Card[], Card[]];
      next[loc] = arr;
      return next;
    });
  }

  function moveTo(cardId: string, dest: Location) {
    const src = findLocation(cardId);
    if (src === dest) return;
    const maxSize = dest === 'pool' ? Infinity : SET_SIZES[dest];
    if (getArray(dest).length >= maxSize) return; // full - no-op
    const card = getArray(src).find((c) => c.id === cardId)!;
    setArray(src, getArray(src).filter((c) => c.id !== cardId));
    setArray(dest, [...getArray(dest), card]);
  }

  function swap(a: Selected, b: Selected) {
    if (a.location === b.location) return;
    const arrA = getArray(a.location);
    const arrB = getArray(b.location);
    const cardA = arrA.find((c) => c.id === a.cardId)!;
    const cardB = arrB.find((c) => c.id === b.cardId)!;
    setArray(a.location, arrA.filter((c) => c.id !== a.cardId).concat(cardB));
    setArray(b.location, arrB.filter((c) => c.id !== b.cardId).concat(cardA));
  }

  function handleCardTap(location: Location, card: Card) {
    playSelectSound();
    setJustDealt(false); // cards are being handled now - stop the deal-in animation
    if (!selected) {
      setSelected({ location, cardId: card.id });
      return;
    }
    if (selected.cardId === card.id) {
      setSelected(null);
      return;
    }
    swap(selected, { location, cardId: card.id });
    setSelected(null);
  }

  function handleEmptySlotTap(dest: Location) {
    if (!selected) return;
    moveTo(selected.cardId, dest);
    setSelected(null);
  }

  function handleAutoArrange() {
    setJustDealt(false);
    const result = autoArrange(hand, cumulativeScore);
    if (result) {
      setSlots(result);
      setPool([]);
      setSelected(null);
    }
  }

  function handleReset() {
    setPool(hand);
    setSlots([[], [], [], []]);
    setSelected(null);
  }

  const validation = useMemo(() => validateLocally(slots, pool), [slots, pool]);
  const dismissEligible = useMemo(() => {
    const reasons: DismissalReason[] = [];
    if (hasSixPairs(hand)) reasons.push('SIX_PAIRS');
    if (pool.length === 0 && isNoSequenceHand(slots)) reasons.push('NO_SEQUENCE');
    return reasons;
  }, [hand, slots, pool]);

  const canConfirm = validation.valid;
  const displayedPool = useMemo(() => sortCards(pool, sortMode), [pool, sortMode]);

  return (
    <div className="arrange-screen">
      <div className="arrange-screen__header">
        <h2>Arrange Your Hand</h2>
        <p className="text-muted">Tap a card, then tap another card or an empty slot to move it.</p>
      </div>

      <div className="arrange-pool panel">
        <div className="arrange-pool__header">
          <div className="arrange-pool__label">Your cards ({pool.length})</div>
          <div className="arrange-sort-toggle" role="group" aria-label="Sort your cards">
            <button
              className={`arrange-sort-btn ${sortMode === 'rank' ? 'arrange-sort-btn--active' : ''}`}
              onClick={() => setSortMode('rank')}
            >
              Sort: Number
            </button>
            <button
              className={`arrange-sort-btn ${sortMode === 'suit' ? 'arrange-sort-btn--active' : ''}`}
              onClick={() => setSortMode('suit')}
            >
              Sort: Suit
            </button>
            <button
              className={`arrange-sort-btn ${sortMode === 'dealt' ? 'arrange-sort-btn--active' : ''}`}
              onClick={() => setSortMode('dealt')}
            >
              Dealt Order
            </button>
          </div>
        </div>
        <div className="arrange-pool__cards">
          {displayedPool.map((c, i) => (
            <button
              key={c.id}
              className={`arrange-card-btn ${justDealt ? 'arrange-card-btn--dealt' : ''}`}
              style={justDealt ? { animationDelay: `${i * 45}ms` } : undefined}
              onClick={() => handleCardTap('pool', c)}
              aria-pressed={selected?.cardId === c.id}
            >
              <PlayingCard card={c} size="sm" selected={selected?.cardId === c.id} />
            </button>
          ))}
          {pool.length === 0 && <div className="arrange-pool__empty text-muted">All cards placed</div>}
        </div>
      </div>

      <div className="arrange-sets">
        {([0, 1, 2, 3] as const).map((idx) => {
          const setCards = slots[idx];
          const isFull = setCards.length === SET_SIZES[idx];
          const value = isFull ? (idx === 3 ? classifyFour(setCards) : classifyThree(setCards)) : null;
          const orderOk = validation.setOk[idx];
          return (
            <div key={idx} className={`arrange-set panel ${orderOk === false ? 'arrange-set--invalid' : ''}`}>
              <div className="arrange-set__header">
                <span>{SET_LABELS[idx]}</span>
                <span className="arrange-set__count">{setCards.length}/{SET_SIZES[idx]}</span>
              </div>
              <div
                className="arrange-set__cards"
                onClick={() => setCards.length < SET_SIZES[idx] && handleEmptySlotTap(idx)}
              >
                {setCards.map((c) => (
                  <button
                    key={c.id}
                    className="arrange-card-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardTap(idx, c);
                    }}
                    aria-pressed={selected?.cardId === c.id}
                  >
                    <PlayingCard card={c} size="sm" selected={selected?.cardId === c.id} />
                  </button>
                ))}
                {Array.from({ length: SET_SIZES[idx] - setCards.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="arrange-set__placeholder" />
                ))}
              </div>
              <div className="arrange-set__status">
                {value ? (
                  <span className={orderOk === false ? 'error-text' : ''}>
                    {orderOk === false ? '✕' : '✓'} {labelFor(value)}
                  </span>
                ) : (
                  <span className="text-muted">Incomplete</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="arrange-validation">
        {validation.messages.map((m, i) => (
          <div key={i} className={m.ok ? 'arrange-check' : 'arrange-check arrange-check--bad'}>
            {m.ok ? '✓' : '✕'} {m.text}
          </div>
        ))}
      </div>

      {submitError && <div className="error-text arrange-submit-error">{submitError}</div>}

      {isCloseToWinning && (
        <p className="arrange-endgame-hint text-muted">
          🏆 You're close to winning — suggestions will now favor one big strong set over a balanced spread.
        </p>
      )}

      <div className="arrange-actions">
        <button className="btn btn-ghost" onClick={handleReset}>Reset</button>
        <button className="btn btn-ghost" onClick={handleAutoArrange}>Suggest Arrangement</button>
        <button className="btn btn-primary" disabled={!canConfirm} onClick={() => onConfirm(slots)}>
          Confirm Hand
        </button>
      </div>

      {dismissEligible.length > 0 && (
        <div className="arrange-dismiss panel">
          <p>Your hand qualifies for dismissal ({dismissEligible.join(', ').toLowerCase().replace('_', ' ')}). Dismissing voids this round for all players — everyone scores 0, and the deal passes to the next dealer.</p>
          <button className="btn" onClick={() => onDismiss(dismissEligible[0])}>
            Dismiss Hand
          </button>
        </div>
      )}
    </div>
  );
}

function validateLocally(
  slots: [Card[], Card[], Card[], Card[]],
  pool: Card[]
): { valid: boolean; messages: { ok: boolean; text: string }[]; setOk: (boolean | null)[] } {
  const messages: { ok: boolean; text: string }[] = [];
  const allPlaced = pool.length === 0;
  messages.push({ ok: allPlaced, text: 'All 13 cards used' });

  const sizesOk = slots.every((s, i) => s.length === SET_SIZES[i]);
  const setOk: (boolean | null)[] = [null, null, null, null];

  let orderingOk = true;
  if (sizesOk) {
    const values = [
      classifyThree(slots[0]),
      classifyThree(slots[1]),
      classifyThree(slots[2]),
      classifyFour(slots[3]),
    ];
    for (let i = 0; i < 3; i++) {
      const ok = compareHand(values[i], values[i + 1]) >= 0;
      setOk[i + 1] = ok;
      if (!ok) orderingOk = false;
    }
    setOk[0] = true;
  }
  messages.push({ ok: sizesOk && orderingOk, text: 'Sets arranged strongest → weakest' });

  return { valid: allPlaced && sizesOk && orderingOk, messages, setOk };
}
