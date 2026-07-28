import type { VillageMaison, VillageTaille } from './village-types';

export interface VillageCatalogJsonStoreData {
  tailles: VillageTaille[];
  maisons: VillageMaison[];
}

export interface VillageAffectationHistoryEntry {
  date: string;
  action: 'Affecter' | 'Liberer' | string;
  matricule: string;
  nom: string;
  numeroVilla: string;
  typeMaison: string;
  ancienNumero: string;
  raison: string;
  commentaire: string;
}

export interface VillageAffectationHistoryJsonStoreData {
  entries: VillageAffectationHistoryEntry[];
}

export interface VillageAffectationSuggestion {
  id: string;
  numeroVilla: string;
  matricule: string;
  nom: string;
  commentaire: string;
  createdAt: string;
}

export interface VillageAffectationSuggestionForm {
  id?: string;
  numeroVilla: string;
  matricule: string;
  nom?: string;
  commentaire?: string;
}

export interface VillageAffectationSuggestionsJsonStoreData {
  suggestions: VillageAffectationSuggestion[];
}
