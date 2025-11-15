import { describe, expect, it } from "vitest";
import { splitHomeworkItems } from "./textUtils";

describe("splitHomeworkItems", () => {
  it("splitst bij harde enters zodat elke regel een nieuw item wordt", () => {
    const result = splitHomeworkItems("Bestudeer paragraaf 3\r\nMaak opdrachten 1-3");
    expect(result).toEqual(["Bestudeer paragraaf 3", "Maak opdrachten 1-3"]);
  });

  it("splitst ook wanneer regels met een zachte enter (Shift+Enter) gescheiden zijn", () => {
    const input = [
      "H2 Gemengde Opgaven 1 t/m 9",
      "H3 Gemengde Opgaven 1 t/m 11",
      "Oefentoetsen H2",
      "Oefentoetsen H3",
    ].join("\u000b");
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "H2 Gemengde Opgaven 1 t/m 9",
      "H3 Gemengde Opgaven 1 t/m 11",
      "Oefentoetsen H2",
      "Oefentoetsen H3",
    ]);
  });

  it("houdt hoofdstukverwijzingen intact wanneer meerdere H-secties voorkomen", () => {
    const input = "H2 Gemengde Opgaven 1 t/m 9 H3 Gemengde Opgaven 1 t/m 11";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "H2 Gemengde Opgaven 1 t/m 9",
      "H3 Gemengde Opgaven 1 t/m 11",
    ]);
  });

  it("maakt aparte taken voor elke Oefentoets", () => {
    const input = "Oefentoets H2 Oefentoets H3";
    const result = splitHomeworkItems(input);
    expect(result).toEqual(["Oefentoets H2", "Oefentoets H3"]);
  });

  it("splitst ook wanneer Oefentoetsen meerdere keren op één regel staan", () => {
    const input = "Oefentoetsen H2 Oefentoetsen H3";
    const result = splitHomeworkItems(input);
    expect(result).toEqual(["Oefentoetsen H2", "Oefentoetsen H3"]);
  });

  it("houdt opmerkingen achter de laatste Oefentoets bij de juiste taak", () => {
    const input = "Oefentoetsen H2 Oefentoetsen H3 (Magister)";
    const result = splitHomeworkItems(input);
    expect(result).toEqual(["Oefentoetsen H2", "Oefentoetsen H3 (Magister)"]);
  });

  it("behoudt hoofdstuknummers wanneer er verbindingswoorden tussen Oefentoetsen staan", () => {
    const input = "Oefentoetsen H2 en Oefentoetsen H3";
    const result = splitHomeworkItems(input);
    expect(result).toEqual(["Oefentoetsen H2", "Oefentoetsen H3"]);
  });

  it("splitst wanneer na een komma een werkwoord start", () => {
    const input = "Bestuderen Intro hoofdstuk 3, maken opdrachten 3.1, leren woordjes";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Bestuderen Intro hoofdstuk 3",
      "maken opdrachten 3.1",
      "leren woordjes",
    ]);
  });

  it("splitst ook wanneer de komma ontbreekt maar een nieuw werkwoord volgt", () => {
    const input = "Bestudeer paragraaf 4 maak opdrachten 2 en leer woordjes";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Bestudeer paragraaf 4",
      "maak opdrachten 2",
      "leer woordjes",
    ]);
  });

  it("laat komma's staan wanneer er geen werkwoord volgt", () => {
    const result = splitHomeworkItems("Lees paragraaf 4, pagina 12-13");
    expect(result).toEqual(["Lees paragraaf 4, pagina 12-13"]);
  });

  it("houdt paragraafaanduidingen bij de juiste opdracht als het werkwoord wisselt", () => {
    const input =
      "Bestuderen Intro Hoofdstuk 3 par 3.1, maken opdrachten Intro (t/m4) par 3.1";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Bestuderen Intro Hoofdstuk 3 par 3.1",
      "maken opdrachten Intro (t/m4) par 3.1",
    ]);
  });

  it("kopieert het voorvoegsel wanneer meerdere paragrafen onder dezelfde opdracht vallen", () => {
    const input = "Maak een samenvatting van paragraaf 3.1 en paragraaf 3.2";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Maak een samenvatting van paragraaf 3.1",
      "Maak een samenvatting van paragraaf 3.2",
    ]);
  });

  it("maakt een aparte taak voor een Voorkennis-sectie", () => {
    const input = "Lesstof: hoofdstuk 4 Voorkennis: herhaal paragraaf 3";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Lesstof: hoofdstuk 4",
      "Voorkennis: herhaal paragraaf 3",
    ]);
  });

  it("splitst wanneer een nummer direct gevolgd wordt door Opgaven", () => {
    const input = "Bestudeer paragraaf 5 1 Opgaven 3 t/m 5";
    const result = splitHomeworkItems(input);
    expect(result).toEqual([
      "Bestudeer paragraaf 5 1",
      "Opgaven 3 t/m 5",
    ]);
  });

  it("splitst ook wanneer er letters vóór het nummer staan", () => {
    const input = "Bekijk V6 Opgaven 1-4";
    const result = splitHomeworkItems(input);
    expect(result).toEqual(["Bekijk V6", "Opgaven 1-4"]);
  });
});
