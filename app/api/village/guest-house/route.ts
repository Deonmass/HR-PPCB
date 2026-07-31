import { NextResponse } from 'next/server';
import {
  createGuestReservation,
  deleteGuestReservation,
  deleteGuestRoom,
  getGuestHouseBundle,
  getGuestReservation,
  getGuestRoom,
  updateGuestReservation,
  updateGuestReservationStatus,
  upsertGuestRoom,
} from '@/lib/guest-house-store';
import type {
  GuestReservationInput,
  GuestReservationStatus,
  GuestRoomCategory,
  GuestRoomInput,
} from '@/lib/guest-house-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'village.guest-house';

// La persistance en ligne (GitHub) d'un store volumineux peut dépasser les 10 s
// par défaut sur Vercel — on étend la durée maximale de la fonction.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  try {
    const data = await getGuestHouseBundle();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      entity?: 'room' | 'reservation';
      action?: string;
      id?: string;
      status?: GuestReservationStatus;
      roomId?: string;
      category?: GuestRoomCategory;
    } & Partial<GuestRoomInput> & Partial<GuestReservationInput>;

    if (body.entity === 'room') {
      if (body.action === 'delete') {
        const denied = await checkPermission(MENU, 'delete');
        if (denied) return denied;
        if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
        const ok = await withAudit(
          {
            module: 'guest-house',
            action: 'delete',
            entityType: 'guest-house.room',
            entityId: body.id,
            summary: `Suppression chambre ${body.id}`,
            getBefore: () => getGuestRoom(body.id!),
            getAfter: () => null,
            path: '/api/village/guest-house',
            method: 'POST',
          },
          () => deleteGuestRoom(body.id!),
        );
        if (!ok) return NextResponse.json({ error: 'Chambre introuvable' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      const denied = await checkPermission(MENU, body.id ? 'edit' : 'create');
      if (denied) return denied;
      const room = await withAudit(
        {
          module: 'guest-house',
          action: body.id ? 'update' : 'create',
          entityType: 'guest-house.room',
          entityId: (result) => (result as { id?: string })?.id ?? body.id,
          summary: body.id
            ? `Modification chambre ${body.id}`
            : `Création chambre ${body.roomNumber || body.roomName || ''}`,
          getBefore: body.id ? () => getGuestRoom(body.id!) : undefined,
          path: '/api/village/guest-house',
          method: 'POST',
        },
        () =>
          upsertGuestRoom({
            id: body.id,
            roomNumber: body.roomNumber,
            roomName: body.roomName,
            building: body.building,
            category: body.category,
            hotelName: body.hotelName,
            characteristics: body.characteristics,
            capacity: body.capacity,
            floor: body.floor,
            amenities: body.amenities,
            notes: body.notes,
            status: body.status,
          }),
      );
      return NextResponse.json(room, { status: body.id ? 200 : 201 });
    }

    if (body.entity === 'reservation') {
      if (body.action === 'status') {
        const denied = await checkPermission(MENU, 'edit');
        if (denied) return denied;
        if (!body.id || !body.status) {
          return NextResponse.json({ error: 'ID et statut requis' }, { status: 400 });
        }
        const updated = await withAudit(
          {
            module: 'guest-house',
            action: 'update',
            entityType: 'guest-house.reservation',
            entityId: body.id,
            summary: `Statut réservation ${body.id} → ${body.status}`,
            getBefore: () => getGuestReservation(body.id!),
            path: '/api/village/guest-house',
            method: 'POST',
          },
          () => updateGuestReservationStatus(body.id!, body.status!, body.roomId),
        );
        return NextResponse.json(updated);
      }
      if (body.action === 'update') {
        const denied = await checkPermission(MENU, 'edit');
        if (denied) return denied;
        if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
        const updated = await withAudit(
          {
            module: 'guest-house',
            action: 'update',
            entityType: 'guest-house.reservation',
            entityId: body.id,
            summary: `Modification réservation ${body.id}`,
            getBefore: () => getGuestReservation(body.id!),
            path: '/api/village/guest-house',
            method: 'POST',
          },
          () =>
            updateGuestReservation(body.id!, {
              personName: body.personName ?? '',
              matricule: body.matricule,
              isAgent: body.isAgent,
              motif: body.motif ?? '',
              startDate: body.startDate ?? '',
              endDate: body.endDate ?? '',
              notes: body.notes,
              company: body.company,
              mission: body.mission,
              phone: body.phone,
              email: body.email,
            }),
        );
        return NextResponse.json(updated);
      }
      if (body.action === 'delete') {
        const denied = await checkPermission(MENU, 'delete');
        if (denied) return denied;
        if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
        const ok = await withAudit(
          {
            module: 'guest-house',
            action: 'delete',
            entityType: 'guest-house.reservation',
            entityId: body.id,
            summary: `Suppression réservation ${body.id}`,
            getBefore: () => getGuestReservation(body.id!),
            getAfter: () => null,
            path: '/api/village/guest-house',
            method: 'POST',
          },
          () => deleteGuestReservation(body.id!),
        );
        if (!ok) return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      const denied = await checkPermission(MENU, 'create');
      if (denied) return denied;
      const created = await withAudit(
        {
          module: 'guest-house',
          action: 'create',
          entityType: 'guest-house.reservation',
          entityId: (result) => (result as { id?: string })?.id,
          summary: (result) => {
            const r = result as { personName?: string; id?: string };
            return `Création réservation ${r.personName || r.id}`;
          },
          path: '/api/village/guest-house',
          method: 'POST',
        },
        () =>
          createGuestReservation({
            personName: body.personName ?? '',
            matricule: body.matricule,
            isAgent: body.isAgent,
            motif: body.motif ?? '',
            startDate: body.startDate ?? '',
            endDate: body.endDate ?? '',
            roomId: body.roomId,
            notes: body.notes,
            company: body.company,
            mission: body.mission,
            phone: body.phone,
            email: body.email,
            nationality: body.nationality,
            idDoc: body.idDoc,
            billing: body.billing,
          }),
      );
      return NextResponse.json(created, { status: 201 });
    }

    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
