import { apiCheckForUpdate, apiInstallUpdate, type UpdateCheckResponse } from "./api";

const MAX_NOTES_LENGTH = 600;

export async function promptUpdateInstallation(
  result: UpdateCheckResponse,
  options?: { suppressSuccessAlert?: boolean }
): Promise<boolean> {
  if (!result.updateAvailable || !result.latestVersion) {
    return false;
  }

  const rawNotes = (result.notes ?? "").trim();
  const snippet =
    rawNotes && rawNotes.length > MAX_NOTES_LENGTH
      ? `${rawNotes.slice(0, MAX_NOTES_LENGTH - 3)}...`
      : rawNotes;

  let message = `Er is een nieuwe versie beschikbaar (v${result.latestVersion}).`;
  message += `\nHuidige versie: v${result.currentVersion}.`;
  if (snippet) {
    message += `\n\nWijzigingen:\n${snippet}`;
  }
  message += "\n\nWil je de update nu installeren?";

  const confirmed = window.confirm(message);
  if (!confirmed) {
    return false;
  }

  try {
    await apiInstallUpdate(result.latestVersion);
    if (!options?.suppressSuccessAlert) {
      window.alert(
        "De installer is gestart. Sluit Vlier Planner af wanneer daarom wordt gevraagd om de update te voltooien."
      );
    }
    return true;
  } catch (error) {
    console.error("Kon update niet starten:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.alert(`Update kon niet worden gestart: ${errorMessage}`);
    return false;
  }
}

export async function checkAndPromptForUpdate(
  options?: { showNoUpdateMessage?: boolean }
): Promise<{
  result: UpdateCheckResponse;
  updateStarted: boolean;
}> {
  const result = await apiCheckForUpdate();

  if (!result.updateAvailable || !result.latestVersion) {
    if (options?.showNoUpdateMessage) {
      window.alert(`Je gebruikt momenteel de nieuwste versie (v${result.currentVersion}).`);
    }
    return { result, updateStarted: false };
  }

  const updateStarted = await promptUpdateInstallation(result, {
    suppressSuccessAlert: options?.showNoUpdateMessage,
  });

  if (options?.showNoUpdateMessage && updateStarted) {
    window.alert(
      `De update naar v${result.latestVersion} is gestart. Sluit Vlier Planner af wanneer daarom wordt gevraagd.`
    );
  }

  return { result, updateStarted };
}

