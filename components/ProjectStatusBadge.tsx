'use client';

import { useState } from 'react';
import ProjectStatusMenu from '@/components/ProjectStatusMenu';
import { formatProjectStatus, statusBadgeClass } from '@/lib/projects';

interface Props {
  statut: string;
  onChange?: (statut: string) => void;
  disabled?: boolean;
}

export default function ProjectStatusBadge({ statut, onChange, disabled }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  if (disabled || !onChange) {
    return (
      <span className={`badge ${statusBadgeClass(statut)}`}>
        {formatProjectStatus(statut)}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`badge badge-clickable ${statusBadgeClass(statut)}`}
        title="Changer le statut"
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        {formatProjectStatus(statut)}
      </button>
      {menu && (
        <ProjectStatusMenu
          x={menu.x}
          y={menu.y}
          current={statut}
          onSelect={onChange}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
