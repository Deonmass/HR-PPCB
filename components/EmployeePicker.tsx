'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectPickerDropdown from '@/components/ProjectPickerDropdown';
import type { Employee } from '@/lib/types';
import { departmentsEqual } from '@/lib/exco-department-map';

export interface EmployeeSelection {
  matricule: string;
  nom: string;
  departement: string;
}

interface PickerProps {
  employees: Employee[];
  value: EmployeeSelection | null;
  onChange: (employee: EmployeeSelection | null) => void;
  required?: boolean;
  department?: string;
  /** Exclure un matricule (ex. l’employé en cours de création). */
  excludeMatricule?: string;
  placeholder?: string;
}

interface SuggestProps {
  employees: Employee[];
  value: string;
  onChange: (value: string) => void;
  onEmployeeSelect?: (employee: Employee) => void;
  onBlur?: () => void;
  required?: boolean;
  placeholder?: string;
  id?: string;
  department?: string;
  /** Après une virgule, une autre personne peut être ajoutée. */
  multiple?: boolean;
  /** Catalogue ajouté dès qu’une virgule est saisie (ex. contractants). */
  extraEmployees?: Employee[];
  primaryKind?: string;
  extraKind?: string;
  /** Noms déjà retenus, exclus des suggestions. */
  excludeNames?: string[];
}

function suggestionMeta(employee: Employee): string {
  return [
    employee.matricule,
    employee.localisation,
    employee.jobTitle,
    employee.cnss,
    employee.departement,
  ].filter(Boolean).join(' · ');
}

function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  if (!selectedDepartment.trim()) return true;
  return departmentsEqual(employeeDepartment, selectedDepartment);
}

