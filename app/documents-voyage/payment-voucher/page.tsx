'use client';

import Link from 'next/link';
import PermissionGate from '@/components/PermissionGate';

export default function PaymentVoucherPage() {
  return (
    <PermissionGate menuId="travel.payment-voucher" action="view">
      <div className="page-header">
        <div>
          <h2>Payment voucher</h2>
          <p>Module en cours de conception — disponible prochainement</p>
        </div>
        <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
          ← Documents
        </Link>
      </div>
      <div className="panel panel-padded placeholder-panel">
        <p>Cette section sera disponible prochainement.</p>
      </div>
    </PermissionGate>
  );
}
