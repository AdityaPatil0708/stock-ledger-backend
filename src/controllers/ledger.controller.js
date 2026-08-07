import StockItem from "../models/StockItem.js";
import Location from "../models/Location.js";
import TxLog from "../models/TxLog.js";
import { STOCK_DATA, INITIAL_LOCATIONS } from "../seedData.js";
import { round3, packingDetailFor, packingTotal, parsePackingRows } from "../lib/ledgerUtils.js";

// ponytail: undo history lives in process memory (matches the original client-only undo
// stack); it resets on server restart and isn't shared across processes. Upgrade to a
// persisted "ActionHistory" collection if multi-instance deployment or durability is needed.
const MAX_HISTORY = 50;
let history = [];

async function snapshot() {
  const [items, locations, txLog] = await Promise.all([
    StockItem.find().lean(),
    Location.find().lean(),
    TxLog.find().sort({ _id: -1 }).lean(),
  ]);
  return { items, locations, txLog };
}

async function pushHistory() {
  history.push(await snapshot());
  if (history.length > MAX_HISTORY) history.shift();
}

async function restoreSnapshot(snap) {
  await Promise.all([StockItem.deleteMany({}), Location.deleteMany({}), TxLog.deleteMany({})]);
  await Promise.all([
    snap.items.length && StockItem.insertMany(snap.items),
    snap.locations.length && Location.insertMany(snap.locations),
    snap.txLog.length && TxLog.insertMany(snap.txLog),
  ]);
}

async function logTx(entry) {
  await TxLog.create(entry);
}

export async function getLedger(req, res) {
  const [items, locations, txLog] = await Promise.all([
    StockItem.find().sort({ material: 1 }),
    Location.find().sort({ code: 1 }),
    TxLog.find().sort({ _id: -1 }),
  ]);
  res.json({ items, locations, txLog, canUndo: history.length > 0 });
}

export async function resetLedger(req, res) {
  await pushHistory();
  await Promise.all([StockItem.deleteMany({}), Location.deleteMany({}), TxLog.deleteMany({})]);
  await StockItem.insertMany(STOCK_DATA);
  await Location.insertMany(INITIAL_LOCATIONS.map((code) => ({ code })));
  res.json({ ok: true });
}

export async function undo(req, res) {
  const snap = history.pop();
  if (!snap) return res.status(400).json({ error: "Nothing to undo yet." });
  await restoreSnapshot(snap);
  res.json({ ok: true });
}

async function registerLocationIfNew(code) {
  if (!code) return;
  const existing = await Location.findOne({ code });
  if (!existing) await Location.create({ code });
}

export async function stockIn(req, res) {
  const body = req.body || {};
  const material = (body.material || "").trim();
  const brand = (body.brand || "").trim();
  const batchNo = (body.batchNo || "").trim();
  const mfg = (body.mfg || "").trim();
  const exp = (body.exp || "").trim();
  const location = (body.location || "").trim();
  const packingRows = parsePackingRows(body.packingRows);

  if (!material) return res.status(400).json({ error: "Material name is required." });
  if (!brand) return res.status(400).json({ error: "Brand / Supplier is required." });
  if (!batchNo) return res.status(400).json({ error: "Batch No is required." });
  if (!mfg) return res.status(400).json({ error: "Mfg date is required." });
  if (!exp) return res.status(400).json({ error: "Exp date is required." });
  if (!location) return res.status(400).json({ error: "Choose a location for this stock." });
  if (packingRows.length === 0) return res.status(400).json({ error: "Add at least one packing size and count." });

  await pushHistory();
  await registerLocationIfNew(location);

  const totalQty = packingTotal(packingRows);
  const distinctSizes = Array.from(new Set(packingRows.map((r) => r.size)));
  const packingDetail = packingDetailFor(packingRows);

  const newItem = await StockItem.create({
    tally: material,
    material,
    brand: brand || null,
    packing: distinctSizes.length === 1 ? distinctSizes[0] : null,
    article: null,
    packingDetail,
    totalStock: totalQty,
    batchNo: batchNo || null,
    mfg: mfg || null,
    exp: exp || null,
    in: totalQty,
    out: 0,
    opening: totalQty,
    location,
  });

  await logTx({
    ts: new Date().toISOString(),
    type: "IN",
    material: newItem.material,
    brand: newItem.brand,
    batchNo: newItem.batchNo,
    location: newItem.location,
    qty: totalQty,
    byUser: req.user.email,
  });

  res.status(201).json({ item: newItem });
}

