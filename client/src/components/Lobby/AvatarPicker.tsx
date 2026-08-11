import { AVATAR_OPTIONS, AVATAR_NAMES } from '../../game/avatars';
import './Lobby.css';

interface Props {
  value: string;
  onChange: (avatar: string) => void;
}

export function AvatarPicker({ value, onChange }: Props) {
  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Choose an avatar">
      {AVATAR_OPTIONS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={AVATAR_NAMES[a] ?? 'Avatar'}
          className={`avatar-picker__option ${value === a ? 'avatar-picker__option--selected' : ''}`}
          onClick={() => onChange(a)}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

/** Small read-only avatar badge used throughout the lobby/table/scoreboard.
 *  `ring` adds a premium brass-medallion frame (used at the table seats). */
export function AvatarBadge({
  avatar,
  size = 'md',
  ring = false,
}: {
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
}) {
  return <span className={`avatar-badge avatar-badge--${size} ${ring ? 'avatar-badge--ring' : ''}`}>{avatar}</span>;
}
