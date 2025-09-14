import React from "react";
import { useAppStore } from "../app/store";
import { sampleDocsInitial, allVakkenFromDocs } from "../data/sampleDocs";

export default function Settings() {
  const { mijnVakken, setMijnVakken } = useAppStore();

  // Afleidbare lijst met alle vakken (in MVP nog uit sampleDocs; later uit backend/uploads)
  const allVakken = React.useMemo(() => allVakkenFromDocs(sampleDocsInitial), []);

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
          Kies welke vakken zichtbaar zijn in <strong>Weekoverzicht</strong>, <strong>Matrix</strong> en <strong>Agenda</strong>.
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
          Tip: je kunt dit later koppelen aan de geüploade documenten, zodat nieuwe vakken automatisch verschijnen.
        </div>
      </div>
    </div>
  );
}
