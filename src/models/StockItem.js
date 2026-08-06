import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema(
  {
    type: { type: [String], default: [] },
    qty: { type: Number, default: 0 },
  },
  { _id: false },
);

const stockItemSchema = new mongoose.Schema(
  {
    tally: { type: mongoose.Schema.Types.Mixed, default: null },
    material: { type: String, required: true },
    brand: { type: mongoose.Schema.Types.Mixed, default: null },
    packing: { type: mongoose.Schema.Types.Mixed, default: null },
    article: { type: mongoose.Schema.Types.Mixed, default: null },
    packingDetail: { type: String, default: null },
    totalStock: { type: mongoose.Schema.Types.Mixed, default: null },
    batchNo: { type: mongoose.Schema.Types.Mixed, default: null },
    mfg: { type: String, default: null },
    exp: { type: String, default: null },
    in: { type: Number, default: 0 },
    out: { type: Number, default: 0 },
    opening: { type: mongoose.Schema.Types.Mixed, default: null },
    location: { type: String, default: null },
    reservation: { type: reservationSchema, default: null },
  },
  { timestamps: true },
);

stockItemSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export default mongoose.model("StockItem", stockItemSchema);
