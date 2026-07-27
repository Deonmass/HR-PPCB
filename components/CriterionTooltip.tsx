'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  label: string;
  trigger: React.ReactNode;
  className?: string;
  prefix?: string;
}

export default function CriterionTooltip({ label, trigger, className = '', prefix }: Props) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const show = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 10,
      left: rect.left + rect.width / 2,
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span
        ref={wrapRef}
        className={`criterion-tooltip-wrap${className ? ` ${className}` : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={visible ? id : undefined}
      >
        {trigger}
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="criterion-tooltip-fixed"
            style={{ top: pos.top, left: pos.left }}
          >
            {prefix && <span className="criterion-tooltip-prefix">{prefix}</span>}
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
