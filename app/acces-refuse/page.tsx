'use client';

import Link from 'next/link';
import { usePermissions } from '@/contexts/PermissionContext';

export default function AccesRefusePage() {
  const { firstAccessiblePath } = usePermissions();

  return (
    <div className="permissions-empty" style={{ padding: '3rem 1rem' }}>
      <h2>Accès refusé</h2>
      <p>Vous n&apos;avez pas la permission d&apos;accéder à cette page.</p>
      {firstAccessiblePath ? (
        <Link href={firstAccessiblePath} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Retour à l&apos;accueil
        </Link>
      ) : (
        <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>
          Aucune page n&apos;est accessible avec vos permissions actuelles. Contactez un administrateur.
        </p>
      )}
    </div>
  );
}
