const withTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);
const withoutLeadingSlash = (value: string) =>
  value.startsWith("/") ? value.slice(1) : value;

const PUBLIC_BASE_URL = withTrailingSlash(import.meta.env.BASE_URL ?? "/");

const resolvePublicAsset = (path: string) =>
  `${PUBLIC_BASE_URL}${withoutLeadingSlash(path)}`;

export const PUBLIC_ASSETS = {
  logo: resolvePublicAsset("logo.png"),
  screenshots: {
    weekoverzicht: resolvePublicAsset("screenshots/weekoverzicht.png"),
    matrix: resolvePublicAsset("screenshots/matrix.png"),
    uploads: resolvePublicAsset("screenshots/uploads.png"),
  },
} as const;

