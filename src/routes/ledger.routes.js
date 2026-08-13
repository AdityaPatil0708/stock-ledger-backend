import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  getLedger,
  undo,
  stockIn,
  stockOut,
  transfer,
  editItem,
  deleteItem,
  reserveItem,
  unreserveItem,
  produceCompound,
} from "../controllers/ledger.controller.js";

const router = Router();
const editorOnly = requireRole("editor");

router.use(authenticate);

router.get("/", getLedger);
router.post("/undo", editorOnly, undo);
router.post("/in", editorOnly, stockIn);
router.post("/produce", editorOnly, produceCompound);
router.post("/items/:id/out", editorOnly, stockOut);
router.post("/items/:id/transfer", editorOnly, transfer);
router.put("/items/:id", editorOnly, editItem);
router.delete("/items/:id", editorOnly, deleteItem);
router.post("/items/:id/reserve", editorOnly, reserveItem);
router.post("/items/:id/unreserve", editorOnly, unreserveItem);

export default router;
