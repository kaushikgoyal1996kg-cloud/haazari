// A small, curated set of avatar icons themed to fit Haazari's Indian
// card-table aesthetic. Kept as plain emoji (no image assets needed) so
// they render everywhere with zero extra network requests.
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
] as const;

export type Avatar = (typeof AVATAR_OPTIONS)[number];

export const DEFAULT_AVATAR: Avatar = AVATAR_OPTIONS[0];

export function isValidAvatar(value: unknown): value is Avatar {
  return typeof value === 'string' && (AVATAR_OPTIONS as readonly string[]).includes(value);
}
