export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const clampChannel = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.round(value)));
};

const roundAlpha = (value: number) => {
  const normalized = clamp01(value);
  return Math.round(normalized * 100) / 100;
};

const expandShortHex = (hex: string) =>
  hex
    .split("")
    .map((ch) => ch + ch)
    .join("");

export const withAlpha = (color: string, alpha: number) => {
  if (!color) {
    return color;
  }
  const trimmed = color.trim();
  const roundedAlpha = roundAlpha(alpha);
  const sixHexMatch = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (sixHexMatch) {
    const hex = sixHexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
  }
  const threeHexMatch = trimmed.match(/^#?([0-9a-f]{3})$/i);
  if (threeHexMatch) {
    const expanded = expandShortHex(threeHexMatch[1]);
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
  }
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const r = clampChannel(Number(rgbMatch[1]));
    const g = clampChannel(Number(rgbMatch[2]));
    const b = clampChannel(Number(rgbMatch[3]));
    return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
  }
  const rgbaMatch = trimmed.match(
    /^rgba\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9]*\.?[0-9]+)\s*\)$/i,
  );
  if (rgbaMatch) {
    const r = clampChannel(Number(rgbaMatch[1]));
    const g = clampChannel(Number(rgbaMatch[2]));
    const b = clampChannel(Number(rgbaMatch[3]));
    return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
  }
  return trimmed;
};
