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
  required?: boolean;
  placeholder?: string;
  id?: string;
  department?: string;
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
      const haystack = `${employee.nom} ${employee.matricule} ${employee.departement} ${employee.jobTitle}`.toLowerCase();
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
            <span className="project-picker-name">{employee.nom}</span>
            <span className="project-picker-meta">
              {[employee.matricule, employee.jobTitle, employee.departement]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
}

export function EmployeeSuggestInput({
  employees,
  value,
  onChange,
  onEmployeeSelect,
  required = false,
  placeholder = 'Rechercher ou saisir un nom…',
  id,
  department,
}: SuggestProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const suggestions = useMemo(
    () => filterEmployees(employees, query, department),
    [department, employees, query],
  );

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(value);
  }, [value]);

  useOutsideDismiss(open, wrapRef, listRef, dismiss);

  const selectEmployee = (employee: Employee) => {
    onChange(employee.nom);
    onEmployeeSelect?.(employee);
    setQuery(employee.nom);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
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
        autoComplete="off"
      />
      <ProjectPickerDropdown
        anchorRef={wrapRef}
        listRef={listRef}
        open={open && suggestions.length > 0}
      >
        {suggestions.map((employee) => (
          <button
            key={employee.matricule}
            type="button"
            className={`project-picker-option${value === employee.nom ? ' active' : ''}`}
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectEmployee(employee)}
          >
            <span className="project-picker-name">{employee.nom}</span>
            <span className="project-picker-meta">
              {[employee.matricule, employee.jobTitle, employee.departement]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
}
