'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import PermissionGate from '@/components/PermissionGate';
import {
  applyCustomLines,
  autoLogementMonthly,
  autoTransportMonthly,
  BULLETIN_BASE_OPTIONS,
  DEFAULT_PAIE_RATES,
  effectFromBlock,
  formatCdf,
  formatPct,
  formatTension,
  getSmigClassification,
  INPP_RATES,
  IPR_ANNUAL_BRACKETS,
  IPR_MAX_OF_BASE,
  newCustomPaieLine,
  PAIE_POLICY_META,
  resolveSmigForMonth,
  simulatePaie,
  SMIG_CLASSIFICATIONS,
  SMIG_DAYS_PER_MONTH,
  SMIG_PERIODS,
  smigDailyForClassification,
  smigFamilyAllowanceDaily,
  smigHousingDailyCap,
  smigMonthlyCdf,
  smigTensionCoeff,
  type BulletinBaseKey,
  type BulletinBlockId,
  type CustomLineMode,
  type CustomPaieLine,
  type InppBand,
  type PaieRates,
} from '@/lib/politique-paie';

type PaieTab = 'simulation' | 'smig';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function StackCell({ day, month }: { day: number; month: number }) {
  return (
    <td className="politique-paie-stack-cell">
      <span className="is-day">{formatCdf(day)}</span>
      <span className="is-month">{formatCdf(month)}</span>
    </td>
  );
}

