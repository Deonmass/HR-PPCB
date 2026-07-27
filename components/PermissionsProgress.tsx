interface PermissionsProgressProps {
  percent: number;
  compact?: boolean;
}

export default function PermissionsProgress({ percent, compact = false }: PermissionsProgressProps) {
  const safePercent = Math.min(100, Math.max(0, percent));

  return (
    <div className={`permissions-progress${compact ? ' compact' : ''}`} title={`${safePercent}% des permissions accordées`}>
      <div className="permissions-progress-track" aria-hidden>
        <div className="permissions-progress-fill" style={{ width: `${safePercent}%` }} />
      </div>
      <span className="permissions-progress-value">{safePercent}%</span>
    </div>
  );
}
