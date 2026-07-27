import { NextResponse } from 'next/server';
import { assignEmployeeMaison } from '@/lib/dependants-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { appendAffectationHistory } from '@/lib/village-affectation-history';
import { readVillageCatalog, setMaisonOccupantExterne } from '@/lib/village-store';

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'edit' },
    { menuId: 'village.dependants-liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      matricule?: string;
      numeroVilla?: string;
      setLocalisationZamba?: boolean;
      raison?: string;
      commentaire?: string;
      ancienNumero?: string;
      nom?: string;
      action?: string;
      /** Occupant hors effectif (nom libre, sans matricule). */
      externe?: boolean;
    };
    const matricule = body.matricule?.trim() ?? '';
    const numeroVilla = body.numeroVilla?.trim() ?? '';
    const nom = body.nom?.trim() ?? '';
    const isExterne = Boolean(body.externe) || (!matricule && Boolean(nom || body.ancienNumero));

    let typeMaison = '';
    const villaForType = numeroVilla || body.ancienNumero?.trim() || '';
    if (villaForType) {
      const { maisons } = await readVillageCatalog();
      const maison = maisons.find(
        (m) => m.numero.trim().toLowerCase() === villaForType.toLowerCase(),
      );
      if (!maison && numeroVilla) {
        return NextResponse.json(
          { error: `Maison « ${numeroVilla} » introuvable dans la feuille MAISON` },
          { status: 400 },
        );
      }
      if (maison) typeMaison = maison.typeMaison || maison.taille;
    }

    if (isExterne && !matricule) {
      const maisonCible = numeroVilla || body.ancienNumero?.trim() || '';
      if (!maisonCible) {
        return NextResponse.json(
          { error: 'Maison requise pour un occupant hors effectif' },
          { status: 400 },
        );
      }
      if (numeroVilla && !nom) {
        return NextResponse.json(
          { error: 'Nom requis pour un occupant hors effectif' },
          { status: 400 },
        );
      }

      const updatedMaison = await setMaisonOccupantExterne(
        numeroVilla || maisonCible,
        numeroVilla ? nom : '',
      );

      try {
        await appendAffectationHistory([
          {
            action: body.action?.trim() || (numeroVilla ? 'Affecter' : 'Liberer'),
            matricule: '',
            nom: numeroVilla ? nom : body.nom?.trim() || updatedMaison.occupantExterne || '',
            numeroVilla,
            typeMaison,
            ancienNumero: body.ancienNumero?.trim() || '',
            raison: body.raison?.trim() || '',
            commentaire: body.commentaire?.trim() || 'Hors effectif',
          },
        ]);
      } catch (histoErr) {
        console.warn('[village-assign] Historique non enregistré:', histoErr);
      }

      return NextResponse.json({
        matricule: '',
        nom: updatedMaison.occupantExterne,
        numeroVilla: updatedMaison.numero,
        externe: true,
        maison: updatedMaison,
      });
    }

    if (!matricule) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }

    if (numeroVilla) {
      const { maisons } = await readVillageCatalog();
      const maison = maisons.find(
        (m) => m.numero.trim().toLowerCase() === numeroVilla.toLowerCase(),
      );
      if (!maison) {
        return NextResponse.json(
          { error: `Maison « ${numeroVilla} » introuvable dans la feuille MAISON` },
          { status: 400 },
        );
      }
      typeMaison = maison.typeMaison || maison.taille;
      // Un agent remplace un éventuel occupant hors effectif.
      if (maison.occupantExterne?.trim()) {
        await setMaisonOccupantExterne(numeroVilla, '');
      }
    }

    const updated = await assignEmployeeMaison({
      matricule,
      numeroVilla,
      typeMaison,
      setLocalisationZamba: body.setLocalisationZamba !== false && Boolean(numeroVilla),
    });

    try {
      await appendAffectationHistory([
        {
          action: body.action?.trim() || (numeroVilla ? 'Affecter' : 'Liberer'),
          matricule,
          nom: body.nom?.trim() || updated.nom || '',
          numeroVilla,
          typeMaison,
          ancienNumero: body.ancienNumero?.trim() || '',
          raison: body.raison?.trim() || '',
          commentaire: body.commentaire?.trim() || '',
        },
      ]);
    } catch (histoErr) {
      console.warn('[village-assign] Historique non enregistré:', histoErr);
    }

    return NextResponse.json(updated);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
