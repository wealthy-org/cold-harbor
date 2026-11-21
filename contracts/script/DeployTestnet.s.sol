// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {ColdHarborSettlement} from "../src/ColdHarborSettlement.sol";
import {FaucetToken} from "../src/mocks/FaucetToken.sol";

/// @notice Testnet deploy: FaucetToken USDG + one FaucetToken per launch ticker + ColdHarborSettlement.
/// Refuses chain 4663. Chain 46630 writes deployments/rh-testnet.json; any other allowed chain (31337 rehearsal)
/// writes deployments/rehearsal-<id>.json so a fake file never looks like a real deployment.
/// Env: DEPLOYER (address that signs, must equal --sender), FEE_BPS (default 8),
///      MAKERS (optional comma list) and MAKER_GAS_WEI (default 0.001 ether): sim makers get gas ETH from the deployer.
/// The json file is written only when really broadcasting, so a dry run never leaves a fake deployment file.
/// Run: forge script script/DeployTestnet.s.sol --rpc-url <url> --account <keystore> --sender $DEPLOYER --broadcast --slow
contract DeployTestnet is Script {
    string[36] internal T = [
        "AAPL","AMD","AMZN","ASML","BABA","CLSK","COIN","CRCL","CRWV","DELL","EWY","GME",
        "GOOGL","INTC","IONQ","META","MSFT","MSTR","MU","NBIS","NVDA","ORCL","PLTR","QQQ",
        "RGTI","RKLB","SGOV","SLV","SNDK","SPCX","SPY","TSLA","TSM","USAR","USO","GLD"
    ];

    function run() external {
        require(block.chainid != 4663, "mainnet is not allowed here");
        require(block.chainid == 46630 || block.chainid == 31337, "unsupported chain");
        address deployer = vm.envAddress("DEPLOYER");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(8)));

        vm.startBroadcast(deployer);
        FaucetToken usdg = new FaucetToken("Cold Harbor Test USDG", "USDG", 6);
        ColdHarborSettlement ch = new ColdHarborSettlement(address(usdg), deployer, feeBps, deployer);

        string memory tokens = "{";
        for (uint256 i = 0; i < T.length; i++) {
            FaucetToken t = new FaucetToken(string.concat("Test ", T[i]), T[i], 18);
            ch.setTokenAllowed(address(t), true);
            tokens = string.concat(tokens, i == 0 ? "" : ",", '"', T[i], '":"', vm.toString(address(t)), '"');
        }
        address[] memory makers = vm.envOr("MAKERS", ",", new address[](0));
        uint256 gasWei = vm.envOr("MAKER_GAS_WEI", uint256(0.001 ether));
        for (uint256 i = 0; i < makers.length; i++) {
            (bool ok,) = payable(makers[i]).call{value: gasWei}("");
            require(ok, "gas transfer failed");
        }
        vm.stopBroadcast();
        tokens = string.concat(tokens, "}");

        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"deployer":"', vm.toString(deployer),
            '","settlement":"', vm.toString(address(ch)),
            '","usdg":"', vm.toString(address(usdg)),
            '","feeBps":', vm.toString(uint256(feeBps)),
            ',"tokens":', tokens, "}"
        );
        string memory file = block.chainid == 46630 ? "rh-testnet" : string.concat("rehearsal-", vm.toString(block.chainid));
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            vm.writeFile(string.concat("deployments/", file, ".json"), json);
            console.log("written deployments/%s.json", file);
        } else {
            console.log("dry run: no file written");
        }
        console.log("settlement", address(ch));
        console.log("usdg", address(usdg));
    }
}
