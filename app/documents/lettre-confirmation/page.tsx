'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  buildConfirmationParagraphParts,
  confirmationCityFromLocalisation,
  confirmationCompanyNames,
  formatLetterEffectDate,
  parseIsoOrDisplayDate,
  todayIsoDate,
  toIsoDateLocal,
  wholeMonthsBetween,
} from '@/lib/confirmation-letter';
import { localizeJobTitle } from '@/lib/bilingual-title';
import { resolveDateFinPeriodeEssai } from '@/lib/employees-trial';
import { formatAttestationAgentName, formatAttestationNom } from '@/lib/format-display-name';
import { civilityFromGender, formatLetterName } from '@/lib/reponse-demission';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

function signatoryTitleFromEmployee(employee: Employee): string {
  return localizeJobTitle(employee.jobTitle || employee.position || '', 'fr');
}

function findDefaultSignatory(employees: Employee[]): Employee | null {
  const match = employees.find((item) => {
    const blob = `${item.nom} ${item.jobTitle} ${item.position}`.toLowerCase();
    return /ewuli/.test(blob) || /directrice des ressources humaines/.test(blob);
  });
  return match || null;
}

function displayToIso(value: string): string {
  const parsed = parseIsoOrDisplayDate(value);
  return parsed ? toIsoDateLocal(parsed) : todayIsoDate();
}

function displayToIsoOrEmpty(value: string): string {
  const parsed = parseIsoOrDisplayDate(value);
  return parsed ? toIsoDateLocal(parsed) : '';
}

function fileNameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get('X-File-Name');
  if (!header) return fallback;
  try {
    return decodeURIComponent(header);
  } catch {
    return fallback;
  }
}

