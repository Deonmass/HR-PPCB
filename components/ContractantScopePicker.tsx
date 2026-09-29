'use client';

import type { ContractantAccessScope } from '@/lib/auth-types';
import type { Contractant } from '@/lib/contractants-types';

interface Props {
  contractants: Contractant[];
  value: ContractantAccessScope;
  disabled?: boolean;
  onChange: (next: ContractantAccessScope) => void;
}

export default function ContractantScopePicker({
  contractants,
  value,
  disabled,
  onChange,
}: Props) {
  const selected = new Set(value.contractantIds);
  const sorted = [...contractants].sort((a, b) =>
    a.denomination.localeCompare(b.denomination, 'fr', { sensitivity: 'base' }),
  );

  const toggle = (id: string, checked: boolean) => {
    const next = checked
      ? [...value.contractantIds, id]
      : value.contractantIds.filter((item) => item !== id);
    onChange({ contractantIds: Array.from(new Set(next)) });
  };

  const selectAll = () => {
    onChange({ contractantIds: sorted.map((item) => item.id) });
  };

  const clearAll = () => {
    onChange({ contractantIds: [] });
  };

  return (
    <div className="permissions-ot-scope">
      <div className="permissions-ot-scope-title">Périmètre contractants</div>
      <p className="permissions-ot-scope-hint">
        Cochez le(s) contractant(s) que cet utilisateur peut gérer (ex. EKMM). Sans sélection, tous
        les contractants restent visibles. Le dashboard et la liste suivront ce filtre.
      </p>
      <div className="permissions-ot-scope-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={selectAll}>
          Tout cocher
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={clearAll}>
          Tout décocher
        </button>
      </div>
      <div className="permissions-ot-columns">
        <div className="permissions-ot-col permissions-ot-col-wide">
          <div className="permissions-ot-col-title">
            Contractants ({selected.size}/{sorted.length})
          </div>
          {sorted.length === 0 ? (
            <p className="permissions-ot-empty-svc">Aucun contractant enregistré</p>
          ) : (
            sorted.map((item) => (
              <label key={item.id} className="permissions-ot-check">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  disabled={disabled}
                  onChange={(event) => toggle(item.id, event.target.checked)}
                />
                <span>
                  {item.denomination}
                  {item.typeService ? (
                    <small className="permissions-ot-parent"> · {item.typeService}</small>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
