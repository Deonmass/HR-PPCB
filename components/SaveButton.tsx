'use client';

interface Props {
  saving: boolean;
  label: string;
  savingLabel?: string;
  className?: string;
}

export default function SaveButton({
  saving,
  label,
  savingLabel = 'Enregistrement…',
  className = 'btn btn-primary',
}: Props) {
  return (
    <button type="submit" className={className} disabled={saving}>
      {saving && <span className="btn-spinner" aria-hidden="true" />}
      {saving ? savingLabel : label}
    </button>
  );
}
