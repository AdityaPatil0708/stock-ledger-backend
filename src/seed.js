import "dotenv/config";
import { connectDB } from "./config/db.js";
import StockItem from "./models/StockItem.js";
import Location from "./models/Location.js";
import { STOCK_DATA, INITIAL_LOCATIONS } from "./seedData.js";

async function main() {
  await connectDB();
  await Promise.all([StockItem.deleteMany({}), Location.deleteMany({})]);
  await StockItem.insertMany(STOCK_DATA);
  await Location.insertMany(INITIAL_LOCATIONS.map((code) => ({ code })));
  console.log(`Seeded ${STOCK_DATA.length} stock items and ${INITIAL_LOCATIONS.length} locations.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
