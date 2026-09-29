'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { DRC_PROVINCES } from '@/components/airtime/drc-provinces';

export type AirtimePlaceSlice = 'all' | 'ppc' | 'contractant' | 'sim' | 'other' | 'assigned' | 'unassigned';

export interface AirtimeMapFact {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface AirtimePlaceStat {
  id: string;
  label: string;
  total: number;
  ppc: number;
  contractant: number;
  assigned: number;
  unassigned: number;
  /** Lignes du tooltip. Sans cette liste, le tooltip Airtime (PPC, contractant, attribué) est utilisé. */
  facts?: AirtimeMapFact[];
}

const CITIES: Record<string, { lon: number; lat: number }> = {
  kinshasa: { lon: 15.32, lat: -4.32 },
  zamba: { lon: 14.55, lat: -5.35 },
  kimpese: { lon: 14.18, lat: -5.82 },
  usine: { lon: 14.9, lat: -5.55 },
  moanda: { lon: 12.42, lat: -5.93 },
  kikwit: { lon: 18.82, lat: -5.04 },
  idiofa: { lon: 19.6, lat: -4.96 },
  ilebo: { lon: 20.58, lat: -4.33 },
  kananga: { lon: 22.42, lat: -5.9 },
  tshikapa: { lon: 20.8, lat: -6.42 },
  'bena dibele': { lon: 22.85, lat: -4.1 },
  'bena di bela': { lon: 22.15, lat: -3.45 },
  kisangani: { lon: 25.19, lat: 0.51 },
  bumba: { lon: 22.47, lat: 2.18 },
  lubudi: { lon: 25.96, lat: -9.95 },
  lubumbashi: { lon: 27.48, lat: -11.66 },
};

const PAD = 28;
const WIDTH = 620;
const HEIGHT = 540;
const MIN_LON = 12.1;
const MAX_LON = 31.3;
const MIN_LAT = -13.45;
const MAX_LAT = 5.45;

export function airtimePlaceKey(place: string): string {
  const value = place.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!value) return 'autre';
  if (value.includes('kinsh') || value.includes('kish')) return 'kinshasa';
  if (value === 'zamba') return 'zamba';
  if (value === 'lubudi') return 'lubudi';
  return value;
}

