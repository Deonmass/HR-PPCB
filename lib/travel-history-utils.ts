export function extractTravelDepartmentName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Non renseigné';
  const emDash = trimmed.indexOf(' — ');
  if (emDash >= 0) return trimmed.slice(0, emDash).trim() || trimmed;
  const hyphen = trimmed.indexOf(' - ');
  if (hyphen >= 0) return trimmed.slice(0, hyphen).trim() || trimmed;
  return trimmed;
}
