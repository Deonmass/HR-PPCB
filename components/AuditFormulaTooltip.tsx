'use client';

interface Props {
  value: string;
  title: string;
  lines: string[];
  className?: string;
}

export default function AuditFormulaTooltip({ value, title, lines, className = '' }: Props) {
  return (
    <span className={`audit-formula-wrap${className ? ` ${className}` : ''}`}>
      <span className="audit-formula-value">{value}</span>
      <span className="audit-formula-tooltip" role="tooltip">
        <strong className="audit-formula-title">{title}</strong>
        {lines.map((line, i) =>
          line === '' ? (
            <span key={i} className="audit-formula-spacer" />
          ) : (
            <span key={i} className="audit-formula-line">{line}</span>
          ),
        )}
      </span>
    </span>
  );
}