export async function stockOut(req, res) {
  const item = await StockItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "Stock row not found." });

  const qtyInput = parseFloat(req.body?.qty);
  await pushHistory();

  const removeQty = isNaN(qtyInput) ? Number(item.totalStock) || 0 : qtyInput;
  const remaining = (Number(item.totalStock) || 0) - removeQty;
  const locCode = item.location;
  const newTotal = remaining > 0 ? round3(remaining) : 0;

  item.totalStock = newTotal;
  item.out = (Number(item.out) || 0) + removeQty;
  if (newTotal <= 0) item.location = null;
  await item.save();

  await logTx({
    ts: new Date().toISOString(),
    type: "OUT",
    material: item.material,
    brand: item.brand,
    batchNo: item.batchNo,
    location: locCode,
    qty: removeQty,
    byUser: req.user.email,
  });

  res.json({ item });
}

export async function transfer(req, res) {
  const source = await StockItem.findById(req.params.id);
  if (!source) return res.status(404).json({ error: "Source stock row not found." });

  const body = req.body || {};
  const material = (body.material || "").trim();
  const brand = (body.brand || "").trim();
  const batchNo = (body.batchNo || "").trim();
  const mfg = (body.mfg || "").trim();
  const exp = (body.exp || "").trim();
  const location = (body.location || "").trim();
  const packingRows = parsePackingRows(body.packingRows);

  if (!material) return res.status(400).json({ error: "Material name is required." });
  if (!brand) return res.status(400).json({ error: "Brand / Supplier is required." });
  if (!location) return res.status(400).json({ error: "Choose a location to transfer this stock to." });
  if (location === source.location)
    return res.status(400).json({ error: "Transfer destination must be a different bin from the current one." });
  if (packingRows.length === 0)
    return res.status(400).json({ error: "Add at least one packing size and count to move out." });

  const transferQty = packingTotal(packingRows);
  const available = Number(source.totalStock) || 0;
  if (transferQty <= 0) return res.status(400).json({ error: "Transfer quantity must be greater than zero." });
  if (transferQty > available + 0.0005)
    return res.status(400).json({ error: `Cannot transfer more than the available stock (${available} kg).` });

  await pushHistory();
  await registerLocationIfNew(location);

  const distinctSizes = Array.from(new Set(packingRows.map((r) => r.size)));
  const packingDetail = packingDetailFor(packingRows);
  const fromLocation = source.location;
  const isFullTransfer = Math.abs(transferQty - available) <= 0.0005;

  if (isFullTransfer) {
    source.material = material;
    source.tally = source.tally || material;
    source.brand = brand;
    source.batchNo = batchNo;
    source.mfg = mfg;
    source.exp = exp;
    source.packing = distinctSizes.length === 1 ? distinctSizes[0] : source.packing;
    source.packingDetail = packingDetail;
    source.location = location;
    await source.save();
  } else {
    source.totalStock = round3(available - transferQty);
    if (source.totalStock <= 0) source.location = null;
    await source.save();

    await StockItem.create({
      tally: material,
      material,
      brand,
      packing: distinctSizes.length === 1 ? distinctSizes[0] : null,
      article: null,
      packingDetail,
      totalStock: transferQty,
      batchNo,
      mfg,
      exp,
      in: 0,
      out: 0,
      opening: transferQty,
      location,
    });
  }

  await logTx({
    ts: new Date().toISOString(),
    type: "TRANSFER",
    material,
    brand,
    batchNo,
    fromLocation,
    toLocation: location,
    packingDetail,
    qty: transferQty,
    byUser: req.user.email,
  });

  res.json({ ok: true });
}

