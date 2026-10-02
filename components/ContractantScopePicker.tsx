'use client';

import type { ContractantAccessScope } from '@/lib/auth-types';
import {
  CONTRACTANT_PORTAL_MENUS,
  contractantMenuVisible,
  type ContractantPortalMenuId,
} from '@/lib/contractant-scope';
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

  const toggleMenu = (id: ContractantPortalMenuId, checked: boolean) => {
    const menus = Object.fromEntries(
      CONTRACTANT_PORTAL_MENUS.map((item) => [item.id, contractantMenuVisible(value, item.id)]),
    ) as NonNullable<ContractantAccessScope['menus']>;
    menus[id] = checked;
    onChange({ contractantIds: value.contractantIds, menus });
  };

  const toggle = (id: string, checked: boolean) => {
    const next = checked
      ? [...value.contractantIds, id]
      : value.contractantIds.filter((item) => item !== id);
    onChange({ contractantIds: Array.from(new Set(next)), menus: value.menus });
  };

  const selectAll = () => {
    onChange({ contractantIds: sorted.map((item) => item.id), menus: value.menus });
  };

  const clearAll = () => {
    onChange({ contractantIds: [], menus: value.menus });
  };

  return (
    <div className="permissions-ot-scope">
      <div className="permissions-contractant-grid">
        <div className="permissions-ot-col-title permissions-contractant-title-menus">
          Menus affichés
        </div>
        <div className="permissions-ot-col-title permissions-contractant-title-scope">
          Périmètre contractants ({selected.size}/{sorted.length})
        </div>

        <p className="permissions-ot-scope-hint permissions-contractant-hint-menus">
          Cochez les menus visibles. Un menu décoché est masqué.
        </p>
        <div className="permissions-contractant-hint-scope">
          <p className="permissions-ot-scope-hint">
            Sans sélection, tous les contractants restent visibles.
          </p>
          <div className="permissions-ot-scope-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={selectAll}>
              Tout cocher
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={clearAll}>
              Tout décocher
            </button>
          </div>
        </div>

        <div className="permissions-contractant-checks is-single permissions-contractant-checks-menus">
          {CONTRACTANT_PORTAL_MENUS.map((item) => (
            <label key={item.id} className="permissions-ot-check">
              <input
                type="checkbox"
                checked={contractantMenuVisible(value, item.id)}
                disabled={disabled}
                onChange={(event) => toggleMenu(item.id, event.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        {sorted.length === 0 ? (
          <p className="permissions-ot-empty-svc permissions-contractant-checks-scope">
            Aucun contractant enregistré
          </p>
        ) : (
          <div className="permissions-contractant-checks permissions-contractant-checks-scope">
            {sorted.map((item) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
