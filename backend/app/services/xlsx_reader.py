from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _column_to_index(column_label: str) -> int:
    value = 0
    for char in column_label:
        if char.isalpha():
            value = value * 26 + ord(char.upper()) - 64
    return value


def _shared_strings(workbook: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    output: list[str] = []
    for item in root.findall("main:si", NS):
        output.append("".join(node.text or "" for node in item.iterfind(".//main:t", NS)))
    return output


def _sheet_targets(workbook: ZipFile) -> list[tuple[str, str]]:
    workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
    rel_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("pkgrel:Relationship", NS)
    }

    output: list[tuple[str, str]] = []
    for sheet in workbook_root.find("main:sheets", NS):
        rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rel_map[rel_id]
        target = target.lstrip("/")
        if target.startswith("xl/"):
            pass
        elif target.startswith("worksheets/"):
            target = f"xl/{target}"
        else:
            target = f"xl/{target}"
        output.append((sheet.attrib["name"], target))
    return output


def read_workbook(file_path: Path) -> list[dict]:
    sheets: list[dict] = []

    with ZipFile(file_path) as workbook:
        shared_strings = _shared_strings(workbook)
        for sheet_name, target in _sheet_targets(workbook):
            xml_root = ET.fromstring(workbook.read(target))
            rows: list[list[str]] = []
            for row in xml_root.iterfind(".//main:sheetData/main:row", NS):
                values: dict[int, str] = {}
                for cell in row.findall("main:c", NS):
                    ref = cell.attrib.get("r", "")
                    col_label = "".join(char for char in ref if char.isalpha())
                    index = _column_to_index(col_label)
                    cell_type = cell.attrib.get("t")
                    cell_value = ""
                    value_node = cell.find("main:v", NS)

                    if cell_type == "s" and value_node is not None and value_node.text:
                        shared_index = int(value_node.text)
                        if shared_index < len(shared_strings):
                            cell_value = shared_strings[shared_index]
                    elif cell_type == "inlineStr":
                        inline_node = cell.find("main:is", NS)
                        if inline_node is not None:
                            cell_value = "".join(
                                item.text or "" for item in inline_node.iterfind(".//main:t", NS)
                            )
                    elif value_node is not None and value_node.text:
                        cell_value = value_node.text

                    values[index] = cell_value

                if not values:
                    continue

                max_index = max(values.keys())
                row_values = [values.get(i, "") for i in range(1, max_index + 1)]
                if any(value != "" for value in row_values):
                    rows.append(row_values)

            sheets.append({"name": sheet_name, "rows": rows})

    return sheets
