import express, {
  type ErrorRequestHandler,
  type Express,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from"./routes";
import analyticsRouter from "./routes/analytics";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api/analytics", analyticsRouter);
const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (error && typeof error === "object" && "type" in error) {
    const requestError = error as { type?: string };
    if (requestError.type === "entity.too.large") {
      response.status(413).json({
        error: "Request too large. Maximum upload size is 6MB.",
      });
      return;
    }
  }

  next(error);
};

app.use(errorHandler);

export default app;
