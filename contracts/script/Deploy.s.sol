// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ColdHarborSettlement} from "../src/ColdHarborSettlement.sol";

/// @notice Deploys ColdHarborSettlement.
/// Env: USDG, FEE_RECIPIENT, FEE_BPS, OWNER, STOCK_TOKENS (comma separated, optional).
/// Testnet (46630): run with `--account <keystore> --sender <addr>`. The agent never handles keys.
/// Mainnet (4663): additionally requires I_UNDERSTAND_MAINNET=yes and AUDIT_REF, and OWNER must be a contract (Safe).
contract Deploy is Script {
    uint256 constant RH_MAINNET = 4663;
    uint256 constant RH_TESTNET = 46630;
    /// @dev Uniswap's canonical Permit2 deployment, same address on every EVM chain. Override with the
    ///      PERMIT2 env var only if a chain is ever missing it.
    address constant PERMIT2_DEFAULT = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external returns (ColdHarborSettlement ch) {
        address usdg = vm.envAddress("USDG");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint16 feeBps = uint16(vm.envUint("FEE_BPS"));
        address owner = vm.envAddress("OWNER");
        address permit2 = vm.envOr("PERMIT2", PERMIT2_DEFAULT);
        address[] memory stocks = vm.envOr("STOCK_TOKENS", ",", new address[](0));

        if (block.chainid == RH_MAINNET) {
            require(keccak256(bytes(vm.envString("I_UNDERSTAND_MAINNET"))) == keccak256("yes"), "mainnet opt-in missing");
            require(bytes(vm.envString("AUDIT_REF")).length != 0, "audit ref missing");
            require(owner.code.length != 0, "mainnet owner must be a contract (Safe)");
        } else {
            require(block.chainid == RH_TESTNET || block.chainid == 31337, "unsupported chain");
        }
        require(usdg.code.length != 0, "USDG has no code on this chain");

        vm.startBroadcast();
        ch = new ColdHarborSettlement(usdg, feeRecipient, feeBps, owner, permit2);
        vm.stopBroadcast();

        // Token allowlist is owner-gated; when owner == broadcaster (testnet) it can be set in the same run.
        if (stocks.length != 0 && msg.sender == owner) {
            vm.startBroadcast();
            for (uint256 i = 0; i < stocks.length; i++) {
                ch.setTokenAllowed(stocks[i], true);
            }
            vm.stopBroadcast();
        }

        console.log("ColdHarborSettlement", address(ch));
        console.log("chainId", block.chainid);
    }
}
