import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { HttpError } from "./hub.js";

const CLOSE_TYPES = { Close: [{ name: "id", type: "uint256" }, { name: "price", type: "uint256" }] } as const;
const FORWARD_STATUS_OPEN = 1;

const isHex = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v);
const isDigits = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v) && v.length < 40;

type Row = { price: string; maker_sig: string | null; taker_sig: string | null; status: "pending" | "ready" };

/** Mutual close is a two-signature handshake over the same (id, price). The relay only
 * routes and matches signatures; closeByMutual() on chain is the only thing that moves funds. */
export function makeClose(cfg: Config, chain: Chain, db: Db) {
  const verify = async (id: bigint, price: bigint, signature: Hex): Promise<Address> =>
    recoverTypedDataAddress({
      domain: { name: "Cold Harbor Forwards", version: "1", chainId: cfg.CHAIN_ID, verifyingContract: chain.engineAddress() },
      types: CLOSE_TYPES,
      primaryType: "Close",
      message: { id, price },
      signature,
    });

  const get = async (idStr: string) => {
    if (!isDigits(idStr)) throw new HttpError(400, "Forward id must be a positive integer.");
    const r = await db.query<Row>(`SELECT price, maker_sig, taker_sig, status FROM close_proposals WHERE forward_id = $1`, [idStr]);
    const row = r.rows[0];
    if (!row) return { status: "none" as const };
    return { status: row.status, price: row.price, hasMakerSig: !!row.maker_sig, hasTakerSig: !!row.taker_sig, makerSig: row.maker_sig, takerSig: row.taker_sig };
  };

  const propose = async (idStr: string, body: unknown) => {
    if (!isDigits(idStr)) throw new HttpError(400, "Forward id must be a positive integer.");
    const b = body as { price?: unknown; signature?: unknown };
    if (!isDigits(b.price)) throw new HttpError(400, "price must be a positive integer string (8 dp).");
    if (!isHex(b.signature)) throw new HttpError(400, "signature must be 0x-prefixed hex.");
    const id = BigInt(idStr);
    const price = BigInt(b.price);
    if (price <= 0n) throw new HttpError(400, "price must be greater than zero.");

    const pos = await chain.getPosition(id);
    if (pos.status !== FORWARD_STATUS_OPEN) throw new HttpError(409, "This forward is not open.");

    const signer = (await verify(id, price, b.signature)).toLowerCase();
    const maker = pos.maker.toLowerCase();
    const taker = pos.taker.toLowerCase();
    const role = signer === maker ? "maker" : signer === taker ? "taker" : null;
    if (!role) throw new HttpError(401, "Signature does not match the maker or taker of this forward.");

    const existing = (await db.query<Row>(`SELECT price, maker_sig, taker_sig, status FROM close_proposals WHERE forward_id = $1`, [idStr])).rows[0];

    let makerSig = role === "maker" ? b.signature : existing?.price === b.price ? existing?.maker_sig ?? null : null;
    let takerSig = role === "taker" ? b.signature : existing?.price === b.price ? existing?.taker_sig ?? null : null;
    const status = makerSig && takerSig ? "ready" : "pending";

    await db.query(
      `INSERT INTO close_proposals (forward_id, price, maker_sig, taker_sig, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (forward_id) DO UPDATE SET price = $2, maker_sig = $3, taker_sig = $4, status = $5, updated_at = now()`,
      [idStr, b.price, makerSig, takerSig, status]
    );
    return { status, price: b.price, hasMakerSig: !!makerSig, hasTakerSig: !!takerSig, makerSig, takerSig, yourRole: role };
  };

  return { get, propose };
}

export type Close = ReturnType<typeof makeClose>;
