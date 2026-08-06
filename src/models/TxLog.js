import mongoose from "mongoose";

const txLogSchema = new mongoose.Schema({
  ts: { type: String, required: true },
  type: {
    type: String,
    enum: ["IN", "OUT", "TRANSFER", "EDIT", "DELETE", "RESERVE", "UNRESERVE"],
    required: true,
  },
  material: { type: mongoose.Schema.Types.Mixed, default: null },
  brand: { type: mongoose.Schema.Types.Mixed, default: null },
  batchNo: { type: mongoose.Schema.Types.Mixed, default: null },
  location: { type: String, default: null },
  fromLocation: { type: String, default: null },
  toLocation: { type: String, default: null },
  packingDetail: { type: String, default: null },
  qty: { type: Number, default: 0 },
  resType: { type: String, default: null },
  byUser: { type: String, default: null },
});

txLogSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export default mongoose.model("TxLog", txLogSchema);
