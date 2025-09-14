import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import WeekOverview from "./pages/WeekOverview";
import Matrix from "./pages/Matrix";
import Agenda from "./pages/Agenda";
import Uploads from "./pages/Uploads";
import Settings from "./pages/Settings";
import { hydrateDocsFromApi } from "./app/store";

export default function App() {
  // Hydrate globale docs-store vanaf de backend zodra de app mount
  useEffect(() => {
    hydrateDocsFromApi();
  }, []);

  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<WeekOverview />} />
          <Route path="/matrix" element={<Matrix />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