function BulletinRow({
  label,
  value,
  formula,
  className,
  baseKey,
  linkMode,
  onPickBase,
}: {
  label: string;
  value: string;
  formula?: string;
  className?: string;
  baseKey?: BulletinBaseKey;
  linkMode?: boolean;
  onPickBase?: (key: BulletinBaseKey) => void;
}) {
  const pickable = Boolean(linkMode && baseKey && onPickBase);
  return (
    <div
      className={`politique-paie-b-row${className ? ` ${className}` : ''}${pickable ? ' is-pickable' : ''}`}
      title={formula || undefined}
      onClick={pickable && baseKey && onPickBase ? () => onPickBase(baseKey) : undefined}
      role={pickable ? 'button' : undefined}
      tabIndex={pickable ? 0 : undefined}
      onKeyDown={
        pickable && baseKey && onPickBase
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPickBase(baseKey);
              }
            }
          : undefined
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CustomLineCard({
  line,
  amount,
  linking,
  onUpdate,
  onRemove,
  onToggleLink,
  onValidate,
  onEdit,
  onDragStart,
  onDragEnd,
}: {
  line: CustomPaieLine;
  amount: number;
  linking: boolean;
  onUpdate: (id: string, patch: Partial<CustomPaieLine>) => void;
  onRemove: (id: string) => void;
  onToggleLink: (id: string) => void;
  onValidate: (id: string) => void;
  onEdit: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const baseLabel =
    BULLETIN_BASE_OPTIONS.find((b) => b.id === line.percentOf)?.label || 'Tot. Base';
  const sign = line.effect === 'deduct_net' ? '− ' : line.effect === 'add_net' ? '+ ' : '';
  const formula =
    line.mode === 'percent'
      ? `${line.label} = ${line.value} % × ${baseLabel} = ${formatCdf(amount)}`
      : `${line.label} = ${formatCdf(amount)}`;

  if (line.validated) {
    return (
      <div
        className="politique-paie-custom-line is-validated"
        draggable
        onDragStart={() => onDragStart(line.id)}
        onDragEnd={onDragEnd}
        title={formula}
      >
        <div className="politique-paie-custom-main">
          <span className="politique-paie-drag" title="Glisser vers un autre bloc">⠿</span>
          <span className="politique-paie-custom-validated-label">{line.label}</span>
          {line.mode === 'percent' ? (
            <span className="politique-paie-custom-pct-hint">
              {line.value} % × {baseLabel}
            </span>
          ) : null}
          <strong className="politique-paie-custom-amt">
            {sign}
            {formatCdf(amount)}
          </strong>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit(line.id)}
            title="Modifier"
          >
            ✎
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRemove(line.id)}
            aria-label="Supprimer la ligne"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`politique-paie-custom-line${linking ? ' is-linking' : ''}`}
      draggable
      onDragStart={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('input, select, button')) {
          e.preventDefault();
          return;
        }
        onDragStart(line.id);
      }}
      onDragEnd={onDragEnd}
      title={formula}
    >
      <div className="politique-paie-custom-main">
        <span className="politique-paie-drag" title="Glisser vers un bloc">⠿</span>
        <input
          className="politique-paie-custom-label"
          value={line.label}
          onChange={(e) => onUpdate(line.id, { label: e.target.value })}
          aria-label="Libellé ligne"
        />
        <select
          value={line.mode}
          onChange={(e) => onUpdate(line.id, { mode: e.target.value as CustomLineMode })}
          aria-label="Mode montant ou %"
        >
          <option value="amount">CDF</option>
          <option value="percent">%</option>
        </select>
        <input
          type="number"
          step={line.mode === 'percent' ? 0.1 : 1}
          value={Number.isFinite(line.value) ? line.value : 0}
          onChange={(e) => onUpdate(line.id, { value: parseAmount(e.target.value) })}
          aria-label="Valeur"
        />
        {line.mode === 'percent' ? (
          <button
            type="button"
            className={`btn btn-secondary btn-sm${linking ? ' is-active-link' : ''}`}
            onClick={() => onToggleLink(line.id)}
            title="Cliquer puis choisir une rubrique du bulletin"
          >
            {linking ? 'Choisir…' : `sur ${baseLabel}`}
          </button>
        ) : null}
        <strong className="politique-paie-custom-amt">
          {sign}
          {formatCdf(amount)}
        </strong>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onValidate(line.id)}
        >
          Valider
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onRemove(line.id)}
          aria-label="Supprimer la ligne"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function BulletinBlockDrop({
  block,
  dropActive,
  onDropLine,
  children,
}: {
  block: BulletinBlockId;
  dropActive: boolean;
  onDropLine: (block: BulletinBlockId) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`politique-paie-block${dropActive ? ' is-drop-target' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropLine(block);
      }}
    >
      {children}
    </div>
  );
}

export default function PolitiquePaiePage() {
  const yearMonth = currentYearMonth();
  const currentPeriod = resolveSmigForMonth(yearMonth);

  const [tab, setTab] = useState<PaieTab>('simulation');
  const [classId, setClassId] = useState('mo');
  const [smigPeriodId, setSmigPeriodId] = useState(currentPeriod.id);

  const classification = getSmigClassification(classId);
  const classDaily = smigDailyForClassification(classification, currentPeriod.dailyCdf);
  const classMonthly = smigMonthlyCdf(classDaily);

  const [salBase, setSalBase] = useState(String(classMonthly));
  const [nbJours, setNbJours] = useState(String(SMIG_DAYS_PER_MONTH));
  const [joursRef, setJoursRef] = useState(String(SMIG_DAYS_PER_MONTH));
  const [logement, setLogement] = useState(
    String(autoLogementMonthly(classDaily, SMIG_DAYS_PER_MONTH)),
  );
  const [transport, setTransport] = useState(
    String(autoTransportMonthly(classDaily, SMIG_DAYS_PER_MONTH)),
  );
  const [arrondi, setArrondi] = useState('0');
  const [inppBand, setInppBand] = useState<InppBand>('51-300');
  const [logementLocked, setLogementLocked] = useState(false);
  const [transportLocked, setTransportLocked] = useState(false);
  const [salBaseLocked, setSalBaseLocked] = useState(false);
  const [customLines, setCustomLines] = useState<CustomPaieLine[]>([]);
  const [linkingLineId, setLinkingLineId] = useState<string | null>(null);
  const [dragLineId, setDragLineId] = useState<string | null>(null);

  const nbJoursNum = parseAmount(nbJours);

  useEffect(() => {
    const cls = getSmigClassification(classId);
    const daily = smigDailyForClassification(cls, currentPeriod.dailyCdf);
    const days = nbJoursNum || SMIG_DAYS_PER_MONTH;
    if (!salBaseLocked) setSalBase(String(smigMonthlyCdf(daily)));
    if (!logementLocked) setLogement(String(autoLogementMonthly(daily, days)));
    if (!transportLocked) setTransport(String(autoTransportMonthly(daily, days)));
  }, [classId, nbJoursNum, currentPeriod.dailyCdf, salBaseLocked, logementLocked, transportLocked]);

  const rates: PaieRates = useMemo(
    () => ({ ...DEFAULT_PAIE_RATES, inpp: INPP_RATES[inppBand] }),
    [inppBand],
  );

  const core = useMemo(
    () =>
      simulatePaie({
        salBase: parseAmount(salBase),
        nbJours: nbJoursNum,
        joursRef: parseAmount(joursRef) || SMIG_DAYS_PER_MONTH,
        logement: parseAmount(logement),
        transport: parseAmount(transport),
        arrondi: parseAmount(arrondi),
        rates,
      }),
    [salBase, nbJoursNum, joursRef, logement, transport, arrondi, rates],
  );

  const result = useMemo(() => applyCustomLines(core, customLines), [core, customLines]);

  const smigTablePeriod =
    SMIG_PERIODS.find((p) => p.id === smigPeriodId) || currentPeriod;

  const formulas = useMemo(() => {
    const jRef = parseAmount(joursRef) || SMIG_DAYS_PER_MONTH;
    return {
      salBase: 'Salaire de base mensuel saisi (SMIG classification par défaut)',
      nbJours: `Jours prestés / jours de référence (${jRef})`,
      totBase: `Tot. Base = Sal. Base × Nb jrs ÷ ${jRef}`,
      cnssAgent: `CNSS agent = Tot. Base × ${formatPct(rates.cnssAgent)}`,
      cnssPatronal: `CNSS patronal = Tot. Base × ${formatPct(rates.cnssPatronal)}`,
      onem: `ONEM = Tot. Base × ${formatPct(rates.onem)}`,
      inpp: `INPP = Tot. Base × ${formatPct(rates.inpp)}`,
      irpp: `IRPP = barème progressif annuel( (Tot. Base − CNSS agent) × 12 ) ÷ 12, plafond ${formatPct(IPR_MAX_OF_BASE)}`,
      totRetenu: 'Tot. Retenu = CNSS agent + IRPP (+ lignes retenues custom)',
      salBrute: 'Sal. Brute = Tot. Base + Logement + Transport (+ gains custom)',
      logement: 'Logement = contre-valeur journalière × Nb jrs (modifiable)',
      transport: 'Transport = alloc. familiale journalière × Nb jrs (modifiable)',
      arrondi: 'Arrondi manuel (+/− sur le net)',
      netAPayer: 'Net = Tot. Base − Tot. Retenu + Logement + Transport + Arrondi ± lignes custom',
      coutEmployeur:
        'Coût employeur = Tot. Base + CNSS patronal + ONEM + INPP + Logement + Transport + Arrondi + charges/gains custom',
    } as const;
  }, [joursRef, rates]);

  function applyClassificationDefaults() {
    const daily = smigDailyForClassification(classification, currentPeriod.dailyCdf);
    const days = SMIG_DAYS_PER_MONTH;
    setSalBaseLocked(false);
    setLogementLocked(false);
    setTransportLocked(false);
    setSalBase(String(smigMonthlyCdf(daily)));
    setNbJours(String(SMIG_DAYS_PER_MONTH));
    setJoursRef(String(SMIG_DAYS_PER_MONTH));
    setLogement(String(autoLogementMonthly(daily, days)));
    setTransport(String(autoTransportMonthly(daily, days)));
    setArrondi('0');
  }

  function updateCustom(id: string, patch: Partial<CustomPaieLine>) {
    setCustomLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeCustom(id: string) {
    setCustomLines((prev) => prev.filter((l) => l.id !== id));
    if (linkingLineId === id) setLinkingLineId(null);
  }

  function pickBase(key: BulletinBaseKey) {
    if (!linkingLineId) return;
    updateCustom(linkingLineId, { percentOf: key, mode: 'percent' });
    setLinkingLineId(null);
  }

  function dropOnBlock(block: BulletinBlockId) {
    if (!dragLineId) return;
    updateCustom(dragLineId, { block, effect: effectFromBlock(block) });
    setDragLineId(null);
  }

  function renderCustomLines(block: BulletinBlockId) {
    return result.customs
      .filter((l) => l.block === block)
      .map((line) => (
        <CustomLineCard
          key={line.id}
          line={line}
          amount={line.amount}
          linking={linkingLineId === line.id}
          onUpdate={updateCustom}
          onRemove={removeCustom}
          onToggleLink={(id) => setLinkingLineId((cur) => (cur === id ? null : id))}
          onValidate={(id) => updateCustom(id, { validated: true })}
          onEdit={(id) => updateCustom(id, { validated: false })}
          onDragStart={setDragLineId}
          onDragEnd={() => setDragLineId(null)}
        />
      ));
  }

  const linkHint = linkingLineId
    ? 'Cliquez une rubrique du bulletin pour lier le %'
    : null;

  return (
    <PermissionGate
      menuId="politique.paie"
      action="view"
      fallback={<p className="docs-hub-empty">Vous n’avez pas accès à cette politique.</p>}
    >
      <div className="convention-page politique-page politique-paie-page">
        <header className="convention-topbar">
          <div>
            <h2>{PAIE_POLICY_META.title}</h2>
            <p className="politique-sub">{PAIE_POLICY_META.subtitle}</p>
          </div>
          <div className="page-header-actions politique-paie-header-actions">
            <div className="tabs header-tabs-compact politique-paie-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`tab-btn tab-btn-sm${tab === 'simulation' ? ' active' : ''}`}
                aria-selected={tab === 'simulation'}
                onClick={() => setTab('simulation')}
              >
                Simulation
              </button>
              <button
                type="button"
                role="tab"
                className={`tab-btn tab-btn-sm${tab === 'smig' ? ' active' : ''}`}
                aria-selected={tab === 'smig'}
                onClick={() => setTab('smig')}
              >
                SMIG
              </button>
            </div>
            <Link href="/politique" className="btn btn-secondary btn-sm" prefetch={false}>
              ← Politique
            </Link>
          </div>
        </header>

        <p className="politique-paie-disclaimer">{PAIE_POLICY_META.disclaimer}</p>

        {tab === 'simulation' ? (
          <section className="panel politique-paie-section politique-paie-sim-tab">
            <div className="politique-paie-section-head">
              <h3>Simulation de paie</h3>
              <span className="politique-paie-chip">
                {classification.code} · {classification.label}
              </span>
            </div>

            <div className="politique-paie-split">
              <form className="politique-paie-form" onSubmit={(e) => e.preventDefault()}>
                <div className="politique-paie-form-grid">
                  <label className="is-wide">
                    Classification
                    <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                      {SMIG_CLASSIFICATIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.label}
                          {c.echelon ? ` (éch. ${c.echelon})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sal. Base (mensuel CDF)
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={salBase}
                      onChange={(e) => {
                        setSalBaseLocked(true);
                        setSalBase(e.target.value);
                      }}
                    />
                    <span className="politique-paie-field-hint">
                      SMIG {formatCdf(classMonthly)} ({formatCdf(classDaily)}/j)
                    </span>
                  </label>
                  <label>
                    Nb jrs
                    <input
                      type="number"
                      min={0}
                      max={31}
                      step={1}
                      value={nbJours}
                      onChange={(e) => setNbJours(e.target.value)}
                    />
                  </label>
                  <label>
                    Jours de référence
                    <input
                      type="number"
                      min={1}
                      max={31}
                      step={1}
                      value={joursRef}
                      onChange={(e) => setJoursRef(e.target.value)}
                    />
                  </label>
                  <label>
                    Logement
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={logement}
                      onChange={(e) => {
                        setLogementLocked(true);
                        setLogement(e.target.value);
                      }}
                    />
                    <span className="politique-paie-field-hint">
                      Auto : contre-valeur × jours
                      {logementLocked ? ' · modifié' : ''}
                    </span>
                  </label>
                  <label>
                    Transport
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={transport}
                      onChange={(e) => {
                        setTransportLocked(true);
                        setTransport(e.target.value);
                      }}
                    />
                    <span className="politique-paie-field-hint">
                      Auto : alloc. fam. × jours
                      {transportLocked ? ' · modifié' : ''}
                    </span>
                  </label>
                  <label>
                    Arrondi
                    <input
                      type="number"
                      step={1}
                      value={arrondi}
                      onChange={(e) => setArrondi(e.target.value)}
                    />
                  </label>
                  <label>
                    Taux INPP (privé)
                    <select
                      value={inppBand}
                      onChange={(e) => setInppBand(e.target.value as InppBand)}
                    >
                      <option value="1-50">1–50 — {formatPct(INPP_RATES['1-50'])}</option>
                      <option value="51-300">51–300 — {formatPct(INPP_RATES['51-300'])}</option>
                      <option value="300+">+300 — {formatPct(INPP_RATES['300+'])}</option>
                    </select>
                  </label>
                </div>

                <div className="politique-paie-form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={applyClassificationDefaults}
                  >
                    Recalculer selon classification
                  </button>
                </div>

                <aside className="politique-paie-rates politique-paie-rates-inline">
                  <h4>Taux & barème IPR</h4>
                  <dl>
                    <div>
                      <dt>CNSS agent / patronal</dt>
                      <dd>
                        {formatPct(DEFAULT_PAIE_RATES.cnssAgent)} /{' '}
                        {formatPct(DEFAULT_PAIE_RATES.cnssPatronal)}
                      </dd>
                    </div>
                    <div>
                      <dt>ONEM / INPP</dt>
                      <dd>
                        {formatPct(DEFAULT_PAIE_RATES.onem)} / {formatPct(rates.inpp)}
                      </dd>
                    </div>
                  </dl>
                  <ul>
                    {IPR_ANNUAL_BRACKETS.map((b, i) => {
                      const prev = i === 0 ? 0 : IPR_ANNUAL_BRACKETS[i - 1].upTo;
                      const label =
                        b.upTo === Number.POSITIVE_INFINITY
                          ? `> ${formatCdf(prev)}`
                          : `≤ ${formatCdf(b.upTo)}`;
                      return (
                        <li key={`${b.rate}-${b.upTo}`}>
                          {label} — {formatPct(b.rate)}
                        </li>
                      );
                    })}
                  </ul>
                </aside>
              </form>

              <article
                className={`politique-paie-bulletin-card${linkingLineId ? ' is-linking-mode' : ''}`}
                aria-label="Bulletin de paie"
              >
                <header className="politique-paie-bulletin-head">
                  <div>
                    <p className="politique-paie-bulletin-kicker">Bulletin de paie — indicatif</p>
                    <h4>{classification.label}</h4>
                    <p>
                      {classification.code}
                      {classification.echelon ? ` · Échelon ${classification.echelon}` : ''}
                      {' · '}
                      Tension {formatTension(smigTensionCoeff(classification.dailyFull))}
                    </p>
                  </div>
                  <div className="politique-paie-bulletin-net">
                    <span>Net à payer</span>
                    <strong>{formatCdf(result.netAPayer)}</strong>
                  </div>
                </header>

                {linkHint ? <p className="politique-paie-link-hint">{linkHint}</p> : null}

                <dl className="politique-paie-bulletin-lines">
                  <BulletinBlockDrop
                    block="base"
                    dropActive={Boolean(dragLineId)}
                    onDropLine={dropOnBlock}
                  >
                    <BulletinRow
                      label="Sal. Base"
                      value={formatCdf(core.salBase)}
                      formula={formulas.salBase}
                      baseKey="salBase"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Nb jrs / réf."
                      value={`${core.nbJours} / ${core.joursRef}`}
                      formula={formulas.nbJours}
                    />
                    <BulletinRow
                      label="Tot. Base"
                      value={formatCdf(core.totBase)}
                      formula={formulas.totBase}
                      className="is-emph"
                      baseKey="totBase"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    {renderCustomLines('base')}
                  </BulletinBlockDrop>

                  <div className="is-sep" />

                  <BulletinBlockDrop
                    block="charges"
                    dropActive={Boolean(dragLineId)}
                    onDropLine={dropOnBlock}
                  >
                    <BulletinRow
                      label={`CNSS patronal (${formatPct(rates.cnssPatronal)})`}
                      value={formatCdf(core.cnssPatronal)}
                      formula={formulas.cnssPatronal}
                      baseKey="cnssPatronal"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label={`ONEM (${formatPct(rates.onem)})`}
                      value={formatCdf(core.onem)}
                      formula={formulas.onem}
                      baseKey="onem"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label={`INPP (${formatPct(rates.inpp)})`}
                      value={formatCdf(core.inpp)}
                      formula={formulas.inpp}
                      baseKey="inpp"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    {renderCustomLines('charges')}
                  </BulletinBlockDrop>

                  <div className="is-sep" />

                  <BulletinBlockDrop
                    block="retenues"
                    dropActive={Boolean(dragLineId)}
                    onDropLine={dropOnBlock}
                  >
                    <BulletinRow
                      label={`CNSS agent (${formatPct(rates.cnssAgent)})`}
                      value={`− ${formatCdf(core.cnssAgent)}`}
                      formula={formulas.cnssAgent}
                      baseKey="cnssAgent"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="IRPP / IPR"
                      value={`− ${formatCdf(core.irpp)}`}
                      formula={formulas.irpp}
                      baseKey="irpp"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Tot. Retenu (salarié)"
                      value={`− ${formatCdf(result.totRetenu)}`}
                      formula={formulas.totRetenu}
                      className="is-emph"
                      baseKey="totRetenu"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    {renderCustomLines('retenues')}
                  </BulletinBlockDrop>

                  <div className="is-sep" />

                  <BulletinBlockDrop
                    block="indemnites"
                    dropActive={Boolean(dragLineId)}
                    onDropLine={dropOnBlock}
                  >
                    <BulletinRow
                      label="Sal. Brute"
                      value={formatCdf(result.salBrute)}
                      formula={formulas.salBrute}
                      baseKey="salBrute"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Logement"
                      value={`+ ${formatCdf(core.logement)}`}
                      formula={formulas.logement}
                      baseKey="logement"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Transport"
                      value={`+ ${formatCdf(core.transport)}`}
                      formula={formulas.transport}
                      baseKey="transport"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Arrondi"
                      value={`${core.arrondi >= 0 ? '+ ' : '− '}${formatCdf(Math.abs(core.arrondi))}`}
                      formula={formulas.arrondi}
                      baseKey="arrondi"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    {renderCustomLines('indemnites')}
                  </BulletinBlockDrop>

                  <div className="is-sep" />

                  <BulletinBlockDrop
                    block="resultats"
                    dropActive={Boolean(dragLineId)}
                    onDropLine={dropOnBlock}
                  >
                    <BulletinRow
                      label="Net à payer"
                      value={formatCdf(result.netAPayer)}
                      formula={formulas.netAPayer}
                      className="is-net"
                      baseKey="netAPayer"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    <BulletinRow
                      label="Coût employeur"
                      value={formatCdf(result.coutEmployeur)}
                      formula={formulas.coutEmployeur}
                      className="is-cost"
                      baseKey="coutEmployeur"
                      linkMode={Boolean(linkingLineId)}
                      onPickBase={pickBase}
                    />
                    {renderCustomLines('resultats')}
                  </BulletinBlockDrop>
                </dl>

                <footer className="politique-paie-bulletin-foot">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      setCustomLines((prev) => [
                        ...prev,
                        newCustomPaieLine({ block: 'indemnites', effect: 'add_net' }),
                      ])
                    }
                  >
                    + Ajouter une ligne
                  </button>
                </footer>
              </article>
            </div>
          </section>
        ) : (
          <section className="panel politique-paie-section politique-paie-smig-tab">
            <div className="politique-paie-section-head politique-paie-smig-head">
              <div className="politique-paie-smig-head-left">
                <h3>SMIG par classification</h3>
                <span className="politique-paie-chip">Décret n°25/22 · 30 mai 2025</span>
              </div>
              <label className="politique-paie-period-inline">
                Période
                <select value={smigPeriodId} onChange={(e) => setSmigPeriodId(e.target.value)}>
                  {SMIG_PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.id === currentPeriod.id ? ' (en vigueur)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="politique-table-wrap politique-paie-table-wrap">
              <table className="data-table politique-paie-smig-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Classification</th>
                    <th>Catégorie</th>
                    <th>Éch.</th>
                    <th>Tension</th>
                    <th>
                      SMIG
                      <span className="politique-paie-th-sub">jour / mois</span>
                    </th>
                    <th>
                      Alloc. fam.
                      <span className="politique-paie-th-sub">jour / mois</span>
                    </th>
                    <th>
                      Logement
                      <span className="politique-paie-th-sub">jour / mois</span>
                    </th>
                    <th>
                      Transport
                      <span className="politique-paie-th-sub">jour / mois</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SMIG_CLASSIFICATIONS.map((c) => {
                    const daily = smigDailyForClassification(c, smigTablePeriod.dailyCdf);
                    const monthly = smigMonthlyCdf(daily);
                    const fam = smigFamilyAllowanceDaily(daily);
                    const housing = smigHousingDailyCap(daily);
                    const transportDay = fam;
                    const isSelected = c.id === classId;
                    return (
                      <tr
                        key={c.id}
                        className={isSelected ? 'is-current-smig' : undefined}
                        onClick={() => {
                          setClassId(c.id);
                          setSalBaseLocked(false);
                          setLogementLocked(false);
                          setTransportLocked(false);
                        }}
                        title="Utiliser cette classification dans la simulation"
                      >
                        <td>
                          <strong>{c.code}</strong>
                        </td>
                        <td>
                          {c.label}
                          {isSelected ? (
                            <span className="politique-paie-inline-badge">Sélection</span>
                          ) : null}
                        </td>
                        <td>{c.category}</td>
                        <td>{c.echelon || '—'}</td>
                        <td>× {formatTension(smigTensionCoeff(c.dailyFull))}</td>
                        <StackCell day={daily} month={monthly} />
                        <StackCell day={fam} month={fam * SMIG_DAYS_PER_MONTH} />
                        <StackCell
                          day={housing}
                          month={autoLogementMonthly(daily, SMIG_DAYS_PER_MONTH)}
                        />
                        <StackCell
                          day={transportDay}
                          month={autoTransportMonthly(daily, SMIG_DAYS_PER_MONTH)}
                        />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="politique-paie-source">
              Source : {PAIE_POLICY_META.source}. Cadre de direction : plafond collab. 4 (tension 10).
            </p>
          </section>
        )}
      </div>
    </PermissionGate>
  );
}
