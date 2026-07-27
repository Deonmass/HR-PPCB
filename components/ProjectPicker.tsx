'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ProjectPickerDropdown from '@/components/ProjectPickerDropdown';
import type { ProjectRecord } from '@/lib/project-types';

interface Props {
  projects: ProjectRecord[];
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
}

export default function ProjectPicker({ projects, value, onChange, required = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((project) => project.name.trim());
    if (!q) return list.slice(0, 12);
    return list
      .filter((project) => {
        const haystack = `${project.name} ${project.secteur} ${project.lieu} ${project.typeProjet}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 12);
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery(value);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, value]);

  const selectProject = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
        required={required}
        className="project-picker-input"
        value={query}
        placeholder="Rechercher un projet…"
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <ProjectPickerDropdown anchorRef={wrapRef} listRef={listRef} open={open && suggestions.length > 0}>
        {suggestions.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`project-picker-option${value === project.name ? ' active' : ''}`}
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectProject(project.name)}
          >
            <span className="project-picker-name">{project.name}</span>
            <span className="project-picker-meta">
              {[project.secteur, project.lieu, project.typeProjet].filter(Boolean).join(' · ')}
            </span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
}
