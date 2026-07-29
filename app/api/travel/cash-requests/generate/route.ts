import {
  createTravelDocuments,
  type TravelGenerationProgressEvent,
} from '@/lib/cash-request-store';
import { checkAnyPermission } from '@/lib/require-permission';
import type { TravelFormFields } from '@/lib/travel-form';
import type { CashRequestLine, CashRequestRecord } from '@/lib/travel-types';
import { withAudit, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

type StreamEvent =
  | TravelGenerationProgressEvent
  | { type: 'done'; record: CashRequestRecord }
  | { type: 'error'; message: string };

function encodeSseEvent(payload: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'create' },
    { menuId: 'travel.etablir', action: 'edit' },
  ]);
  if (denied) return denied;

  const body = (await request.json()) as {
    employeeMatricule?: string;
    employeeName?: string;
    employeeDepartment?: string;
    travel?: TravelFormFields;
    lines?: CashRequestLine[];
    saveDirectory?: string;
    selectedDocuments?: Array<
      | 'cash-request'
      | 'trip-budget'
      | 'travel-authorization'
      | 'hotel-booking'
      | 'flight-booking'
      | 'mission-order'
      | 'travel-pdf'
    >;
  };

  if (!body.travel) {
    return new Response(JSON.stringify({ error: 'Données voyage requises' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (payload: StreamEvent) => {
        controller.enqueue(encodeSseEvent(payload));
      };

      try {
        const record = await withAudit(
          {
            module: 'travel.etablir',
            action: 'create',
            entityType: 'travel.cash-request',
            entityId: (result) => (result as CashRequestRecord)?.id,
            summary: (result) => {
              const r = result as CashRequestRecord;
              return `Génération documents voyage ${r.missionRef || r.id}`;
            },
            details: (_r, _b, after) => {
              const r = after as CashRequestRecord | undefined;
              return `Documents générés (SSE) pour ${r?.employeeName || body.employeeName || '—'} (${r?.missionRef || '—'})`;
            },
            undoable: false,
            path: '/api/travel/cash-requests/generate',
            method: 'POST',
            logErrors: false,
          },
          () =>
            createTravelDocuments(
              {
                employeeMatricule: body.employeeMatricule ?? '',
                employeeName: body.employeeName ?? '',
                employeeDepartment: body.employeeDepartment ?? '',
                travel: body.travel!,
                lines: body.lines ?? [],
                saveDirectory: body.saveDirectory,
                selectedDocuments: body.selectedDocuments,
              },
              (event) => emit(event),
            ),
        );
        emit({ type: 'done', record });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur';
        await logAuditError({
          message,
          details: `Échec génération documents voyage: ${message}`,
          module: 'travel.etablir',
          path: '/api/travel/cash-requests/generate',
          method: 'POST',
          stack: err instanceof Error ? err.stack : undefined,
          user: await getAuditActor(),
        });
        emit({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
