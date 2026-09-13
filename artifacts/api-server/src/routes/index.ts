import { Router, type IRouter } from "express";
import chatRouter from "./chat";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);

export default router;
