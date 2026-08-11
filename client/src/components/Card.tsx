import type { Card as CardType, Suit } from '../game/types';
import './Card.css';

const SUIT_SYMBOL: Record<Suit, string> = {
  SPADES: '\u2660',
  HEARTS: '\u2665',
  DIAMONDS: '\u2666',
  CLUBS: '\u2663',
};

const RED_SUITS: Suit[] = ['HEARTS', 'DIAMONDS'];

interface CardProps {
  card: CardType;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PlayingCard({ card, size = 'md', selected, dimmed, className = '', style }: CardProps) {
  const isRed = RED_SUITS.includes(card.suit);
  return (
    <div
      className={`hz-card hz-card--${size} ${isRed ? 'hz-card--red' : 'hz-card--black'} ${selected ? 'hz-card--selected' : ''} ${dimmed ? 'hz-card--dimmed' : ''} ${className}`}
      style={style}
      aria-label={`${card.rank} of ${card.suit.toLowerCase()}`}
    >
      <span className="hz-card__corner hz-card__corner--top">
        {card.rank}
        <br />
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="hz-card__pip">{SUIT_SYMBOL[card.suit]}</span>
      <span className="hz-card__corner hz-card__corner--bottom">
        {card.rank}
        <br />
        {SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}

export function CardBack({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div className={`hz-card hz-card--${size} hz-card--back ${className}`} aria-hidden="true">
      <div className="hz-card__back-pattern" />
    </div>
  );
}
