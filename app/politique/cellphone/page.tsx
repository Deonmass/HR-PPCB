'use client';

import AirtimePolicyTable from '@/components/airtime/AirtimePolicyTable';
import PermissionGate from '@/components/PermissionGate';

export default function CellphonePolicyPage() {
  return (
    <PermissionGate menuId="politique.cellphone" action="view" fallback={<p className="docs-hub-empty">Accès refusé.</p>}>
      <div className="page-header">
        <div>
          <h2>Politique cellphone</h2>
          <p>Plafond mensuel d’airtime selon la catégorie et le grade.</p>
        </div>
      </div>
      <div className="airtime-policy-wrap">
        <AirtimePolicyTable />
      </div>
    </PermissionGate>
  );
}
