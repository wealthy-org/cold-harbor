#!/usr/bin/env python3
"""TESTNET ONLY. Gives each simulated maker free margin in the MarginVault (approve + deposit USDG).
Uses the throwaway keys in .secrets/sim-makers.env. Appends tx hashes to deployments/proofs-testnet.json."""
import json, subprocess, sys
R = "https://rpc.testnet.chain.robinhood.com"
AMOUNT = 1_000_000 * 10**6  # per maker, 6 dp
env = dict(l.strip().split("=", 1) for l in open(".secrets/sim-makers.env") if "=" in l and not l.startswith("#"))
pks = env["SIM_MAKER_PKS"].split(",")
base = json.load(open("deployments/rh-testnet.json")); fw = json.load(open("deployments/rh-testnet-forwards.json"))
usdg, vault = base["usdg"], fw["vault"]
def cast(*a):
    extra = [] if a[0] == "wallet" else ["--rpc-url", R]
    r = subprocess.run(["cast", *a, *extra], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[:300])
    return r.stdout.strip()
def send(pk, to, sig, *args):
    return json.loads(cast("send", to, sig, *args, "--private-key", pk, "--json"))["transactionHash"]
proofs = json.load(open("deployments/proofs-testnet.json")); out = proofs.setdefault("simMakerVaultSetup", [])
for pk in pks:
    who = cast("wallet", "address", "--private-key", pk)
    have = int(cast("call", usdg, "balanceOf(address)(uint256)", who).split()[0])
    free = int(cast("call", vault, "freeMargin(address)(uint256)", who).split()[0])
    if free >= AMOUNT: print(who, "already funded"); continue
    txs = []
    if have < AMOUNT: txs.append(send(pk, usdg, "mint(address,uint256)", who, str(AMOUNT)))
    txs.append(send(pk, usdg, "approve(address,uint256)", vault, str(AMOUNT)))
    txs.append(send(pk, vault, "deposit(uint256)", str(AMOUNT)))
    out.append({"maker": who, "hashes": txs})
    print(who, "free margin now", int(cast("call", vault, "freeMargin(address)(uint256)", who).split()[0]) / 1e6)
json.dump(proofs, open("deployments/proofs-testnet.json", "w"), indent=2)
