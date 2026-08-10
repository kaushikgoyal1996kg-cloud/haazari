import { AVATAR_OPTIONS } from '../../game/avatars';
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
          className={`avatar-picker__option ${value === a ? 'avatar-picker__option--selected' : ''}`}
          onClick={() => onChange(a)}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

/** Small read-only avatar badge used throughout the lobby/table/scoreboard. */
export function AvatarBadge({ avatar, size = 'md' }: { avatar: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar-badge avatar-badge--${size}`}>{avatar}</span>;
}
