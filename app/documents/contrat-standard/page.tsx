'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  CLASSIFICATION_RULES,
  formatCategoryLine,
  resolveClassification,
  type ContractClassification,
} from '@/lib/convention-collective-rules';
import {
  formatCdfAmount,
  formatUsdAmount,
  usdToWordsPhrase,
} from '@/lib/contrat-standard-money';
import {
  emptyContratForm,
  type ContratDependantRow,
  type ContratStandardFormData,
} from '@/lib/contrat-standard-types';
import { formatMaritalStatusFr, formatPrestationLocation, joinPersonName } from '@/lib/contrat-standard-family';
import { showError, showSuccess } from '@/lib/swal';
import { formatFetchFailure, readResponseError } from '@/lib/http-error';
import type { Employee } from '@/lib/types';

function isHrDepartment(value: string): boolean {
  const d = value.trim().toLowerCase();
  if (!d) return false;
  return (
    d.includes('human resources')
    || d.includes('ressources humaines')
    || d.includes('resource humaine')
    || d === 'rh'
    || d.startsWith('rh ')
    || d.includes(' hr')
    || /\brh\b/.test(d)
  );
}

function isHrManager(e: Employee): boolean {
  if (!isHrDepartment(e.departement || e.departmentHr || '')) return false;
  const title = `${e.jobTitle || ''} ${e.position || ''}`.trim().toLowerCase();
  if (!title) return false;
  return (
    /\bmanager\b/i.test(title)
    || /\bhead of\b/i.test(title)
    || /\bchef\b/i.test(title)
    || /\bdirecteur\b/i.test(title)
    || /\bresponsable\b/i.test(title)
  );
}

function isActiveEmployee(e: Employee): boolean {
  const statut = String(e.statut || '').toLowerCase();
  return !statut || statut === 'active' || statut === 'actif';
}

