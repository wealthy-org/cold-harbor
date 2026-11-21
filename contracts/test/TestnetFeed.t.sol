// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TestnetFeed} from "../src/mocks/TestnetFeed.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";

contract TestnetFeedTest is Test {
    TestnetFeed feed;
    OracleAdapter oracle;

    function setUp() public {
        vm.warp(1_800_000_000);
        feed = new TestnetFeed("NVDA / USD (testnet mock)", 1000); // 10% per push
        oracle = new OracleAdapter(address(this));
    }

    function test_anyoneCanPush_roundsGrow() public {
        vm.prank(address(0xBEEF));
        feed.push(150e8);
        (uint80 id, int256 a,, uint256 u,) = feed.latestRoundData();
        assertEq(id, 1);
        assertEq(a, 150e8);
        assertEq(u, block.timestamp);
        feed.push(155e8);
        (id,,,,) = feed.latestRoundData();
        assertEq(id, 2);
        (, int256 a1,,,) = feed.getRoundData(1);
        assertEq(a1, 150e8);
    }

    function test_moveCap() public {
        feed.push(100e8);
        feed.push(110e8); // exactly 10%
        vm.expectRevert(TestnetFeed.MoveTooLarge.selector);
        feed.push(130e8);
        vm.expectRevert(TestnetFeed.MoveTooLarge.selector);
        feed.push(90e8); // -18%
    }

    function test_badInputs() public {
        vm.expectRevert(TestnetFeed.BadPrice.selector);
        feed.push(0);
        feed.pushAt(100e8, block.timestamp - 100);
        vm.expectRevert(TestnetFeed.BadTimestamp.selector);
        feed.pushAt(100e8, block.timestamp - 200); // before the previous round
        vm.expectRevert(TestnetFeed.BadTimestamp.selector);
        feed.pushAt(100e8, block.timestamp + 1); // future
        vm.expectRevert("no round");
        feed.getRoundData(5);
    }

    function test_emptyReverts() public {
        vm.expectRevert("no data");
        feed.latestRoundData();
    }

    /// A close price recorded after the close, back-dated to it, is accepted by the real OracleAdapter.
    function test_backdatedCloseObservedByOracle() public {
        uint64 closeTs = uint64(block.timestamp);
        feed.pushAt(100e8, closeTs - 3600);
        vm.warp(uint256(closeTs) + 400);
        feed.pushAt(104e8, closeTs); // pushed later, stamped at the close
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 104e8);
    }
}