function filterEmployees(
  employees: Employee[],
  query: string,
  department?: string,
  excludeMatricule?: string,
): Employee[] {
  const excluded = (excludeMatricule || '').trim().toLowerCase();
  let list = employees.filter((employee) => {
    if (!employee.nom.trim()) return false;
    if (excluded && employee.matricule.trim().toLowerCase() === excluded) return false;
    return true;
  });
  if (department?.trim()) {
    list = list.filter((employee) => matchesDepartment(employee.departement, department));
  }
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, 12);
  return list
    .filter((employee) => {
      const haystack = `${employee.nom} ${employee.matricule} ${employee.departement} ${employee.jobTitle} ${employee.localisation} ${employee.cnss}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 12);
}

function useOutsideDismiss(
  open: boolean,
  wrapRef: React.RefObject<HTMLDivElement | null>,
  listRef: React.RefObject<HTMLDivElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onDismiss, wrapRef, listRef]);
}

export default function EmployeePicker({
  employees,
  value,
  onChange,
  required = false,
  department,
  excludeMatricule,
  placeholder,
}: PickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value?.nom ?? '');
  const valueNom = value?.nom ?? '';
  const valueMatricule = value?.matricule ?? '';

  useEffect(() => {
    setQuery(valueNom);
  }, [valueNom, valueMatricule]);

  const suggestions = useMemo(
    () => filterEmployees(employees, query, department, excludeMatricule),
    [department, employees, excludeMatricule, query],
  );

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(valueNom);
  }, [valueNom]);

  useOutsideDismiss(open, wrapRef, listRef, dismiss);

  const selectEmployee = (employee: Employee) => {
    onChange({
      matricule: employee.matricule,
      nom: employee.nom,
      departement: employee.departement,
    });
    setQuery(employee.nom);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
        required={required}
        className="project-picker-input"
        value={query}
        placeholder={
          placeholder
            || (department
              ? 'Rechercher dans le département…'
              : 'Rechercher un employé…')
        }
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          if (!next.trim()) {
            onChange(null);
            setOpen(true);
            return;
          }
          // Nom libre si hors suggestions (matricule vide) ; sélection liste = matricule renseigné.
          if (valueMatricule && valueNom === next) {
            setOpen(true);
            return;
          }
          onChange({
            matricule: '',
            nom: next,
            departement: valueMatricule ? '' : (value?.departement ?? ''),
          });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <ProjectPickerDropdown
        anchorRef={wrapRef}
        listRef={listRef}
        open={open && suggestions.length > 0}
        minWidth={400}
      >
        {suggestions.map((employee) => (
          <button
            key={employee.matricule}
            type="button"
            className={`project-picker-option${valueMatricule === employee.matricule ? ' active' : ''}`}
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectEmployee(employee)}
          >
            <span className={`project-picker-name${(employee as { parti?: boolean }).parti ? ' is-left' : ''}`}>{employee.nom}</span>
            <span className="project-picker-meta">
              {suggestionMeta(employee)}
            </span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
}

function personKey(employee: Employee): string {
  return `${employee.matricule}\0${employee.nom}`;
}

export function EmployeeSuggestInput({
  employees,
  value,
  onChange,
  onEmployeeSelect,
  onBlur,
  required = false,
  placeholder = 'Rechercher ou saisir un nom…',
  id,
  department,
  multiple = false,
  extraEmployees,
  primaryKind = '',
  extraKind = '',
  excludeNames,
}: SuggestProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const commaAt = multiple ? query.lastIndexOf(',') : -1;
  const tail = commaAt >= 0 ? query.slice(commaAt + 1) : query;
  const mixExtras = Boolean(extraEmployees?.length) && (!multiple || commaAt >= 0);
  const extraKeys = useMemo(
    () => new Set((extraEmployees ?? []).map(personKey)),
    [extraEmployees],
  );
  const pool = useMemo(() => {
    if (!mixExtras || !extraEmployees?.length) return employees;
    const seen = new Set(employees.map(personKey));
    return [...employees, ...extraEmployees.filter((employee) => !seen.has(personKey(employee)))];
  }, [employees, extraEmployees, mixExtras]);
  const chosen = useMemo(() => {
    const excluded = new Set((excludeNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
    if (commaAt >= 0) {
      query.slice(0, commaAt).split(',').forEach((part) => {
        const name = part.trim().toLowerCase();
        if (name) excluded.add(name);
      });
    }
    return excluded;
  }, [commaAt, excludeNames, query]);

  const suggestions = useMemo(
    () => filterEmployees(pool, tail, department).filter(
      (employee) => !chosen.has(employee.nom.trim().toLowerCase()),
    ),
    [chosen, department, pool, tail],
  );

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(value);
  }, [value]);

  useOutsideDismiss(open, wrapRef, listRef, dismiss);

  const selectEmployee = (employee: Employee) => {
    if (!multiple) {
      onChange(employee.nom);
      onEmployeeSelect?.(employee);
      setQuery(employee.nom);
      setOpen(false);
      return;
    }
    onEmployeeSelect?.(employee);
    setQuery(', ');
    setOpen(false);
    inputRef.current?.focus();
  };

  const tailName = tail.trim().toLowerCase();

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
        ref={inputRef}
        id={id}
        required={required}
        className="project-picker-input"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
          }
          onBlur?.();
        }}
        autoComplete="off"
      />
      <ProjectPickerDropdown
        anchorRef={wrapRef}
        listRef={listRef}
        open={open && suggestions.length > 0}
        minWidth={400}
      >
        {suggestions.map((employee) => {
          const kind = mixExtras
            ? (extraKeys.has(personKey(employee)) ? extraKind : primaryKind)
            : '';
          return (
            <button
              key={personKey(employee)}
              type="button"
              className={`project-picker-option${tailName === employee.nom.trim().toLowerCase() ? ' active' : ''}`}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                skipBlurRef.current = true;
              }}
              onClick={() => selectEmployee(employee)}
            >
              <span className={`project-picker-name${(employee as { parti?: boolean }).parti ? ' is-left' : ''}`}>{employee.nom}</span>
              <span className="project-picker-meta">
                {[kind, suggestionMeta(employee)].filter(Boolean).join(' · ')}
              </span>
            </button>
          );
        })}
      </ProjectPickerDropdown>
    </div>
  );
}

export function TextSuggestInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Rechercher…',
  id,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 20);
    const matches = suggestions.filter((item) => item.toLowerCase().includes(q));
    return (matches.length > 0 ? matches : suggestions).slice(0, 20);
  }, [query, suggestions]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(value);
  }, [value]);

  useOutsideDismiss(open, wrapRef, listRef, dismiss);

  const selectValue = (next: string) => {
    onChange(next);
    setQuery(next);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
        id={id}
        className="project-picker-input"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        autoComplete="off"
      />
      <ProjectPickerDropdown
        anchorRef={wrapRef}
        listRef={listRef}
        open={open && !disabled && filtered.length > 0}
        minWidth={320}
      >
        {filtered.map((item) => (
          <button
            key={item}
            type="button"
            className={`project-picker-option${value === item ? ' active' : ''}`}
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectValue(item)}
          >
            <span className="project-picker-name">{item}</span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
}
