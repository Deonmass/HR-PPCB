interface Props {
  ticks?: number[];
  className?: string;
}

const DEFAULT_TICKS = [0, 25, 50, 75, 100];

export default function ChartHorizontalGrid({
  ticks = DEFAULT_TICKS,
  className = '',
}: Props) {
  return (
    <div className={`chart-grid-lines${className ? ` ${className}` : ''}`}>
      {ticks.map((tick) => (
        <div
          key={tick}
          className="chart-grid-line"
          style={{ bottom: `${tick}%` }}
        />
      ))}
    </div>
  );
}
