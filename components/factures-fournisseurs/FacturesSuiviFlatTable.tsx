'use client';

import { useMemo, useState } from 'react';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import type { FactureSuivi, FactureSuiviInput } from '@/lib/factures-fournisseurs/types';
import {
  formatUsdLike,
  isFacturePaid,
  paymentStatusLabel,
  paymentValueFromStatus,
} from '@/lib/factures-fournisseurs/utils';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

export type EditableFactureField = 'pr' | 'po' | 'payment';

type FilterKey = 'date' | 'societe' | 'facture' | 'montant' | 'pr' | 'po' | 'payment' | 'commentaire';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  date: [],
  societe: [],
  facture: [],
  montant: [],
  pr: [],
  po: [],
  payment: [],
  commentaire: [],
};

function displayMontant(value: number | null | undefined): string {
  return value != null ? `${formatUsdLike(value)} $` : '—';
}

const FIELD_META: Record<
  EditableFactureField,
  { title: string; valueLabel: string; dateLabel: string; dateKey: 'datePr' | 'datePo' | 'datePym' }
> = {
  pr: { title: 'Modifier le PR', valueLabel: 'N° PR', dateLabel: 'Date PR', dateKey: 'datePr' },
  po: { title: 'Modifier le PO', valueLabel: 'N° PO', dateLabel: 'Date PO', dateKey: 'datePo' },
  payment: {
    title: 'Modifier le paiement',
    valueLabel: 'Statut Payment',
    dateLabel: 'Date paiement',
    dateKey: 'datePym',
  },
};

function displayCell(value: string): string {
  return value.trim() || '—';
}

