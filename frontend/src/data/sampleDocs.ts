export type DocMeta = {
  fileId: string;
  bestand: string;
  vak: string;
  niveau: "HAVO" | "VWO";
  leerjaar: string; // "1".."6"
  periode: number;  // 1..4
  beginWeek: number;
  eindWeek: number;
};

export const sampleDocsInitial: DocMeta[] = [
  { fileId: "f1", bestand: "Aardrijkskunde_4V_P1_2526.pdf", vak: "Aardrijkskunde", niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
  { fileId: "f2", bestand: "Duits_4V_P1_2526.pdf",           vak: "Duits",          niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
  { fileId: "f3", bestand: "Engels_4V_P1_2526.pdf",          vak: "Engels",         niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
  { fileId: "f4", bestand: "Filosofie_4V_P1_2526.pdf",       vak: "Filosofie",      niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
  { fileId: "f5", bestand: "Frans_4V_P1_2526.pdf",           vak: "Frans",          niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
  { fileId: "f6", bestand: "Bedrijfseconomie_4V_P1_2526.pdf",vak: "Bedrijfseconomie",niveau: "VWO", leerjaar: "4", periode: 1, beginWeek: 36, eindWeek: 41 },
];

export const allVakkenFromDocs = (docs: DocMeta[]) =>
  Array.from(new Set(docs.map(d => d.vak))).sort();
