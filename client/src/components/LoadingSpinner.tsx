import { PeacockMotif } from './PeacockMotif';
import './LoadingSpinner.css';

interface Props {
  message?: string;
  size?: number;
}

export function LoadingSpinner({ message, size = 56 }: Props) {
  return (
    <div className="loading-spinner">
      <div className="loading-spinner__motif">
        <PeacockMotif size={size} />
      </div>
      {message && <p className="loading-spinner__message text-muted">{message}</p>}
    </div>
  );
}
