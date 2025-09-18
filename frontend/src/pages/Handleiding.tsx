import React from "react";
import {
  Sparkles,
  CalendarClock,
  ClipboardList,
  Upload,
  Settings2,
  Wand2,
} from "lucide-react";

const weekoverzichtSvg = `
  <svg width="360" height="220" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="220" rx="18" fill="#f3f4f6" />
    <rect x="18" y="18" width="90" height="28" rx="8" fill="#0ea5e9" opacity="0.18" />
    <rect x="120" y="18" width="90" height="28" rx="8" fill="#0ea5e9" opacity="0.12" />
    <rect x="222" y="18" width="90" height="28" rx="8" fill="#0ea5e9" opacity="0.08" />
    <rect x="18" y="58" width="324" height="136" rx="12" fill="#ffffff" />
    <rect x="34" y="74" width="60" height="10" rx="5" fill="#0ea5e9" opacity="0.65" />
    <rect x="102" y="74" width="60" height="10" rx="5" fill="#0ea5e9" opacity="0.4" />
    <rect x="170" y="74" width="60" height="10" rx="5" fill="#0ea5e9" opacity="0.2" />
    <rect x="238" y="74" width="60" height="10" rx="5" fill="#0ea5e9" opacity="0.1" />
    <rect x="34" y="96" width="292" height="26" rx="6" fill="#ecfdf5" />
    <rect x="40" y="102" width="120" height="14" rx="7" fill="#10b981" opacity="0.7" />
    <rect x="34" y="130" width="292" height="26" rx="6" fill="#fef9c3" />
    <rect x="40" y="136" width="160" height="14" rx="7" fill="#facc15" opacity="0.7" />
    <rect x="34" y="164" width="292" height="26" rx="6" fill="#f3f4f6" />
    <rect x="40" y="170" width="140" height="14" rx="7" fill="#9ca3af" opacity="0.5" />
    <circle cx="296" cy="170" r="10" fill="#10b981" opacity="0.85" />
    <circle cx="318" cy="170" r="10" fill="#9ca3af" opacity="0.5" />
  </svg>
`;

const matrixSvg = `
  <svg width="360" height="220" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="220" rx="18" fill="#f5f3ff" />
    <rect x="18" y="18" width="324" height="184" rx="14" fill="#ffffff" />
    <rect x="34" y="40" width="292" height="26" rx="8" fill="#ede9fe" />
    <rect x="42" y="48" width="120" height="10" rx="5" fill="#7c3aed" opacity="0.6" />
    <rect x="34" y="80" width="292" height="90" rx="10" fill="#f8fafc" />
    <rect x="48" y="94" width="116" height="20" rx="6" fill="#f1f5f9" />
    <rect x="176" y="94" width="116" height="20" rx="6" fill="#f1f5f9" />
    <rect x="48" y="122" width="244" height="10" rx="5" fill="#7c3aed" opacity="0.18" />
    <rect x="48" y="140" width="180" height="10" rx="5" fill="#7c3aed" opacity="0.32" />
    <rect x="48" y="158" width="124" height="10" rx="5" fill="#7c3aed" opacity="0.48" />
    <rect x="34" y="180" width="92" height="10" rx="5" fill="#c4b5fd" />
    <rect x="132" y="180" width="92" height="10" rx="5" fill="#c4b5fd" opacity="0.7" />
    <rect x="230" y="180" width="92" height="10" rx="5" fill="#c4b5fd" opacity="0.4" />
  </svg>
`;

