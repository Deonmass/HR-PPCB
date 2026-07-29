import 'server-only';

import type { AuditLogEntry } from './audit-log-types';
import { hasUndoHandler as registryHasUndoHandler } from './audit-undo-registry';
import type { AuthUser, CostCenterSetting, DepartmentSetting } from './auth-types';
import { deleteUser, upsertUser } from './auth-store';
import type { CharroiAchat, CharroiVehicule } from './charroi-types';
import {
  deleteAchat,
  deleteVehicule,
  restoreAchat,
  restoreVehicule,
} from './charroi-store';
import type { DependantRecord } from './dependants-json-types';
import { deleteDependant, restoreDependant } from './dependants-json-store';
import { deleteEmployee, upsertEmployee } from './employees-json-store';
import type { FactureSuivi } from './factures-fournisseurs/types';
import { deleteFactureSuivi, upsertFactureSuivi } from './factures-fournisseurs/store';
import { deleteFournisseur, upsertFournisseur } from './fournisseurs-store';
import type { Fournisseur } from './fournisseurs-types';
import type { GuestReservation, GuestRoom } from './guest-house-types';
import {
  deleteGuestReservation,
  deleteGuestRoom,
  restoreGuestReservation,
  restoreGuestRoom,
} from './guest-house-store';
import type { ProjectExpense, ProjectRecord } from './project-types';
import { deleteExpense, deleteProject, upsertExpense, upsertProject } from './projects-store';
import {
  deleteCostCenter,
  deleteDepartment,
  upsertCostCenter,
  upsertDepartment,
} from './settings-store';
import type { TravelHistoryRow } from './travel-history-types';
import {
  deleteTravelHistoryRow,
  readTravelHistory,
  restoreTravelHistoryRow,
} from './travel-history-json-store';
import type { Employee } from './types';
import type { VillageAffectationSuggestion } from './village-json-types';
import type { VillageMaison, VillageTaille } from './village-types';
import {
  deleteAffectationSuggestion,
  deleteMaison,
  deleteTaille,
  upsertAffectationSuggestion,
  upsertMaison,
  upsertTaille,
} from './village-json-store';

export type AuditUndoHandler = (entry: AuditLogEntry) => Promise<void>;

function requireBefore(entry: AuditLogEntry): unknown {
  if (entry.before == null) {
    throw new Error('Instantané « avant » manquant — annulation impossible');
  }
  return entry.before;
}

function entityIdOf(entry: AuditLogEntry, fallback?: unknown): string {
  if (entry.entityId?.trim()) return entry.entityId.trim();
  if (fallback && typeof fallback === 'object' && fallback !== null && 'id' in fallback) {
    const id = String((fallback as { id?: unknown }).id ?? '').trim();
    if (id) return id;
  }
  if (fallback && typeof fallback === 'object' && fallback !== null && 'matricule' in fallback) {
    const matricule = String((fallback as { matricule?: unknown }).matricule ?? '').trim();
    if (matricule) return matricule;
  }
  throw new Error('Identifiant d’entité manquant pour l’annulation');
}

async function undoCreateDeleteRestore(params: {
  entry: AuditLogEntry;
  deleteFn: (id: string) => Promise<boolean | void>;
  restoreFn: (snapshot: unknown) => Promise<unknown>;
  idFrom?: (snapshot: unknown) => string;
}): Promise<void> {
  const { entry, deleteFn, restoreFn } = params;
  if (entry.action === 'create') {
    const id = params.idFrom
      ? params.idFrom(entry.after)
      : entityIdOf(entry, entry.after);
    const ok = await deleteFn(id);
    if (ok === false) throw new Error('Entité créée introuvable pour annulation');
    return;
  }
  if (entry.action === 'update' || entry.action === 'delete') {
    await restoreFn(requireBefore(entry));
    return;
  }
  throw new Error(`Action « ${entry.action} » non annulable`);
}

