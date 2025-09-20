const withoutLeadingSlash = (value: string) => (value.startsWith("/") ? value.slice(1) : value);
const resolvePublicAsset = (path: string) => `${PUBLIC_BASE_URL}${withoutLeadingSlash(path)}`;
export const PUBLIC_ASSETS = {
  screenshots: {
  },
} as const;
