import { describe, expect, it } from "vitest";
import { splitHomeworkItems } from "./textUtils";

describe("splitHomeworkItems", () => {
  it("splitst bij harde enters zodat elke regel een nieuw item wordt", () => {
    const result = splitHomeworkItems("Bestudeer paragraaf 3\r\nMaak opdrachten 1-3");
    expect(result).toEqual(["Bestudeer paragraaf 3", "Maak opdrachten 1-3"]);
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
});
