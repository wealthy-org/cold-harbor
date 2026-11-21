#!/usr/bin/env bash
# Installs pinned Foundry dependencies into lib/ (not committed). Run once after cloning.
set -euo pipefail
cd "$(dirname "$0")"
forge install --no-git foundry-rs/forge-std@v1.17.0
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.1.0
