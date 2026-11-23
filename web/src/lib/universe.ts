// Launch universe: Chainlink Reference Data Directory, Robinhood Chain mainnet (brief section 4).
export const TICKERS = [
  "AAPL","AMD","AMZN","ASML","BABA","CLSK","COIN","CRCL","CRWV","DELL","EWY","GME",
  "GOOGL","INTC","IONQ","META","MSFT","MSTR","MU","NBIS","NVDA","ORCL","PLTR","QQQ",
  "RGTI","RKLB","SGOV","SLV","SNDK","SPCX","SPY","TSLA","TSM","USAR","USO","GLD",
] as const;

export const ETFS = new Set(["SPY", "QQQ", "GLD", "SLV", "SGOV", "EWY", "USO"]);
export const FEED_24_7 = new Set(["GOOGL", "NVDA", "SNDK", "TSLA"]);

// Display names from the Robinhood Stock Token API (tokenName).
export const NAMES: Record<string, string> = {
  AAPL: "Apple",
  AMD: "AMD",
  AMZN: "Amazon",
  ASML: "ASML Holding NV",
  BABA: "Alibaba",
  CLSK: "CleanSpark",
  COIN: "Coinbase",
  CRCL: "Circle Internet Group",
  CRWV: "CoreWeave",
  DELL: "Dell",
  EWY: "iShares MSCI South Korea fund",
  GME: "GameStop",
  GOOGL: "Alphabet Class A",
  INTC: "Intel",
  IONQ: "IonQ",
  META: "Meta Platforms",
  MSFT: "Microsoft",
  MSTR: "Strategy",
  MU: "Micron Technology",
  NBIS: "Nebius Group",
  NVDA: "NVIDIA",
  ORCL: "Oracle",
  PLTR: "Palantir Technologies",
  QQQ: "Invesco QQQ",
  RGTI: "Rigetti Computing",
  RKLB: "Rocket Lab",
  SGOV: "iShares 0-3 Month Treasury Bond",
  SLV: "iShares Silver Trust",
  SNDK: "Sandisk",
  SPCX: "Space Exploration Technologies",
  SPY: "SPDR S&P 500 ETF Trust",
  TSLA: "Tesla",
  TSM: "Taiwan Semiconductor Manufacturing",
  USAR: "USA Rare Earth",
  USO: "United States Oil Fund",
  GLD: "SPDR Gold Trust",
};

// Company logos vendored in /public/logos (all 36 tokens now have dedicated logos)
export const HAS_LOGO = new Set([
  "AAPL", "AMD", "AMZN", "ASML", "BABA", "CLSK", "COIN", "CRCL", "CRWV", "DELL",
  "EWY", "GLD", "GME", "GOOGL", "INTC", "IONQ", "META", "MSFT", "MSTR", "MU",
  "NBIS", "NVDA", "ORCL", "PLTR", "QQQ", "RGTI", "RKLB", "SGOV", "SLV", "SNDK",
  "SPCX", "SPY", "TSLA", "TSM", "USAR", "USO"
]);
