import type { ProjectsData } from './project-types';

export async function fetchProjectsData(): Promise<ProjectsData> {
  const res = await fetch('/api/projects');
  const text = await res.text();

  let json: ProjectsData & { error?: string };
  try {
    json = JSON.parse(text) as ProjectsData & { error?: string };
  } catch {
    throw new Error(
      'Réponse serveur invalide. Vérifiez que le fichier Excel PROJECTS est accessible et que le serveur tourne correctement.',
    );
  }

  if (!res.ok) {
    throw new Error(json.error || `Erreur serveur (${res.status})`);
  }

  return json;
}
