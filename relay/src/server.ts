import { WebSocketServer } from "ws";
import { mmByKey } from "./auth.js";
import { makeChain } from "./chain.js";
import { makeClose } from "./close.js";
import type { Config } from "./config.js";
import { connect } from "./db.js";
import { Hub } from "./hub.js";
import { createHttp } from "./http.js";
import { startIndexer } from "./indexer.js";
import { createPortal } from "./portal.js";

/** Builds the full relay (HTTP + WebSocket upgrade wiring) without starting a listener, so
 * `index.ts` and tests can both compose it the same way and just choose when/where to listen. */
export function buildRelay(cfg: Config) {
  const db = connect(cfg.DATABASE_URL);
  const chain = makeChain(cfg);
  const hub = new Hub(cfg, db, chain);
  const indexer = startIndexer(cfg, db, chain);
  const portal = createPortal({ db, chain, hub, chainId: cfg.CHAIN_ID, knownTickers: () => Object.keys(cfg.TOKENS) });
  const close = makeClose(cfg, chain, db);
  const server = createHttp(cfg, db, hub, { indexer: indexer.status, portal, close });

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
        alive.set(ws, true);
        ws.on("pong", () => alive.set(ws, true));
        hub.register(mm, ws);
      });
    } catch (e) {
      console.error("upgrade failed:", e instanceof Error ? e.message : e);
      refuse(500, "Internal Server Error");
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 20_000);
  heartbeat.unref();

  const stop = async () => {
    clearInterval(heartbeat);
    indexer.stop();
    wss.close();
    await new Promise<void>((r) => server.close(() => r()));
    await db.end();
  };

  return { server, db, chain, hub, indexer, portal, close, stop };
}