const uploadSvg = `
  <svg width="360" height="220" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="220" rx="18" fill="#ecfdf5" />
    <rect x="24" y="26" width="312" height="60" rx="12" fill="#ffffff" />
    <rect x="40" y="42" width="120" height="12" rx="6" fill="#10b981" opacity="0.65" />
    <rect x="172" y="42" width="120" height="12" rx="6" fill="#10b981" opacity="0.25" />
    <rect x="24" y="98" width="312" height="96" rx="12" fill="#ffffff" />
    <rect x="40" y="114" width="140" height="12" rx="6" fill="#0f172a" opacity="0.35" />
    <rect x="40" y="134" width="206" height="12" rx="6" fill="#0f172a" opacity="0.25" />
    <rect x="40" y="154" width="168" height="12" rx="6" fill="#0f172a" opacity="0.15" />
    <rect x="240" y="120" width="80" height="32" rx="10" fill="#10b981" opacity="0.85" />
    <rect x="40" y="182" width="120" height="10" rx="5" fill="#d1fae5" />
    <rect x="172" y="182" width="120" height="10" rx="5" fill="#d1fae5" opacity="0.6" />
    <path d="M300 140 L300 118" stroke="#ffffff" stroke-width="4" stroke-linecap="round" />
    <path d="M290 126 L300 118 L310 126" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

const weekoverzichtImage = `data:image/svg+xml;utf8,${encodeURIComponent(weekoverzichtSvg)}`;
const matrixImage = `data:image/svg+xml;utf8,${encodeURIComponent(matrixSvg)}`;
const uploadImage = `data:image/svg+xml;utf8,${encodeURIComponent(uploadSvg)}`;

const stappen = [
  {
    title: "Bekijk je week",
    description:
      "Open het weekoverzicht om snel te zien wat er per vak klaarstaat. Gebruik de pijltjes bovenaan om naar een andere week te gaan.",
    icon: CalendarClock,
  },
  {
    title: "Vink opdrachten af",
    description:
      "Klik op een opdracht om hem als klaar te markeren. Zo houd je overzicht over wat je nog moet doen.",
    icon: ClipboardList,
  },
  {
    title: "Voeg je eigen taken toe",
    description:
      "Mis je iets? Voeg eenvoudig een eigen notitie of taak toe per vak zodat alles op één plek staat.",
    icon: Wand2,
  },
  {
    title: "Upload je studiewijzer",
    description:
      "Voeg de studiewijzer van je vak toe. Zo heb je altijd de actuele planning en afspraken in beeld.",
    icon: Upload,
  },
  {
    title: "Pas de app aan jouw stijl aan",
    description:
      "Ga naar Settings om kleuren, achtergrond en de manier van afvinken aan te passen. Zo werkt de planner zoals jij wilt.",
    icon: Settings2,
  },
];

const tips = [
  {
    title: "Gebruik de matrix voor lange termijn",
    text:
      "In het matrixoverzicht zie je in één oogopslag welke grote opdrachten eraan komen. Handig voor projecten en toetsen die later gepland staan.",
  },
  {
    title: "Check de deadlines",
    text:
      "Onder \"Belangrijke events\" staan belangrijke momenten zoals toetsen of inleverdata. Plan je week hierop vooruit.",
  },
  {
    title: "Houd je studiewijzer actueel",
    text:
      "Upload alleen de nieuwste studiewijzer per vak. Zo weet je zeker dat je planning klopt met wat de docent verwacht.",
  },
];

const demoScreens = [
  {
    title: "Weekoverzicht",
    description: "Zie per dag wat je moet doen en vink opdrachten af zodra ze klaar zijn.",
    caption:
      "Tip: klik op een dag om eigen taken toe te voegen of een afspraak te verplaatsen.",
    image: weekoverzichtImage,
    imageAlt: "Screenshot van het weekoverzicht met taken per dag en afgeronde opdrachten.",
    highlights: [
      "Start je week met een blik op maandag t/m zondag",
      "Sleep opdrachten naar een andere dag als je planning wijzigt",
      "Vink klaar wat af is en zie meteen hoeveel je al gedaan hebt",
    ],
  },
  {
    title: "Matrix",
    description: "Bekijk per vak welke grote opdrachten of toetsen eraan komen.",
    caption: "Gebruik dit scherm om vooruit te plannen voor projecten en toetsweken.",
    image: matrixImage,
    imageAlt: "Screenshot van de matrixweergave met kolommen per vak en highlightbalken.",
    highlights: [
      "Zie per vak welke hoofdstukken of projecten eraan komen",
      "Kijk vooruit naar grote taken zodat je op tijd kunt starten",
      "Combineer met het weekoverzicht om je werk te verdelen",
    ],
  },
  {
    title: "Studiewijzer uploaden",
    description: "Voeg de PDF van je studiewijzer toe zodat je alles op één plek hebt.",
    caption:
      "Let op: upload alleen studiewijzers en ververs ze zodra de docent een nieuwe versie deelt.",
    image: uploadImage,
    imageAlt: "Screenshot van het uploadscherm met een groene uploadknop en velden voor de studiewijzer.",
    highlights: [
      "Kies het vak en upload de nieuwste studiewijzer als PDF",
      "De planner leest de opdrachten in en zet ze op de juiste plek",
      "Controleer even of de gegevens kloppen met wat je docent zei",
    ],
  },
];

export default function Handleiding() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--app-accent)] px-3 py-1 text-sm font-medium text-[var(--app-accent-text)]">
          <Sparkles size={16} aria-hidden="true" />
          Snelstart voor leerlingen
        </span>
        <h1 className="text-3xl font-semibold tracking-tight theme-text">Zo haal je alles uit de planner</h1>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--app-muted)]">
          Deze pagina helpt je in een paar stappen op weg en laat zien hoe je met de planner rust houdt in je hoofd en overzicht krijgt in je huiswerk.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {stappen.map((stap) => (
          <article
            key={stap.title}
            className="flex gap-4 rounded-xl border theme-border theme-surface p-4 shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-accent)] text-[var(--app-accent-text)]">
              <stap.icon size={24} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold theme-text">{stap.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--app-muted)]">{stap.description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold theme-text">Bekijk voorbeeldschermen</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {demoScreens.map((screen) => (
            <figure
              key={screen.title}
              className="flex h-full flex-col overflow-hidden rounded-xl border theme-border theme-surface shadow-sm"
            >
              <div className="relative h-48 border-b border-[var(--app-border)] bg-[var(--app-background)]">
                <img
                  src={screen.image}
                  alt={screen.imageAlt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="space-y-3 p-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium theme-text">{screen.title}</p>
                  <p className="mt-2 text-sm leading-relaxed">{screen.description}</p>
                </div>
                <ul className="space-y-2 rounded-lg bg-[var(--app-background)]/60 p-3 text-xs leading-relaxed text-[var(--app-muted)]">
                  {screen.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2">
                      <span
                        className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--app-accent)]"
                        aria-hidden="true"
                      />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
                <figcaption className="text-xs leading-relaxed text-[var(--app-muted)]">
                  {screen.caption}
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold theme-text">Snelle tips</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {tips.map((tip) => (
            <article key={tip.title} className="rounded-xl border theme-border theme-surface p-4 shadow-sm">
              <h3 className="text-lg font-semibold theme-text">{tip.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--app-muted)]">{tip.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-dashed theme-border theme-surface p-6 shadow-sm">
        <h2 className="text-2xl font-semibold theme-text">Zo pak je je week slim aan</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--app-muted)]">
          <li>
            Start op zondag of maandag met het weekoverzicht en noteer meteen je sport, werk of andere afspraken.
          </li>
          <li>
            Check daarna de matrix en deadlines zodat je precies weet wat belangrijk is voor de komende weken.
          </li>
          <li>
            Plan per dag wat je gaat doen en vink klaar wat af is. Klaar? Neem een korte pauze of beloon jezelf.
          </li>
        </ol>
        <p className="text-sm leading-relaxed text-[var(--app-muted)]">
          Tip: upload alleen de studiewijzers van je vakken en vervang ze zodra er een nieuwe versie is. Zo blijf je precies werken met wat de docent verwacht.
        </p>
      </section>
    </div>
  );
}
