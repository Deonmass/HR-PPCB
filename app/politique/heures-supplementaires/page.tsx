'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PermissionGate from '@/components/PermissionGate';
import { TIMESHEET_POLICY_SECTIONS } from '@/lib/timesheet-policy';

const PDF_SRC = '/api/politique/heures-sup?mode=pdf';
const PDF_DOWNLOAD = '/api/politique/heures-sup?mode=pdf&download=1';

export default function PolitiqueHeuresSupPage() {
  const [hasPdf, setHasPdf] = useState(false);

  useEffect(() => {
    void fetch('/api/politique/heures-sup')
      .then((res) => res.json())
      .then((data) => setHasPdf(Boolean(data?.hasPdf)))
      .catch(() => setHasPdf(false));
  }, []);

  return (
    <PermissionGate
      menuId="politique.heures-sup"
      action="view"
      fallback={<p className="docs-hub-empty">Vous n’avez pas accès à cette politique.</p>}
    >
      <div className="convention-page politique-page">
        <header className="convention-topbar">
          <div>
            <h2>Politique sur les heures supplémentaires finale oct 25</h2>
            <p className="politique-sub">PPCB-LG-POL-HR-0032 — référence interne et convention collective.</p>
          </div>
          <div className="page-header-actions">
            {hasPdf ? (
              <a className="btn btn-secondary btn-sm" href={PDF_DOWNLOAD}>
                Télécharger le PDF
              </a>
            ) : null}
            <Link href="/politique" className="btn btn-secondary btn-sm" prefetch={false}>
              ← Politique
            </Link>
          </div>
        </header>

        <div className="politique-layout">
          <aside className="politique-col-list panel">
            <p className="politique-list-meta">Résumé des règles appliquées dans le timesheet</p>
            <div className="politique-hs-sections">
              {TIMESHEET_POLICY_SECTIONS.map((section) => (
                <section key={section.title} className="politique-hs-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
          <section className="politique-col-pdf panel">
            {hasPdf ? (
              <iframe className="convention-pdf-iframe" title="Politique heures supplémentaires" src={PDF_SRC} />
            ) : (
              <p className="docs-hub-empty">
                PDF non déposé. Placez le fichier dans
                {' '}
                <code>Excel/templates/policies/politique-heures-supplementaires-oct-25.pdf</code>
                {' '}
                pour l’afficher ici.
              </p>
            )}
          </section>
        </div>
      </div>
    </PermissionGate>
  );
}
