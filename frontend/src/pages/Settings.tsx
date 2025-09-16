import React from "react";
import { useAppStore } from "../app/store";

export default function Settings() {
  const { mijnVakken, setMijnVakken, huiswerkWeergave, setHuiswerkWeergave } = useAppStore();
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

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Instellingen</div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-2 font-medium">Mijn vakken</div>

        <div className="mb-3 text-sm text-gray-600">
          Kies welke vakken zichtbaar zijn in <strong>Weekoverzicht</strong>, <strong>Matrix</strong> en <strong>Deadlines</strong>.
        </div>

        <div className="mb-3 flex gap-2">
          <button onClick={selectAll} className="rounded-md border px-2 py-1 text-sm">Alles selecteren</button>
          <button onClick={clearAll} className="rounded-md border px-2 py-1 text-sm">Alles leegmaken</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          {allVakken.map((vak) => (
            <label key={vak} className="flex items-center gap-2 rounded-md border p-2 bg-white">
              <input
                type="checkbox"
                checked={mijnVakken.includes(vak)}
                onChange={() => toggle(vak)}
              />
              <span>{vak}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Deze lijst volgt automatisch de geüploade documenten.
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-2 font-medium">Huiswerkweergave</div>

        <div className="mb-3 text-sm text-gray-600">
          Kies hoe huiswerk wordt getoond in <strong>Weekoverzicht</strong> en <strong>Matrix</strong>.
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 rounded-md border p-2 bg-white">
            <input
              type="radio"
              name="huiswerkweergave"
              value="perOpdracht"
              checked={huiswerkWeergave === "perOpdracht"}
              onChange={() => setHuiswerkWeergave("perOpdracht")}
            />
            <span>Per opdracht (meerdere regels met vinkjes)</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border p-2 bg-white">
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
    </div>
  );
}
