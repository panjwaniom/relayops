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
  await ensureSchema();
  await initQueue(executeSyncJob);
  startScheduler();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`RelayOps API listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
