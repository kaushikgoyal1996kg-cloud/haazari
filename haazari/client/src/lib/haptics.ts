function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Unsupported or blocked - nothing actionable to do.
  }
}

/** A light tap - card selection, button presses. */
export function hapticLight(): void {
  vibrate(10);
}

/** A slightly firmer tap - playing a set, confirming a hand. */
export function hapticMedium(): void {
  vibrate(25);
}

/** A short double-pulse - winning a sub-round. */
export function hapticSuccess(): void {
  vibrate([20, 40, 20]);
}

/** A longer celebratory pattern - winning the whole game. */
export function hapticVictory(): void {
  vibrate([30, 50, 30, 50, 60]);
}

/** A single sharp buzz - an error / invalid action. */
export function hapticError(): void {
  vibrate(60);
}
