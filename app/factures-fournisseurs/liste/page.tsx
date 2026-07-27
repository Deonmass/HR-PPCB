'use client';

import PermissionGate from '@/components/PermissionGate';

export default function FournisseursFacturesListePage() {
  return (
    <PermissionGate anyOf={[{ menuId: 'factures.fournisseur.liste', action: 'view' }]}>
      <div className="page-header">
        <div>
          <h2>Factures fournisseur — Liste</h2>
          <p>Cette section sera disponible prochainement.</p>
        </div>
      </div>

      <div className="panel panel-padded">
        <p className="empty-state">Fonctionnalité en cours de développement.</p>
      </div>
    </PermissionGate>
  );
}

