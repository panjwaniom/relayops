import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config";
import authRoutes from "./routes/auth";
import integrationRoutes from "./routes/integrations";
import jobRoutes from "./routes/jobs";
import metaRoutes from "./routes/meta";
import aiRoutes from "./routes/ai";
import { aiStatus } from "./ai";

export function createApp() {
  const app = express();
  app.use(cors({ origin: [config.frontendUrl, "http://localhost:5173", "http://localhost:3000"], credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => {
    const ai = aiStatus();
    res.json({ ok: true, service: "relayops", time: new Date().toISOString(), postgres: config.usePostgres, redis: config.useRedis, ai: ai.configured, aiProvider: ai.provider, aiModel: ai.model, scheduler: true });
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/integrations", integrationRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api", metaRoutes);

  // 404 + error handler with proper shape
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: err.issues });
    }
    console.error(err);
    res.status(err?.status || 500).json({ error: err?.message || "Internal server error" });
  });
  return app;
}