export function airtimePlaceLabel(key: string): string {
  const known: Record<string, string> = {
    kinshasa: 'Kinshasa',
    zamba: 'Zamba',
    lubudi: 'Lubudi',
    kimpese: 'Kimpese',
    kikwit: 'Kikwit',
    ilebo: 'Ilebo',
    kananga: 'Kananga',
    tshikapa: 'Tshikapa',
    'bena dibele': 'Bena Dibele',
    'bena di bela': 'Bena Di bela',
    kisangani: 'Kisangani',
    bumba: 'Bumba',
    idiofa: 'Idiofa',
    lubumbashi: 'Lubumbashi',
    moanda: 'Moanda',
    usine: 'Usine',
    autre: 'Autre',
  };
  if (known[key]) return known[key];
  return key.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function project(lon: number, lat: number): { x: number; y: number } {
  return {
    x: PAD + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * (WIDTH - PAD * 2),
    y: PAD + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (HEIGHT - PAD * 2),
  };
}

interface Box { x: number; y: number; w: number; h: number }
interface Pin {
  site: AirtimePlaceStat;
  cx: number;
  cy: number;
  box: Box;
}

function hits(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function layoutPins(sites: AirtimePlaceStat[]): { pins: Pin[]; elsewhere: AirtimePlaceStat[] } {
  const boxes: Box[] = [];
  const pins: Pin[] = [];
  const elsewhere: AirtimePlaceStat[] = [];
  const ordered = [...sites].sort((a, b) => b.total - a.total);
  for (const site of ordered) {
    const city = CITIES[site.id] || CITIES[airtimePlaceKey(site.label)];
    if (!city) {
      elsewhere.push(site);
      continue;
    }
    const { x: cx, y: cy } = project(city.lon, city.lat);
    const w = Math.max(54, (`${site.total} ${site.label}`).length * 5.6 + 14);
    const h = 16;
    const towardWest = city.lon < 16.2;
    const base: Array<[number, number]> = towardWest
      ? [[-w - 14, -h / 2], [-w - 14, -h - 10], [-w - 14, 12], [14, -h / 2], [14, -h - 10], [14, 12], [-w / 2, -h - 16], [-w / 2, 14]]
      : [[14, -h / 2], [14, -h - 10], [-w - 14, -h / 2], [14, 12], [-w - 14, 12], [-w / 2, -h - 16], [-w / 2, 14], [14, -h - 22]];
    let chosen: [number, number] | null = null;
    for (let step = 0; step < 14 && !chosen; step += 1) {
      for (const [dx, dy] of base) {
        const ox = dx + Math.sign(dx || (towardWest ? -1 : 1)) * step * 11;
        const oy = dy + Math.sign(dy || -1) * step * 8;
        const box = { x: cx + ox, y: cy + oy, w, h };
        if (box.x < 4 || box.y < 4 || box.x + w > WIDTH - 4 || box.y + h > HEIGHT - 4) continue;
        const padded = { x: box.x - 5, y: box.y - 5, w: w + 10, h: h + 10 };
        if (boxes.some((other) => hits(padded, other))) continue;
        chosen = [ox, oy];
        break;
      }
    }
    const box = {
      x: Math.min(WIDTH - w - 4, Math.max(4, cx + (chosen?.[0] ?? 14))),
      y: Math.min(HEIGHT - h - 4, Math.max(4, cy + (chosen?.[1] ?? -h / 2))),
      w,
      h,
    };
    if (!chosen) {
      while (boxes.some((other) => hits({ x: box.x - 5, y: box.y - 5, w: w + 10, h: h + 10 }, other)) && box.y + h < HEIGHT - 6) {
        box.y += h + 6;
      }
    }
    boxes.push(box);
    pins.push({ site, cx, cy, box });
  }
  return { pins, elsewhere };
}

function siteFacts(site: AirtimePlaceStat): AirtimeMapFact[] {
  if (site.facts?.length) return site.facts;
  const other = Math.max(0, site.total - site.ppc - site.contractant);
  return [
    { id: 'ppc', label: 'PPC', value: site.ppc },
    { id: 'contractant', label: 'Contractant', value: site.contractant },
    { id: 'other', label: 'Autre', value: other },
  ].filter((fact) => fact.value > 0);
}

function pillSlice(site: AirtimePlaceStat): string {
  if (site.facts?.some((fact) => fact.id === 'total')) return 'total';
  return 'all';
}

export default function AirtimeDrcMap({
  sites,
  onSelect,
  legendLeft,
  legendRight,
  bare = false,
}: {
  sites: AirtimePlaceStat[];
  onSelect: (id: string, slice: string) => void;
  legendLeft?: ReactNode;
  legendRight?: ReactNode;
  bare?: boolean;
}) {
  const { pins, elsewhere } = useMemo(() => layoutPins(sites), [sites]);
  const [hover, setHover] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const active = pins.find((pin) => pin.site.id === hover) || null;

  function show(id: string) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setHover(id);
  }

  function hideSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(null), 160);
  }

  return (
    <div
      className={`airtime-map${bare ? ' is-bare' : ''}`}
      onClick={bare ? (event) => event.stopPropagation() : undefined}
    >
      <div className="airtime-map-frame">
        {legendLeft ? <div className="airtime-legend">{legendLeft}</div> : null}
        <div className="airtime-map-canvas">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Carte de la République démocratique du Congo">
            {DRC_PROVINCES.map((province, index) => (
              <path key={province.name} className={index % 2 ? 'airtime-province is-alt' : 'airtime-province'} d={province.d}>
                <title>{province.name}</title>
              </path>
            ))}
            {pins.map((pin) => (
              <g
                key={pin.site.id}
                className="airtime-pin"
                onMouseEnter={() => show(pin.site.id)}
                onMouseLeave={hideSoon}
              >
                <line className="airtime-leader" x1={pin.cx} y1={pin.cy} x2={pin.box.x + pin.box.w / 2} y2={pin.box.y + pin.box.h / 2} />
                <circle className="airtime-dot" cx={pin.cx} cy={pin.cy} r="3.3" />
                <g
                  className="airtime-pill"
                  transform={`translate(${pin.box.x} ${pin.box.y})`}
                  onClick={() => onSelect(pin.site.id, pillSlice(pin.site))}
                >
                  <rect width={pin.box.w} height={pin.box.h} rx="8" />
                  <text x={pin.box.w / 2} y="11.2" textAnchor="middle" fontSize="9">
                    {pin.site.total} {pin.site.label}
                  </text>
                </g>
              </g>
            ))}
          </svg>
          {active ? (
            <div
              className="airtime-tip"
              style={{
                left: `${((active.box.x + active.box.w / 2) / WIDTH) * 100}%`,
                top: `${((active.box.y + active.box.h) / HEIGHT) * 100}%`,
              }}
              onMouseEnter={() => show(active.site.id)}
              onMouseLeave={hideSoon}
            >
              <strong>{active.site.label}</strong>
              {siteFacts(active.site).map((fact, index) => (
                <button
                  key={fact.id}
                  type="button"
                  className={fact.id === 'total' ? 'is-total' : undefined}
                  style={{ animationDelay: `${40 + index * 45}ms` }}
                  title={`Voir la liste — ${active.site.label} · ${fact.label}`}
                  onClick={() => onSelect(active.site.id, fact.id)}
                >
                  <span className="airtime-tip-label">
                    {fact.color ? <i className="airtime-tip-swatch" style={{ background: fact.color }} /> : null}
                    {fact.label}
                  </span>
                  <b>{fact.value}</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {legendRight ? <div className="airtime-legend">{legendRight}</div> : null}
      </div>
      {elsewhere.length > 0 ? (
        <div className="airtime-map-extra">
          {elsewhere.map((site) => (
            <button key={site.id} type="button" title={`Voir la liste — ${site.label}`} onClick={() => onSelect(site.id, pillSlice(site))}>
              <strong>{site.total}</strong>
              <span>{site.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
