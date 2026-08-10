export function PeacockMotif({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className="peacock-motif"
    >
      <ellipse cx="50" cy="50" rx="46" ry="30" stroke="var(--gold-500)" strokeWidth="1.2" opacity="0.8" />
      <ellipse cx="50" cy="50" rx="34" ry="20" stroke="var(--gold-500)" strokeWidth="1" opacity="0.6" />
      <ellipse cx="50" cy="50" rx="20" ry="11" stroke="var(--gold-300)" strokeWidth="1" opacity="0.9" />
      <circle cx="50" cy="50" r="7" fill="var(--gold-300)" opacity="0.85" />
      <circle cx="50" cy="50" r="3" fill="var(--felt-900)" />
      <path d="M50 4 V20 M50 80 V96 M4 50 H20 M80 50 H96" stroke="var(--gold-500)" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
