import { strFromU8, unzipSync } from "fflate";

export type SheetPreview = { name: string; rows: string[][] };

const LIMIT = 8 * 1024 * 1024;

function xml(bytes?: Uint8Array) {
  if (!bytes) throw new Error("missing_sheet");
  const document = new DOMParser().parseFromString(
    strFromU8(bytes),
    "text/xml",
  );
  if (document.querySelector("parsererror")) throw new Error("invalid_sheet");
  return document;
}

function children(node: Element, name: string) {
  return Array.from(node.children).filter((child) => child.localName === name);
}

function column(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function safeEntries(buffer: ArrayBuffer) {
  return unzipSync(new Uint8Array(buffer), {
    filter: (entry) =>
      entry.originalSize <= LIMIT &&
      (/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
        entry.name,
      ) ||
        entry.name === "content.xml"),
  });
}

function xlsx(buffer: ArrayBuffer): SheetPreview {
  const files = safeEntries(buffer);
  const workbook = xml(files["xl/workbook.xml"]);
  const sheet = Array.from(workbook.getElementsByTagNameNS("*", "sheet"))[0];
  const title = sheet?.getAttribute("name") || "Folha 1";
  const relation =
    sheet?.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    ) || sheet?.getAttribute("r:id");
  let target = "worksheets/sheet1.xml";
  const relationships = files["xl/_rels/workbook.xml.rels"];
  if (relation && relationships) {
    const rel = Array.from(
      xml(relationships).getElementsByTagNameNS("*", "Relationship"),
    ).find((item) => item.getAttribute("Id") === relation);
    target = rel?.getAttribute("Target") || target;
  }
  const clean = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
  if (clean.includes("..")) throw new Error("invalid_sheet");
  const sheetXml = xml(files[`xl/${clean}`]);
  const shared = files["xl/sharedStrings.xml"]
    ? Array.from(
        xml(files["xl/sharedStrings.xml"]).getElementsByTagNameNS("*", "si"),
      ).map((item) =>
        Array.from(item.getElementsByTagNameNS("*", "t"))
          .map((text) => text.textContent || "")
          .join(""),
      )
    : [];
  const rows: string[][] = [];
  for (const row of Array.from(
    sheetXml.getElementsByTagNameNS("*", "row"),
  ).slice(0, 250)) {
    const values: string[] = [];
    for (const cell of children(row, "c").slice(0, 60)) {
      const at = Math.min(59, column(cell.getAttribute("r") || "A"));
      const type = cell.getAttribute("t");
      const raw = children(cell, "v")[0]?.textContent || "";
      const inline = Array.from(cell.getElementsByTagNameNS("*", "t"))
        .map((node) => node.textContent || "")
        .join("");
      values[at] =
        type === "s"
          ? shared[Number(raw)] || ""
          : type === "b"
            ? raw === "1"
              ? "TRUE"
              : "FALSE"
            : type === "inlineStr"
              ? inline
              : raw;
    }
    rows.push(values.map((value) => value || ""));
  }
  return { name: title, rows };
}

function ods(buffer: ArrayBuffer): SheetPreview {
  const content = xml(safeEntries(buffer)["content.xml"]);
  const table = Array.from(content.getElementsByTagNameNS("*", "table"))[0];
  const rows: string[][] = [];
  for (const row of Array.from(table?.children || []).filter(
    (node) => node.localName === "table-row",
  )) {
    if (rows.length >= 250) break;
    const values: string[] = [];
    for (const cell of Array.from(row.children).filter(
      (node) => node.localName === "table-cell",
    )) {
      const repeats = Math.min(
        60 - values.length,
        Number(
          cell.getAttributeNS(
            "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
            "number-columns-repeated",
          ),
        ) || 1,
      );
      const value = Array.from(cell.getElementsByTagNameNS("*", "p"))
        .map((node) => node.textContent || "")
        .join("\n");
      for (let count = 0; count < repeats; count++) values.push(value);
      if (values.length >= 60) break;
    }
    rows.push(values);
  }
  return {
    name:
      table?.getAttributeNS(
        "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
        "name",
      ) || "Folha 1",
    rows,
  };
}

function csv(buffer: ArrayBuffer): SheetPreview {
  const source = new TextDecoder().decode(buffer).slice(0, LIMIT);
  const separator =
    (source.split("\n", 1)[0].match(/;/g)?.length || 0) >
    (source.split("\n", 1)[0].match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < source.length && rows.length < 250; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') value += source[++index];
      else quoted = !quoted;
    } else if (character === separator && !quoted) {
      if (row.length < 60) row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index++;
      if (row.length < 60) row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if ((value || row.length) && rows.length < 250) rows.push([...row, value]);
  return { name: "CSV", rows };
}

export async function readSpreadsheet(buffer: ArrayBuffer, name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return xlsx(buffer);
  if (extension === "ods") return ods(buffer);
  if (extension === "csv") return csv(buffer);
  throw new Error("unsupported_sheet");
}
