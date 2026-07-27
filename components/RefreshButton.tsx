'use client';

interface Props {
  onClick: () => void | Promise<void>;
  loading?: boolean;
  title?: string;
  className?: string;
}

export default function RefreshButton({
  onClick,
  loading = false,
  title = 'Actualiser',
  className = '',
}: Props) {
  return (
    <button
      type="button"
      className={`btn-icon-refresh${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={loading}
      title={title}
      aria-label={title}
    >
      <svg
        className={loading ? 'spinning' : undefined}
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
        <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
      </svg>
    </button>
  );
}
