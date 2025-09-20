const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);
const publicBaseUrl = ensureTrailingSlash(import.meta.env.BASE_URL ?? "/");
const publicAsset = (fileName: string) => `${publicBaseUrl}${fileName}`;
export const PUBLIC_LOGO = publicAsset("logo.png");
export const PUBLIC_SCREENSHOTS = {
  weekoverzicht: publicAsset("voorbeeld_weekoverzicht.png"),
  matrix: publicAsset("voorbeeld_matrix.png"),
  uploads: publicAsset("voorbeeld_studiewijzer.png"),
};
