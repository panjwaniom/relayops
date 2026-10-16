import { config } from "./config";
import { ensureSchema } from "./db";
import { createApp } from "./app";
import { initQueue, executeSyncJob } from "./queue";
import { startScheduler } from "./scheduler";

async function main() {
  const boot: Array<{ t: string; msg: string }> = [];
  const log = (msg: string) => {
    boot.push({ t: new Date().toISOString(), msg });
    console.log(msg);
    (global as any).__bootLog = boot;
  };
  process.on("uncaughtException", (e) => log(`[fatal] uncaught: ${e?.message || e}`));
  process.on("unhandledRejection", (e: any) => log(`[fatal] unhandled rejection: ${e?.message || e}`));
  if (config.isProduction && config.jwtSecret === "relayops-dev-secret-change-me") {
    console.error("Refusing to start: set a unique JWT_SECRET in production.");
    process.exit(1);
  }
  const app = createApp();
  // Listen first so liveness probes pass while the database warms up.
  // Retry the bind: during rolling deploys the previous instance can briefly
  // hold the port, and a single EADDRINUSE must not kill the boot.
  const port = config.port;
  for (let i = 1; ; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = app.listen(port, () => resolve());
        server.on("error", reject);
      });
      log(`RelayOps API listening on http://localhost:${port}`);
      break;
    } catch (e: any) {
      log(`[net] port ${port} busy (attempt ${i}): ${e?.message || e} — retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  try {
    await initQueue(executeSyncJob);
    log("[queue] ready");
  } catch (e: any) {
    log(`[queue] init failed: ${e?.message || e}`);
  }
  try {
    startScheduler();
    log("[scheduler] ready");
  } catch (e: any) {
    log(`[scheduler] init failed: ${e?.message || e}`);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSchema();
      log("[db] schema ready");
      break;
    } catch (e: any) {
      log(`[db] schema not ready (attempt ${attempt}): ${e?.message || e} — retrying in 10s`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

main().catch((e) => {
  console.error("Fatal boot error (non-fatal, staying up for diagnostics):", e?.message || e);
});

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
