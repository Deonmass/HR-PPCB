'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function PaymentVoucherPage() {
  return (
    <PermissionGate menuId="travel.payment-voucher" action="view">
      <PlaceholderPage
        title="Payment voucher"
        description="Module en cours de conception — disponible prochainement"
      />
    </PermissionGate>
  );
}
