import { loadConfig } from "./config.js";
import { buildRelay } from "./server.js";

const cfg = loadConfig();
const relay = buildRelay(cfg);

relay.server.listen(cfg.PORT, () => console.log(`relay listening on :${cfg.PORT} (chain ${cfg.CHAIN_ID})`));

const stop = () => {
  void relay.stop().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
