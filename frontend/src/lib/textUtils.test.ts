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

  it("laat komma's staan wanneer er geen werkwoord volgt", () => {
    const result = splitHomeworkItems("Lees paragraaf 4, pagina 12-13");
    expect(result).toEqual(["Lees paragraaf 4, pagina 12-13"]);
  });
});
