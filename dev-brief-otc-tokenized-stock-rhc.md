# DEV BRIEF — On-chain OTC Desk untuk Tokenized Stock di Robinhood Chain
*Versi 1.0 · 21 Nov 2026 (WITA) · Disusun Forge untuk Bos Fine*

**Konvensi dokumen**
- **[ASUMSI]**: angka atau keputusan desain yang belum terverifikasi dan masih bisa diubah.
- **[BELUM TERVERIFIKASI]**: fakta pihak ketiga yang belum dikonfirmasi dari sumber resmi.
- Klaim lain diberi link sumber.

---

## 1. Ringkasan & positioning

**Satu kalimat:** *"Wintermute OTC, tapi on-chain, untuk saham di Robinhood Chain."*

Desk OTC non-kustodian untuk Robinhood Stock Tokens. Isinya:
- **RFQ multi-MM**: banyak market maker bersaing memberi quote.
- **Block trade atomik**: Stock Token ⇄ USDG dalam satu transaksi.
- **Forward saham cash-settled**: dikolateralkan USDG, diselesaikan pada harga penutupan resmi via oracle.

**Kenapa sekarang (fakta):**
- **Stock Tokens:** ERC-20 standar, 18 desimal, bisa ditransfer dan dikomposisikan ke kontrak. Tiap token punya feed Chainlink ([RHC docs — Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/)).
- **Likuiditas DEX tipis dibanding volume:** volume DEX stock token $209M/24 jam vs likuiditas DEX $45M ([Stockdeck](https://stockdeck.xyz/chain/robinhood)). Order besar butuh quote MM, bukan AMM.
- **RFQ sudah jadi pola resmi:** RHC docs menyebut stock token diperdagangkan via RFQ (0x RFQ, 1inch Fusion, LiFi), AMM, dan propAMM (Rialto) ([Building with Stock Tokens](https://docs.robinhood.com/chain/building-with-stock-tokens/)).
- **Venue hedging untuk MM tersedia di chain yang sama:**
  - Arcus: perp saham, 38 market, volume $112M/24 jam ([ArcusGuide](https://arcusguide.com/markets/category/equities), [Arcus docs](https://docs.arcus.xyz/concepts/perpetuals/real-world-assets)).
  - Lighter Domain RHC: spot & perps stock token ([RHC docs — Lighter](https://docs.robinhood.com/chain/lighter-domains/)).

**Pembeda vs Wintermute:**
1. **Non-kustodian & atomik.** Settlement di smart contract, bukan bilateral ISDA.
2. **Multi-MM.** Beberapa MM bersaing per RFQ, bukan satu prinsipal.
3. **24/7 via wallet.** Harga settlement forward dari oracle publik yang bisa diaudit siapa pun.

---

## 2. Nama produk

**Nama: Cold Harbor** (dipilih Bos)

- **Makna:** "cold" seperti cold storage (aman, tenang, tidak emosional ala desk institusi), "harbor" adalah pelabuhan tempat kapal besar berlabuh dengan aman, seperti transaksi besar yang tereksekusi tanpa guncangan harga. Nuansanya senada dengan Wintermute: dingin, tenang, institusional.
- **Ejaan:** dua kata, ejaan Amerika ("Harbor"), sesuai pasar saham AS yang disasar.
- **Headline hero:** *"Shipping size through on-chain markets"* (dipilih Bos; senada dengan "Harnessing chaos in digital asset markets" milik Wintermute)
- **Tagline pendek (di bawah logo):** *"Where size settles."*
- *Domain, merek dagang, dan handle X belum dicek.* **[ASUMSI]**

---

## 3. Persona pengguna

| Persona | Kebutuhan | Fitur utama |
|---|---|---|
| **Trader/whale on-chain** (beli/jual $50K–$5M stock token) | Harga firm tanpa slippage AMM | RFQ + block trade |
| **Fund/treasury crypto-native** (diversifikasi ke saham AS 24/7) | Eksposur atau hedging tanpa memegang token, tenor mingguan/bulanan | Forward cash-settled |
| **Market maker / AP** (mis. AP primer RHC adalah BBVI, [RHC docs](https://docs.robinhood.com/chain/stock-tokens/); propAMM seperti Rialto, [docs](https://docs.rialto.xyz/overview/how-rialto-works)) | Order flow besar yang tidak toxic | Portal MM + API quote |
| **Integrator** (wallet, aggregator, fase 2) | Sumber likuiditas firm | API publik / adapter aggregator |

---

## 4. Universe awal (terverifikasi)

**Sumber:** Chainlink Reference Data Directory untuk RHC mainnet ([feeds-robinhood-mainnet.json](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json), diambil 21 Nov 2026).

**Isi:** 62 feed total. Di antaranya **35 feed saham per-ticker** bertipe `us_equities_24/5`, plus **GLD**. Semua heartbeat 86.400 detik, deviasi 0,5%, 8 desimal.

**36 ticker MVP:**

`AAPL, AMD, AMZN, ASML, BABA, CLSK, COIN, CRCL, CRWV, DELL, EWY, GME, GOOGL, INTC, IONQ, META, MSFT, MSTR, MU, NBIS, NVDA, ORCL, PLTR, QQQ, RGTI, RKLB, SGOV, SLV, SNDK, SPCX, SPY, TSLA, TSM, USAR, USO, GLD`

**Feed 24/7 tambahan:** GOOGL, NVDA, SNDK, TSLA (kategori "custom"). Dipakai untuk mark-to-market di akhir pekan.

**Pembanding:** Note Systems juga mencatat 35 feed saham Chainlink, dari 194 stock token yang ada saat itu ([Note docs](https://note.systems/docs/protocol/oracle-and-calendar/)).

**Alamat token:** wajib dibaca dari registry resmi ([RHC Token Contracts](https://docs.robinhood.com/chain/contracts/)) atau `GET https://api.robinhood.com/rhj/assets` ([Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)). Jangan di-hardcode dari sumber lain.

---

## 5. User flow per fitur

### 5.1 RFQ saham
1. Trader connect wallet (RHC, chain ID 4663).
2. Pilih ticker, arah (Buy/Sell), dan jumlah (token atau notional USDG).
3. Backend membuat RFQ dan mem-broadcast ke MM terdaftar via WebSocket.
4. MM membalas dengan quote EIP-712 bertanda tangan. Masa berlaku quote 15–30 detik **[ASUMSI]**.
5. UI menampilkan quote terbaik, harga vs Chainlink/Pyth ("vs oracle ±bps"), jumlah MM yang merespons, dan hitung mundur.
6. Trader klik **Execute** dan lanjut ke 5.2.

### 5.2 Block trade atomik
1. Approve token jual (Permit2 atau `approve`) ke `ColdHarborSettlement`.
2. Trader memanggil `fillQuote(quote, makerSig)`. Kontrak lalu:
   - memverifikasi signature MM, `expiry`, `nonce`, dan `taker`;
   - menarik token dari kedua pihak;
   - memotong fee;
   - mengirim aset dalam **satu transaksi**. Semua sukses atau seluruhnya revert.
3. Event `QuoteFilled`, lalu indexer memperbarui riwayat.

### 5.3 Forward cash-settled
1. Trader memilih ticker, arah (Long/Short), quantity (token), dan tanggal jatuh tempo. Tanggal yang bisa dipilih hanya hari penutupan resmi pasar AS dari `MarketCalendar`.
2. RFQ forward dikirim ke MM. MM memberi **strike** (USDG per token) bertanda tangan.
3. Trader menyetor **margin awal (IM)** USDG. MM juga harus sudah punya saldo margin di `MarginVault`.
4. Selama posisi terbuka:
   - Mark-to-market memakai `referencePrice`.
   - Jika equity < maintenance margin, status menjadi **margin call** (notifikasi), lalu ada jendela top-up.
   - Jika tidak di-top-up, posisi **dilikuidasi** oleh keeper.
5. Pada jatuh tempo:
   - Keeper memanggil `settle(forwardId)` setelah `closeTs + closeGrace`.
   - PnL = (S_close − K) × qty untuk Long (kebalikannya untuk Short), dibayar dalam USDG dari margin pihak yang kalah ke pihak yang menang.
   - Sisa margin dikembalikan ke masing-masing pihak.

### 5.4 Portal MM
Onboarding:
1. Whitelist alamat signer.
2. API key.
3. Deposit margin USDG.
4. Set limit notional per ticker dan per trader.

Lalu MM memantau RFQ masuk, hit rate, posisi forward terbuka, eksposur per ticker, dan PnL.

### 5.5 Dashboard trader
Berisi riwayat block trade, posisi forward (strike, mark, uPnL, margin ratio, jatuh tempo, hitung mundur), tombol top-up dan close, serta export CSV.

---

## 6. Arsitektur

```
[Frontend Next.js + wagmi/viem]
        │  REST/WS
[RFQ Relay & API] ─WS→ [MM quoting engines]
        │                      │ (sign EIP-712)
        ▼                      ▼
[Smart contracts @ RHC 4663] ← tx ← Trader wallet
  ├ ColdHarborSettlement (spot RFQ)
  ├ ForwardEngine + MarginVault
  ├ OracleAdapter (Chainlink primary, Pyth Pro backup)
  └ MarketCalendar
        │ events
[Indexer] → [Postgres] → API dashboard/portal
[Keeper] → settle / liquidate / post Pyth Pro close print
```

### 6.1 Jaringan (dari docs resmi, [Connecting](https://docs.robinhood.com/chain/connecting/))

| Parameter | Mainnet | Testnet |
|---|---|---|
| Chain ID | **4663** | **46630** |
| Gas token | ETH | ETH |
| Explorer | robinhoodchain.blockscout.com | explorer.testnet.chain.robinhood.com |
| RPC (produksi) | `https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}` | `https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}` |
| RPC publik (rate-limited) | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |

**Detail lain:**
- RHC adalah Arbitrum L2 yang mendukung ERC-4337 (account abstraction) ([About RHC](https://docs.robinhood.com/chain/)).
- **USDG** mainnet: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` ([Token Contracts](https://docs.robinhood.com/chain/contracts/)).
- USDG memakai 6 desimal (contoh deposit 1 USDG = 1e6 di [Lighter Domains](https://docs.robinhood.com/chain/lighter-domains/)). **Developer wajib cek `decimals()` on-chain.**

### 6.2 Komponen
- **Smart contracts:** Solidity 0.8.x, Foundry, OpenZeppelin (EIP712, SafeERC20, ReentrancyGuard, Pausable), proxy UUPS **[ASUMSI]**.
- **RFQ Relay:** Node/TypeScript atau Go, WebSocket untuk MM, REST untuk frontend. Tugas: memilih quote terbaik, memverifikasi signature off-chain sebelum ditampilkan.
- **Indexer:** Ponder atau indexer viem custom **[ASUMSI]**. Mendengarkan event kontrak dan menulis ke Postgres. Butuh endpoint archive untuk riwayat (docs merekomendasikan archive untuk indexing).
- **Keeper:** bot yang menjalankan:
  - `settle()` setelah close;
  - `liquidate()`;
  - posting Pyth Pro update sebagai cadangan harga close.
- **Oracle:**
  - Chainlink Data Feeds (`AggregatorV3Interface`) ([RHC Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/)).
  - L2 Sequencer Uptime Feed (direkomendasikan docs RHC).
  - Pyth Pro verifier `0xACeA761c27A909d4D3895128EBe6370FDE2dF481` ([Pyth Pro EVM](https://docs.pyth.network/pro/use-prices-on-blockchain/evm), [Note docs](https://note.systems/docs/protocol/oracle-and-calendar/)).
  - Chainlink Data Streams (opsional, verifier proxy `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7`) ([Data Streams](https://docs.robinhood.com/chain/data-streams/)).
- **Frontend:** Next.js + TypeScript, wagmi/viem, RainbowKit atau ConnectKit **[ASUMSI]**, Tailwind.
- **Data off-chain:** REST `https://api.robinhood.com/rhj/` untuk metadata, multiplier, dan harga bid/ask. Rate limit 60 rps. Catatan: harga REST belum disesuaikan multiplier, sedangkan feed on-chain sudah ([Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)).

---

## 7. Spesifikasi smart contract

### 7.1 `ColdHarborSettlement` (spot RFQ)
Pola: signed maker order EIP-712 ala 0x `OtcOrder`/`RfqOrder`, dengan field `expiry`, nonce, dan `txOrigin` ([0x Orders](https://docs.0xprotocol.org/en/latest/basics/orders.html), [LibNativeOrder.sol](https://github.com/0xProject/protocol/blob/fd68edb23957ddef3e462bf1718d2ea9c3ef93f1/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol)). Opsi Permit2 untuk taker meniru pola Bebop ([Bebop RFQ-A](https://github.com/bebop-dex/bebop-rfqa)).

```solidity
struct Quote {
  address maker;        // signer MM (atau signer terdaftar milik MM)
  address taker;        // wajib = trader (quote private)
  address makerToken;   // token yang dikirim MM
  address takerToken;   // token yang dikirim trader
  uint256 makerAmount;
  uint256 takerAmount;
  uint64  expiry;       // unix detik
  uint64  nonceBucket;
  uint128 nonce;        // replay protection: bitmap per (maker, bucket)
  uint16  feeBps;       // fee protokol yang disetujui di quote
  bytes32 rfqId;        // id RFQ off-chain
}

function fillQuote(Quote calldata q, bytes calldata makerSig) external;
function fillQuoteWithPermit2(Quote calldata q, bytes calldata makerSig, ISignatureTransfer.PermitTransferFrom calldata p, bytes calldata takerSig) external;
function cancelNonce(uint64 bucket, uint128 nonce) external;            // dipanggil maker
function registerSigner(address signer, bool allowed) external;         // maker → hot signer
function setTokenAllowed(address token, bool allowed) external;         // admin: universe
function setFeeRecipient(address r) external;

event QuoteFilled(bytes32 indexed rfqId, address indexed maker, address indexed taker,
                  address makerToken, address takerToken, uint256 makerAmount, uint256 takerAmount, uint256 fee);
event NonceCancelled(address indexed maker, uint64 bucket, uint128 nonce);
event SignerRegistered(address indexed maker, address signer, bool allowed);
```

**Aturan:**
- `block.timestamp <= expiry`.
- `msg.sender == taker`.
- Nonce belum dipakai.
- Kedua token ada di allowlist universe (stock token resmi + USDG).
- Fee dipotong dari sisi USDG ke `feeRecipient`.

**Domain EIP-712:** `{name:"Cold Harbor", version:"1", chainId:4663, verifyingContract}`.

### 7.2 `MarginVault`
```solidity
function deposit(uint256 amount) external;           // USDG
function withdraw(uint256 amount) external;          // hanya free margin
function freeMargin(address acct) external view returns (uint256);
event Deposited(address indexed acct, uint256 amount);
event Withdrawn(address indexed acct, uint256 amount);
```

### 7.3 `ForwardEngine`
```solidity
enum Side { Long, Short }                    // dari sisi taker
enum Status { Open, Settled, Liquidated, Closed }

struct ForwardQuote {
  address maker; address taker; address stockToken; address feed;
  Side side; uint256 qty;              // 18 desimal (unit token)
  uint256 strike;                      // USDG per token (8 desimal, sama dengan feed)
  uint64  maturityCloseTs;             // harus MarketCalendar.isOfficialClose()
  uint16  imBps; uint16 mmBps;         // margin awal & maintenance (dari notional)
  uint16  feeBps; uint64 expiry; uint64 nonceBucket; uint128 nonce; bytes32 rfqId;
}

struct Position {
  address maker; address taker; address stockToken; address feed; Side side;
  uint256 qty; uint256 strike; uint64 maturityCloseTs;
  uint256 makerMargin; uint256 takerMargin; uint16 mmBps; Status status;
}

function openForward(ForwardQuote calldata q, bytes calldata makerSig) external returns (uint256 id);
function topUp(uint256 id, uint256 amount) external;
function markToMarket(uint256 id) external view returns (int256 pnlTaker, uint256 equityTaker, uint256 equityMaker, uint256 price, bool live);
function liquidate(uint256 id) external;           // keeper; jika equity < maintenance setelah grace
function settle(uint256 id) external;              // siapa saja, setelah closeTs + closeGrace
function closeByMutual(uint256 id, uint256 price, bytes calldata makerSig, bytes calldata takerSig) external; // unwind dini

event ForwardOpened(uint256 indexed id, bytes32 indexed rfqId, address indexed maker, address taker, address stockToken, Side side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint256 makerMargin, uint256 takerMargin);
event MarginToppedUp(uint256 indexed id, address indexed who, uint256 amount);
event MarginCall(uint256 indexed id, address indexed who, uint256 equity, uint256 required, uint64 deadline);
event ForwardLiquidated(uint256 indexed id, address indexed liquidatedParty, uint256 price, int256 pnlTaker, uint256 penalty);
event ForwardSettled(uint256 indexed id, uint256 closePrice, int256 pnlTaker);
event ObservationDeferred(uint256 indexed id, uint64 closeTs);
```

**Parameter default [ASUMSI]**

| Parameter | Nilai default | Keterangan |
|---|---|---|
| IM (single stock) | 20% | |
| IM (ETF: SPY, QQQ, GLD, SLV, SGOV) | 10% | |
| Maintenance | 50% dari IM | |
| Jendela top-up setelah margin call | 4 jam bursa buka | |
| Penalti likuidasi | 2% notional | Ke counterparty |
| Tenor | 1 minggu – 3 bulan | |
| Notional per posisi | Min 10.000 USDG, maks 1.000.000 USDG | Fase awal |

**Mark-to-market (`referencePrice`)**, mengikuti pola Note Systems ([docs](https://note.systems/docs/protocol/oracle-and-calendar/)):
1. Print Chainlink segar (≤ `liveMaxAge`).
2. Jika tidak ada, print Pyth Pro segar.
3. Jika tidak ada, harga close terakhir (`live=false`).

Untuk GOOGL, NVDA, SNDK, TSLA ada feed 24/7 ([Chainlink directory](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json)) sehingga MTM akhir pekan bisa memakai feed itu. **Likuidasi hanya berjalan bila `live==true`** **[ASUMSI desain]**.

### 7.4 `OracleAdapter` (harga settlement)
Diadopsi dari desain Note Systems ([Oracle & MarketCalendar](https://note.systems/docs/protocol/oracle-and-calendar/)):
- **`observe(feed, closeTs) → (price, ok)`**
  - Hanya bisa dipanggil setelah `closeTs + closeGrace`. Default Note: 5 menit.
  - Walk back rounds Chainlink (`getRoundData`) sampai menemukan round terakhir dengan `updatedAt ≤ closeTs` dan `updatedAt ≥ closeTs − maxPreCloseLag`.
  - Harga yang sudah terselesaikan di-*pin*.
- **Fakta penting dari Note:**
  - Feed Chainlink berbasis deviasi tidak selalu mencetak harga tepat di close. Dalam sampel 4 Sep 2026, **16 dari 35** feed tidak punya round di jendela [close−30 menit, close+5 menit].
  - Karena itu konfigurasi produksi Note memakai `maxPreCloseLag = 24 jam` dan `maxRoundWalk = 500`.
  - **Implementasi kita:** keeper **memposting print Pyth Pro sesi reguler** di sekitar close sebagai cadangan. Kontrak `PythProFeed` membungkus Pyth Pro ke interface Aggregator dan menolak print pre/after-hours. Adapter lalu membandingkannya dengan Chainlink dalam batas `maxDeviationBps`.
- **Deferral:** jika tidak ada harga valid, settlement ditunda (`ObservationDeferred`) dan bisa dicoba ulang siapa pun. Setelah `deferralWindow` lewat, ada governance force-observe dengan timelock, mengikuti pola Note.
- **Sequencer check:** baca L2 Sequencer Uptime Feed sebelum memakai harga ([RHC Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/)).

### 7.5 `MarketCalendar`
Spesifikasi mengikuti Note ([docs](https://note.systems/docs/protocol/oracle-and-calendar/)):

| Aturan | Nilai |
|---|---|
| Close reguler | 16:00 New York, yaitu 20:00 UTC saat DST dan 21:00 UTC di luar DST |
| Hari bursa | Senin–Jumat |
| Libur | `setHoliday(dayIndex,bool)` per tahun (admin/governance) |
| Early close | `setEarlyClose(dayIndex, closeTs)`, biasanya 13:00 NY |
| DST | Dihitung on-chain: mulai Minggu ke-2 Maret, berakhir Minggu ke-1 November |

**Fungsi:** `isOfficialClose(ts)`, `nextClose(ts)`, `lastCloseAtOrBefore(ts)`.

**Following Business Day:** bila libur baru didaftarkan setelah posisi dibuka, jatuh tempo bergeser ke close resmi berikutnya (maks. 8 hari kalender), mengikuti pola Note.

### 7.6 Aksi korporasi
- Stock Token memakai **ERC-8056 `uiMultiplier()`**, dan feed on-chain sudah disesuaikan dengan multiplier ([Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/), [Note docs](https://note.systems/docs/protocol/oracle-and-calendar/)).
- **Desain kita:** strike dan qty dinyatakan dalam *unit token*, sehingga split otomatis tercermin di harga feed. Strike tidak perlu disesuaikan **[ASUMSI desain, verifikasi dengan RHJ]**.
- **Oracle pause:** saat aksi korporasi diproses, `oraclePaused()` pada token bernilai `true` ([RHC Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/)). Selama itu `observe` dan likuidasi ditunda dan UI menampilkan "Corporate action in progress".
- **Pending multiplier:** `pendingMultiplier` dan `pendingMultiplierEffectiveTime` dari REST `/assets` ditampilkan di UI sebagai pengumuman.
- **Dividen tunai:** perlakuannya pada Stock Token **[BELUM TERVERIFIKASI]**. Arcus menyebut dividen tercermin di harga oracle untuk perp-nya ([Arcus docs](https://docs.arcus.xyz/concepts/perpetuals/real-world-assets)). MVP: tidak ada penyesuaian strike untuk dividen. MM memasukkan dividen yang diharapkan ke dalam strike.

---

## 8. API RFQ untuk Market Maker

**Base URL:** `https://api.coldharbor.xyz/v1` **[ASUMSI]**.

**Auth:**
- API key (header `X-API-Key`).
- Signer EIP-712 terdaftar on-chain (`registerSigner`).

| Endpoint | Metode | Fungsi |
|---|---|---|
| `/mm/ws` | WebSocket | Stream `rfq.request`, kirim `quote.submit`, terima `quote.result` |
| `/mm/limits` | GET/PUT | Batas notional per ticker, per taker, global |
| `/mm/positions` | GET | Posisi forward terbuka & eksposur |
| `/mm/fills` | GET | Riwayat fill (spot + forward) |
| `/mm/stats` | GET | Hit rate, latensi rata-rata, volume |
| `/rfq` | POST | (frontend/taker) membuat RFQ |
| `/rfq/{id}` | GET | Status RFQ + quote terbaik |
| `/universe` | GET | Daftar ticker aktif + feed + status pause |

**`rfq.request` (relay → MM)**
```json
{
  "type": "rfq.request",
  "rfqId": "0x9f1c...e2",
  "product": "spot",
  "chainId": 4663,
  "taker": "0xTrader...",
  "baseToken": {"symbol": "NVDA", "address": "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", "decimals": 18},
  "quoteToken": {"symbol": "USDG", "address": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", "decimals": 6},
  "side": "BUY",
  "baseAmount": "5000000000000000000000",
  "oracleRef": {"source": "chainlink", "price": "14225000000", "updatedAt": 1763690400},
  "feeBps": 8,
  "quoteDeadlineMs": 1500,
  "minExpirySec": 20
}
```
*(Alamat NVDA dari [Note docs](https://note.systems/docs/protocol/oracle-and-calendar/). Produksi wajib memakai registry resmi.)*

**`quote.submit` (MM → relay)**
```json
{
  "type": "quote.submit",
  "rfqId": "0x9f1c...e2",
  "quote": {
    "maker": "0xMM...",
    "taker": "0xTrader...",
    "makerToken": "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    "takerToken": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    "makerAmount": "5000000000000000000000",
    "takerAmount": "711600000000",
    "expiry": 1763690425,
    "nonceBucket": "7",
    "nonce": "1029384",
    "feeBps": 8,
    "rfqId": "0x9f1c...e2"
  },
  "signature": "0x..."
}
```

**`rfq.request` produk forward** — tambahan field:
```json
{
  "product": "forward",
  "underlying": "AAPL",
  "feed": "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
  "side": "LONG",
  "qty": "2000000000000000000000",
  "maturityCloseTs": 1766437200,
  "imBps": 2000, "mmBps": 1000
}
```
Balasan MM berisi `strike` (8 desimal) dan signature `ForwardQuote`. *(Feed AAPL dari [Chainlink directory](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json).)*

**`quote.result` (relay → MM):** `{ "rfqId": "...", "status": "WON|LOST|EXPIRED|FILLED", "txHash": "0x..." }`

**Aturan relay [ASUMSI]:**
- Quote terbaik dipilih berdasarkan nilai net untuk taker.
- Quote yang menyimpang > X bps dari oracle ditolak.
- MM dengan latensi > `quoteDeadlineMs` tidak diikutkan.
- Satu MM hanya boleh satu quote aktif per RFQ.

---

## 9. Model data (Postgres)

| Tabel | Kolom kunci |
|---|---|
| `accounts` | id, wallet, role(trader/mm/admin), created_at |
| `mm_profiles` | account_id, name, api_key_hash, signer_addresses[], status |
| `mm_limits` | mm_id, ticker, max_notional, max_per_taker, max_open_forwards |
| `universe` | ticker, token_address, chainlink_feed, pyth_feed_id, is_etf, im_bps, active, paused |
| `rfqs` | rfq_id, taker, product, ticker, side, amount, created_at, status |
| `quotes` | rfq_id, mm_id, payload_json, signature, net_price, received_ms, outcome |
| `fills` | tx_hash, rfq_id, maker, taker, maker_token, taker_token, amounts, fee, block_time |
| `forwards` | id, rfq_id, maker, taker, ticker, side, qty, strike, maturity_close_ts, margins, status |
| `margin_events` | forward_id, type(topup/call/liquidation), amount, price, block_time |
| `observations` | feed, close_ts, price, source(chainlink/pyth/forced), resolved_at |
| `calendar` | day_index, is_holiday, early_close_ts |
| `fee_ledger` | source(spot/forward), ref_id, amount_usdg, block_time |

---

## 10. Daftar integrasi

| Integrasi | Fungsi | Link |
|---|---|---|
| Robinhood Chain RPC/explorer | Jaringan | [Connecting](https://docs.robinhood.com/chain/connecting/) |
| Stock Tokens & registry | Universe, alamat token | [Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/), [Contracts](https://docs.robinhood.com/chain/contracts/), [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/) |
| Chainlink Data Feeds | Harga primer | [RHC Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/), [Directory JSON](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json) |
| Chainlink Data Streams | Harga latensi rendah (opsional) | [RHC Data Streams](https://docs.robinhood.com/chain/data-streams/), [Changelog](https://dev.chain.link/changelog/data-streams-expands-to-robinhood-chain-mainnet) |
| Pyth Pro | Harga cadangan & print close | [Pyth Pro EVM](https://docs.pyth.network/pro/use-prices-on-blockchain/evm), [Contract addresses](https://docs.pyth.network/pro/contract-addresses) |
| Referensi desain oracle/kalender | Pola | [Note Systems](https://note.systems/docs/protocol/oracle-and-calendar/) |
| 0x RFQ / OtcOrder | Pola signed order | [0x Orders](https://docs.0xprotocol.org/en/latest/basics/orders.html) |
| Bebop RFQ / JAM | Pola Permit2 + settlement | [Bebop RFQ](https://docs.bebop.xyz/rfq-api/introduction), [JAM contracts](https://github.com/bebop-dex/bebop-jam-contracts) |
| Arcus | Venue hedging MM (perp saham) | [Arcus docs](https://docs.arcus.xyz/concepts/perpetuals/real-world-assets), [Fees](https://help.arcus.xyz/faq/arcus-perps-faq/fees/what-are-the-perp-fee-tiers) |
| Lighter (RHC Domain) | Venue hedging MM | [RHC Lighter](https://docs.robinhood.com/chain/lighter-domains/), [API](https://apidocs.rh.lighter.xyz/docs/get-started) |
| Rialto | Aggregator/propAMM (fase 2) | [Rialto docs](https://docs.rialto.xyz/overview/how-rialto-works) |
| Sablier Lockup | Modul token terkunci (fase 2) | [Deployments](https://docs.sablier.com/guides/lockup/deployments), [Transferability](https://docs.sablier.com/concepts/transferability) |
| Alchemy | RPC, AA, gas sponsorship | [Connecting](https://docs.robinhood.com/chain/connecting/) |

---

## 11. Revenue model [ASUMSI]

| Sumber | Tarif awal | Catatan |
|---|---|---|
| Fee spot RFQ (taker) | 5–10 bps notional | Dipotong di sisi USDG. MM 0 bps untuk menarik likuiditas. |
| Fee buka forward | 15–25 bps notional | Dibayar taker saat `openForward` |
| Fee settlement forward | 0–5 bps | |
| Penalti likuidasi | 2% notional | Mayoritas ke counterparty, sebagian kecil ke protokol |
| Fase 2: fee API/aggregator | Revenue share | Mis. integrasi Rialto partner program ([Rialto blog](https://blog.rialto.xyz/blog/introducing-rialto)) |

*Referensi pasar:*
- Note Systems memakai fee notional 75 bps dan coupon fee 2.500 bps pada produk struktur mereka ([Note addresses/params](https://note.systems/docs/developers/addresses/)).
- Arcus: taker fee perp RWA 0,0225% di tier 0 ([Arcus fees](https://help.arcus.xyz/faq/arcus-perps-faq/fees/what-are-the-perp-fee-tiers)).

---

## 12. Urutan pengerjaan

**Tim inti:**
- 1 Solidity engineer senior
- 1 backend (relay, keeper, indexer)
- 1 frontend
- 0,5 designer
- 1 BD/MM relations (Bos + 1)
- Audit eksternal

Urutan deliverable (dikerjakan paralel bila memungkinkan, tanpa batas waktu tetap):

1. Finalisasi spesifikasi, design system, setup repo, testnet 46630
2. `ColdHarborSettlement` + relay RFQ + UI RFQ/block trade (testnet), uji coba dengan 2 MM
3. `MarginVault`, `ForwardEngine`, `OracleAdapter`, `MarketCalendar`, keeper; unit + fork test pada feed RHC mainnet
4. Indexer, dashboard trader, portal MM, landing page
5. **Audit kontrak** + perbaikan
6. Mainnet terbatas (whitelist trader & MM, limit notional rendah)
7. Buka publik. Fase 2: modul Sablier, opsi, adapter aggregator (Rialto, Bebop, 0x, 1inch)

---

## 13. Kriteria keberhasilan [ASUMSI target]

| Horizon | Metrik | Target |
|---|---|---|
| Mainnet terbatas | MM aktif yang quoting | ≥3 |
| | Response rate RFQ (≥1 quote valid) | ≥90% |
| | Median waktu RFQ → quote | <2 detik |
| | Fill gagal karena error kontrak | 0 |
| 90 hari | Volume spot block trade | ≥$25M kumulatif |
| | Rata-rata ukuran tiket | ≥$100K |
| | Forward dibuka / tersettle otomatis tanpa intervensi | ≥50 / 100% |
| | Harga rata-rata vs AMM terbaik untuk ukuran sama | Lebih baik ≥20 bps |
| 6 bulan | Revenue fee bulanan | ≥$50K |
| | Ticker aktif yang punya ≥1 MM | ≥30 dari 36 |
| | Trader berulang (≥3 trade) | ≥40% |

---

## 14. Desain website & app

### 14.1 Bedah wintermute.com (referensi gaya, bukan disalin)
Sumber: HTML/CSS [wintermute.com](https://www.wintermute.com/) dan [/otc/forwards](https://www.wintermute.com/otc/forwards), diambil 21 Nov 2026. CSS: `/_next/static/immutable/chunks/156d7_ww5rq0j.css`.

**Struktur section home:**
1. Header (logo, navigasi Who we serve / OTC / DeFi / Insights / Company, CTA "Contact us").
2. Hero dengan H1 besar ("Harnessing chaos in digital asset markets").
3. Kartu laporan unggulan ("1H26 OTC flow report").
4. "Who we serve — Explore".
5. Feed X / "What's happening" (carousel 12 slide, "Load more").
6. Blok CTA tiga kolom (Contact / Subscribe / Apply).
7. Footer (Contact, Careers, Events, Brand, Telegram Bot, YouTube, X, LinkedIn, Privacy, Cookies).

**Struktur halaman produk (/otc/forwards):**
1. H1 ("Turning locked tokens into liquid opportunity").
2. Subjudul satu kalimat.
3. CTA "Get in touch".
4. "Traded by": kartu persona (carousel).
5. "Trade with Wintermute": 6 poin keunggulan.
6. "Discover more": kartu produk terkait.
7. Blok CTA dan footer.

**Tipografi (dari CSS):**
- **Saans** (400/500/600/900) untuk body dan heading.
- **Blender** (400/500) untuk label kecil teknis. Kelas `font-blender` dipakai 121 kali, `uppercase` 127 kali, artinya banyak label kapital bergaya monospace/teknis.
- H1 memakai `text-[5.625rem]` (90px).
- Keduanya font berlisensi, bukan gratis.

**Palet Wintermute (hex nyata dari CSS):**

| Peran | Hex |
|---|---|
| Night green (bg utama) | #070B09 |
| Shadow | #151916 |
| Charcoal | #1C211E |
| Graphite | #323935 |
| Ash | #606663 |
| Steel | #9EA4A0 |
| Silver | #BEC1BF |
| Off-white | #FAFAFA |
| Aksen hijau neon | #00F554 |
| Hijau tradfi | #00D64A |
| Hijau mid | #66FF9A |
| Hijau light | #A8F5C2 |

Aksen sekunder di gradient: ungu #746BE6, biru #3C85DD, pink #DB33CB.

**Layout:**
- Variabel `--spacing-block` 2.5rem → 4rem, `--spacing-container` 1rem → 4rem (mobile → desktop), `--header-height` 4.5rem → 6rem.
- Ada `grid-cols-12`.
- Tombol `rounded-full`, kartu `rounded-lg`.

**Animasi:**
- Ada 20 elemen `<canvas>`, yang menandakan latar/ilustrasi animasi generatif. Efek persisnya **[perkiraan]**.
- Accordion bermotion (`motion-accordion`) dan carousel.

**Tone copy:** pendek, percaya diri, institusional. Kalimat deklaratif seperti "Harnessing chaos…", "Turning locked tokens into liquid opportunity". Benefit dalam poin satu baris.

### 14.2 Identitas Cold Harbor (feel serupa, identitas sendiri)
**Prinsip:**
- Gelap, minimalis institusional, banyak ruang kosong, angka sebagai elemen visual.
- **Tidak memakai** logo, nama, font berlisensi, atau aset Wintermute.
- Hijau neon diganti **amber sinyal**, dengan basis gelap bernuansa biru-tinta (bukan hijau).

**Palet usulan:**

| Token | Hex | Pakai |
|---|---|---|
| `ink-950` | #0A0C12 | Background utama |
| `ink-900` | #11141C | Section/kartu |
| `ink-800` | #1A1E29 | Kartu hover, input |
| `ink-700` | #2A2F3D | Border, divider |
| `slate-500` | #5D6475 | Teks sekunder |
| `slate-300` | #A2A9B8 | Teks tersier/label |
| `mist-100` | #E6E8EE | Teks utama di gelap |
| `paper-50` | #F7F7F4 | Section terang (kontras) |
| `signal-500` | **#FFB020** | Aksen utama, CTA, highlight angka |
| `signal-300` | #FFD27A | Hover/gradient |
| `pos-500` | #3DDC97 | PnL positif / Buy |
| `neg-500` | #FF5C5C | PnL negatif / Sell |
| `info-500` | #6C8CFF | Link/info/status |

**Font (bebas lisensi, Google Fonts):**
- **Geist** (heading & body; 400/500/600/800).
- **Geist Mono** (label uppercase, angka, ticker, hash). Pengganti peran "Blender".
- Alternatif: Inter Tight + JetBrains Mono.

**Skala tipografi:**

| Elemen | Ukuran |
|---|---|
| H1 | 88/96px desktop, 48px mobile, tracking −2% |
| H2 | 48px |
| H3 | 28px |
| Body | 16–18px |
| Label | Geist Mono 12px uppercase, tracking +8% |

**Grid & spasi:**
- 12 kolom, container padding 16px (mobile) → 64px (desktop).
- Jarak antar section 40px → 64px.
- Header 72px → 96px.
- Radius: tombol pill penuh, kartu 12px.

**Ilustrasi/animasi:**
- Latar canvas "order-flow field": partikel titik-titik halus bergerak membentuk aliran yang memadat menjadi "blok", menggambarkan fill besar yang tenang.
- Ticker tape horizontal berisi harga oracle live (Chainlink) di bawah hero.
- Animasi angka (count-up) untuk metrik.
- Semua animasi menghormati `prefers-reduced-motion`.

**Komponen:**
- **Navigasi & tombol:** `TopNav` (logo, Products, Markets, MMs, Docs, CTA "Launch app"), `PillButton` (primary amber / ghost), `MonoLabel`.
- **Tampilan data:** `TickerTape`, `StatCounter`, `PriceTag` (ticker + harga + Δ vs oracle bps), `MarketsTable` (sortable).
- **Kartu & konten:** `PersonaCard`, `FeatureList` (poin 1 baris + ikon garis), `ProductCard`, `Accordion` (FAQ), `CTA3` (tiga kolom), `Footer`.
- **App:** `TickerSelect` (search + logo dari CDN RH `cdn.robinhood.com/ncw_assets/logos/<address>.png`, [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)), `AmountInput` (toggle token/USDG), `QuoteCard` (best price, MM count, countdown ring), `TxStepper` (Approve → Sign → Confirm), `PositionTable`, `MarginBar` (equity vs maintenance), `MaturityCalendar` (hanya hari close resmi, libur abu-abu), `Toast`, `EmptyState`.

### 14.3 Wireframe teks

**Landing (/)**
```
[TopNav]  Cold Harbor            Products  Markets  Market Makers  Docs      (Launch app ●)
[Hero]    MONO LABEL: ON-CHAIN OTC · ROBINHOOD CHAIN
          H1:  Shipping size through on-chain markets
          Tagline kecil di bawah logo: Where size settles.
          Sub: Request firm quotes from multiple market makers for tokenized US stocks.
               Settle atomically. Hedge with cash-settled forwards.
          (Request a quote)  (Become a market maker →)
          [canvas order-flow field di latar]
[TickerTape] NVDA 142.25 · AAPL 350.63 · SPY … (sumber: Chainlink)
[Stats]   36 STOCKS & ETFs  ·  ATOMIC SETTLEMENT  ·  24/7 RFQ  ·  ≥3 MAKERS   ← angka live dari indexer
[Section] H2: Built for size
          3 ProductCard: Block RFQ / Forwards / API for Makers
[Section] H2: Traded by          → PersonaCard carousel (Funds, Whales, Treasuries, Makers)
[Section] H2: Why on-chain OTC   → FeatureList 6 poin:
          Firm, signed quotes · One-transaction settlement · Multiple makers compete ·
          Oracle-transparent settlement · Self-custody, wallet access · 24/7 RFQ
[Section] H2: How it works       → 3 langkah bernomor mono: 01 Request · 02 Compare · 03 Settle
[Section] H2: Markets            → MarketsTable (ticker, harga oracle, likuiditas MM, status)
[Accordion FAQ]
[CTA3]    Trade (Launch app) · Make markets (Apply) · Build (Docs)
[Footer]  Products · Docs · Status · X · Telegram · Terms · Privacy
```

**App — RFQ (/app/trade)**
```
[AppNav] Trade | Forwards | Portfolio            [wallet ● 0x12…ab] [RHC 4663]
[Left 5 col]  TickerSelect · Buy/Sell toggle · AmountInput (NVDA | USDG) · (Request quotes)
[Right 7 col] QuoteCard best: 5,000 NVDA @ 142.32 USDG · vs oracle +5 bps · 4 makers · ⟳ 18s
              Daftar quote lain (abu-abu) · Fee 8 bps · Total 711,600 USDG
              TxStepper: Approve → Execute
[Bottom]      Recent fills (tabel)
```

**App — Forwards (/app/forwards)**
```
[Form] Ticker · Long/Short · Qty · Maturity (MaturityCalendar) · (Request strike)
[QuoteCard] Strike 352.10 · Notional 704,200 · IM 20% = 140,840 USDG · Maint. 10%
            Settlement: official close 16:00 NY, Chainlink primary / Pyth backup
            (Deposit margin & open)
[Open positions] PositionTable: id · ticker · side · qty · strike · mark · uPnL · MarginBar · maturity · actions(Top-up)
```

**App — Portfolio/Dashboard (/app/portfolio)**
```
[StatCounter] Total volume · Open forwards · uPnL · Realized PnL
[Tabs] Fills | Forwards | Margin events | Settlements   (Export CSV)
[Upcoming maturities] timeline 7 hari ke depan
```

**Portal MM (/mm)**
```
[Header] Maker: Alpha Liquidity · Signer 0x…  · API key (rotate)
[KPI] Hit rate · Median latency · 24h volume · Open exposure
[Live RFQ stream] tabel real-time (rfqId, ticker, side, size, our quote, result)
[Limits] tabel editable per ticker (max notional, per taker)
[Positions] forward terbuka + margin vault (Deposit/Withdraw)
[Docs] link API + contoh payload
```

### 14.4 Contoh copy hero

| Opsi | H1 | Subjudul |
|---|---|---|
| A (dipilih Bos) | **Shipping size through on-chain markets** | Firm quotes from competing market makers for tokenized US stocks on Robinhood Chain. One transaction. No slippage. |
| B | **Institutional OTC. Now on-chain.** | Block trades and cash-settled forwards on 36 tokenized stocks & ETFs, settled by smart contract, priced by public oracles. |
| C | **The block desk for tokenized equities.** | Request. Compare. Settle atomically, 24/7, from your own wallet. |

Label mono di atas H1: `ON-CHAIN OTC · ROBINHOOD CHAIN · 24/7`.

---

## 15. Referensi teknis
- Robinhood Chain docs:
  - [Overview](https://docs.robinhood.com/chain/)
  - [Connecting](https://docs.robinhood.com/chain/connecting/)
  - [Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/)
  - [Building with Stock Tokens](https://docs.robinhood.com/chain/building-with-stock-tokens/)
  - [Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)
  - [Token Contracts](https://docs.robinhood.com/chain/contracts/)
  - [Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/)
  - [Data Streams](https://docs.robinhood.com/chain/data-streams/)
  - [Lighter Domains](https://docs.robinhood.com/chain/lighter-domains/)
- Chainlink: [Reference Data Directory — Robinhood mainnet](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json), [Data Streams changelog](https://dev.chain.link/changelog/data-streams-expands-to-robinhood-chain-mainnet)
- Pyth Pro: [EVM integration](https://docs.pyth.network/pro/use-prices-on-blockchain/evm), [Contract addresses](https://docs.pyth.network/pro/contract-addresses)
- Note Systems: [Oracle & MarketCalendar](https://note.systems/docs/protocol/oracle-and-calendar/), [Addresses & parameters](https://note.systems/docs/developers/addresses/)
- 0x: [Orders (RFQ/OTC)](https://docs.0xprotocol.org/en/latest/basics/orders.html), [LibNativeOrder.sol](https://github.com/0xProject/protocol/blob/fd68edb23957ddef3e462bf1718d2ea9c3ef93f1/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol)
- Bebop: [RFQ API](https://docs.bebop.xyz/rfq-api/introduction), [JAM contracts](https://github.com/bebop-dex/bebop-jam-contracts), [RFQ-A wrapper](https://github.com/bebop-dex/bebop-rfqa)
- Arcus: [RWA perps](https://docs.arcus.xyz/concepts/perpetuals/real-world-assets), [Fee tiers](https://help.arcus.xyz/faq/arcus-perps-faq/fees/what-are-the-perp-fee-tiers)
- Lighter RHC: [API docs](https://apidocs.rh.lighter.xyz/docs/get-started)
- Rialto: [How Rialto works](https://docs.rialto.xyz/overview/how-rialto-works), [propAMM](https://docs.rialto.xyz/overview/what-is-a-propamm)
- Sablier: [Deployments](https://docs.sablier.com/guides/lockup/deployments), [Transferability](https://docs.sablier.com/concepts/transferability)
- Data pasar: [DefiLlama RHC](https://defillama.com/chain/robinhood-chain), [Stockdeck RHC](https://stockdeck.xyz/chain/robinhood)
- Desain referensi: [wintermute.com](https://www.wintermute.com/), [wintermute.com/otc/forwards](https://www.wintermute.com/otc/forwards)