const handlers: Record<string, AuditUndoHandler> = {
  'charroi.vehicule': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteVehicule,
      restoreFn: async (snapshot) => restoreVehicule(snapshot as CharroiVehicule),
    });
  },
  'charroi.achat': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteAchat,
      restoreFn: async (snapshot) => restoreAchat(snapshot as CharroiAchat),
    });
  },
  employee: async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: async (id) => deleteEmployee(id),
      restoreFn: async (snapshot) => upsertEmployee(snapshot as Employee),
      idFrom: (snapshot) => {
        const matricule = String((snapshot as Employee | undefined)?.matricule ?? '').trim();
        if (!matricule) throw new Error('Matricule manquant');
        return matricule;
      },
    });
  },
  dependant: async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: async (id) => deleteDependant(Number(id)),
      restoreFn: async (snapshot) => restoreDependant(snapshot as DependantRecord),
    });
  },
  'guest-house.room': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteGuestRoom,
      restoreFn: async (snapshot) => restoreGuestRoom(snapshot as GuestRoom),
    });
  },
  'guest-house.reservation': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteGuestReservation,
      restoreFn: async (snapshot) => restoreGuestReservation(snapshot as GuestReservation),
    });
  },
  'facture.suivi': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteFactureSuivi,
      restoreFn: async (snapshot) => upsertFactureSuivi(snapshot as FactureSuivi),
    });
  },
  project: async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteProject,
      restoreFn: async (snapshot) => upsertProject(snapshot as ProjectRecord),
    });
  },
  'project.expense': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: async (id) => {
        const result = await deleteExpense(id);
        return Boolean(result);
      },
      restoreFn: async (snapshot) => upsertExpense(snapshot as ProjectExpense),
    });
  },
  'travel.history': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: async (id) => {
        const data = await readTravelHistory();
        const row = data.rows.find((item) => item.ref === id.trim());
        if (!row) return false;
        await deleteTravelHistoryRow(row.rowIndex, id.trim());
        return true;
      },
      restoreFn: async (snapshot) => restoreTravelHistoryRow(snapshot as TravelHistoryRow),
      idFrom: (snapshot) => {
        const ref = String((snapshot as TravelHistoryRow | undefined)?.ref ?? '').trim();
        if (!ref) throw new Error('Référence mission manquante');
        return ref;
      },
    });
  },
  fournisseur: async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteFournisseur,
      restoreFn: async (snapshot) => {
        const item = snapshot as Fournisseur;
        return upsertFournisseur({
          id: item.id,
          nom: item.nom,
          natureService: item.natureService,
        });
      },
    });
  },
  'village.maison': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteMaison,
      restoreFn: async (snapshot) => {
        const item = snapshot as VillageMaison;
        return upsertMaison({
          numero: item.numero,
          taille: item.taille,
          typeMaison: item.typeMaison,
          commentaires: item.commentaires,
          occupantExterne: item.occupantExterne,
        });
      },
      idFrom: (snapshot) => {
        const numero = String((snapshot as VillageMaison | undefined)?.numero ?? '').trim();
        if (!numero) throw new Error('Numéro de maison manquant');
        return numero;
      },
    });
  },
  'village.taille': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteTaille,
      restoreFn: async (snapshot) => {
        const item = snapshot as VillageTaille;
        return upsertTaille({
          code: item.code,
          label: item.label,
          capacite: item.capacite,
          commentaires: item.commentaires,
        });
      },
      idFrom: (snapshot) => {
        const code = String((snapshot as VillageTaille | undefined)?.code ?? '').trim();
        if (!code) throw new Error('Code taille manquant');
        return code;
      },
    });
  },
  'village.suggestion': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteAffectationSuggestion,
      restoreFn: async (snapshot) => {
        const item = snapshot as VillageAffectationSuggestion;
        return upsertAffectationSuggestion({
          id: item.id,
          numeroVilla: item.numeroVilla,
          matricule: item.matricule,
          nom: item.nom,
          commentaire: item.commentaire,
        });
      },
    });
  },
  'settings.department': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteDepartment,
      restoreFn: async (snapshot) => upsertDepartment(snapshot as DepartmentSetting),
    });
  },
  'settings.cost-center': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteCostCenter,
      restoreFn: async (snapshot) => upsertCostCenter(snapshot as CostCenterSetting),
    });
  },
  'auth.user': async (entry) => {
    await undoCreateDeleteRestore({
      entry,
      deleteFn: deleteUser,
      restoreFn: async (snapshot) => {
        const user = snapshot as Omit<AuthUser, 'password'> & { password?: string };
        return upsertUser({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          initials: user.initials,
          email: user.email,
          matricule: user.matricule,
          active: user.active,
        });
      },
    });
  },
};

export function hasUndoHandler(entityType: string): boolean {
  return registryHasUndoHandler(entityType);
}

export async function runUndoHandler(entry: AuditLogEntry): Promise<void> {
  const type = entry.entityType?.trim();
  if (!type) throw new Error('Type d’entité manquant');
  const handler = handlers[type];
  if (!handler) throw new Error(`Aucun gestionnaire d’annulation pour « ${type} »`);
  await handler(entry);
}

export function listUndoEntityTypes(): string[] {
  return Object.keys(handlers);
}
