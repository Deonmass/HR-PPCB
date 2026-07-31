'use client';

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Suppression en cours : affiche un spinner à la place de la corbeille. */
  deleting?: boolean;
}

export default function ActionButtons({
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  deleting = false,
}: Props) {
  if (!canEdit && !canDelete) return null;

  return (
    <div className="action-btns">
      {canEdit && (
        <button
          type="button"
          className="action-btn action-edit"
          onClick={onEdit}
          disabled={deleting}
          title="Modifier"
          aria-label="Modifier"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="action-btn action-delete"
          onClick={onDelete}
          disabled={deleting}
          title={deleting ? 'Suppression…' : 'Supprimer'}
          aria-label={deleting ? 'Suppression en cours' : 'Supprimer'}
        >
          {deleting ? (
            <span className="btn-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
