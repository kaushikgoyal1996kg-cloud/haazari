import { useState } from 'react';
import { markTutorialSeen } from '../lib/tutorial';
import './RulesModal.css';
import './TutorialModal.css';

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '🂡',
    title: 'The Goal',
    body: "You're dealt 13 cards. Arrange them into 4 sets — three sets of 3 cards, one set of 4 — ranked from strongest (Set 1) to weakest (Set 4).",
  },
  {
    emoji: '⚔️',
    title: 'Four Rounds of Battle',
    body: "Each set is played as its own mini-round: your Set 1 goes up against everyone else's Set 1, then Set 2 vs Set 2, and so on. Whoever has the strongest set in each battle wins it.",
  },
  {
    emoji: '🏆',
    title: 'Winning Points',
    body: "Win a battle and you score points equal to everyone's card values in that battle. Spreading your strength across all 4 sets usually beats stacking it all into one.",
  },
  {
    emoji: '🎯',
    title: 'First to 1000 Wins',
    body: "Play round after round — the dealer rotates each time — until someone's total score crosses 1000 points. That player wins the game!",
  },
];

export function TutorialModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  function finish() {
    markTutorialSeen();
    onClose();
  }

  return (
    <div className="rules-overlay" onClick={finish}>
      <div className="rules-panel panel tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel__header">
          <h2>How to Play</h2>
          <button className="rules-close btn btn-ghost" onClick={finish} aria-label="Skip tutorial">
            ✕
          </button>
        </div>

        <div className="tutorial-modal__slide">
          <div className="tutorial-modal__emoji" aria-hidden="true">
            {slide.emoji}
          </div>
          <h3 className="tutorial-modal__title">{slide.title}</h3>
          <p className="tutorial-modal__body">{slide.body}</p>
        </div>

        <div className="tutorial-modal__dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={`tutorial-modal__dot ${i === step ? 'tutorial-modal__dot--active' : ''}`} />
          ))}
        </div>

        <div className="tutorial-modal__actions">
          <button className="btn btn-ghost" onClick={finish}>
            Skip
          </button>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-primary" onClick={isLast ? finish : () => setStep((s) => s + 1)}>
            {isLast ? "Let's Play!" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
