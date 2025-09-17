export const hasMeaningfulContent = (value?: string | null): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/[\u2013\u2014]/g, "-");
  return normalized !== "-";
};
