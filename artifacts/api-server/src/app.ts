// @ts-nocheck
import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
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

// === FIX WHITE SCREEN - FINAL WORKING VERSION ===
app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif; text-align:center; padding:50px">
      <h1>MediLingua AI is Running ✅</h1>
      <p>Backend is live!</p>
      <p><a href="/api/health">Check /api/health</a></p>
      <p>WhatsApp: /webhook</p>
    </body></html>
  `)
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MediLingua API', time: new Date().toISOString() })
});

// Try to serve frontend IF it exists (optional)
const frontendDist = path.resolve(__dirname, "../../healthcare-assistant/dist/public");
const frontendRoot = path.resolve(__dirname, "../../healthcare-assistant/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  console.log("Serving frontend from:", frontendDist);
} else if (fs.existsSync(frontendRoot)) {
  app.use(express.static(frontendRoot));
  console.log("Serving frontend from:", frontendRoot);
}

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