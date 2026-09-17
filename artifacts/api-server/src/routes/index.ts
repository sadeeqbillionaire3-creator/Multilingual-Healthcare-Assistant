import { Router, type IRouter } from "express";
import chatRouter from "./chat.js";
import healthRouter from "./health.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
export default router;