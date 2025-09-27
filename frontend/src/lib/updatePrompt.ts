import {
  API_BASE,
  apiCheckForUpdate,
  apiInstallUpdate,
  type UpdateCheckResponse,
} from "./api";

const MAX_NOTES_LENGTH = 600;
const UPDATE_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 2000;

type RestartWatcherState = { cancel: boolean };

let activeRestartWatcher: RestartWatcherState | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForBackendRestart(
  targetVersion: string,
  state: RestartWatcherState
): Promise<void> {
  const deadline = Date.now() + UPDATE_TIMEOUT_MS;
  let observedDowntime = false;

  while (!state.cancel && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    if (state.cancel) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/system/version?ts=${Date.now()}`,
        {
          cache: "no-store",
        }
      );
      if (!response.ok) {
        observedDowntime = true;
        continue;
      }
      const data = (await response.json()) as { version?: string };
      const reported = data?.version?.trim();
      if (!reported) {
        continue;
      }

      if (reported === targetVersion) {
        state.cancel = true;
        window.location.reload();
        return;
      }

      if (observedDowntime && reported !== targetVersion) {
        state.cancel = true;
        window.location.reload();
        return;
      }
    } catch {
      observedDowntime = true;
    }
  }

  if (!state.cancel) {
    const message = observedDowntime
      ? "De update lijkt niet automatisch te zijn afgerond. Sluit Vlier Planner en start deze opnieuw om de update te voltooien."
      : "We konden niet bevestigen dat de update is voltooid. Start Vlier Planner handmatig opnieuw om zeker te weten dat de nieuwste versie wordt geladen.";
    window.alert(message);
  }
}

function startBackendRestartWatcher(targetVersion: string | undefined): void {
  if (!targetVersion) {
    return;
  }

  if (activeRestartWatcher) {
    activeRestartWatcher.cancel = true;
  }

  const state: RestartWatcherState = { cancel: false };
  activeRestartWatcher = state;

  void (async () => {
    try {
      await waitForBackendRestart(targetVersion, state);
    } catch (error) {
      console.warn("Watcher voor update mislukt:", error);
    } finally {
      if (activeRestartWatcher === state) {
        activeRestartWatcher = null;
      }
    }
  })();
}

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
    const response = await apiInstallUpdate(result.latestVersion);
    const targetVersion = response.targetVersion ?? result.latestVersion;

    if (response.restartInitiated) {
      if (!options?.suppressSuccessAlert) {
        window.alert(
          "De update wordt nu geïnstalleerd. Laat Vlier Planner geopend; de pagina wordt automatisch vernieuwd zodra de nieuwe versie klaarstaat."
        );
      }
      startBackendRestartWatcher(targetVersion);
    } else if (!options?.suppressSuccessAlert) {
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

