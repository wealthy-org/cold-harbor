import { WebSocketServer } from "ws";
import { mmByKey } from "./auth.js";
import { makeChain } from "./chain.js";
import { makeClose } from "./close.js";
import { loadConfig } from "./config.js";
import { connect } from "./db.js";
import { Hub } from "./hub.js";
import { createHttp } from "./http.js";
import { startIndexer } from "./indexer.js";
import { createPortal } from "./portal.js";

const cfg = loadConfig();
const db = connect(cfg.DATABASE_URL);
const chain = makeChain(cfg);
const hub = new Hub(cfg, db, chain);
const indexer = startIndexer(cfg, db, chain);
const portal = createPortal({ db, chain, hub, chainId: cfg.CHAIN_ID, knownTickers: () => Object.keys(cfg.TOKENS) });
const close = makeClose(cfg, chain, db);
const server = createHttp(cfg, db, hub, { indexer: indexer.status, portal, close });

// Makers connect to /mm/ws with their API key in the X-API-Key header (never in the URL, which ends up in logs).
const alive = new WeakMap<object, boolean>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
server.on("upgrade", async (req, socket, head) => {
  const refuse = (code: number, text: string) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  try {
    if (new URL(req.url ?? "/", "http://x").pathname !== "/mm/ws") return refuse(404, "Not Found");
    const key = String(req.headers["x-api-key"] ?? "");
    const mm = await mmByKey(db, key);
    if (!mm) return refuse(401, "Unauthorized");
    wss.handleUpgrade(req, socket, head, (ws) => {
      // noServer mode does not emit "connection", so the heartbeat is wired here.
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      hub.register(mm, ws);
    });
  } catch (e) {
    console.error("upgrade failed:", e instanceof Error ? e.message : e);
    refuse(500, "Internal Server Error");
  }
});

// Drop dead connections: ping every 20s, terminate whoever did not answer the previous ping.
setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 20_000).unref();

server.listen(cfg.PORT, () => console.log(`relay listening on :${cfg.PORT} (chain ${cfg.CHAIN_ID})`));

const stop = () => {
  indexer.stop();
  wss.close();
  server.close(() => void db.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
