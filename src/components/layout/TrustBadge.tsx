interface TrustBadgeProps {
  label: string;
  title?: string;
}

export function TrustBadge({
  label,
  title = "All data stays on your device",
}: TrustBadgeProps) {
  return (
    <span className="trust-badge" title={title}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3L5 6.5V11.5C5 16.1 8.1 20.4 12 21.5C15.9 20.4 19 16.1 19 11.5V6.5L12 3Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 12L11 13.5L14.5 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}
