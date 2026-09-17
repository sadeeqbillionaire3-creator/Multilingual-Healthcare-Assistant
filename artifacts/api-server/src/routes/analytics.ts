import { Router } from "express";
import { analyticStore } from "../lib/analyticStore.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(analyticStore);
});

export default router;
