import { NextResponse } from 'next/server';
import {
  createGuestReservation,
  deleteGuestReservation,
  deleteGuestRoom,
  getGuestHouseBundle,
  updateGuestReservationStatus,
  upsertGuestRoom,
} from '@/lib/guest-house-store';
import type { GuestReservationInput, GuestReservationStatus, GuestRoomInput } from '@/lib/guest-house-types';
import { checkPermission } from '@/lib/require-permission';

const MENU = 'village.guest-house';

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
    } & Partial<GuestRoomInput> & Partial<GuestReservationInput>;

    if (body.entity === 'room') {
      if (body.action === 'delete') {
        const denied = await checkPermission(MENU, 'delete');
        if (denied) return denied;
        if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
        const ok = await deleteGuestRoom(body.id);
        if (!ok) return NextResponse.json({ error: 'Chambre introuvable' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      const denied = await checkPermission(MENU, body.id ? 'edit' : 'create');
      if (denied) return denied;
      const room = await upsertGuestRoom({
        id: body.id,
        roomNumber: body.roomNumber ?? '',
        building: body.building ?? '',
        characteristics: body.characteristics ?? '',
      });
      return NextResponse.json(room, { status: body.id ? 200 : 201 });
    }

    if (body.entity === 'reservation') {
      if (body.action === 'status') {
        const denied = await checkPermission(MENU, 'edit');
        if (denied) return denied;
        if (!body.id || !body.status) {
          return NextResponse.json({ error: 'ID et statut requis' }, { status: 400 });
        }
        const updated = await updateGuestReservationStatus(body.id, body.status, body.roomId);
        return NextResponse.json(updated);
      }
      if (body.action === 'delete') {
        const denied = await checkPermission(MENU, 'delete');
        if (denied) return denied;
        if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
        const ok = await deleteGuestReservation(body.id);
        if (!ok) return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      const denied = await checkPermission(MENU, 'create');
      if (denied) return denied;
      const created = await createGuestReservation({
        personName: body.personName ?? '',
        matricule: body.matricule,
        isAgent: body.isAgent,
        motif: body.motif ?? '',
        startDate: body.startDate ?? '',
        endDate: body.endDate ?? '',
        roomId: body.roomId,
        notes: body.notes,
      });
      return NextResponse.json(created, { status: 201 });
    }

    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