function toInputDate(display: string): string {
  const raw = (display ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ContratStandardPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState<ContratStandardFormData>(emptyContratForm);
  const [generating, setGenerating] = useState(false);
  const [familyHint, setFamilyHint] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/employees')
      .then((r) => (r.ok ? r.json() : []))
      .then((emps: Employee[]) => setEmployees(Array.isArray(emps) ? emps : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  const hrManagers = useMemo(
    () => employees.filter((e) => isActiveEmployee(e) && isHrManager(e)),
    [employees],
  );

  const cdfPreview = useMemo(() => {
    const usd = Number(form.salaryUsd) || 0;
    const rate = Number(form.exchangeRate) || 0;
    return usd * rate;
  }, [form.salaryUsd, form.exchangeRate]);

  const applyEmployee = async (employee: Employee) => {
    setSelected(employee);
    setQuery(employee.nom);
    setFamilyHint(null);
    const classification = resolveClassification(
      `${employee.grade || ''} ${employee.patersonGrade || ''} ${employee.employeeSubGroup || ''}`,
    );
    const rules = CLASSIFICATION_RULES[classification];
    const categoryCode = (employee.grade || employee.patersonGrade || '').trim()
      || (classification === 'maitrise' ? 'C1' : '');
    const civility: 'Monsieur' | 'Madame' = /^f/i.test(employee.gender || '') ? 'Madame' : 'Monsieur';

    setForm((prev) => ({
      ...prev,
      matricule: employee.matricule,
      employeeName: employee.nom,
      civility,
      nationality: employee.nationality || prev.nationality || 'Congolaise',
      birthDate: toInputDate(employee.dateOfBirth),
      maritalStatus: formatMaritalStatusFr(employee.maritalStatus || prev.maritalStatus, civility),
      cnss: employee.cnss || '',
      identityNumber: employee.nif || prev.identityNumber,
      contractType: /cdi/i.test(employee.typeContrat || '') ? 'CDI' : 'CDD',
      contractDurationLabel:
        employee.dureeContratMois && employee.dureeContratMois > 0
          ? `${employee.dureeContratMois} mois`
          : prev.contractDurationLabel,
      startDate: toInputDate(employee.appointmentDate) || prev.startDate,
      trialMonths: employee.periodeEssaiMois && employee.periodeEssaiMois > 0
        ? employee.periodeEssaiMois
        : rules.trialMonths,
      jobTitle: employee.jobTitle || employee.position || '',
      lineManagerTitle: employee.lineManagerPosition || employee.lineManagerName || '',
      workLocation: employee.localisation || '',
      classification,
      categoryCode,
      leaveDays: rules.annualLeaveDays,
      spouseFullName: '',
      dependants: [
        { fullName: '', birthPlaceDate: '' },
        { fullName: '', birthPlaceDate: '' },
        { fullName: '', birthPlaceDate: '' },
        { fullName: '', birthPlaceDate: '' },
      ],
    }));

    try {
      const res = await fetch(
        `/api/documents/contrat-standard?matricule=${encodeURIComponent(employee.matricule)}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        spouse?: { prenom: string; nom: string; postNom: string } | null;
        children?: Array<{
          prenom: string;
          nom: string;
          postNom: string;
          birthPlaceDate: string;
        }>;
        matchedAs?: 'head' | 'conjoint' | 'enfant' | null;
      };
      const depRows: ContratDependantRow[] = [0, 1, 2, 3].map((i) => {
        const child = json.children?.[i];
        if (!child) return { fullName: '', birthPlaceDate: '' };
        return {
          fullName: joinPersonName(child),
          birthPlaceDate: child.birthPlaceDate || '',
        };
      });
      const spouseName = json.spouse ? joinPersonName(json.spouse) : '';
      const hasFamily = Boolean(spouseName)
        || depRows.some((r) => r.fullName || r.birthPlaceDate);
      setForm((prev) => ({
        ...prev,
        spouseFullName: spouseName,
        dependants: depRows,
      }));
      if (hasFamily) {
        if (json.matchedAs === 'conjoint') {
          setFamilyHint('Situation familiale préremplie : agent trouvé comme conjoint dans la liste des dépendants.');
        } else if (json.matchedAs === 'enfant') {
          setFamilyHint('Situation familiale préremplie : agent trouvé comme enfant dans la liste des dépendants.');
        } else if (json.matchedAs === 'head') {
          setFamilyHint('Situation familiale préremplie depuis la liste des dépendants de cet agent.');
        } else {
          setFamilyHint('Situation familiale préremplie depuis la liste des dépendants.');
        }
      }
    } catch {
      // ignore family autofill errors
    }
  };

  const setClassification = (classification: ContractClassification) => {
    const rules = CLASSIFICATION_RULES[classification];
    setForm((prev) => ({
      ...prev,
      classification,
      trialMonths: rules.trialMonths,
      leaveDays: rules.annualLeaveDays,
      categoryCode: prev.categoryCode || (classification === 'maitrise' ? 'C1' : ''),
    }));
  };

  const updateDep = (index: number, patch: Partial<ContratDependantRow>) => {
    setForm((prev) => {
      const next = [...prev.dependants];
      next[index] = { ...next[index], ...patch };
      return { ...prev, dependants: next };
    });
  };

  const handleGenerate = async () => {
    if (!form.employeeName.trim()) {
      await showError('Sélectionnez un agent');
      return;
    }
    if (!form.address.trim()) {
      await showError('Adresse de l’employé requise (Article 12)');
      return;
    }
    if (!form.salaryUsd || form.salaryUsd <= 0) {
      await showError('Indiquez le salaire en USD');
      return;
    }
    if (!form.signerName.trim()) {
      await showError('Sélectionnez le manager RH signataire');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/documents/contrat-standard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        throw new Error(await readResponseError(res, 'Génération du contrat impossible'));
      }
      const blob = await res.blob();
      const header = res.headers.get('X-File-Name');
      let fileName = `Contrat ${form.contractType} - ${form.employeeName}.docx`;
      if (header) {
        try {
          fileName = decodeURIComponent(header);
        } catch {
          // keep fallback
        }
      }
      triggerDownload(blob, fileName);
      await showSuccess('Contrat généré');
    } catch (err) {
      await showError(formatFetchFailure(err, 'Génération du contrat impossible'));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;
  if (!can('documents.contrat-standard', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  const rules = CLASSIFICATION_RULES[form.classification];

  return (
    <>
      <div className="page-header contrat-standard-header">
        <div>
          <h2>Contrat standard</h2>
          <p>
            Contrat de travail CDD/CDI — identité, famille, classification conventionnelle,
            rémunération USD/CDF et signataire RH.
          </p>
        </div>
        <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
          ← Documents
        </Link>
      </div>

      <div className="panel docs-generator-panel contrat-standard-panel">
        <div className="form-group docs-generator-picker">
          <label>Agent concerné</label>
          <EmployeeSuggestInput
            employees={employees}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (selected && value !== selected.nom) setSelected(null);
            }}
            onEmployeeSelect={(employee) => {
              void applyEmployee(employee);
            }}
            placeholder="Rechercher un agent (nom ou matricule)…"
          />
        </div>

        {selected ? (
          <div className="exit-docs-employee">
            <strong>{selected.nom}</strong>
            <span>
              {selected.matricule} · {selected.jobTitle || selected.position || '—'} ·{' '}
              {selected.departement || '—'}
            </span>
          </div>
        ) : (
          <p className="docs-generator-placeholder">Sélectionnez un agent pour préremplir le contrat.</p>
        )}

        <div className="form-grid form-grid-2 contrat-standard-grid">
          <div className="form-group">
            <label>Civilité</label>
            <select
              value={form.civility}
              onChange={(e) => setForm((p) => ({ ...p, civility: e.target.value as 'Monsieur' | 'Madame' }))}
            >
              <option value="Monsieur">Monsieur</option>
              <option value="Madame">Madame</option>
            </select>
          </div>
          <div className="form-group">
            <label>Nationalité</label>
            <input
              value={form.nationality}
              onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Né(e) le</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>État civil</label>
            <input
              value={form.maritalStatus}
              onChange={(e) => setForm((p) => ({ ...p, maritalStatus: e.target.value }))}
            />
          </div>
          <div className="form-group form-group-full">
            <label>
              Adresse (Article 12 — élection de domicile)
              <span className="contrat-field-hint"> champ obligatoire</span>
            </label>
            <input
              className="contrat-address-input"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Ex. 126, Av Baraka, Q/Mongala, C/Kinshasa"
            />
          </div>
          <div className="form-group">
            <label>Téléphone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>N° CNSS</label>
            <input
              value={form.cnss}
              onChange={(e) => setForm((p) => ({ ...p, cnss: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Numéro d’identité</label>
            <input
              value={form.identityNumber}
              onChange={(e) => setForm((p) => ({ ...p, identityNumber: e.target.value }))}
            />
          </div>
        </div>

        <h3 className="contrat-section-title">Situation familiale</h3>
        {familyHint ? <p className="text-muted contrat-family-hint">{familyHint}</p> : null}
        <div className="form-group">
          <label>Nom complet du conjoint</label>
          <input
            value={form.spouseFullName}
            onChange={(e) => setForm((p) => ({ ...p, spouseFullName: e.target.value }))}
            placeholder="Nom Post-nom Prénom"
          />
        </div>

        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label>Personnes à charge</label>
          <div className="table-wrap">
            <table className="contrat-dependants-table">
              <thead>
                <tr>
                  <th style={{ width: '2.5rem' }}>#</th>
                  <th>Nom complet</th>
                  <th>Date et lieu de naissance</th>
                </tr>
              </thead>
              <tbody>
                {form.dependants.map((row, index) => (
                  <tr key={`dep-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        value={row.fullName}
                        onChange={(e) => updateDep(index, { fullName: e.target.value })}
                        placeholder="Nom Post-nom Prénom"
                      />
                    </td>
                    <td>
                      <input
                        value={row.birthPlaceDate}
                        onChange={(e) => updateDep(index, { birthPlaceDate: e.target.value })}
                        placeholder="Kinshasa — 04/08/2025"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="contrat-section-title">Article 1 — Durée & essai</h3>
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>Type de contrat</label>
            <select
              value={form.contractType}
              onChange={(e) => setForm((p) => ({
                ...p,
                contractType: e.target.value === 'CDI' ? 'CDI' : 'CDD',
              }))}
            >
              <option value="CDD">CDD — durée déterminée</option>
              <option value="CDI">CDI — durée indéterminée</option>
            </select>
          </div>
          {form.contractType === 'CDD' ? (
            <div className="form-group">
              <label>Durée (libellé)</label>
              <input
                value={form.contractDurationLabel}
                onChange={(e) => setForm((p) => ({ ...p, contractDurationLabel: e.target.value }))}
                placeholder="1 an renouvelable"
              />
            </div>
          ) : null}
          <div className="form-group">
            <label>Date de début</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Période d’essai (mois)</label>
            <input
              type="number"
              min={1}
              max={12}
              value={form.trialMonths}
              onChange={(e) => setForm((p) => ({ ...p, trialMonths: Number(e.target.value) || 1 }))}
            />
          </div>
          <div className="form-group">
            <label>Date du document</label>
            <input
              type="date"
              value={form.documentDate}
              onChange={(e) => setForm((p) => ({ ...p, documentDate: e.target.value }))}
            />
          </div>
        </div>

        <h3 className="contrat-section-title">Article 2 — Poste & classification</h3>
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>Poste / qualité</label>
            <input
              value={form.jobTitle}
              onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Supérieur hiérarchique</label>
            <input
              value={form.lineManagerTitle}
              onChange={(e) => setForm((p) => ({ ...p, lineManagerTitle: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Lieu de prestations</label>
            <input
              value={form.workLocation}
              onChange={(e) => setForm((p) => ({ ...p, workLocation: e.target.value }))}
              placeholder="Zamba, Kinshasa…"
            />
            {/^zamba$/i.test(form.workLocation.trim()) ? (
              <p className="text-muted contrat-rules-hint" style={{ marginTop: '0.35rem' }}>
                Dans le contrat : « Le lieu des prestations est fixé à{' '}
                {formatPrestationLocation(form.workLocation)} ».
              </p>
            ) : null}
          </div>
          <div className="form-group">
            <label>Classification (convention)</label>
            <select
              value={form.classification}
              onChange={(e) => setClassification(e.target.value as ContractClassification)}
            >
              <option value="classifie">Classifié — essai 3 mois, congé 20 j, préavis 14 j +7</option>
              <option value="maitrise">Maîtrise — essai 5 mois, congé 22 j, préavis 1 mois +9</option>
              <option value="cadre">Cadre — essai 6 mois, congé 24 j, préavis 3 mois +16</option>
            </select>
          </div>
          <div className="form-group">
            <label>Code catégorie</label>
            <input
              value={form.categoryCode}
              onChange={(e) => setForm((p) => ({ ...p, categoryCode: e.target.value }))}
              placeholder="C1"
            />
          </div>
          <div className="form-group">
            <label>Congé annuel (jours ouvrables)</label>
            <input
              type="number"
              min={1}
              value={form.leaveDays}
              onChange={(e) => setForm((p) => ({ ...p, leaveDays: Number(e.target.value) || 1 }))}
            />
          </div>
        </div>
        <p className="text-muted contrat-rules-hint">
          Catégorie affichée : <strong>{formatCategoryLine(form.classification, form.categoryCode)}</strong>
          {' · '}
          Préavis : {rules.noticeBaseLabel}, +{rules.noticeIncreaseDaysPerYear} j / an de service.
        </p>

        <h3 className="contrat-section-title">Article 3 — Rémunération</h3>
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>Salaire net mensuel (USD)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.salaryUsd || ''}
              onChange={(e) => setForm((p) => ({ ...p, salaryUsd: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="form-group">
            <label>Taux de change (CDF pour 1 USD)</label>
            <input
              type="number"
              min={1}
              step={0.1}
              value={form.exchangeRate || ''}
              onChange={(e) => setForm((p) => ({ ...p, exchangeRate: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
        <p className="contrat-salary-preview">
          {form.salaryUsd > 0 ? (
            <>
              <strong>{formatCdfAmount(cdfPreview)} CDF</strong>
              {' / équivalent USD '}
              <strong>{formatUsdAmount(form.salaryUsd)}</strong>
              {' ('}
              {usdToWordsPhrase(form.salaryUsd)}
              )
            </>
          ) : (
            <span className="text-muted">Saisissez le salaire USD pour voir l’équivalent CDF.</span>
          )}
        </p>

        <h3 className="contrat-section-title">Signature employeur (RH)</h3>
        <div className="form-group">
          <label>Manager RH signataire</label>
          <select
            value={form.signerMatricule}
            onChange={(e) => {
              const mat = e.target.value;
              const mgr = hrManagers.find((m) => m.matricule === mat);
              setForm((p) => ({
                ...p,
                signerMatricule: mat,
                signerName: mgr?.nom || '',
                signerTitle: mgr?.jobTitle || mgr?.position || 'Plant HR Manager',
              }));
            }}
          >
            <option value="">— Sélectionner —</option>
            {hrManagers.map((m) => (
              <option key={m.matricule} value={m.matricule}>
                {m.nom} — {m.jobTitle || m.position || 'RH'}
              </option>
            ))}
          </select>
        </div>
        {form.signerName ? (
          <p className="text-muted">
            Signataire : <strong>{form.signerName}</strong>
            {form.signerTitle ? ` (${form.signerTitle})` : ''}
          </p>
        ) : null}

        {can('documents.contrat-standard', 'create') ? (
          <div className="exit-docs-actions" style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleGenerate()}
              disabled={generating || !selected}
            >
              {generating ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Génération…
                </>
              ) : (
                'Générer le contrat'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
