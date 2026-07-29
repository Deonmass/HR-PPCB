'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EmployeePicker, { EmployeeSuggestInput, type EmployeeSelection } from '@/components/EmployeePicker';
import SaveButton from '@/components/SaveButton';
import TravelAllowanceRatesModal from '@/components/travel/TravelAllowanceRatesModal';
import TravelDocumentSelectModal from '@/components/travel/TravelDocumentSelectModal';
import TravelGenerationModal, { type GenerationStep } from '@/components/TravelGenerationModal';
import { usePermissions } from '@/contexts/PermissionContext';
import { resolveAllowanceCategory } from '@/lib/travel-allowance-rates';
import {
  TRAVEL_COMPANY_OPTIONS,
  computeBudgetLineTotal,
  computeTripDays,
  createDefaultBudgetLines,
  emptyBudgetLine,
  emptyFlightBookingFields,
  MAX_BUDGET_LINES,
  todayInputDate,
  type TravelFormFields,
  type TripBudgetLine,
} from '@/lib/travel-form';
import {
  formatAirportOption,
  SEAT_PREFERENCE_OPTIONS,
  TRAVEL_AIRLINE_LABELS,
  TRAVEL_AIRPORTS,
} from '@/lib/travel-flight-data';
import { showError } from '@/lib/swal';
import { readTravelGenerationStream } from '@/lib/travel-generation-stream';
import type { CashRequestRecord, TravelFileType } from '@/lib/travel-types';
import type { CostCenterSetting, DepartmentSetting } from '@/lib/auth-types';
import {
  folderSelectionErrorMessage,
  isFullWindowsPath,
  isValidSaveDirectorySelection,
} from '@/lib/browser-folder-save';
import type { Employee } from '@/lib/types';

const FOLDER_PICKER_PLACEHOLDER = 'Cliquez pour parcourir et sélectionner un dossier';

const BASE_GENERATION_STEPS: GenerationStep[] = [
  { id: 'cash-request', label: 'Cash Request' },
  { id: 'trip-budget', label: 'TRIP BUDGET FORM' },
  { id: 'travel-authorization', label: 'Formulaire autorisation de voyage' },
  { id: 'hotel-booking', label: 'Hotel booking form' },
  { id: 'flight-booking', label: 'FLIGHT BOOKING FORM' },
  { id: 'mission-order', label: 'Ordre de mission' },
  { id: 'travel-pdf', label: 'PDF combiné' },
];

function buildGenerationSteps(isInternational: boolean): GenerationStep[] {
  return BASE_GENERATION_STEPS.filter(
    (step) => step.id !== 'flight-booking' || isInternational,
  );
}

function createInitialTravelForm(): TravelFormFields {
  return {
    position: '',
    department: '',
    tripPurpose: '',
    costCenter: '',
    documentDate: '',
    departureDate: '',
    departurePlace: '',
    destinationPlace: '',
    returnDate: '',
    peopleCount: 1,
    companyName: TRAVEL_COMPANY_OPTIONS[0],
    departmentToWorkWith: '',
    contactPerson: '',
    transportMeans: '',
    paymentOrderSignatory: '',
    budgetLines: createDefaultBudgetLines(),
    isInternationalTravel: false,
    flightBooking: emptyFlightBookingFields(),
  };
}

