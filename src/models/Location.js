import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
});

locationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.__v;
  },
});

export default mongoose.model("Location", locationSchema);