function todayDisplay(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function fromDateInputValue(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface Props {
  factures: FactureSuivi[];
  canEdit: boolean;
  canSelect?: boolean;
  selectedIds?: Set<string>;
  exitingIds?: Set<string>;
  flashingIds?: Set<string>;
  onToggleSelect?: (id: string, selected: boolean) => void;
  onToggleSelectMany?: (ids: string[], selected: boolean) => void;
  onFieldUpdate: (id: string, patch: FactureSuiviInput) => Promise<void>;
  onContextMenu?: (event: React.MouseEvent, facture: FactureSuivi) => void;
}

export default function FacturesSuiviFlatTable({
  factures,
  canEdit,
  canSelect = false,
  selectedIds,
  exitingIds,
  flashingIds,
  onToggleSelect,
  onToggleSelectMany,
  onFieldUpdate,
  onContextMenu,
}: Props) {
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [editModal, setEditModal] = useState<{
    facture: FactureSuivi;
    field: EditableFactureField;
  } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(factures, {
        date: (f) => f.date,
        societe: (f) => f.societe,
        facture: (f) => f.facture,
        montant: (f) => displayMontant(f.montant),
        pr: (f) => f.pr,
        po: (f) => f.po,
        payment: (f) => paymentStatusLabel(f.payment),
        commentaire: (f) => f.commentaire,
      }),
    [factures],
  );

  const filtered = useMemo(
    () =>
      factures.filter(
        (f) =>
          matchesColumnFilter(colFilters.date, f.date) &&
          matchesColumnFilter(colFilters.societe, f.societe) &&
          matchesColumnFilter(colFilters.facture, f.facture) &&
          matchesColumnFilter(colFilters.montant, displayMontant(f.montant)) &&
          matchesColumnFilter(colFilters.pr, f.pr) &&
          matchesColumnFilter(colFilters.po, f.po) &&
          matchesColumnFilter(colFilters.payment, paymentStatusLabel(f.payment)) &&
          matchesColumnFilter(colFilters.commentaire, f.commentaire),
      ),
    [factures, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const openEditModal = (facture: FactureSuivi, field: EditableFactureField) => {
    if (!canEdit) return;
    const meta = FIELD_META[field];
    setEditModal({ facture, field });
    setFormError(null);
    if (field === 'payment') {
      setDraftValue(isFacturePaid(facture.payment) ? 'paid' : 'unpaid');
      setDraftDate(toDateInputValue(facture.datePym) || toDateInputValue(todayDisplay()));
    } else {
      setDraftValue(facture[field] || '');
      setDraftDate(toDateInputValue(facture[meta.dateKey]) || toDateInputValue(todayDisplay()));
    }
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditModal(null);
    setDraftValue('');
    setDraftDate('');
    setFormError(null);
  };

  const submitEditModal = async () => {
    if (!editModal || saving) return;
    const { facture, field } = editModal;
    const meta = FIELD_META[field];
    const dateDisplay = fromDateInputValue(draftDate);

    let patch: FactureSuiviInput = { id: facture.id };

    if (field === 'payment') {
      const status = draftValue === 'paid' ? 'paid' : 'unpaid';
      const payment = paymentValueFromStatus(status);
      if (status === 'paid' && !dateDisplay) {
        setFormError('La date de paiement est requise pour un statut Paid.');
        return;
      }
      patch = {
        ...patch,
        payment,
        datePym: status === 'paid' ? dateDisplay : '',
      };
      if (
        isFacturePaid(payment) === isFacturePaid(facture.payment) &&
        (facture.datePym || '') === (patch.datePym || '')
      ) {
        closeEditModal();
        return;
      }
    } else {
      const value = draftValue.trim();
      if (value && !dateDisplay) {
        setFormError(`La ${meta.dateLabel.toLowerCase()} est requise.`);
        return;
      }
      patch = {
        ...patch,
        [field]: value,
        [meta.dateKey]: value ? dateDisplay : '',
      };
      if (
        (facture[field] || '').trim() === value &&
        (facture[meta.dateKey] || '') === (value ? dateDisplay : '')
      ) {
        closeEditModal();
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      await onFieldUpdate(facture.id, patch);
      setEditModal(null);
      setDraftValue('');
      setDraftDate('');
    } catch {
      setFormError('Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const renderEditable = (facture: FactureSuivi, field: EditableFactureField) => {
    const label = field === 'payment' ? paymentStatusLabel(facture.payment) : displayCell(facture[field]);
    const meta = FIELD_META[field];
    const relatedDate = facture[meta.dateKey];
    const title = canEdit
      ? relatedDate
        ? `Double-clic pour modifier · ${meta.dateLabel}: ${relatedDate}`
        : 'Double-clic pour modifier (valeur + date)'
      : relatedDate
        ? `${meta.dateLabel}: ${relatedDate}`
        : undefined;

    return (
      <span
        className={`factures-suivi-editable${canEdit ? ' is-editable' : ''}${
          field === 'payment' ? ` is-payment is-${paymentStatusLabel(facture.payment).toLowerCase()}` : ''
        }`}
        title={title}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openEditModal(facture, field);
        }}
      >
        {label}
        {relatedDate ? <small className="factures-suivi-editable-date">{relatedDate}</small> : null}
      </span>
    );
  };

  const filteredIds = useMemo(() => filtered.map((f) => f.id), [filtered]);
  const allFilteredSelected =
    canSelect &&
    filteredIds.length > 0 &&
    !!selectedIds &&
    filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected =
    canSelect && !!selectedIds && filteredIds.some((id) => selectedIds.has(id));

  if (!factures.length) {
    return <p className="empty-state">Aucune facture.</p>;
  }

  const modalMeta = editModal ? FIELD_META[editModal.field] : null;
  const colCount = canSelect ? 10 : 9;

  return (
    <div className="factures-suivi-flat">
      {activeFilterCount > 0 ? (
        <div className="factures-suivi-filter-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setColFilters(EMPTY_FILTERS)}
          >
            Effacer les filtres ({activeFilterCount})
          </button>
          <span className="factures-suivi-toolbar-meta">
            {filtered.length} / {factures.length} facture{factures.length > 1 ? 's' : ''}
          </span>
        </div>
      ) : null}

      <div className="factures-suivi-table-wrap">
        <table className="factures-suivi-table factures-suivi-flat-table">
          <thead>
            <tr>
              {canSelect ? (
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={Boolean(allFilteredSelected)}
                    ref={(el) => {
                      if (el) el.indeterminate = Boolean(someFilteredSelected && !allFilteredSelected);
                    }}
                    onChange={(e) => onToggleSelectMany?.(filteredIds, e.target.checked)}
                    aria-label="Sélectionner toutes les factures visibles"
                    disabled={!filteredIds.length}
                  />
                </th>
              ) : null}
              <th className="col-row-num">#</th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Date facture"
                  values={filterValues.date}
                  selected={colFilters.date}
                  onChange={setColFilter('date')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Société"
                  values={filterValues.societe}
                  selected={colFilters.societe}
                  onChange={setColFilter('societe')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="N°Facture"
                  values={filterValues.facture}
                  selected={colFilters.facture}
                  onChange={setColFilter('facture')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Montant"
                  values={filterValues.montant}
                  selected={colFilters.montant}
                  onChange={setColFilter('montant')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Pr"
                  values={filterValues.pr}
                  selected={colFilters.pr}
                  onChange={setColFilter('pr')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Po"
                  values={filterValues.po}
                  selected={colFilters.po}
                  onChange={setColFilter('po')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Payment"
                  values={filterValues.payment}
                  selected={colFilters.payment}
                  onChange={setColFilter('payment')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Commentaire"
                  values={filterValues.commentaire}
                  selected={colFilters.commentaire}
                  onChange={setColFilter('commentaire')}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="empty-state">
                  Aucune facture pour ces filtres.
                </td>
              </tr>
            ) : (
              filtered.map((f, index) => {
                const isSelected = Boolean(selectedIds?.has(f.id));
                const isExiting = Boolean(exitingIds?.has(f.id));
                const isFlashing = Boolean(flashingIds?.has(f.id));
                return (
                <tr
                  key={f.id}
                  className={[
                    'factures-suivi-row-context',
                    isSelected ? 'is-selected' : '',
                    isExiting ? 'factures-suivi-row-exit' : '',
                    isFlashing ? 'factures-suivi-row-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onContextMenu={(event) => onContextMenu?.(event, f)}
                >
                  {canSelect ? (
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onToggleSelect?.(f.id, e.target.checked)}
                        aria-label={`Sélectionner ${f.facture || f.id}`}
                      />
                    </td>
                  ) : null}
                  <td className="col-row-num is-num">{index + 1}</td>
                  <td className="col-date" title={displayCell(f.date)}>
                    {displayCell(f.date)}
                  </td>
                  <td className="col-societe" title={displayCell(f.societe)}>
                    {displayCell(f.societe)}
                  </td>
                  <td className="col-facture" title={displayCell(f.facture)}>
                    <strong>{displayCell(f.facture)}</strong>
                  </td>
                  <td className="col-montant is-num" title={displayMontant(f.montant)}>
                    {displayMontant(f.montant)}
                  </td>
                  <td className="col-pr">{renderEditable(f, 'pr')}</td>
                  <td className="col-po">{renderEditable(f, 'po')}</td>
                  <td className="col-payment">{renderEditable(f, 'payment')}</td>
                  <td className="factures-suivi-comment col-comment" title={displayCell(f.commentaire)}>
                    {displayCell(f.commentaire)}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editModal && modalMeta ? (
        <div className="modal-overlay open" onClick={closeEditModal}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalMeta.title}</h3>
              <button type="button" className="modal-close" onClick={closeEditModal} disabled={saving}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="factures-suivi-assign-hint">
                {editModal.facture.facture}
                {editModal.facture.societe ? ` · ${editModal.facture.societe}` : ''}
              </p>
              {formError ? <div className="alert alert-danger">{formError}</div> : null}
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label>{modalMeta.valueLabel}</label>
                  {editModal.field === 'payment' ? (
                    <select
                      value={draftValue === 'paid' ? 'paid' : 'unpaid'}
                      disabled={saving}
                      autoFocus
                      onChange={(e) => {
                        setDraftValue(e.target.value);
                        if (e.target.value === 'paid' && !draftDate) {
                          setDraftDate(toDateInputValue(todayDisplay()));
                        }
                      }}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  ) : (
                    <input
                      value={draftValue}
                      disabled={saving}
                      autoFocus
                      onChange={(e) => setDraftValue(e.target.value)}
                      placeholder={modalMeta.valueLabel}
                    />
                  )}
                </div>
                <div className="form-group">
                  <label>
                    {modalMeta.dateLabel}
                    {editModal.field === 'payment' && draftValue === 'unpaid'
                      ? ' (optionnelle)'
                      : ' *'}
                  </label>
                  <input
                    type="date"
                    value={draftDate}
                    disabled={saving || (editModal.field === 'payment' && draftValue === 'unpaid')}
                    onChange={(e) => setDraftDate(e.target.value)}
                    required={!(editModal.field === 'payment' && draftValue === 'unpaid')}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeEditModal} disabled={saving}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void submitEditModal()}
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
