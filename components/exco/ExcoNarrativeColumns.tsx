'use client';

import { useEffect, useState } from 'react';
import ExcoRichText from '@/components/exco/ExcoRichText';
import {
  EMPTY_NARRATIVE_ZONES,
  NARRATIVE_ZONE_LABELS,
  parseNarrativeZones,
  serializeNarrativeZones,
  type NarrativeZoneKey,
  type NarrativeZones,
} from '@/lib/exco-narrative-html';

const KEYS: NarrativeZoneKey[] = ['plant', 'hq', 'regions'];

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (serialized: string) => void;
};

export default function ExcoNarrativeColumns({ value, disabled, onChange }: Props) {
  const [zones, setZones] = useState<NarrativeZones>(
    () => parseNarrativeZones(value) || { ...EMPTY_NARRATIVE_ZONES },
  );

  useEffect(() => {
    const parsed = parseNarrativeZones(value);
    if (parsed) setZones(parsed);
  }, [value]);

  const update = (key: NarrativeZoneKey, html: string) => {
    const next = { ...zones, [key]: html };
    setZones(next);
    onChange(serializeNarrativeZones(next));
  };

  return (
    <div className="exco-narrative-columns">
      {KEYS.map((key) => (
        <label key={key} className="exco-narrative-column">
          <span>{NARRATIVE_ZONE_LABELS[key]}</span>
          <ExcoRichText
            value={zones[key]}
            disabled={disabled}
            placeholder={`${NARRATIVE_ZONE_LABELS[key]} — vide = texte du modèle conservé`}
            onChange={(html) => update(key, html)}
          />
        </label>
      ))}
    </div>
  );
}
