import React from "react";
import { useAppStore, type ThemeSettings, hydrateDocsFromApi } from "../app/store";
import { apiDeleteAllDocs } from "../lib/api";

export default function Settings() {
  const {
    mijnVakken,
    setMijnVakken,
    huiswerkWeergave,
    setHuiswerkWeergave,
    themePresets,
    activeThemeId,
    setActiveTheme,
    addCustomTheme,
    updateCustomTheme,
    removeCustomTheme,
    theme,
    setThemeColor,
    backgroundImage,
    setBackgroundImage,
    resetBackgroundImage,
    surfaceOpacity,
    setSurfaceOpacity,
    enableHomeworkEditing,
    setEnableHomeworkEditing,
    enableCustomHomework,
    setEnableCustomHomework,
    enableAutoUpdate,
    setEnableAutoUpdate,
    resetAppState,
  } = useAppStore();
  
  const docs = useAppStore((s) => s.docs) ?? [];
  
  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = React.useState<
    { type: "info" | "success" | "error"; message: string } | null
  >(null);

  const activeTheme = React.useMemo(
    () => themePresets.find((preset) => preset.id === activeThemeId),
    [themePresets, activeThemeId]
  );
  const canEditActiveTheme = !!activeTheme && !activeTheme.builtIn;
  const [isCreatingTheme, setIsCreatingTheme] = React.useState(false);
  const [newThemeName, setNewThemeName] = React.useState("Mijn thema");
  const [isRenamingTheme, setIsRenamingTheme] = React.useState(false);
  const [editingThemeName, setEditingThemeName] = React.useState("");

  const allVakken = React.useMemo(
    () => Array.from(new Set(docs.filter((d) => d.enabled).map((d) => d.vak))).sort(),
    [docs]
  );

  const toggle = (vak: string) => {
    if (mijnVakken.includes(vak)) {
      setMijnVakken(mijnVakken.filter((v) => v !== vak));
    } else {
      setMijnVakken([...mijnVakken, vak].sort());
    }
  };

  const selectAll = () => setMijnVakken(allVakken);
  const clearAll = () => setMijnVakken([]);

  const colorOptions: { key: keyof ThemeSettings; label: string; description: string }[] = [
    {
      key: "background",
      label: "Achtergrond",
      description: "Algemene achtergrondkleur van de applicatie.",
    },
    {
      key: "surface",
      label: "Kaarten & panelen",
      description: "Gebruikt voor kaarten, tabellen en panelen.",
    },
    {
      key: "text",
      label: "Tekstkleur",
      description: "Standaard kleur voor tekst.",
    },
    {
      key: "muted",
      label: "Secundaire tekst",
      description: "Kleur voor subtiele teksten en toelichtingen.",
    },
    {
      key: "border",
      label: "Randen",
      description: "Kleur voor randen en scheidingslijnen.",
    },
    {
      key: "accent",
      label: "Accent",
      description: "Wordt gebruikt voor actieve navigatie en accenten.",
    },
    {
      key: "accentText",
      label: "Accent-tekst",
      description: "Tekstkleur op het accent, bijvoorbeeld bij actieve navigatie.",
    },
  ];

  const handleColorChange = (key: keyof ThemeSettings, value: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setThemeColor(key, value.toLowerCase());
    }
  };

  const beginCreateTheme = () => {
    const baseName = activeTheme?.name ? `${activeTheme.name} (kopie)` : "Mijn thema";
    setNewThemeName(baseName);
    setIsRenamingTheme(false);
    setEditingThemeName("");
    setIsCreatingTheme(true);
  };

  const cancelCreateTheme = () => {
    setIsCreatingTheme(false);
    setNewThemeName("Mijn thema");
  };

  const handleAddCustomTheme = () => {
    const name = newThemeName.trim() || "Mijn thema";
    addCustomTheme(name);
    setIsCreatingTheme(false);
    setNewThemeName("Mijn thema");
  };

  const startRenameTheme = () => {
    if (!activeTheme || activeTheme.builtIn) {
      return;
    }
    setIsCreatingTheme(false);
    setIsRenamingTheme(true);
    setEditingThemeName(activeTheme.name);
  };

  const cancelRenameTheme = () => {
    setIsRenamingTheme(false);
    setEditingThemeName("");
  };

  const saveThemeName = () => {
    if (!activeTheme || activeTheme.builtIn) {
      return;
    }
    const name = editingThemeName.trim() || "Mijn thema";
    updateCustomTheme(activeTheme.id, { name });
    setIsRenamingTheme(false);
    setEditingThemeName("");
  };

  const handleRemoveTheme = (id: string) => {
    const preset = themePresets.find((item) => item.id === id);
    if (!preset) {
      return;
    }
    const confirmed = window.confirm(
      `Weet je zeker dat je het thema "${preset.name}" wilt verwijderen?`
    );
    if (!confirmed) {
      return;
    }
    removeCustomTheme(id);
    setIsRenamingTheme(false);
    setEditingThemeName("");
  };

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleBackgroundUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!canEditActiveTheme) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setBackgroundImage(result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleResetApplication = async () => {
    const confirmed = window.confirm(
      "Weet je zeker dat je alle gegevens wilt wissen en terug wilt naar de beginstatus? " +
        "Instellingen, selecties en afgevinkte items gaan verloren."
    );
    if (!confirmed) {
      return;
    }
    resetAppState();
    try {
      await apiDeleteAllDocs();
    } catch (error) {
      console.error("Kon backend-documenten niet wissen", error);
    }
    try {
      await hydrateDocsFromApi();
    } catch (error) {
      console.error("Kon plannerdata niet herladen", error);
    }
  };

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateCheckStatus(null);
    try {
      const [api, prompt] = await Promise.all([
        import("../lib/api"),
        import("../lib/updatePrompt"),
      ]);
      const result = await api.apiCheckForUpdate();
      if (!result.updateAvailable || !result.latestVersion) {
        setUpdateCheckStatus({
          type: "info",
          message: `Je gebruikt de nieuwste versie (v${result.currentVersion}).`,
        });
        return;
      }

      const updateStarted = await prompt.promptUpdateInstallation(result, {
        suppressSuccessAlert: true,
      });

      if (updateStarted) {
        setUpdateCheckStatus({
          type: "success",
          message:
            "De update is gestart. Laat Vlier Planner geopend; de pagina wordt automatisch vernieuwd zodra de nieuwe versie klaarstaat.",
        });
      } else {
        setUpdateCheckStatus({
          type: "info",
          message: `Er is een update beschikbaar (v${result.latestVersion}). Je kunt deze later opnieuw starten.`,
        });
      }
    } catch (error) {
      console.error("Handmatige update-check mislukt:", error);
      const message = error instanceof Error ? error.message : String(error);
      setUpdateCheckStatus({
        type: "error",
        message: `Controle mislukt: ${message}`,
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold theme-text">Instellingen</div>

      <div className="rounded-2xl border theme-border theme-surface p-4">
        <div className="mb-2 font-medium theme-text">Mijn vakken</div>

        <div className="mb-3 text-sm theme-muted">
          Kies welke vakken zichtbaar zijn in <strong>Weekoverzicht</strong>, <strong>Matrix overzicht</strong> en <strong>Belangrijke events</strong>.
        </div>

        <div className="mb-3 flex gap-2">
          <button
            onClick={selectAll}
            className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          >
            Alles selecteren
          </button>
          <button
            onClick={clearAll}
            className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          >
            Alles leegmaken
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          {allVakken.map((vak) => (
            <label
              key={vak}
              className="flex items-center gap-2 rounded-md border theme-border theme-soft p-2"
            >
              <input
                type="checkbox"
                checked={mijnVakken.includes(vak)}
                onChange={() => toggle(vak)}
              />
              <span>{vak}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 text-xs theme-muted">
          Deze lijst volgt automatisch de geüploade documenten.
        </div>
      </div>

      <div className="rounded-2xl border theme-border theme-surface p-4">
        <div className="mb-2 font-medium theme-text">Huiswerkweergave</div>

        <div className="mb-3 text-sm theme-muted">
          Kies hoe huiswerk wordt getoond in <strong>Weekoverzicht</strong> en <strong>Matrix overzicht</strong>.
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 rounded-md border theme-border theme-soft p-2">
            <input
              type="radio"
              name="huiswerkweergave"
              value="perOpdracht"
              checked={huiswerkWeergave === "perOpdracht"}
              onChange={() => setHuiswerkWeergave("perOpdracht")}
            />
            <span>Per opdracht (meerdere regels met vinkjes)</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border theme-border theme-soft p-2">
            <input
              type="radio"
              name="huiswerkweergave"
              value="gecombineerd"
              checked={huiswerkWeergave === "gecombineerd"}
              onChange={() => setHuiswerkWeergave("gecombineerd")}
            />
            <span>Alles als één regel met één vinkje</span>
          </label>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-3 rounded-md border theme-border theme-soft p-3">
            <input
              type="checkbox"
              checked={enableHomeworkEditing}
              onChange={(event) => setEnableHomeworkEditing(event.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-medium theme-text">Bewerken en verwijderen toestaan</div>
              <div className="text-xs leading-snug theme-muted">
                Verberg de potlood- en prullenbakknoppen bij huiswerk wanneer dit is uitgeschakeld.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md border theme-border theme-soft p-3">
            <input
              type="checkbox"
              checked={enableCustomHomework}
              onChange={(event) => setEnableCustomHomework(event.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-medium theme-text">Eigen taak toevoegen</div>
              <div className="text-xs leading-snug theme-muted">
                Toon de knop om zelf extra taakregels toe te voegen aan een week.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md border theme-border theme-soft p-3">
            <input
              type="checkbox"
              checked={enableAutoUpdate}
              onChange={(event) => setEnableAutoUpdate(event.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-medium theme-text">Automatisch op updates controleren</div>
              <div className="text-xs leading-snug theme-muted">
                Vraag bij het opstarten om een nieuwe versie te installeren wanneer die beschikbaar is.
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={handleManualUpdateCheck}
                  className="w-full sm:w-auto rounded-md border theme-border theme-surface px-3 py-1 text-sm disabled:opacity-60"
                  disabled={isCheckingUpdate}
                >
                  {isCheckingUpdate ? "Controleren..." : "Controleer nu op updates"}
                </button>
                {updateCheckStatus ? (
                  <span
                    className={`text-xs sm:text-sm ${
                      updateCheckStatus.type === "error"
                        ? "text-red-600"
                        : updateCheckStatus.type === "success"
                        ? "text-green-600"
                        : "theme-muted"
                    }`}
                  >
                    {updateCheckStatus.message}
                  </span>
                ) : null}
              </div>
            </div>
          </label>
        </div>
      </div>

      <div
        data-tour-id="settings-theme"
        aria-label="Instellingen voor thema en achtergrond"
        className="rounded-2xl border theme-border theme-surface p-4 space-y-4"
      >
        <div className="font-medium theme-text">Thema &amp; achtergrond</div>

        <div className="space-y-3">
          <div className="text-sm font-medium theme-text">Kleurenpaletten</div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide theme-muted" htmlFor="theme-select">
              Geselecteerd thema
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <select
                id="theme-select"
                value={activeThemeId}
                onChange={(event) => setActiveTheme(event.target.value)}
                className="w-full rounded-md border theme-border theme-surface px-3 py-2 text-sm sm:max-w-xs"
              >
                {themePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                    {preset.builtIn ? " (vast)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={beginCreateTheme}
                className="rounded-md border theme-border theme-surface px-3 py-2 text-sm"
              >
                Nieuw thema
              </button>
            </div>
          </div>
          {isCreatingTheme && (
            <div className="space-y-2 rounded-xl border theme-border theme-soft p-3">
              <div className="text-sm font-medium theme-text">Nieuw thema maken</div>
              <div className="text-xs theme-muted">
                Kies een naam voor je nieuwe thema. We starten met de kleuren, achtergrond en doorzichtigheid van het geselecteerde thema.
              </div>
              <input
                type="text"
                value={newThemeName}
                onChange={(event) => setNewThemeName(event.target.value)}
                className="w-full rounded-md border theme-border theme-surface px-2 py-1 text-sm"
                placeholder="Naam van nieuw thema"
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAddCustomTheme}
                  className="rounded-md border theme-border theme-surface px-3 py-1 text-sm font-medium"
                >
                  Opslaan
                </button>
                <button
                  onClick={cancelCreateTheme}
                  className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}
          {activeTheme && (
            canEditActiveTheme ? (
              isRenamingTheme ? (
                <div className="space-y-2 rounded-xl border theme-border theme-soft p-3">
                  <div className="text-sm font-medium theme-text">Naam van thema wijzigen</div>
                  <input
                    type="text"
                    value={editingThemeName}
                    onChange={(event) => setEditingThemeName(event.target.value)}
                    className="w-full rounded-md border theme-border theme-surface px-2 py-1 text-sm"
                    placeholder="Naam van thema"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={saveThemeName}
                      className="rounded-md border theme-border theme-surface px-3 py-1 text-sm font-medium"
                    >
                      Opslaan
                    </button>
                    <button
                      onClick={cancelRenameTheme}
                      className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
                    >
                      Annuleren
                    </button>
                    <button
                      onClick={() => handleRemoveTheme(activeTheme.id)}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-100"
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={startRenameTheme}
                    className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
                  >
                    Naam wijzigen
                  </button>
                  <button
                    onClick={() => handleRemoveTheme(activeTheme.id)}
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-100"
                  >
                    Verwijderen
                  </button>
                </div>
              )
            ) : (
              <div className="text-xs theme-muted">
                Dit is een vast thema. Maak een nieuw thema om kleuren of achtergrond aan te passen.
              </div>
            )
          )}
          <div className="text-xs theme-muted">
            Een nieuw thema gebruikt het huidige kleurenschema, de achtergrond en de doorzichtigheid als startpunt.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {colorOptions.map((option) => (
            <div
              key={option.key}
              className="flex items-center justify-between gap-4 rounded-xl border theme-border theme-soft px-3 py-2"
            >
              <div className="flex-1">
                <div className="text-sm font-medium theme-text">{option.label}</div>
                <div className="text-xs theme-muted">{option.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label={option.label}
                  value={theme[option.key]}
                  onChange={(event) => handleColorChange(option.key, event.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-md border theme-border bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canEditActiveTheme}
                />
                <span className="font-mono text-sm theme-text">{theme[option.key].toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>

        {!canEditActiveTheme && (
          <div className="text-xs theme-muted">
            Selecteer of maak een eigen thema om kleuren en achtergrond aan te passen.
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-medium theme-text">Achtergrondafbeelding</div>
          <div className="text-xs theme-muted">
            Upload een afbeelding om als achtergrond te gebruiken. Grote afbeeldingen worden automatisch geschaald.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBackgroundUpload}
              className="hidden"
            />
            <button
              onClick={() => canEditActiveTheme && fileInputRef.current?.click()}
              className="rounded-md border theme-border theme-surface px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canEditActiveTheme}
            >
              Kies afbeelding
            </button>
            <button
              onClick={resetBackgroundImage}
              className="rounded-md border theme-border theme-surface px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canEditActiveTheme || !backgroundImage}
            >
              Achtergrond resetten
            </button>
          </div>
          {backgroundImage ? (
            <div className="h-32 w-full overflow-hidden rounded-xl border theme-border theme-soft">
              <img src={backgroundImage} alt="Voorbeeld achtergrond" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="text-sm theme-muted">Er is nog geen achtergrond ingesteld.</div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium theme-text" htmlFor="surface-opacity">
              Doorzichtigheid kaarten
            </label>
            <div className="flex items-center gap-3">
              <input
                id="surface-opacity"
                type="range"
                min={0}
                max={100}
                value={surfaceOpacity}
                onChange={(event) => setSurfaceOpacity(Number(event.target.value))}
                className="h-2 w-full accent-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canEditActiveTheme}
              />
              <span className="w-12 text-right text-sm font-medium theme-text">{surfaceOpacity}%</span>
            </div>
            <div className="text-xs theme-muted">
              Bepaalt hoe sterk kaarten en panelen het achtergrondbeeld afdekken.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border theme-border theme-surface p-4 space-y-3">
        <div className="font-medium theme-text">Applicatie resetten</div>
        <div className="text-sm theme-muted">
          Wis alle opgeslagen gegevens en laad de planner opnieuw alsof je de applicatie voor het eerst opent.
          Documenten worden opnieuw opgehaald vanaf de server en persoonlijke instellingen gaan verloren.
        </div>
        <button
          onClick={handleResetApplication}
          className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
        >
          Alles wissen en terug naar beginstatus
        </button>
      </div>
    </div>
  );
}
