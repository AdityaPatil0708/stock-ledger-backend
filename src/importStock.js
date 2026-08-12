// Additive import: inserts NEW_STOCK_ITEMS / NEW_LOCATIONS from newStockData.js without
// touching anything already in the DB (manual /in entries included). Safe to re-run —
// rows already present (by material+brand+batchNo+location+totalStock+packingDetail+mfg+exp)
// are skipped.
import "dotenv/config";
import { connectDB } from "./config/db.js";
import StockItem from "./models/StockItem.js";
import Location from "./models/Location.js";
import { NEW_STOCK_ITEMS, NEW_LOCATIONS } from "./newStockData.js";

function keyOf(item) {
  return [item.material, item.brand, item.batchNo, item.location, item.totalStock, item.packingDetail, item.mfg, item.exp]
    .map((v) => (v === undefined || v === null ? "" : String(v)))
    .join("|");
}

async function main() {
  await connectDB();

  const existingItems = await StockItem.find().lean();
  const existingCounts = new Map();
  for (const item of existingItems) {
    const key = keyOf(item);
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
  }

  const newItems = NEW_STOCK_ITEMS.filter((item) => {
    const key = keyOf(item);
    const remaining = existingCounts.get(key) || 0;
    if (remaining > 0) {
      existingCounts.set(key, remaining - 1);
      return false;
    }
    return true;
  });

  const existingLocations = new Set((await Location.find().lean()).map((l) => l.code));
  const newLocations = NEW_LOCATIONS.filter((code) => !existingLocations.has(code));

  if (newItems.length) await StockItem.insertMany(newItems);
  if (newLocations.length) await Location.insertMany(newLocations.map((code) => ({ code })));

  console.log(`Added ${newItems.length} new stock items and ${newLocations.length} new locations.`);
  console.log(`Skipped ${NEW_STOCK_ITEMS.length - newItems.length} already-present stock items.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
