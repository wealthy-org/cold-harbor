// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {ForwardEngine} from "../src/ForwardEngine.sol";
import {MarginVault} from "../src/MarginVault.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";
import {TestnetFeed} from "../src/mocks/TestnetFeed.sol";

/// @notice Testnet deploy of the forward stack, reusing the tokens in deployments/rh-testnet.json.
/// One TestnetFeed per ticker (anyone can push, 10% max move per push). Refuses mainnet.
/// Writes deployments/rh-testnet-forwards.json only when really broadcasting.
/// Env: DEPLOYER. Run: forge script script/DeployForwardsTestnet.s.sol --rpc-url <url> --account <keystore> --sender $DEPLOYER --broadcast --slow
contract DeployForwardsTestnet is Script {
    string[36] internal T = [
        "AAPL","AMD","AMZN","ASML","BABA","CLSK","COIN","CRCL","CRWV","DELL","EWY","GME",
        "GOOGL","INTC","IONQ","META","MSFT","MSTR","MU","NBIS","NVDA","ORCL","PLTR","QQQ",
        "RGTI","RKLB","SGOV","SLV","SNDK","SPCX","SPY","TSLA","TSM","USAR","USO","GLD"
    ];

    function _isEtf(string memory s) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(s));
        return h == keccak256("QQQ") || h == keccak256("SPY") || h == keccak256("SGOV") || h == keccak256("SLV")
            || h == keccak256("EWY") || h == keccak256("USO") || h == keccak256("GLD");
    }

    function run() external {
        require(block.chainid == 46630 || block.chainid == 31337, "testnet only");
        address deployer = vm.envAddress("DEPLOYER");
        string memory base = vm.readFile("deployments/rh-testnet.json");
        address usdg = vm.parseJsonAddress(base, ".usdg");

        vm.startBroadcast(deployer);
        MarketCalendar cal = new MarketCalendar(deployer);
        OracleAdapter oracle = new OracleAdapter(deployer);
        MarginVault vault = new MarginVault(usdg, deployer);
        ForwardEngine eng = new ForwardEngine(address(vault), address(oracle), address(cal), deployer, deployer);
        vault.setEngine(address(eng));

        string memory feeds = "{";
        for (uint256 i = 0; i < T.length; i++) {
            TestnetFeed f = new TestnetFeed(string.concat(T[i], " / USD (testnet mock, anyone can push)"), 1000);
            address token = vm.parseJsonAddress(base, string.concat(".tokens.", T[i]));
            eng.setUnderlying(token, address(f), true, _isEtf(T[i]) ? 1000 : 2000);
            feeds = string.concat(feeds, i == 0 ? "" : ",", '"', T[i], '":"', vm.toString(address(f)), '"');
        }
        vm.stopBroadcast();

        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"calendar":"', vm.toString(address(cal)),
            '","oracle":"', vm.toString(address(oracle)),
            '","vault":"', vm.toString(address(vault)),
            '","engine":"', vm.toString(address(eng)),
            '","feeds":', feeds, "}}"
        );
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            string memory f = block.chainid == 46630 ? "rh-testnet-forwards" : "rehearsal-forwards";
            vm.writeFile(string.concat("deployments/", f, ".json"), json);
            console.log("written deployments/%s.json", f);
        } else {
            console.log("dry run: no file written");
        }
        console.log("engine", address(eng));
    }
}
