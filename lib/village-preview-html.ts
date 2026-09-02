import { formatDisplayName } from './format-display-name';
import { formatRate, ratioToRate } from './format-rate';
import { compareMaisonNumero } from './table-sort';
import { DEFAULT_ALLOCATION_CRITERIA, type VillagePresentation } from './village-presentation';
import { resolveMaisonTypeLabel } from './village-agents';
import type {
  VillageDashboardStats,
  VillageMaisonOccupancy,
  VillageTaille,
} from './village-types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function villaNorm(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function displayHouse(numero: string): string {
  return String(numero ?? '').trim() || '—';
}

function brandKicker(value: string | undefined): string {
  const raw = String(value ?? '').trim() || 'PPC · VILLAGE';
  return raw.replace(/exco/gi, 'VILLAGE');
}

function enLabel(value: string): string {
  const key = String(value ?? '').trim();
  if (key === 'Hors effectif') return 'Non-staff';
  if (key === 'Non renseigné') return 'Not specified';
  return key;
}

function findMaison(
  occupancy: VillageMaisonOccupancy[],
  house: string,
): VillageMaisonOccupancy | undefined {
  const key = villaNorm(house);
  return occupancy.find((m) => villaNorm(m.numero) === key);
}

function chrome(opts: {
  title: string;
  period: string;
  sectionNo?: string;
  kicker: string;
}): string {
  const badge = opts.sectionNo
    ? `<span class="badge">${esc(opts.sectionNo)}</span>`
    : '';
  return `<div class="bar-top"></div>
<header class="head">
  ${badge}
  <div class="head-txt">
    <p class="brand">${esc(brandKicker(opts.kicker))}</p>
    <h1>${esc(opts.title)}</h1>
  </div>
  <span class="period">${esc(opts.period)}</span>
</header>`;
}

function kpiCard(label: string, value: string, sub?: string): string {
  return `<article class="kpi">
  <span class="lbl">${esc(label)}</span>
  <strong class="val">${esc(value)}</strong>
  ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
</article>`;
}

function renderCover(deck: VillagePresentation): string {
  const meet = `${deck.cover.title} HELD ON ${deck.cover.date}, IN ${deck.cover.place}`;
  return `<section class="slide cover">
  <div class="cover-deco-tl"></div>
  <div class="cover-deco-bot"></div>
  <div class="body">
    <img class="cover-banner" src="/exco/cover-banner.png" alt="PPC" />
    <div class="cover-meet">
      <img class="cover-badge" src="/exco/cover-badge.png" alt="" />
      <p>${esc(meet)}</p>
    </div>
  </div>
</section>`;
}

