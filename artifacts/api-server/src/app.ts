// @ts-nocheck
import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import routers from './routes/index.js'
import analyticsRouters from "./routes/analytics.js"
import whatsappRouter from "./routes/whatsapp.js"
import { logger } from "./lib/logger.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
app.set("trust proxy", 1);
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0], }; }, res(res) { return { statusCode: res.statusCode, }; }, }, }));
app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/webhook", whatsappRouter);
app.use("/api", routers);
app.use("/api/analytics", analyticsRouters);

// === FIX WHITE SCREEN - FINAL ===
const frontendDist = path.resolve(__dirname, "../../healthcare-assistant/dist/public");
const frontendRoot = path.resolve(__dirname, "../../healthcare-assistant/dist");
console.log("Serving frontend from:", frontendDist);
app.use(express.static(frontendDist));
app.use(express.static(frontendRoot));

app.get('/{*any}', (req, res) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/webhook")) return next();
  // try public/index.html first, then dist/index.html
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(frontendRoot, "index.html"), (err2) => {
        if (err2) next();
      });
    }
  });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (error && typeof error === "object" && "type" in error) {
    const requestError = error as { type?: string };
    if (requestError.type === "entity.too.large") {
      response.status(413).json({ error: "Request too large. Maximum upload size is 6MB.", });
      return;
    }
  }
  next(error);
};
app.use(errorHandler);
export default app;