export default function EtablirTravelForm() {
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const editRef = searchParams.get('ref')?.trim() ?? '';
  const canSubmit = editRef ? can('travel.etablir', 'edit') : can('travel.etablir', 'create');
  const editLoadedRef = useRef(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employee, setEmployee] = useState<EmployeeSelection | null>(null);
  const [travel, setTravel] = useState<TravelFormFields>(createInitialTravelForm);
  const [saveDirectory, setSaveDirectory] = useState('');

  const [genOpen, setGenOpen] = useState(false);
  const [genComplete, setGenComplete] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<number[]>([]);
  const [genActiveStep, setGenActiveStep] = useState(0);
  const [genResult, setGenResult] = useState<CashRequestRecord | null>(null);
  const [selectDocsOpen, setSelectDocsOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [allowanceModalOpen, setAllowanceModalOpen] = useState(false);
  const [missionRef, setMissionRef] = useState('');
  const [settingsDepartments, setSettingsDepartments] = useState<DepartmentSetting[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterSetting[]>([]);
  const stepTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const folderPickerBusyRef = useRef(false);

  const generationSteps = useMemo(
    () => buildGenerationSteps(Boolean(travel.isInternationalTravel)),
    [travel.isInternationalTravel],
  );
  const activeGenerationSteps = useMemo(() => {
    if (!selectedDocIds.length) return generationSteps;
    return generationSteps.filter((step) => selectedDocIds.includes(step.id));
  }, [generationSteps, selectedDocIds]);

  /** Employé issu de la base (suggestion) vs saisie libre. */
  const isKnownEmployee = Boolean(employee?.matricule);

  const paramDepartmentNames = useMemo(
    () => settingsDepartments.map((item) => item.name).filter(Boolean),
    [settingsDepartments],
  );
  const availableCostCenters = useMemo(() => {
    const activeCenters = costCenters.filter((item) => item.active !== false);
    if (!travel.department) return activeCenters;
    const departmentId = settingsDepartments.find((item) => item.name === travel.department)?.id;
    if (!departmentId) return activeCenters;
    return activeCenters.filter(
      (item) => !item.departmentId || item.departmentId === departmentId,
    );
  }, [costCenters, settingsDepartments, travel.department]);
  const tripDays = useMemo(
    () => computeTripDays(travel.departureDate, travel.returnDate),
    [travel.departureDate, travel.returnDate],
  );
  const budgetTotal = useMemo(
    () =>
      travel.budgetLines.reduce((sum, line) => {
        const lineTotal = computeBudgetLineTotal(line.amount, travel.peopleCount, tripDays);
        return sum + (lineTotal || 0);
      }, 0),
    [travel.budgetLines, travel.peopleCount, tripDays],
  );

  const patchTravel = (patch: Partial<TravelFormFields>) => {
    setTravel((prev) => ({ ...prev, ...patch }));
  };

  const handleEmployeeChange = (selection: EmployeeSelection | null) => {
    setEmployee(selection);
    if (!selection) {
      setTravel((prev) => ({
        ...prev,
        department: '',
        position: '',
      }));
      return;
    }

    // Saisie libre (hors suggestions) : position / département éditables.
    if (!selection.matricule) {
      setTravel((prev) => ({
        ...prev,
        department: selection.departement || prev.department,
        position: prev.position,
      }));
      return;
    }

    const full = employees.find((item) => item.matricule === selection.matricule);
    const position = full?.jobTitle?.trim() || '';
    const category = resolveAllowanceCategory({
      jobTitle: full?.jobTitle,
      grade: full?.grade,
      position,
    });
    setTravel((prev) => ({
      ...prev,
      department: selection.departement,
      position: position || prev.position,
      budgetLines: createDefaultBudgetLines(category),
      flightBooking: {
        ...(prev.flightBooking ?? emptyFlightBookingFields()),
        passportFullName: prev.flightBooking?.passportFullName || selection.nom,
      },
    }));
  };

  const loadMissionRef = useCallback(async () => {
    try {
      const res = await fetch('/api/travel/mission-ref');
      const json = (await res.json()) as { ref?: string };
      if (res.ok && json.ref) setMissionRef(json.ref);
    } catch {
      setMissionRef('');
    }
  }, []);

  const loadSettingsParams = useCallback(async () => {
    try {
      const [deptRes, centersRes] = await Promise.all([
        fetch('/api/settings/departments'),
        fetch('/api/settings/cost-centers'),
      ]);
      const deptJson = (await deptRes.json()) as DepartmentSetting[];
      const centersJson = (await centersRes.json()) as CostCenterSetting[];
      setSettingsDepartments(Array.isArray(deptJson) ? deptJson : []);
      setCostCenters(Array.isArray(centersJson) ? centersJson : []);
    } catch {
      setSettingsDepartments([]);
      setCostCenters([]);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      const data = (await res.json()) as Employee[];
      setEmployees(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTravel((prev) => ({
      ...prev,
      documentDate: prev.documentDate || todayInputDate(),
    }));
    loadEmployees();
    loadSettingsParams();
    if (!editRef) loadMissionRef();
  }, [loadEmployees, loadMissionRef, loadSettingsParams, editRef]);

  useEffect(() => {
    if (!editRef || editLoadedRef.current || loading) return;
    editLoadedRef.current = true;

    void (async () => {
      try {
        const res = await fetch(
          `/api/travel/cash-requests/by-ref/${encodeURIComponent(editRef)}`,
        );
        const json = (await res.json()) as CashRequestRecord & { error?: string };
        if (!res.ok) {
          await showError(json.error || 'Mission introuvable');
          return;
        }

        setEmployee({
          matricule: json.employeeMatricule,
          nom: json.employeeName,
          departement: json.employeeDepartment,
        });

        if (json.travel) {
          setTravel({
            ...createInitialTravelForm(),
            ...json.travel,
            budgetLines: json.travel.budgetLines?.length
              ? json.travel.budgetLines
              : createDefaultBudgetLines(),
            flightBooking: json.travel.flightBooking ?? emptyFlightBookingFields(),
          });
        }

        if (json.saveDirectory) setSaveDirectory(json.saveDirectory);
        if (json.missionRef) setMissionRef(json.missionRef);
      } catch {
        await showError('Impossible de charger la mission');
      }
    })();
  }, [editRef, loading]);

  useEffect(() => {
    return () => {
      stepTimersRef.current.forEach((timer) => clearInterval(timer));
      stepTimersRef.current.clear();
    };
  }, []);

  const stopAllStepProgress = () => {
    stepTimersRef.current.forEach((timer) => clearInterval(timer));
    stepTimersRef.current.clear();
  };

  const startStepProgress = (stepIndex: number) => {
    if (stepIndex < 0 || stepTimersRef.current.has(stepIndex)) return;

    const timer = setInterval(() => {
      setGenProgress((prev) => {
        const next = [...prev];
        const current = next[stepIndex] ?? 0;
        if (current >= 92) return prev;
        next[stepIndex] = Math.min(current + 2, 92);
        return next;
      });
      setGenActiveStep(stepIndex);
    }, 80);

    stepTimersRef.current.set(stepIndex, timer);
  };

  const completeStepProgress = (stepIndex: number) => {
    const timer = stepTimersRef.current.get(stepIndex);
    if (timer) {
      clearInterval(timer);
      stepTimersRef.current.delete(stepIndex);
    }

    setGenProgress((prev) => {
      const next = [...prev];
      next[stepIndex] = 100;
      return next;
    });
  };

  const findStepIndex = (stepId: string, steps: GenerationStep[]) =>
    steps.findIndex((step) => step.id === stepId);

  const updateBudgetLine = (index: number, patch: Partial<TripBudgetLine>) => {
    setTravel((prev) => ({
      ...prev,
      budgetLines: prev.budgetLines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const addBudgetLine = () => {
    if (travel.budgetLines.length >= MAX_BUDGET_LINES) return;
    setTravel((prev) => ({
      ...prev,
      budgetLines: [...prev.budgetLines, emptyBudgetLine()],
    }));
  };

  const removeBudgetLine = (index: number) => {
    if (travel.budgetLines.length <= 1) return;
    setTravel((prev) => ({
      ...prev,
      budgetLines: prev.budgetLines.filter((_, i) => i !== index),
    }));
  };

  const stopProgressAnimation = () => {
    stopAllStepProgress();
  };

  const startProgressAnimation = (stepCount: number) => {
    stopAllStepProgress();
    setGenProgress(Array.from({ length: stepCount }, () => 0));
    setGenActiveStep(0);
  };

  const patchFlightBooking = (patch: Partial<NonNullable<TravelFormFields['flightBooking']>>) => {
    setTravel((prev) => ({
      ...prev,
      flightBooking: { ...(prev.flightBooking ?? emptyFlightBookingFields()), ...patch },
    }));
  };

  const applyFolderPath = (serverPath: string) => {
    if (!isFullWindowsPath(serverPath)) return;
    setSaveDirectory(serverPath);
  };

  const openFolderPicker = async () => {
    if (saving || folderPickerBusyRef.current) return;
    folderPickerBusyRef.current = true;

    try {
      const res = await fetch('/api/travel/pick-save-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPath: saveDirectory || undefined }),
      });

      if (res.status === 204) return;

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        await showError(json.error || 'Impossible de sélectionner le dossier');
        return;
      }

      const json = (await res.json()) as { path?: string };
      if (json.path) {
        applyFolderPath(json.path);
      }
    } catch {
      await showError('Impossible de sélectionner le dossier');
    } finally {
      folderPickerBusyRef.current = false;
    }
  };

  const openSavedFileLocation = async () => {
    const directory = genResult?.saveDirectory?.trim();
    if (!directory) return;

    const res = await fetch('/api/travel/open-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath: directory }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      await showError(json.error || 'Impossible d\'ouvrir l\'emplacement');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!employee?.nom.trim()) {
      await showError('Sélectionnez ou saisissez un employé');
      return;
    }

    if (!isKnownEmployee) {
      if (!travel.position.trim()) {
        await showError('Renseignez la position');
        return;
      }
      if (!travel.department.trim()) {
        await showError('Renseignez le département');
        return;
      }
    }

    if (!travel.costCenter.trim()) {
      await showError('Renseignez le centre de coût');
      return;
    }

    if (!travel.transportMeans.trim()) {
      await showError('Renseignez le moyen de transport');
      return;
    }

    if (!isValidSaveDirectorySelection(saveDirectory)) {
      await showError(
        folderSelectionErrorMessage(saveDirectory) ?? "Sélectionnez un dossier d'enregistrement",
      );
      return;
    }

    if (travel.isInternationalTravel) {
      const flight = travel.flightBooking ?? emptyFlightBookingFields();
      if (!flight.passportFullName.trim()) {
        await showError('Renseignez le nom complet tel qu\'inscrit sur le passeport');
        return;
      }
      if (!flight.nearestAirport.trim()) {
        await showError('Renseignez l\'aéroport le plus proche');
        return;
      }
      if (!flight.carrier.trim()) {
        await showError('Renseignez la compagnie aérienne');
        return;
      }
    }

    setSelectDocsOpen(true);
  };

  const runGeneration = async (docIds: string[]) => {
    if (!employee) return;

    const hasServerPath = isFullWindowsPath(saveDirectory);
    const steps = generationSteps.filter((step) => docIds.includes(step.id));
    if (!steps.length) {
      await showError('Sélectionnez au moins un fichier à générer');
      return;
    }

    const contentIds = docIds.filter((id) => id !== 'travel-pdf');
    if (docIds.includes('travel-pdf') && contentIds.length === 0) {
      await showError('Le PDF combiné nécessite au moins un autre document');
      return;
    }

    setSelectDocsOpen(false);
    setSelectedDocIds(docIds);
    setSaving(true);
    setGenOpen(true);
    setGenComplete(false);
    setGenError(null);
    setGenResult(null);
    startProgressAnimation(steps.length);

    try {
      const res = await fetch('/api/travel/cash-requests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeMatricule: employee.matricule,
          employeeName: employee.nom,
          employeeDepartment: travel.department || employee.departement,
          travel,
          saveDirectory: hasServerPath ? saveDirectory.trim() : undefined,
          selectedDocuments: docIds as TravelFileType[],
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        stopProgressAnimation();
        setGenError(json.error || 'Erreur lors de la génération');
        setGenProgress(Array.from({ length: steps.length }, () => 0));
        await showError(json.error || 'Erreur lors de la génération');
        return;
      }

      let generatedRecord: CashRequestRecord | undefined;
      let streamError: string | null = null;

      await readTravelGenerationStream(res, (event) => {
        if (event.type === 'step-start') {
          const stepIndex = findStepIndex(event.stepId, steps);
          if (stepIndex >= 0) startStepProgress(stepIndex);
          return;
        }

        if (event.type === 'step-complete') {
          const stepIndex = findStepIndex(event.stepId, steps);
          if (stepIndex >= 0) completeStepProgress(stepIndex);
          return;
        }

        if (event.type === 'error') {
          streamError = event.message;
          return;
        }

        if (event.type === 'done') {
          generatedRecord = event.record;
        }
      });

      stopProgressAnimation();

      if (streamError) {
        setGenError(streamError);
        setGenProgress(Array.from({ length: steps.length }, () => 0));
        await showError(streamError);
        return;
      }

      if (!generatedRecord) {
        setGenError('Erreur lors de la génération');
        setGenProgress(Array.from({ length: steps.length }, () => 0));
        await showError('Erreur lors de la génération');
        return;
      }

      const resolvedDirectory = hasServerPath
        ? saveDirectory.trim()
        : generatedRecord.saveDirectory ?? saveDirectory.trim();

      setGenProgress(Array.from({ length: steps.length }, () => 100));
      setGenActiveStep(steps.length - 1);
      setGenComplete(true);
      setGenResult({
        ...generatedRecord,
        saveDirectory: resolvedDirectory,
      });
      void loadMissionRef();
    } catch {
      stopProgressAnimation();
      setGenError('Erreur réseau');
      setGenProgress([]);
      await showError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  const closeGenerationModal = () => {
    setGenOpen(false);
    setGenComplete(false);
    setGenError(null);
    setGenResult(null);
    setGenProgress([]);
  };

  const airportSuggestions = useMemo(
    () => TRAVEL_AIRPORTS.map(formatAirportOption),
    [],
  );
  const airlineSuggestions = TRAVEL_AIRLINE_LABELS;

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <div className="cash-request-page">
      <div className="cash-request-sticky">
        <div className="page-header">
          <div>
            <h2>{missionRef || 'Cash request — Documents de voyage'}</h2>
            <p>
              {missionRef
                ? 'Ordre de mission · Informations voyage et génération des fichiers'
                : 'Informations voyage et génération des fichiers'}
            </p>
          </div>
        </div>
      </div>

      <div className="panel cash-request-panel">
        <form onSubmit={handleSubmit}>
          <div className="travel-form-grid-3">
            <div className="travel-form-col">
              <h4 className="travel-form-col-title">Identité</h4>
              <div className="form-group">
                <label htmlFor="employee">Nom employé</label>
                <EmployeePicker
                  employees={employees}
                  value={employee}
                  onChange={handleEmployeeChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="position">Position</label>
                <input
                  id="position"
                  disabled={isKnownEmployee}
                  required={!isKnownEmployee}
                  value={travel.position}
                  onChange={(e) => patchTravel({ position: e.target.value })}
                  placeholder={isKnownEmployee ? 'Rempli automatiquement' : 'Saisir la position'}
                />
              </div>
              <div className="form-group">
                <label htmlFor="department">Département</label>
                {isKnownEmployee ? (
                  <input
                    id="department"
                    disabled
                    required
                    value={travel.department}
                    placeholder="Rempli automatiquement"
                  />
                ) : (
                  <input
                    id="department"
                    required
                    list="travel-department-suggestions"
                    value={travel.department}
                    onChange={(e) => patchTravel({ department: e.target.value })}
                    placeholder="Saisir ou choisir un département"
                    autoComplete="off"
                  />
                )}
              </div>
              <div className="form-group">
                <label htmlFor="costCenter">Centre de coût</label>
                <input
                  id="costCenter"
                  required
                  list="travel-cost-center-suggestions"
                  value={travel.costCenter}
                  onChange={(e) => patchTravel({ costCenter: e.target.value })}
                  placeholder="Saisir ou filtrer un centre de coût"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label htmlFor="companyName">Company name</label>
                <select
                  id="companyName"
                  required
                  value={travel.companyName}
                  onChange={(e) => patchTravel({ companyName: e.target.value as TravelFormFields['companyName'] })}
                >
                  {TRAVEL_COMPANY_OPTIONS.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="travel-form-col">
              <h4 className="travel-form-col-title">Voyage</h4>
              <div className="form-group">
                <label htmlFor="tripPurpose">Trip purpose</label>
                <input
                  id="tripPurpose"
                  required
                  value={travel.tripPurpose}
                  onChange={(e) => patchTravel({ tripPurpose: e.target.value })}
                  placeholder="Objet du déplacement"
                />
              </div>
              <div className="form-group">
                <label htmlFor="documentDate">Date document</label>
                <input
                  id="documentDate"
                  type="date"
                  required
                  value={travel.documentDate}
                  onChange={(e) => patchTravel({ documentDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="departureDate">Departure date</label>
                <input
                  id="departureDate"
                  type="date"
                  required
                  value={travel.departureDate}
                  onChange={(e) => patchTravel({ departureDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="returnDate">Return date</label>
                <input
                  id="returnDate"
                  type="date"
                  required
                  value={travel.returnDate}
                  onChange={(e) => patchTravel({ returnDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="peopleCount">Nombre de personnes</label>
                <input
                  id="peopleCount"
                  type="number"
                  min="1"
                  step="1"
                  value={travel.peopleCount}
                  onChange={(e) => patchTravel({ peopleCount: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="travel-form-col">
              <h4 className="travel-form-col-title">Destination & contacts</h4>
              <div className="form-group">
                <label htmlFor="departurePlace">Departure place</label>
                <input
                  id="departurePlace"
                  value={travel.departurePlace}
                  onChange={(e) => patchTravel({ departurePlace: e.target.value })}
                  placeholder="Lieu de départ"
                />
              </div>
              <div className="form-group">
                <label htmlFor="destinationPlace">Destination place</label>
                <input
                  id="destinationPlace"
                  value={travel.destinationPlace}
                  onChange={(e) => patchTravel({ destinationPlace: e.target.value })}
                  placeholder="Destination"
                />
              </div>
              <div className="form-group">
                <label htmlFor="departmentToWorkWith">Department to work with</label>
                <select
                  id="departmentToWorkWith"
                  value={travel.departmentToWorkWith}
                  onChange={(e) => patchTravel({ departmentToWorkWith: e.target.value })}
                >
                  <option value="">Sélectionner un département</option>
                  {paramDepartmentNames.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="contactPerson">Contact person to work with</label>
                <EmployeeSuggestInput
                  employees={employees}
                  value={travel.contactPerson}
                  onChange={(value) => patchTravel({ contactPerson: value })}
                  placeholder="Rechercher ou saisir un contact"
                />
              </div>
              <div className="form-group">
                <label htmlFor="transportMeans">Moyen de transport</label>
                <input
                  id="transportMeans"
                  list="transport-options"
                  required
                  value={travel.transportMeans}
                  onChange={(e) => patchTravel({ transportMeans: e.target.value })}
                  placeholder="Avion, voiture…"
                />
              </div>
            </div>
          </div>

          <div className="travel-signatory-save-row">
            <div className="form-group">
              <label htmlFor="paymentOrderSignatory">Signataire de l&apos;ordre de paiement</label>
              <EmployeeSuggestInput
                id="paymentOrderSignatory"
                employees={employees}
                value={travel.paymentOrderSignatory}
                onChange={(value) => patchTravel({ paymentOrderSignatory: value })}
                placeholder="Rechercher un agent"
                required
              />
            </div>
            <div className="form-group travel-save-directory">
              <span id="saveDirectoryLabel" className="folder-picker-label">
                Dossier d&apos;enregistrement
              </span>
              <div
                className="folder-picker-single"
                role="button"
                tabIndex={0}
                aria-labelledby="saveDirectoryLabel"
                onClick={() => void openFolderPicker()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void openFolderPicker();
                  }
                }}
              >
                <span
                  className={`folder-picker-path-display${saveDirectory ? ' has-value' : ''}`}
                  title={saveDirectory || FOLDER_PICKER_PLACEHOLDER}
                  aria-live="polite"
                >
                  <svg className="folder-picker-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                  </svg>
                  <span className="folder-picker-path-text">
                    {saveDirectory || FOLDER_PICKER_PLACEHOLDER}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="travel-international-row">
            <label className="travel-international-check">
              <input
                type="checkbox"
                checked={Boolean(travel.isInternationalTravel)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setTravel((prev) => ({
                    ...prev,
                    isInternationalTravel: checked,
                    flightBooking: checked
                      ? {
                          ...(prev.flightBooking ?? emptyFlightBookingFields()),
                          passportFullName:
                            prev.flightBooking?.passportFullName || employee?.nom || '',
                          flyDepartureDate: prev.flightBooking?.flyDepartureDate || prev.departureDate,
                          flyReturnDate: prev.flightBooking?.flyReturnDate || prev.returnDate,
                          flyDepartureFrom: prev.flightBooking?.flyDepartureFrom || prev.departurePlace,
                          flyDepartureTo: prev.flightBooking?.flyDepartureTo || prev.destinationPlace,
                          flyReturnFrom: prev.flightBooking?.flyReturnFrom || prev.destinationPlace,
                          flyReturnTo: prev.flightBooking?.flyReturnTo || prev.departurePlace,
                        }
                      : prev.flightBooking,
                  }));
                }}
              />
              <span>Déplacement international et national ?</span>
            </label>
          </div>

          {travel.isInternationalTravel && (
            <div className="travel-flight-section panel">
              <h3 className="form-section-title">FLIGHT BOOKING FORM</h3>
              <p className="form-hint">
                Purpose et Number of Travellers sont repris automatiquement depuis le voyage.
              </p>
              <div className="travel-flight-grid">
                <div className="form-group">
                  <label htmlFor="passportFullName">Full name as written in the passport</label>
                  <input
                    id="passportFullName"
                    required
                    value={travel.flightBooking?.passportFullName ?? ''}
                    onChange={(e) => patchFlightBooking({ passportFullName: e.target.value })}
                    placeholder="Nom complet du passeport"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flightPurpose">Purpose</label>
                  <input id="flightPurpose" disabled value={travel.tripPurpose} placeholder="Trip purpose" />
                </div>
                <div className="form-group">
                  <label htmlFor="flightTravellers">Number of Travellers</label>
                  <input id="flightTravellers" disabled value={String(travel.peopleCount)} />
                </div>
                <div className="form-group">
                  <label htmlFor="nearestAirport">Nearest airport</label>
                  <input
                    id="nearestAirport"
                    list="airport-options"
                    required
                    value={travel.flightBooking?.nearestAirport ?? ''}
                    onChange={(e) => patchFlightBooking({ nearestAirport: e.target.value })}
                    placeholder="Ex. FIH — Kinshasa N'djili"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="carrier">Carrier</label>
                  <input
                    id="carrier"
                    list="airline-options"
                    required
                    value={travel.flightBooking?.carrier ?? ''}
                    onChange={(e) => patchFlightBooking({ carrier: e.target.value })}
                    placeholder="Compagnie aérienne"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="frequentFlyerNumber">Frequent Flyer Number</label>
                  <input
                    id="frequentFlyerNumber"
                    value={travel.flightBooking?.frequentFlyerNumber ?? ''}
                    onChange={(e) => patchFlightBooking({ frequentFlyerNumber: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="seatPreference">Seat Preference</label>
                  <input
                    id="seatPreference"
                    list="seat-preference-options"
                    value={travel.flightBooking?.seatPreference ?? ''}
                    onChange={(e) => patchFlightBooking({ seatPreference: e.target.value })}
                    placeholder="Window, Aisle…"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="estimatedCost">Estimated cost (if business)</label>
                  <input
                    id="estimatedCost"
                    value={travel.flightBooking?.estimatedCost ?? ''}
                    onChange={(e) => patchFlightBooking({ estimatedCost: e.target.value })}
                    placeholder="Ex. 2500 USD"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyDepartureDate">Fly departure date</label>
                  <input
                    id="flyDepartureDate"
                    type="date"
                    required
                    value={travel.flightBooking?.flyDepartureDate ?? ''}
                    onChange={(e) => patchFlightBooking({ flyDepartureDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyDepartureFrom">Fly departure from</label>
                  <input
                    id="flyDepartureFrom"
                    list="airport-options"
                    required
                    value={travel.flightBooking?.flyDepartureFrom ?? ''}
                    onChange={(e) => patchFlightBooking({ flyDepartureFrom: e.target.value })}
                    placeholder="Aéroport de départ"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyDepartureTo">Fly departure to</label>
                  <input
                    id="flyDepartureTo"
                    list="airport-options"
                    required
                    value={travel.flightBooking?.flyDepartureTo ?? ''}
                    onChange={(e) => patchFlightBooking({ flyDepartureTo: e.target.value })}
                    placeholder="Aéroport d'arrivée"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyReturnDate">Fly return date</label>
                  <input
                    id="flyReturnDate"
                    type="date"
                    required
                    value={travel.flightBooking?.flyReturnDate ?? ''}
                    onChange={(e) => patchFlightBooking({ flyReturnDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyReturnFrom">Fly return from</label>
                  <input
                    id="flyReturnFrom"
                    list="airport-options"
                    required
                    value={travel.flightBooking?.flyReturnFrom ?? ''}
                    onChange={(e) => patchFlightBooking({ flyReturnFrom: e.target.value })}
                    placeholder="Aéroport de départ retour"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="flyReturnTo">Fly return to</label>
                  <input
                    id="flyReturnTo"
                    list="airport-options"
                    required
                    value={travel.flightBooking?.flyReturnTo ?? ''}
                    onChange={(e) => patchFlightBooking({ flyReturnTo: e.target.value })}
                    placeholder="Aéroport d'arrivée retour"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="cash-request-section-head travel-budget-section">
            <div>
              <div className="travel-budget-title-row">
                <h3 className="form-section-title">Budget voyage</h3>
                <button
                  type="button"
                  className="travel-budget-info-btn"
                  onClick={() => setAllowanceModalOpen(true)}
                  title="Grille des indemnités de voyage domestique"
                  aria-label="Afficher la grille des indemnités de voyage domestique"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                </button>
              </div>
              <p className="form-hint travel-budget-meta">
                {tripDays > 0
                  ? `${tripDays} jour${tripDays > 1 ? 's' : ''} · ${travel.peopleCount} personne${travel.peopleCount > 1 ? 's' : ''}`
                  : 'Renseignez les dates de départ et de retour pour calculer les jours'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addBudgetLine}
              disabled={travel.budgetLines.length >= MAX_BUDGET_LINES}
            >
              + Ajouter une ligne
            </button>
          </div>

          <div className="table-wrap cash-request-lines-wrap travel-budget-table-wrap">
            <table className="cash-request-lines">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Montant (USD)</th>
                  <th># Pers.</th>
                  <th># Jours</th>
                  <th>Total</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {travel.budgetLines.map((line, index) => {
                  const lineTotal = computeBudgetLineTotal(line.amount, travel.peopleCount, tripDays);
                  return (
                    <tr key={index}>
                      <td>
                        <input
                          value={line.label}
                          onChange={(e) => updateBudgetLine(index, { label: e.target.value })}
                          placeholder="Description"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.amount || ''}
                          onChange={(e) =>
                            updateBudgetLine(index, { amount: Number(e.target.value) || 0 })
                          }
                          placeholder="0.00"
                        />
                      </td>
                      <td className="travel-budget-readonly">{travel.peopleCount}</td>
                      <td className="travel-budget-readonly">{tripDays > 0 ? tripDays : '—'}</td>
                      <td className="travel-budget-readonly">
                        {lineTotal > 0
                          ? lineTotal.toLocaleString('fr-FR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeBudgetLine(index)}
                          disabled={travel.budgetLines.length <= 1}
                          title="Supprimer la ligne"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="cash-request-total-label">
                    Total budget
                  </td>
                  <td className="cash-request-total-value">
                    {budgetTotal > 0
                      ? budgetTotal.toLocaleString('fr-FR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <datalist id="travel-department-suggestions">
            {paramDepartmentNames.map((department) => (
              <option key={department} value={department} />
            ))}
          </datalist>
          <datalist id="travel-cost-center-suggestions">
            {availableCostCenters.map((center) => (
              <option key={center.id} value={center.code}>
                {center.code}
              </option>
            ))}
          </datalist>
          <datalist id="transport-options">
            <option value="Avion" />
            <option value="Voiture" />
            <option value="Train" />
            <option value="Bateau" />
            <option value="Autre" />
          </datalist>
          <datalist id="airport-options">
            {airportSuggestions.map((airport) => (
              <option key={airport} value={airport} />
            ))}
          </datalist>
          <datalist id="airline-options">
            {airlineSuggestions.map((airline) => (
              <option key={airline} value={airline} />
            ))}
          </datalist>
          <datalist id="seat-preference-options">
            {SEAT_PREFERENCE_OPTIONS.map((seat) => (
              <option key={seat} value={seat} />
            ))}
          </datalist>

          <div className="cash-request-form-actions">
            {canSubmit && (
              <SaveButton saving={saving} label="Générer les documents" savingLabel="Génération…" />
            )}
          </div>
        </form>
      </div>

      <TravelDocumentSelectModal
        open={selectDocsOpen}
        steps={generationSteps}
        onConfirm={(ids) => {
          void runGeneration(ids);
        }}
        onClose={() => setSelectDocsOpen(false)}
      />

      <TravelGenerationModal
        open={genOpen}
        steps={activeGenerationSteps}
        activeStepIndex={genActiveStep}
        stepProgress={genProgress}
        complete={genComplete}
        error={genError}
        saveDirectory={genResult?.saveDirectory}
        onOpenLocation={openSavedFileLocation}
        onClose={closeGenerationModal}
      />

      <TravelAllowanceRatesModal
        open={allowanceModalOpen}
        onClose={() => setAllowanceModalOpen(false)}
      />
    </div>
  );
}
