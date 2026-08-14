export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  let s = n.toFixed(3);
  s = s.replace(/\.?0+$/, "");
  return s;
}

export function parsePackingRows(rows) {
  return (rows || [])
    .map((r) => ({ size: parseFloat(r.size), count: parseFloat(r.count) }))
    .filter((r) => !isNaN(r.size) && r.size > 0 && !isNaN(r.count) && r.count > 0);
}

export function packingDetailFor(rows) {
  return rows.map((r) => r.count + "×" + fmtNum(r.size) + "kg").join(", ");
}

export function packingTotal(rows) {
  return round3(rows.reduce((s, r) => s + r.size * r.count, 0));
}

function buildSearchFilter(search, fields) {
  const q = (search || "").trim();
  if (!q) return {};
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: fields.map((f) => ({
      $expr: { $regexMatch: { input: { $toString: { $ifNull: [`$${f}`, ""] } }, regex: escaped, options: "i" } },
    })),
  };
}

const STOCK_SEARCH_FIELDS = ["material", "brand", "batchNo", "tally", "location", "article", "packingDetail", "packing"];
const TXLOG_SEARCH_FIELDS = [
  "type",
  "material",
  "brand",
  "batchNo",
  "location",
  "fromLocation",
  "toLocation",
  "packingDetail",
  "note",
  "recipe",
];

export function stockSearchFilter(search) {
  return buildSearchFilter(search, STOCK_SEARCH_FIELDS);
}

export function txLogSearchFilter(search) {
  return buildSearchFilter(search, TXLOG_SEARCH_FIELDS);
}
