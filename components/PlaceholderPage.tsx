interface Props {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <>
      <div className="page-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="panel panel-padded placeholder-panel">
        <p>Cette section sera disponible prochainement.</p>
      </div>
    </>
  );
}
