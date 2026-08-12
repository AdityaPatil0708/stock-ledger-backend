import "dotenv/config";
import { connectDB } from "./config/db.js";
import StockItem from "./models/StockItem.js";
import Location from "./models/Location.js";
import { STOCK_DATA, INITIAL_LOCATIONS } from "./seedData.js";

async function main() {
  await connectDB();

  const existingCount = await StockItem.countDocuments();
  if (existingCount > 0) {
    console.error(
      `Refusing to seed: StockItem collection already has ${existingCount} documents (including any manual /in additions). ` +
        `Seeding would delete them. Run against an empty database only.`
    );
    process.exit(1);
  }

  await StockItem.insertMany(STOCK_DATA);
  await Location.insertMany(INITIAL_LOCATIONS.map((code) => ({ code })));
  console.log(`Seeded ${STOCK_DATA.length} stock items and ${INITIAL_LOCATIONS.length} locations.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
