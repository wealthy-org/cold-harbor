# Cold Harbor web

Next.js 16, Tailwind 4, viem. Landing page plus the trade app.

```
pnpm install
cp .env.example .env.local
pnpm dev -p 3005
pnpm lint && npx tsc --noEmit && pnpm build
```

Wallet: EIP-6963 discovery, no wallet SDK (`src/components/app/WalletProvider.tsx`).
Quotes: `/api/sim/rfq` simulated makers, only when `SIM_QUOTES=1` and chain is not 4663.
Prices: `/api/prices` proxies `https://api.robinhood.com/rhj/prices`.

`NEXT_PUBLIC_*` values are inlined at build time, so restart the dev server after changing them.
See the repo root README for the overall status.
