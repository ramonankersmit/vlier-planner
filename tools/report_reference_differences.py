#!/usr/bin/env python3
"""Report row-level differences between two Excel exports.

This helper compares the spreadsheet that wordt gebruikt als referentie met
het Excel-bestand dat via ``tools/convert_results_to_excel.py`` is
genereerd.  Het script groepeert de verschillen per document en schrijft
standaard een Markdown-rapport zodat je in één oogopslag ziet welke velden
nog afwijken.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import pandas as pd  # type: ignore

DEFAULT_KEY_COLUMNS = ("document", "source_row_id")


def _load_excel(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path)
    if not isinstance(df, pd.DataFrame):  # pragma: no cover - defensive
        raise RuntimeError(f"Kon {path} niet als DataFrame inlezen")
    return df


def _with_index(df: pd.DataFrame, key_columns: Sequence[str]) -> pd.DataFrame:
    missing = [col for col in key_columns if col not in df.columns]
    if missing:
        cols = ", ".join(missing)
        raise KeyError(f"Kolommen ontbreken in dataset: {cols}")
    indexed = df.set_index(list(key_columns), drop=False)
    if indexed.index.has_duplicates:
        raise ValueError(
            "Gevonden dubbele combinatie van sleutelkolommen: "
            f"{key_columns}. Maak eerst de referentie uniek."
        )
    return indexed


def _rows_with_differences(
    ref: pd.DataFrame, cand: pd.DataFrame, key_columns: Sequence[str]
) -> List[Dict[str, object]]:
    ref_idx = _with_index(ref, key_columns).sort_index()
    cand_idx = _with_index(cand, key_columns).sort_index()
    union_index = ref_idx.index.union(cand_idx.index)
    ref_aligned = ref_idx.reindex(union_index)
    cand_aligned = cand_idx.reindex(union_index)

    mismatch_mask = (ref_aligned != cand_aligned) & ~(
        ref_aligned.isna() & cand_aligned.isna()
    )

    diffs: List[Dict[str, object]] = []
    for idx in union_index:
        row_mask = mismatch_mask.loc[idx]
        changed_cols = [col for col, flag in row_mask.items() if flag]
        if not changed_cols:
            continue
        entry: Dict[str, object] = {
            "key": {col: idx[i] for i, col in enumerate(key_columns)},
            "differences": [],
        }
        source = ref_aligned.loc[idx]
        fallback = cand_aligned.loc[idx]
        entry["meta"] = {
            "week": source.get("week") if hasattr(source, "get") else None,
            "week_label": source.get("week_label") if hasattr(source, "get") else None,
        }
        if entry["meta"]["week"] is None and hasattr(fallback, "get"):
            entry["meta"]["week"] = fallback.get("week")
        if entry["meta"]["week_label"] is None and hasattr(fallback, "get"):
            entry["meta"]["week_label"] = fallback.get("week_label")
        for col in changed_cols:
            entry["differences"].append(
                {
                    "column": col,
                    "reference": source[col],
                    "candidate": cand_aligned.loc[idx, col],
                }
            )
        diffs.append(entry)
    return diffs


def _markdown_escape(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    text = str(value)
    return text.replace("|", "\\|").replace("\n", "<br>")


def _write_markdown(
    diffs: Iterable[Dict[str, object]],
    key_columns: Sequence[str],
    output_path: Path,
) -> None:
    lines: List[str] = []
    diffs = list(diffs)
    lines.append("# Vergelijking referentie en parser-export")
    lines.append("")
    lines.append(
        "Dit bestand bevat alle rijen waarvoor de parser-export nog afwijkt "
        "van de referentie-Excel."
    )
    lines.append("")
    lines.append(f"Totaal aantal rijen met verschillen: {len(diffs)}")
    lines.append("")

    by_document: Dict[str, List[Dict[str, object]]] = {}
    for entry in diffs:
        key_info = entry["key"]
        document = str(key_info.get("document", "onbekend"))
        by_document.setdefault(document, []).append(entry)

    for document in sorted(by_document):
        lines.append(f"## {document}")
        lines.append("")
        lines.append("| Bronrij | Week | Kolom | Referentie | Huidige parser |")
        lines.append("| --- | --- | --- | --- | --- |")
        for entry in sorted(
            by_document[document],
            key=lambda item: str(item["key"].get("source_row_id")),
        ):
            row_id = str(entry["key"].get("source_row_id"))
            week = entry.get("meta", {}).get("week")
            week_label = entry.get("meta", {}).get("week_label")
            week_display = week_label or week or ""
            for diff in entry["differences"]:
                lines.append(
                    "| {row} | {week} | {col} | {ref} | {cur} |".format(
                        row=row_id,
                        week=_markdown_escape(week_display),
                        col=_markdown_escape(str(diff["column"])),
                        ref=_markdown_escape(diff["reference"]),
                        cur=_markdown_escape(diff["candidate"]),
                    )
                )
        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Markdown-rapport geschreven naar {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rapporteer verschillen tussen referentie- en parser-Excel"
    )
    parser.add_argument(
        "--reference",
        required=True,
        help="Pad naar de referentie-Excel (bijv. tests/reference/referentie_vwo_p2.xlsx)",
    )
    parser.add_argument(
        "--candidate",
        required=True,
        help="Pad naar de Excel die je wilt vergelijken (bijv. tools/out/vwo_p2.xlsx)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Pad naar het Markdown-bestand met het resultaat",
    )
    parser.add_argument(
        "--key-columns",
        nargs="*",
        default=list(DEFAULT_KEY_COLUMNS),
        help="Kolommen die de rij uniek identificeren (standaard: document source_row_id)",
    )
    args = parser.parse_args()

    reference_path = Path(args.reference).resolve()
    candidate_path = Path(args.candidate).resolve()
    output_path = Path(args.output).resolve()
    key_columns: Sequence[str] = args.key_columns or DEFAULT_KEY_COLUMNS

    ref_df = _load_excel(reference_path)
    cand_df = _load_excel(candidate_path)
    diffs = _rows_with_differences(ref_df, cand_df, key_columns)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_markdown(diffs, key_columns, output_path)


if __name__ == "__main__":
    main()
