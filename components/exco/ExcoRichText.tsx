'use client';

import { useEffect, useRef } from 'react';

type Props = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (html: string) => void;
};

function ToolbarButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="exco-rich-btn"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function ExcoRichText({ value, disabled, placeholder, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.innerHTML !== (value || '')) el.innerHTML = value || '';
  }, [value]);

  const exec = (command: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command);
    onChange(ref.current?.innerHTML || '');
  };

  return (
    <div className={`exco-rich${disabled ? ' is-disabled' : ''}`}>
      <div className="exco-rich-toolbar" role="toolbar" aria-label="Mise en forme">
        <ToolbarButton label="Gras" disabled={disabled} onClick={() => exec('bold')} />
        <ToolbarButton label="Italique" disabled={disabled} onClick={() => exec('italic')} />
        <ToolbarButton label="Souligné" disabled={disabled} onClick={() => exec('underline')} />
        <ToolbarButton label="Liste" disabled={disabled} onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton label="1. 2. 3." disabled={disabled} onClick={() => exec('insertOrderedList')} />
      </div>
      <div
        ref={ref}
        className="exco-rich-surface"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || 'Saisir le texte…'}
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || '')}
      />
    </div>
  );
}