function renderDashboard(deck: VillagePresentation, stats: VillageDashboardStats): string {
  const occPct = stats.maisonsTotal
    ? ratioToRate(stats.maisonsOccupees, stats.maisonsTotal)
    : 0;
  const kpis = [
    kpiCard('Houses', String(stats.maisonsTotal), 'Village inventory'),
    kpiCard('Occupied', String(stats.maisonsOccupees), `${formatRate(occPct)} occupancy`),
    kpiCard('Vacant', String(stats.maisonsVides), 'Available'),
    kpiCard('Village', String(stats.village), `${stats.villagePersonnes} with family`),
    kpiCard('Kimpese', String(stats.kimpese), `${stats.kimpesePersonnes} with family`),
    kpiCard('Zamba', String(stats.zamba), 'Headcount'),
  ].join('');

  const typeRows = stats.parTaille
    .map((row, i) => {
      const pct = row.total ? ratioToRate(row.occupees, row.total) : 0;
      const zebra = i % 2 === 0 ? '' : ' class="alt"';
      return `<tr${zebra}>
        <td class="left"><strong>${esc(enLabel(row.label))}</strong></td>
        <td>${row.total}</td>
        <td class="ok">${row.occupees}</td>
        <td class="${row.vides ? 'warn' : ''}">${row.vides}</td>
        <td class="red"><strong>${esc(formatRate(pct))}</strong></td>
      </tr>`;
    })
    .join('');
  const typeTable = `<table class="v-table">
    <thead><tr><th class="left">House type</th><th>Total</th><th>Occupied</th><th>Vacant</th><th>Occ. %</th></tr></thead>
    <tbody>
      ${typeRows}
      <tr class="total">
        <td class="left"><strong>Total</strong></td>
        <td><strong>${stats.maisonsTotal}</strong></td>
        <td><strong>${stats.maisonsOccupees}</strong></td>
        <td><strong>${stats.maisonsVides}</strong></td>
        <td class="red"><strong>${esc(formatRate(occPct))}</strong></td>
      </tr>
    </tbody>
  </table>`;

  const cols = stats.tailleColumns;
  const colTotals: Record<string, number> = {};
  for (const col of cols) colTotals[col] = 0;
  const deptRows = stats.parDepartementTaille
    .map((row, i) => {
      const zebra = i % 2 === 0 ? '' : ' class="alt"';
      for (const col of cols) colTotals[col] = (colTotals[col] ?? 0) + (row.counts[col] ?? 0);
      const cells = cols
        .map((col) => {
          const n = row.counts[col] ?? 0;
          return `<td class="${n ? '' : 'muted'}">${n ? n : '—'}</td>`;
        })
        .join('');
      return `<tr${zebra}>
        <td class="left"><strong>${esc(enLabel(row.departement))}</strong></td>
        ${cells}
        <td class="red"><strong>${row.total}</strong></td>
      </tr>`;
    })
    .join('');
  const grand = stats.parDepartementTaille.reduce((sum, r) => sum + r.total, 0);
  const deptHead = `<th class="left">Department</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total</th>`;
  const deptTotalCells = cols.map((col) => `<td><strong>${colTotals[col] ?? 0}</strong></td>`).join('');
  const deptTable = `<table class="v-table compact">
    <thead><tr>${deptHead}</tr></thead>
    <tbody>
      ${deptRows}
      <tr class="total">
        <td class="left"><strong>Total</strong></td>
        ${deptTotalCells}
        <td class="red"><strong>${grand}</strong></td>
      </tr>
    </tbody>
  </table>`;

  const criteria = deck.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA;
  const title = String(criteria.title ?? '').trim();
  const intro = String(criteria.intro ?? '').trim();
  const items = Array.isArray(criteria.items)
    ? criteria.items.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  const criteriaBox =
    title || intro || items.length
      ? `<aside class="criteria">
          ${title ? `<h3>${esc(title)}</h3>` : ''}
          ${intro ? `<p>${esc(intro)}</p>` : ''}
          ${
            items.length
              ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
              : ''
          }
        </aside>`
      : '';

  return `<section class="slide">
  ${chrome({
    title: deck.dashboard.title,
    period: deck.period,
    sectionNo: '01',
    kicker: deck.chromeKicker,
  })}
  <div class="body dash-body">
    <div class="kpis kpis-6">${kpis}</div>
    <div class="dash-grid">
      <div>
        <h2>Houses by type</h2>
        ${typeTable}
        ${criteriaBox}
      </div>
      <div>
        <h2>By department × type</h2>
        ${deptTable}
      </div>
    </div>
  </div>
  <div class="bar-bot"></div>
</section>`;
}

