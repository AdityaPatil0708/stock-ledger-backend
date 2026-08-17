// Converts a "Product,Brand,Batch,Mfg,Exp,Packing,Units,Loose,Stock (kg),Location,..." stock
// sheet export into src/newStockData.js (NEW_STOCK_ITEMS / NEW_LOCATIONS), ready for
// `npm run import-stock`.
// Usage: node src/csvToStockData.js "<path to csv>"
import fs from "fs";
import path from "path";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  if (!s || s.toUpperCase() === "NA") return null;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `20${m[2]}-${pad(mo)}-01`;
  }
  return s;
}

function trimTrailingZeros(numStr) {
  if (!/^-?\d+\.\d+$/.test(numStr)) return numStr;
  return numStr.replace(/0+$/, "").replace(/\.$/, "");
}

export function parseStockCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const rows = lines.slice(1).map(splitCsvLine);

  const items = [];
  const locationsSet = new Set();
  const skipped = [];
  let prev = { product: "", brand: "", batch: "", mfg: "", exp: "" };

  for (const cells of rows) {
    const [product, brand, batch, mfg, exp, packing, units, loose, stockKg, location] = cells.map((c) =>
      (c || "").trim(),
    );

    const isBlankSeparator =
      !product && !brand && !batch && !mfg && !exp && !packing && !units && !loose && !stockKg && !location;
    if (isBlankSeparator) {
      prev = { product: "", brand: "", batch: "", mfg: "", exp: "" };
      continue;
    }

    const filled = {
      product: product || prev.product,
      brand: brand || prev.brand,
      batch: batch || prev.batch,
      mfg: mfg || prev.mfg,
      exp: exp || prev.exp,
    };
    prev = filled;

    const totalStock = parseFloat(stockKg);
    if (!stockKg || !filled.product || isNaN(totalStock)) {
      skipped.push(cells.join("|"));
      continue;
    }

    let packingDetail = null;
    let packingSize = null;
    if (packing) {
      packingSize = parseFloat(packing);
      packingDetail = `${units}×${trimTrailingZeros(packing)}kg`;
    } else if (loose) {
      packingDetail = units === "1" ? `${trimTrailingZeros(loose)}kg loose` : `${units}×${trimTrailingZeros(loose)}kg loose`;
    }

    if (location) locationsSet.add(location);

    items.push({
      tally: null,
      material: filled.product,
      brand: filled.brand || null,
      packing: packingSize,
      article: null,
      packingDetail,
      totalStock,
      batchNo: filled.batch || null,
      mfg: parseDate(filled.mfg),
      exp: parseDate(filled.exp),
      in: 0,
      out: 0,
      opening: totalStock,
      location: location || null,
      reservation: null,
    });
  }

  return { items, locations: Array.from(locationsSet).sort(), skipped };
}

export function toStockDataModule(items, locations, batchLabel) {
  const header = `// Holds only the newest CSV batch to import — replace the contents of NEW_STOCK_ITEMS
// (and NEW_LOCATIONS, if the batch introduces bin codes not already in the DB) each time
// a new stock sheet comes in, then run \`npm run import-stock\`.
// Current batch: ${batchLabel} (${items.length} items).
export const NEW_STOCK_ITEMS = `;

  return `${header}${JSON.stringify(items, null, 2)};

export const NEW_LOCATIONS = ${JSON.stringify(locations, null, 2)};
`;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node src/csvToStockData.js "<path to csv>"');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const { items, locations, skipped } = parseStockCsv(raw);
  const out = toStockDataModule(items, locations, path.basename(csvPath));

  const outPath = new URL("./newStockData.js", import.meta.url);
  fs.writeFileSync(outPath, out);

  console.log(`Wrote ${items.length} items and ${locations.length} locations to src/newStockData.js`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} row(s) with no material/stock value:`);
    skipped.forEach((s) => console.log("  " + s));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
