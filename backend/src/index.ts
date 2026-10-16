import { config } from "./config";
import { ensureSchema } from "./db";
import { createApp } from "./app";
import { initQueue, executeSyncJob } from "./queue";
import { startScheduler } from "./scheduler";

async function main() {
  if (config.isProduction && config.jwtSecret === "relayops-dev-secret-change-me") {
    console.error("Refusing to start: set a unique JWT_SECRET in production.");
    process.exit(1);
  }
  const app = createApp();
  // Listen first so liveness probes pass while the database warms up;
  // schema migration retries in the background until it succeeds.
  app.listen(config.port, () => {
    console.log(`RelayOps API listening on http://localhost:${config.port}`);
  });
  await initQueue(executeSyncJob);
  startScheduler();
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSchema();
      console.log("[db] schema ready");
      break;
    } catch (e: any) {
      console.error(`[db] schema not ready (attempt ${attempt}): ${e?.message || e} — retrying in 10s`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

main().catch((e) => {
  console.error("Fatal boot error:", e?.message || e);
  process.exit(1);
});

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