function vacantTable(
  rows: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): string {
  const body = rows.length
    ? rows
        .map((m, i) => {
          const type = resolveMaisonTypeLabel(m.taille, m.typeMaison, tailles);
          const zebra = i % 2 === 0 ? '' : ' class="alt"';
          return `<tr${zebra}>
            <td class="left red"><strong>${esc(displayHouse(m.numero))}</strong></td>
            <td class="left">${esc(enLabel(type))}</td>
            <td>${m.capacite != null ? m.capacite : '—'}</td>
            <td class="warn"><strong>Vacant</strong></td>
          </tr>`;
        })
        .join('')
    : `<tr><td class="left" colspan="4">No vacant houses</td></tr>`;
  return `<table class="v-table">
    <thead><tr><th class="left">House</th><th class="left">Type</th><th>Capacity</th><th>Status</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderVacant(
  deck: VillagePresentation,
  occupancy: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): string {
  const empty = occupancy
    .filter((m) => !m.occupied)
    .slice()
    .sort((a, b) => compareMaisonNumero(a.numero, b.numero));
  const byType = new Map<string, number>();
  for (const maison of empty) {
    const label = resolveMaisonTypeLabel(maison.taille, maison.typeMaison, tailles);
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  const typeEntries = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const pageSize = 22;
  const pages = Math.max(1, Math.ceil(empty.length / pageSize) || 1);

  return Array.from({ length: pages }, (_, page) => {
    const suffix = pages > 1 ? ` (${page + 1}/${pages})` : '';
    const summary =
      page === 0
        ? (() => {
            const cards = [
              kpiCard('Vacant houses', String(empty.length)),
              ...typeEntries.slice(0, 3).map(([label, count]) => kpiCard(enLabel(label), String(count))),
            ];
            while (cards.length < 4) cards.push(kpiCard('—', '—'));
            return `<div class="kpis kpis-4">${cards.slice(0, 4).join('')}</div>`;
          })()
        : '';
    const slice = empty.slice(page * pageSize, (page + 1) * pageSize);
    const mid = Math.ceil(slice.length / 2) || 1;
    const left = slice.slice(0, mid);
    const right = slice.slice(mid);
    return `<section class="slide">
      ${chrome({
        title: `${deck.vacant.title}${suffix}`,
        period: deck.period,
        sectionNo: '02',
        kicker: deck.chromeKicker,
      })}
      <div class="body vacant-body">
        ${summary}
        <div class="vacant-grid">
          ${vacantTable(left, tailles)}
          ${right.length ? vacantTable(right, tailles) : ''}
        </div>
      </div>
      <div class="bar-bot"></div>
    </section>`;
  }).join('');
}

function renderProposals(
  deck: VillagePresentation,
  occupancy: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): string {
  const items = deck.proposals.items.length
    ? deck.proposals.items
    : [{ id: 'empty', house: '—', name: 'No proposal', matricule: '', purpose: '', badge: 'proposal' as const }];
  const cards = items
    .map((spec) => {
      const maison = findMaison(occupancy, spec.house);
      const type = maison
        ? resolveMaisonTypeLabel(maison.taille, maison.typeMaison, tailles)
        : '—';
      const houseLabel = maison ? displayHouse(maison.numero) : spec.house || '—';
      const occupantNow = maison?.occupants[0];
      const status = occupantNow
        ? `Currently: ${formatDisplayName(occupantNow.nom)}`
        : 'Currently vacant';
      const roleOnly = spec.badge === 'role';
      const meta = [spec.purpose, !roleOnly && spec.matricule ? `ID ${spec.matricule}` : '']
        .filter(Boolean)
        .join('  ·  ');
      return `<article class="proposal">
        <span class="house">${esc(houseLabel)}</span>
        <div class="who">
          <strong>${esc(spec.name || '—')}</strong>
          <span>${esc(meta || ' ')}</span>
        </div>
        <div class="meta">
          <strong>${esc(enLabel(type))}</strong>
          <span>${esc(status)}</span>
        </div>
        <span class="tag ${roleOnly ? 'role' : 'prop'}">${roleOnly ? 'Role / use' : 'Proposal'}</span>
      </article>`;
    })
    .join('');
  const note = deck.proposals.note
    ? `<p class="note">${esc(deck.proposals.note)}</p>`
    : '';
  return `<section class="slide">
    ${chrome({
      title: deck.proposals.title,
      period: deck.period,
      sectionNo: '03',
      kicker: deck.chromeKicker,
    })}
    <div class="body proposals-body">
      ${note}
      <div class="proposal-list">${cards}</div>
    </div>
    <div class="bar-bot"></div>
  </section>`;
}

function renderThanks(deck: VillagePresentation): string {
  return `<section class="slide">
    <div class="bar-top"></div>
    <div class="body thanks-body">
      <div class="thanks-card">
        <p class="thanks-kicker">${esc(brandKicker(deck.thankYou.kicker || deck.chromeKicker))}</p>
        <strong class="thanks-msg">${esc(deck.thankYou.message || 'Thank You')}</strong>
        <span class="thanks-rule"></span>
        <span class="thanks-period">${esc(deck.period)}</span>
      </div>
    </div>
    <div class="bar-bot"></div>
  </section>`;
}

export function buildVillagePreviewHtml(
  deck: VillagePresentation,
  stats: VillageDashboardStats,
  occupancy: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Village preview — ${esc(deck.period)}</title>
<style>
  :root {
    --red: #e30613;
    --ink: #16161e;
    --muted: #6b6b7a;
    --line: #e0e0e6;
    --panel: #f7f7fa;
    --white: #fff;
    --black: #0a0a0a;
    --ok: #166534;
    --warn: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: 'Segoe UI', Calibri, sans-serif;
    background: #cfcfd6;
    color: var(--ink);
  }
  .deck { display: flex; flex-direction: column; gap: 22px; max-width: 1280px; margin: 0 auto; }
  .slide {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #e8e8ec url('/exco/slide-fade.jpg') center / cover no-repeat;
    border-radius: 3px;
    box-shadow: 0 6px 22px rgba(0,0,0,.16);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .bar-top { height: 4px; background: var(--red); flex: 0 0 auto; }
  .bar-bot { height: 7px; background: var(--black); flex: 0 0 auto; }
  .head {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 14px 4px; flex: 0 0 auto; background: #fff;
    border-bottom: 1px solid var(--line);
  }
  .badge {
    width: 24px; height: 24px; border-radius: 4px; background: var(--red);
    color: #fff; font-size: 11px; font-weight: 700;
    display: grid; place-items: center; flex: 0 0 auto;
  }
  .head-txt { display: flex; flex-direction: column; gap: 0; line-height: 1.05; }
  .brand { margin: 0; color: var(--red); font-size: 8px; font-weight: 700; }
  .head h1 { margin: 0; font-size: 15px; font-weight: 800; }
  .head .period { margin-left: auto; color: var(--muted); font-size: 11px; }
  .body { flex: 1; min-height: 0; padding: 8px 14px 10px; overflow: hidden; }

  .cover { background: #fff; }
  .cover .body {
    padding: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: flex-start; position: relative; overflow: hidden;
  }
  .cover-deco-tl {
    position: absolute; left: -70px; top: -80px; width: 220px; height: 220px;
    border-radius: 50%; background: #e8e8ec; pointer-events: none;
  }
  .cover-deco-bot {
    position: absolute; left: 50%; bottom: -90px; transform: translateX(-50%);
    width: 180px; height: 180px; border-radius: 50%; background: #d8d8de; pointer-events: none;
  }
  .cover-banner { position: relative; z-index: 1; width: 90%; max-width: 920px; margin-top: 28px; display: block; }
  .cover-meet {
    position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    margin-top: 56px; max-width: 92%;
  }
  .cover-badge { width: 18px; height: 18px; flex: 0 0 auto; display: block; }
  .cover-meet p { margin: 0; font-size: 13px; font-weight: 700; color: #0a0a0a; }

  .kpis { display: grid; gap: 6px; }
  .kpis-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .kpis-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 8px; }
  .kpi {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px 6px 11px;
    position: relative;
    min-width: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
  }
  .kpi::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: var(--red); border-radius: 6px 0 0 6px;
  }
  .kpi .lbl { display: block; color: var(--red); font-size: 8px; font-weight: 700; }
  .kpi .val { display: block; font-size: 18px; font-weight: 800; line-height: 1.15; }
  .kpi .sub { display: block; color: var(--muted); font-size: 8px; }

  .dash-body, .vacant-body, .proposals-body { display: flex; flex-direction: column; }
  .dash-grid {
    display: grid;
    grid-template-columns: 1fr 1.08fr;
    gap: 12px;
    margin-top: 8px;
    min-height: 0;
    flex: 1;
  }
  .dash-grid h2, .vacant-body h2 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 800;
  }
  .v-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .v-table.compact { font-size: 8.5px; }
  .v-table th {
    background: var(--black); color: #fff; font-weight: 700;
    padding: 4px 5px; text-align: center;
  }
  .v-table td { padding: 3px 5px; text-align: center; border-bottom: 1px solid var(--line); background: #fff; }
  .v-table tr.alt td { background: var(--panel); }
  .v-table tr.total td { background: #fce8e9; font-weight: 700; }
  .v-table .left, .v-table th.left { text-align: left; }
  .v-table .ok { color: var(--ok); }
  .v-table .warn { color: var(--warn); }
  .v-table .red { color: var(--red); }
  .v-table .muted { color: var(--muted); }

  .criteria {
    margin-top: 8px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 10px 8px 12px;
    border-left: 3px solid var(--red);
  }
  .criteria h3 { margin: 0 0 4px; color: var(--red); font-size: 12px; }
  .criteria p { margin: 0 0 4px; font-size: 10px; }
  .criteria ul { margin: 0; padding-left: 16px; font-size: 10px; }
  .criteria li + li { margin-top: 1px; }

  .vacant-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 0; flex: 1; }

  .note { margin: 0 0 6px; font-size: 10px; color: var(--muted); font-style: italic; }
  .proposal-list { display: flex; flex-direction: column; gap: 5px; overflow: auto; min-height: 0; flex: 1; }
  .proposal {
    display: grid;
    grid-template-columns: 72px 1fr 160px 92px;
    gap: 8px;
    align-items: center;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,.05);
  }
  .proposal .house {
    background: var(--red); color: #fff; font-weight: 800; font-size: 12px;
    border-radius: 5px; text-align: center; padding: 6px 4px;
  }
  .proposal .who { min-width: 0; }
  .proposal .who strong, .proposal .meta strong { display: block; font-size: 12px; }
  .proposal .who span, .proposal .meta span { display: block; color: var(--muted); font-size: 10px; }
  .proposal .meta { text-align: right; }
  .proposal .meta strong { color: var(--red); }
  .tag {
    justify-self: end;
    font-size: 9px; font-weight: 700; border-radius: 5px; padding: 4px 8px; text-align: center;
  }
  .tag.prop { background: #dbeafe; color: #1d4ed8; }
  .tag.role { background: #fef3c7; color: #b45309; }

  .thanks-body { display: grid; place-items: center; }
  .thanks-card {
    width: min(72%, 720px);
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 36px 24px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0,0,0,.06);
  }
  .thanks-kicker { margin: 0; color: var(--red); font-weight: 700; font-size: 13px; }
  .thanks-msg { display: block; font-size: 42px; font-weight: 800; margin: 10px 0 12px; }
  .thanks-rule { display: block; width: 48px; height: 4px; background: var(--red); margin: 0 auto 12px; }
  .thanks-period { color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
  <div class="deck">
    ${renderCover(deck)}
    ${renderDashboard(deck, stats)}
    ${renderVacant(deck, occupancy, tailles)}
    ${renderProposals(deck, occupancy, tailles)}
    ${renderThanks(deck)}
  </div>
</body>
</html>`;
}
