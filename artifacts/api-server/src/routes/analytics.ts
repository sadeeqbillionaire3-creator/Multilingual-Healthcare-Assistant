import { Router } from "express";
import { analyticStore } from "../lib/analyticStore";

const router = Router();

router.get("/", (req, res) => {
  res.json(analyticStore);
});

export default router;
