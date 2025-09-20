import React from "react";
import {
  Sparkles,
  CalendarClock,
  ClipboardList,
  Upload,
  Settings2,
  Wand2,
} from "lucide-react";
import { PUBLIC_LOGO, PUBLIC_SCREENSHOTS } from "../assets/images";

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
    image: PUBLIC_SCREENSHOTS.weekoverzicht,
    imageAlt: "Screenshot van het weekoverzicht na het importeren van alle voorbeeldstudiewijzers.",
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
    image: PUBLIC_SCREENSHOTS.matrix,
    imageAlt: "Screenshot van het matrixoverzicht met vakken na het laden van alle voorbeeldstudiewijzers.",
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
    image: PUBLIC_SCREENSHOTS.uploads,
    imageAlt: "Screenshot van het uploadscherm nadat alle documenten uit de sample-map zijn ingeladen.",
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
      <header className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)] lg:items-center">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--app-accent)] px-3 py-1 text-sm font-medium text-[var(--app-accent-text)]">
            <Sparkles size={16} aria-hidden="true" />
            Snelstart voor leerlingen
          </span>
          <h1 className="text-3xl font-semibold tracking-tight theme-text">Zo haal je alles uit de planner</h1>
          <p className="max-w-2xl text-base leading-relaxed text-[var(--app-muted)]">
            Deze pagina helpt je in een paar stappen op weg en laat zien hoe je met de planner rust houdt in je hoofd en overzicht krijgt in je huiswerk.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <img
            src={PUBLIC_LOGO}
            alt="Logo van Het Vlier Studiewijzer Planner"
            className="h-36 w-36 object-contain"
          />
        </div>
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
