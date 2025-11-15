#!/usr/bin/env python3
"""
Utility script to convert the JSON output from ``tools/parse_demo.py`` into
Excel workbooks.  The JSON produced by ``parse_demo.py --rows`` is a list of
objects, each containing a ``meta`` dictionary (metadata about the
studiewijzer) and a list of ``rows`` dictionaries (the raw timetable rows).

This script reads that JSON file and writes the row data to Excel.  By
default it writes a single workbook with one sheet per document.  Optionally
it can produce one workbook per input document.  The worksheet names are
derived from the original filename but truncated to 31 characters (the
maximum sheet name length allowed by Excel).

Usage examples:

    # Convert parse results into a single Excel file with multiple sheets
    python convert_results_to_excel.py --input tools/out/parse_results.json \
        --output tools/out/parse_results.xlsx

    # Produce one Excel file per document in the given directory
    python convert_results_to_excel.py --input tools/out/parse_results.json \
        --output-dir tools/out/xlsx

The script requires the ``pandas`` library.  Install it via ``pip install pandas``
if it is not already available in your environment.
"""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List

try:
    import pandas as pd  # type: ignore
except ImportError as exc:
    raise ImportError(
        "pandas is required to run this script. Install it with 'pip install pandas'."
    ) from exc


def _sanitize_sheet_name(name: str) -> str:
    """Return a safe Excel sheet name limited to 31 characters.

    Excel limits sheet names to 31 characters and disallows certain
    characters (\ / ? * [ ] :).  Replace invalid characters with a space and
    truncate to 31 characters.

    Args:
        name: Proposed sheet name, e.g. the filename of the document.

    Returns:
        A sanitized sheet name.
    """
    invalid_chars = set('\\/?*[]:')
    safe = ''.join(' ' if ch in invalid_chars else ch for ch in name)
    return safe[:31]


def convert_json_to_excel_single(
    results: List[Dict[str, Any]], output_path: Path
) -> None:
    """Write all parse results to a single Excel workbook with one sheet per document.

    Each document will be written to its own sheet within ``output_path``.

    Args:
        results: List of dictionaries containing ``meta`` and ``rows`` keys.
        output_path: Path to the output Excel file.  Parent directories will
            be created if they do not exist.
    """
    output_path = output_path.resolve()
    if not output_path.parent.exists():
        output_path.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        sheet_count = 0
        for idx, entry in enumerate(results):
            rows = entry.get("rows")
            meta = entry.get("meta", {})
            # Skip entries without rows
            if not rows:
                continue
            # Determine a sheet name. Prefer the original filename from meta if present.
            base_name: str = str(meta.get("bestand") or meta.get("path") or f"doc{idx+1}")
            # Remove extension for sheet name
            base_name = os.path.splitext(base_name)[0]
            sheet_name = _sanitize_sheet_name(base_name)
            # If the same sheet name already exists, append an index to make it unique
            if sheet_name in writer.book.sheetnames:
                count = 1
                new_name = f"{sheet_name}_{count}"
                while new_name in writer.book.sheetnames:
                    count += 1
                    new_name = f"{sheet_name}_{count}"
                sheet_name = new_name
            df = pd.DataFrame(rows)
            # Ensure all column names are strings for Excel
            df.columns = [str(c) for c in df.columns]
            # Write DataFrame to sheet
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            sheet_count += 1
        # Save workbook (handled automatically by context manager)
    print(f"Wrote {sheet_count} worksheets to {output_path}")


