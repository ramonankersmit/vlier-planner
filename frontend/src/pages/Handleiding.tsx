import React from "react";
import {
  Sparkles,
  CalendarClock,
  ClipboardList,
  Upload,
  Settings2,
  Wand2,
} from "lucide-react";

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
    title: "Upload belangrijke bestanden",
    description:
      "Bewaar samenvattingen, verslagen of andere documenten bij je weekplanning. Je opent ze daarna direct vanuit de app.",
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
    title: "Werk samen met klasgenoten",
    text:
      "Moet je samenwerken? Deel je scherm of maak samen een planning terwijl jullie dezelfde week bekijken.",
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
          Deze pagina helpt je in een paar stappen op weg. De uitleg is geschreven voor leerlingen uit 4 havo en 4 vwo en laat zien hoe je met de planner rust houdt in je hoofd en overzicht krijgt in je huiswerk.
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
          Tip: vergeet niet om nieuwe documenten meteen te uploaden. Zo heb je altijd alles bij de hand, ook op schoolcomputers.
        </p>
      </section>
    </div>
  );
}
