interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon = "◇",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="primary-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