def convert_json_to_single_sheet(
    results: List[Dict[str, Any]], output_path: Path
) -> None:
    """Concatenate all rows from all documents into a single worksheet.

    This function merges the ``rows`` from every result into one large
    DataFrame.  Additional columns are added to each row to preserve the
    source document's metadata (e.g. document name, period, subject).  The
    resulting workbook contains only one sheet.

    Args:
        results: List of dictionaries containing ``meta`` and ``rows`` keys.
        output_path: Path to the output Excel file.
    """
    output_path = output_path.resolve()
    if not output_path.parent.exists():
        output_path.parent.mkdir(parents=True, exist_ok=True)

    all_rows: List[Dict[str, Any]] = []
    for idx, entry in enumerate(results):
        rows = entry.get("rows")
        meta: Dict[str, Any] = entry.get("meta", {})
        if not rows:
            continue
        # Determine a source document identifier
        doc_name = str(meta.get("bestand") or meta.get("path") or f"doc{idx+1}")
        # Collect meta fields of interest
        meta_fields = {
            "document": doc_name,
            "periode": meta.get("periode"),
            "vak": meta.get("vak"),
            "niveau": meta.get("niveau"),
            "leerjaar": meta.get("leerjaar"),
            "schooljaar": meta.get("schooljaar"),
        }
        for row in rows:
            if not isinstance(row, dict):
                continue
            # Merge row with a copy of metadata fields
            merged_row = {**row, **meta_fields}
            all_rows.append(merged_row)
    if not all_rows:
        print("No rows found in input; nothing to write.")
        return
    df = pd.DataFrame(all_rows)
    # Ensure all column names are strings
    df.columns = [str(c) for c in df.columns]
    # Write to a single sheet named 'Sheet1'
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Sheet1", index=False)
    print(f"Wrote {len(all_rows)} rows to single-sheet workbook {output_path}")


def convert_json_to_excel_multiple(
    results: List[Dict[str, Any]], output_dir: Path
) -> None:
    """Write each document's rows to a separate Excel file.

    The output directory will contain one .xlsx file per document.  The
    filenames are derived from the document's original name.  If multiple
    periods exist for a single document, separate files will be generated
    with a period suffix (e.g. ``document_p1.xlsx``).

    Args:
        results: List of dictionaries containing ``meta`` and ``rows`` keys.
        output_dir: Directory to write the Excel files to.  It will be
            created if it does not exist.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    for idx, entry in enumerate(results):
        rows = entry.get("rows")
        meta = entry.get("meta", {})
        if not rows:
            continue
        # Determine base filename from meta information. Use 'bestand' field if present.
        original_name = str(meta.get("bestand") or meta.get("path") or f"document{idx+1}")
        base_name = os.path.splitext(os.path.basename(original_name))[0]
        # Distinguish different periods if meta contains 'periode'
        period_suffix = str(meta.get("periode")) if meta.get("periode") not in (None, "") else None
        if period_suffix:
            file_name = f"{base_name}_p{period_suffix}.xlsx"
        else:
            file_name = f"{base_name}.xlsx"
        out_path = output_dir / file_name
        df = pd.DataFrame(rows)
        df.columns = [str(c) for c in df.columns]
        df.to_excel(out_path, index=False)
        print(f"Wrote {out_path}")


def load_results(input_path: Path) -> List[Dict[str, Any]]:
    """Load parse results from a JSON file.

    Args:
        input_path: Path to the JSON file containing the parse results.

    Returns:
        A list of dictionaries representing the parse results.
    """
    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    # Ensure data is a list
    if isinstance(data, dict):
        # Single result or aggregated by file?  Wrap in list.
        return [data]
    if not isinstance(data, list):
        raise ValueError("Unexpected JSON format: expected list of results")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert parse_demo.py JSON output into Excel format."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to the JSON file produced by parse_demo.py",
    )
    parser.add_argument(
        "--output",
        help="Path to the Excel file to write. If omitted, a default name based on the input will be used."
    )
    parser.add_argument(
        "--output-dir",
        dest="output_dir",
        help="Directory in which to write one Excel file per document. Cannot be used with --single-sheet."
    )
    parser.add_argument(
        "--single-sheet",
        dest="single_sheet",
        action="store_true",
        help="Concatenate all rows from all documents into a single worksheet."
    )
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    results = load_results(input_path)
    # Determine output behaviour based on flags
    if args.single_sheet:
        if args.output_dir:
            raise ValueError("--output-dir cannot be combined with --single-sheet")
        output_path = Path(args.output or input_path.with_suffix(".xlsx"))
        convert_json_to_single_sheet(results, output_path)
    elif args.output_dir:
        # Write one file per document
        convert_json_to_excel_multiple(results, Path(args.output_dir))
    else:
        # Write one file with multiple sheets.  Determine default output path.
        output_path = Path(args.output or input_path.with_suffix(".xlsx"))
        convert_json_to_excel_single(results, output_path)


if __name__ == "__main__":
    main()