export async function editItem(req, res) {
  const item = await StockItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "This row no longer exists." });

  const body = req.body || {};
  const material = (body.material || "").trim();
  const brand = (body.brand || "").trim();
  const batchNo = (body.batchNo || "").trim();
  const mfg = (body.mfg || "").trim();
  const exp = (body.exp || "").trim();
  const packingRaw = (body.packing ?? "").toString().trim();
  const packingDetail = (body.packingDetail || "").trim();
  const totalStockRaw = (body.totalStock ?? "").toString().trim();
  const location = (body.location || "").trim();

  if (!material) return res.status(400).json({ error: "Material name is required." });
  if (totalStockRaw === "") return res.status(400).json({ error: "Total stock is required." });
  const totalStock = parseFloat(totalStockRaw);
  if (isNaN(totalStock) || totalStock < 0)
    return res.status(400).json({ error: "Total stock must be a valid number, 0 or more." });
  let packing = null;
  if (packingRaw !== "") {
    packing = parseFloat(packingRaw);
    if (isNaN(packing) || packing < 0) return res.status(400).json({ error: "Packing size must be a valid number." });
  }

  await pushHistory();
  if (location) await registerLocationIfNew(location);

  item.material = material;
  item.tally = item.tally || material;
  item.brand = brand || null;
  item.batchNo = batchNo || null;
  item.mfg = mfg || null;
  item.exp = exp || null;
  item.packing = packing;
  item.packingDetail = packingDetail || null;
  item.totalStock = round3(totalStock);
  item.location = location || null;
  await item.save();

  await logTx({
    ts: new Date().toISOString(),
    type: "EDIT",
    material: item.material,
    brand: item.brand,
    batchNo: item.batchNo,
    location: item.location,
    qty: item.totalStock,
    byUser: req.user.email,
  });

  res.json({ item });
}

export async function deleteItem(req, res) {
  const item = await StockItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "This row no longer exists." });

  await pushHistory();
  await item.deleteOne();

  await logTx({
    ts: new Date().toISOString(),
    type: "DELETE",
    material: item.material,
    brand: item.brand,
    batchNo: item.batchNo,
    location: item.location,
    qty: Number(item.totalStock) || 0,
    byUser: req.user.email,
  });

  res.json({ ok: true });
}

export async function reserveItem(req, res) {
  const item = await StockItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "This row no longer exists." });

  const types = Array.isArray(req.body?.types) ? req.body.types : [];
  const qty = parseFloat(req.body?.qty);

  if (types.length === 0) return res.status(400).json({ error: "Choose at least one reservation type." });
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Enter a valid quantity to reserve." });
  if (qty > (Number(item.totalStock) || 0))
    return res.status(400).json({ error: "Reserved qty cannot exceed stock on hand." });

  await pushHistory();
  const reservedQty = round3(qty);
  item.reservation = { type: types, qty: reservedQty };
  await item.save();

  await logTx({
    ts: new Date().toISOString(),
    type: "RESERVE",
    material: item.material,
    brand: item.brand,
    batchNo: item.batchNo,
    location: item.location,
    qty: reservedQty,
    resType: types.join(", "),
    byUser: req.user.email,
  });

  res.json({ item });
}

export async function unreserveItem(req, res) {
  const item = await StockItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "This row no longer exists." });
  if (!item.reservation) return res.json({ item });

  await pushHistory();
  const prevRes = item.reservation;
  item.reservation = null;
  await item.save();

  await logTx({
    ts: new Date().toISOString(),
    type: "UNRESERVE",
    material: item.material,
    brand: item.brand,
    batchNo: item.batchNo,
    location: item.location,
    qty: prevRes.qty,
    resType: prevRes.type.join(", "),
    byUser: req.user.email,
  });

  res.json({ item });
}
