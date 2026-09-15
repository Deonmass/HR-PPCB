'use client';

import type { DepartmentSetting, OvertimeAccessScope, ServiceSetting } from '@/lib/auth-types';

interface Props {
  departments: DepartmentSetting[];
  services: ServiceSetting[];
  value: OvertimeAccessScope;
  disabled?: boolean;
  allDepartmentsGranted?: boolean;
  onChange: (next: OvertimeAccessScope) => void;
}

export default function OvertimeScopePicker({
  departments,
  services,
  value,
  disabled,
  allDepartmentsGranted,
  onChange,
}: Props) {
  const departmentIds = new Set(value.departmentIds);
  const serviceIds = new Set(value.serviceIds);
  const activeDepartments = departments
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const activeServices = services
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const toggleDepartment = (id: string, checked: boolean) => {
    const nextIds = checked
      ? [...departmentIds, id]
      : value.departmentIds.filter((item) => item !== id);
    onChange({
      departmentIds: Array.from(new Set(nextIds)),
      serviceIds: value.serviceIds,
    });
  };

  const toggleService = (id: string, checked: boolean) => {
    const nextIds = checked
      ? [...serviceIds, id]
      : value.serviceIds.filter((item) => item !== id);
    onChange({
      departmentIds: value.departmentIds,
      serviceIds: Array.from(new Set(nextIds)),
    });
  };

  const parentName = (service: ServiceSetting) =>
    departments.find((item) => item.id === service.departmentId)?.name ?? '';

  const locked = Boolean(disabled);

  return (
    <div className="permissions-ot-scope">
      <div className="permissions-ot-scope-title">Périmètre overtime — département ou service</div>
      <p className="permissions-ot-scope-hint">
        Cochez un ou plusieurs départements, ou seulement le(s) service(s) (CEC, Packing Plant,
        Driver…). Sans sélection, le superviseur reste limité à son département lié.
      </p>
      {allDepartmentsGranted ? (
        <p className="permissions-ot-scope-all">
          Accès « tous les départements » est aussi activé : ce périmètre reste éditable, mais il
          n’est pas appliqué tant que cet accès global est coché.
        </p>
      ) : null}
      <div className="permissions-ot-columns">
        <div className="permissions-ot-col">
          <div className="permissions-ot-col-title">Départements</div>
          {activeDepartments.map((department) => (
            <label key={department.id} className="permissions-ot-check">
              <input
                type="checkbox"
                checked={departmentIds.has(department.id)}
                disabled={locked}
                onChange={(event) => toggleDepartment(department.id, event.target.checked)}
              />
              <span>{department.name}</span>
            </label>
          ))}
        </div>
        <div className="permissions-ot-col">
          <div className="permissions-ot-col-title">Services</div>
          {activeServices.length === 0 ? (
            <p className="permissions-ot-empty-svc">Aucun service paramétré</p>
          ) : (
            activeServices.map((service) => (
              <label key={service.id} className="permissions-ot-check permissions-ot-service">
                <input
                  type="checkbox"
                  checked={serviceIds.has(service.id)}
                  disabled={locked}
                  onChange={(event) => toggleService(service.id, event.target.checked)}
                />
                <span>
                  {service.name}
                  {parentName(service) ? (
                    <small className="permissions-ot-parent"> · {parentName(service)}</small>
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
