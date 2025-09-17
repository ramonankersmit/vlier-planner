import React from "react";
import { useAppStore, type ThemeSettings, hydrateDocsFromApi } from "../app/store";
import { apiDeleteAllDocs } from "../lib/api";

export default function Settings() {
  const {
    mijnVakken,
    setMijnVakken,
    huiswerkWeergave,
    setHuiswerkWeergave,
    theme,
    setThemeColor,
    resetTheme,
    backgroundImage,
    setBackgroundImage,
    resetBackgroundImage,
    resetAppState,
  } = useAppStore();
  const docs = useAppStore((s) => s.docs) ?? [];

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

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleBackgroundUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
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

  const resetAllAppearance = () => {
    resetTheme();
    resetBackgroundImage();
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
      </div>

      <div className="rounded-2xl border theme-border theme-surface p-4 space-y-4">
        <div className="font-medium theme-text">Thema &amp; achtergrond</div>

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
                  className="h-10 w-10 cursor-pointer rounded-md border theme-border bg-transparent p-0"
                />
                <span className="font-mono text-sm theme-text">{theme[option.key].toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>

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
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
            >
              Kies afbeelding
            </button>
            <button
              onClick={resetBackgroundImage}
              className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
              disabled={!backgroundImage}
            >
              Achtergrond resetten
            </button>
            <button
              onClick={resetAllAppearance}
              className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
            >
              Reset thema &amp; achtergrond
            </button>
          </div>
          {backgroundImage ? (
            <div className="h-32 w-full overflow-hidden rounded-xl border theme-border theme-soft">
              <img src={backgroundImage} alt="Voorbeeld achtergrond" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="text-sm theme-muted">Er is nog geen achtergrond ingesteld.</div>
          )}
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