function ConfirmationLetterPageInner() {
  const { can, isLoading } = usePermissions();
  const searchParams = useSearchParams();
  const prefillMatricule = searchParams.get('matricule')?.trim() || '';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [generating, setGenerating] = useState(false);
  const [letterDate, setLetterDate] = useState(todayIsoDate());
  const [confirmationDate, setConfirmationDate] = useState(todayIsoDate());
  const [trialStartDate, setTrialStartDate] = useState('');
  const [trialMonths, setTrialMonths] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyShort, setCompanyShort] = useState('PPC Barnet DRC');
  const [companyLegal, setCompanyLegal] = useState('PPC Barnet DRC Manufacturing S.A');
  const [city, setCity] = useState('Kinshasa');
  const [signatoryQuery, setSignatoryQuery] = useState('');
  const [signatory, setSignatory] = useState<Employee | null>(null);
  const [signatoryTitle, setSignatoryTitle] = useState('');

  useEffect(() => {
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(Array.isArray(json) ? json : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!prefillMatricule || !employees.length || selected) return;
    const match = employees.find((item) => item.matricule === prefillMatricule);
    if (!match) return;
    applyEmployee(match);
  }, [prefillMatricule, employees, selected]);

  useEffect(() => {
    if (signatory || !employees.length) return;
    const fallback = findDefaultSignatory(employees);
    if (!fallback) return;
    setSignatory(fallback);
    setSignatoryQuery(fallback.nom);
    setSignatoryTitle(signatoryTitleFromEmployee(fallback));
  }, [employees, signatory]);

  const applyEmployee = (employee: Employee) => {
    const companies = confirmationCompanyNames(employee.company || '');
    setSelected(employee);
    setQuery(employee.nom);
    setJobTitle(employee.jobTitle || employee.position || '');
    setCompanyShort(companies.short);
    setCompanyLegal(companies.legal);
    setCity(confirmationCityFromLocalisation(employee.localisation || ''));
    setConfirmationDate(displayToIso(resolveDateFinPeriodeEssai(employee)));
    setTrialStartDate(displayToIsoOrEmpty(employee.appointmentDate || ''));
    setTrialMonths(
      employee.periodeEssaiMois != null && employee.periodeEssaiMois > 0
        ? String(employee.periodeEssaiMois)
        : '',
    );
    setLetterDate(todayIsoDate());
  };

  const displayName = useMemo(
    () => (selected ? formatLetterName(selected.nom) || selected.nom : ''),
    [selected],
  );

  const paragraphPreview = useMemo(() => {
    if (!selected) return [];
    const typedMonths = Number(trialMonths.replace(',', '.'));
    const months =
      Number.isFinite(typedMonths) && typedMonths > 0
        ? typedMonths
        : wholeMonthsBetween(
            parseIsoOrDisplayDate(trialStartDate),
            parseIsoOrDisplayDate(confirmationDate),
          );
    const start = parseIsoOrDisplayDate(trialStartDate);
    const effect = parseIsoOrDisplayDate(confirmationDate);
    return buildConfirmationParagraphParts({
      trialMonths: months,
      trialStartLabel: start ? formatLetterEffectDate(start) : '',
      jobTitle,
      companyLegal,
      effectLabel: effect ? formatLetterEffectDate(effect) : '',
    });
  }, [selected, trialMonths, trialStartDate, confirmationDate, jobTitle, companyLegal]);

  const handleGenerate = async () => {
    if (!selected) return;
    if (!signatory || !signatoryTitle.trim()) {
      await showError('Sélectionnez le signataire dans la liste des employés.');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/documents/confirmation-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: selected.matricule,
          employeeName: displayName,
          familyName: formatAttestationNom(selected.nom),
          civility: civilityFromGender(selected.gender || ''),
          jobTitle,
          companyShort,
          companyLegal,
          city,
          letterDate,
          confirmationDate,
          trialStartDate,
          trialMonths: trialMonths.trim() ? Number(trialMonths.replace(',', '.')) : null,
          signatoryName: signatory ? formatAttestationAgentName(signatory.nom) || signatory.nom : '',
          signatoryTitle,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || 'Génération impossible');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileNameFromResponse(res, `Lettre de confirmation - ${selected.nom}.docx`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Génération impossible');
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.confirmation-letter', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  const canCreate = can('documents.confirmation-letter', 'create');

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Lettre de confirmation</h2>
          <p>
            Confirmation de période d’essai — durée, dates, fonction et société sont
            préremplies depuis la fiche agent.
          </p>
        </div>
        <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
          ← Documents
        </Link>
      </div>

      <div className="panel docs-generator-panel">
        <div className="form-group docs-generator-picker">
          <label>Agent concerné</label>
          <EmployeeSuggestInput
            employees={employees}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (selected && value !== selected.nom) setSelected(null);
            }}
            onEmployeeSelect={(employee) => applyEmployee(employee)}
            placeholder="Rechercher un agent (nom ou matricule)…"
          />
        </div>

        {selected ? (
          <>
            <div className="exit-docs-employee">
              <strong>{displayName}</strong>
              <span>
                {selected.matricule} · {jobTitle || '—'} · {selected.departement || '—'}
              </span>
            </div>
            <div className="docs-generator-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="form-group">
                <label>Date de la lettre</label>
                <input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Début de la période d’essai</label>
                <input
                  type="date"
                  value={trialStartDate}
                  onChange={(e) => setTrialStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Durée d’essai (mois)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={trialMonths}
                  onChange={(e) => setTrialMonths(e.target.value)}
                  placeholder="Depuis la fiche agent"
                />
              </div>
              <div className="form-group">
                <label>Date d’effet / fin d’essai</label>
                <input
                  type="date"
                  value={confirmationDate}
                  onChange={(e) => setConfirmationDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Fonction</label>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Ville</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Société (en-tête)</label>
                <input value={companyShort} onChange={(e) => setCompanyShort(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Société (corps)</label>
                <input value={companyLegal} onChange={(e) => setCompanyLegal(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Signataire</label>
                <EmployeeSuggestInput
                  employees={employees}
                  value={signatoryQuery}
                  onChange={(value) => {
                    setSignatoryQuery(value);
                    if (signatory && value !== signatory.nom) {
                      setSignatory(null);
                      setSignatoryTitle('');
                    }
                  }}
                  onEmployeeSelect={(employee) => {
                    setSignatory(employee);
                    setSignatoryQuery(employee.nom);
                    setSignatoryTitle(signatoryTitleFromEmployee(employee));
                  }}
                  placeholder="Rechercher le signataire…"
                />
              </div>
              <div className="form-group">
                <label>Titre du signataire</label>
                <input
                  value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)}
                  placeholder="Rempli depuis la fiche agent"
                />
              </div>
            </div>
            <p className="text-muted" style={{ marginTop: 12 }}>
              {paragraphPreview.map((part, index) => (
                part.bold
                  ? <strong key={index}>{part.text}</strong>
                  : <span key={index}>{part.text}</span>
              ))}
            </p>
            {canCreate ? (
              <div className="exit-docs-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleGenerate()}
                  disabled={generating || !signatory}
                >
                  {generating ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Génération…
                    </>
                  ) : (
                    'Générer la lettre'
                  )}
                </button>
              </div>
            ) : (
              <p className="text-muted">Vous n’avez pas la permission de générer ce document.</p>
            )}
          </>
        ) : (
          <p className="text-muted">Sélectionnez un agent pour préremplir la lettre.</p>
        )}
      </div>
    </>
  );
}

export default function ConfirmationLetterPage() {
  return (
    <Suspense fallback={<div className="loading">Chargement...</div>}>
      <ConfirmationLetterPageInner />
    </Suspense>
  );
}
