export const AVATAR_OPTIONS = [
  '🦚', // peacock
  '👑', // crown
  '🐘', // elephant
  '🐯', // tiger
  '🦁', // lion
  '🦜', // parrot
  '🐍', // cobra
  '🪷', // lotus
  '🔱', // trident
  '🎭', // mask
  '🌙', // moon
  '⭐', // star
  '🤴', // prince
  '👸', // princess
  '🧞', // genie
  '👳', // person wearing turban
  '🧕', // person with headscarf
  '🥷', // ninja
  '🧙', // wizard
  '🕵️', // detective
  '🤠', // cowboy
  '🥸', // disguise face
] as const;

export const DEFAULT_AVATAR = AVATAR_OPTIONS[0];

/** Human-readable names for accessibility (screen readers) - matches the comments above 1:1. */
export const AVATAR_NAMES: Record<string, string> = {
  '🦚': 'Peacock',
  '👑': 'Crown',
  '🐘': 'Elephant',
  '🐯': 'Tiger',
  '🦁': 'Lion',
  '🦜': 'Parrot',
  '🐍': 'Cobra',
  '🪷': 'Lotus',
  '🔱': 'Trident',
  '🎭': 'Mask',
  '🌙': 'Moon',
  '⭐': 'Star',
  '🤴': 'Prince',
  '👸': 'Princess',
  '🧞': 'Genie',
  '👳': 'Person wearing turban',
  '🧕': 'Person with headscarf',
  '🥷': 'Ninja',
  '🧙': 'Wizard',
  '🕵️': 'Detective',
  '🤠': 'Cowboy',
  '🥸': 'Disguise face',
};
