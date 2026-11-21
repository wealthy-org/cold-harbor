// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract OracleAdapterTest is Test {
    OracleAdapter oracle;
    MockAggregator feed;
    MockAggregator backup;
    MockAggregator seq;
    address owner = makeAddr("owner");

    uint64 closeTs = 1_800_000_000;

    function setUp() public {
        vm.warp(closeTs - 10 days);
        oracle = new OracleAdapter(owner);
        feed = new MockAggregator();
        backup = new MockAggregator();
        seq = new MockAggregator();
    }

    function _afterGrace() private {
        vm.warp(uint256(closeTs) + 301);
    }

    function test_observe_tooEarly() public {
        feed.push(100e8, closeTs - 60);
        vm.warp(uint256(closeTs) + 299);
        vm.expectRevert(OracleAdapter.TooEarly.selector);
        oracle.observe(address(feed), closeTs);
        vm.warp(uint256(closeTs) + 300);
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 100e8);
    }

    function test_observe_walksBackToLastRoundAtOrBeforeClose() public {
        feed.push(100e8, closeTs - 3600);
        feed.push(101e8, closeTs - 60);
        feed.push(150e8, closeTs + 30); // after the close: must be ignored
        feed.push(160e8, closeTs + 200);
        _afterGrace();
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 101e8);
    }

    function test_observe_roundExactlyAtClose() public {
        feed.push(100e8, closeTs - 100);
        feed.push(105e8, closeTs);
        _afterGrace();
        (uint256 p,) = oracle.observe(address(feed), closeTs);
        assertEq(p, 105e8);
    }

    function test_observe_pinsAndNeverChanges() public {
        feed.push(100e8, closeTs - 60);
        _afterGrace();
        (uint256 p1,) = oracle.observe(address(feed), closeTs);
        feed.push(100e8, closeTs - 30); // a late round posted afterwards, still before the close
        (uint256 p2, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p1, p2);
        (uint256 pp, bool resolved) = oracle.pinned(address(feed), closeTs);
        assertTrue(resolved);
        assertEq(pp, p1);
    }

    function test_observe_defersWhenOnlyStaleRound() public {
        feed.push(100e8, closeTs - 2 days); // older than maxPreCloseLag (1 day)
        _afterGrace();
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok);
        assertEq(p, 0);
        (, bool resolved) = oracle.pinned(address(feed), closeTs);
        assertFalse(resolved, "deferral is not pinned");
        // A valid round posted later can still resolve it.
        feed.push(103e8, closeTs - 5);
        (p, ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 103e8);
    }

    function test_observe_defersWhenAllRoundsAfterClose() public {
        feed.push(100e8, closeTs + 10);
        _afterGrace();
        (, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok);
    }

    function test_observe_rejectsNonPositiveAnswer() public {
        feed.push(0, closeTs - 10);
        _afterGrace();
        (, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok);
    }

    function test_observe_brokenFeedDoesNotRevert() public {
        _afterGrace(); // feed has no rounds: latestRoundData reverts inside the mock
        (, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok);
    }

    function test_observe_respectsMaxRoundWalk() public {
        feed.push(100e8, closeTs - 60);
        for (uint256 i = 0; i < 20; i++) {
            feed.push(200e8, closeTs + 1 + i);
        }
        vm.prank(owner);
        oracle.setParams(300, 1 days, 1 hours, 10, 100, address(0), 1 hours); // walk at most 10 rounds
        _afterGrace();
        (, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok, "valid round is 21 steps back, beyond the walk limit");
        vm.prank(owner);
        oracle.setParams(300, 1 days, 1 hours, 50, 100, address(0), 1 hours);
        (uint256 p, bool ok2) = oracle.observe(address(feed), closeTs);
        assertTrue(ok2);
        assertEq(p, 100e8);
    }

    // ------------------------------------------------------------ backup feed

    function test_backup_usedWhenPrimaryMissing() public {
        vm.prank(owner);
        oracle.setBackupFeed(address(feed), address(backup));
        backup.push(99e8, closeTs - 30);
        _afterGrace(); // primary is empty
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 99e8);
    }

    function test_backup_agreementWithinToleranceUsesPrimary() public {
        vm.prank(owner);
        oracle.setBackupFeed(address(feed), address(backup));
        feed.push(100e8, closeTs - 30);
        backup.push(100_5000_0000, closeTs - 20); // 100.5, within 1%
        _afterGrace();
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, 100e8);
    }

    function test_backup_disagreementDefers() public {
        vm.prank(owner);
        oracle.setBackupFeed(address(feed), address(backup));
        feed.push(100e8, closeTs - 30);
        backup.push(102e8, closeTs - 20); // 2% apart
        _afterGrace();
        (, bool ok) = oracle.observe(address(feed), closeTs);
        assertFalse(ok, "do not guess when sources disagree");
    }

    function test_backup_decimalsMustMatch() public {
        backup.setDecimals(18);
        vm.prank(owner);
        vm.expectRevert(OracleAdapter.BadParam.selector);
        oracle.setBackupFeed(address(feed), address(backup));
    }

    // ------------------------------------------------------------ reference (mark) price

    function test_reference_freshIsLive() public {
        feed.push(100e8, block.timestamp - 60);
        (uint256 p, bool live) = oracle.referencePrice(address(feed));
        assertEq(p, 100e8);
        assertTrue(live);
    }

    function test_reference_staleFallsBackToLastKnownNotLive() public {
        feed.push(100e8, block.timestamp - 2 hours);
        (uint256 p, bool live) = oracle.referencePrice(address(feed));
        assertEq(p, 100e8);
        assertFalse(live);
    }

    function test_reference_freshBackupIsLive() public {
        vm.prank(owner);
        oracle.setBackupFeed(address(feed), address(backup));
        feed.push(100e8, block.timestamp - 3 hours);
        backup.push(101e8, block.timestamp - 10 minutes);
        (uint256 p, bool live) = oracle.referencePrice(address(feed));
        assertEq(p, 101e8);
        assertTrue(live);
    }

    function test_reference_emptyFeedNotLive() public view {
        (uint256 p, bool live) = oracle.referencePrice(address(feed));
        assertEq(p, 0);
        assertFalse(live);
    }

    function test_reference_sequencerDownOrRecovering() public {
        vm.prank(owner);
        oracle.setParams(300, 1 days, 1 hours, 500, 100, address(seq), 1 hours);
        feed.push(100e8, block.timestamp - 60);

        seq.pushWithStart(0, block.timestamp - 5 hours, block.timestamp - 5 hours); // up for 5h
        (, bool live) = oracle.referencePrice(address(feed));
        assertTrue(live);

        seq.pushWithStart(1, block.timestamp - 1 minutes, block.timestamp - 1 minutes); // down
        (, live) = oracle.referencePrice(address(feed));
        assertFalse(live);

        seq.pushWithStart(0, block.timestamp - 10 minutes, block.timestamp - 10 minutes); // back up, within grace
        (, live) = oracle.referencePrice(address(feed));
        assertFalse(live, "grace period after sequencer restart");

        vm.warp(block.timestamp + 2 hours);
        feed.push(100e8, block.timestamp - 60);
        (, live) = oracle.referencePrice(address(feed));
        assertTrue(live);
    }

    // ------------------------------------------------------------ admin

    function test_admin_onlyOwnerAndBounds() public {
        vm.expectRevert();
        oracle.setParams(300, 1 days, 1 hours, 500, 100, address(0), 1 hours);
        vm.expectRevert();
        oracle.setBackupFeed(address(feed), address(backup));
        vm.startPrank(owner);
        vm.expectRevert(OracleAdapter.BadParam.selector);
        oracle.setParams(300, 1 days, 1 hours, 0, 100, address(0), 1 hours);
        vm.expectRevert(OracleAdapter.BadParam.selector);
        oracle.setParams(300, 1 days, 1 hours, 2001, 100, address(0), 1 hours);
        vm.expectRevert(OracleAdapter.BadParam.selector);
        oracle.setParams(300, 1 days, 1 hours, 500, 10_001, address(0), 1 hours);
        vm.stopPrank();
    }

    /// Whatever rounds exist, a successful observation returns the last round at or before the close.
    function testFuzz_observe_picksLastBeforeClose(uint8 nBefore, uint8 nAfter, uint32 seed) public {
        nBefore = uint8(bound(nBefore, 1, 20));
        nAfter = uint8(bound(nAfter, 0, 20));
        uint256 expected;
        for (uint256 i = 0; i < nBefore; i++) {
            uint256 price = (uint256(keccak256(abi.encode(seed, i))) % 1000 + 1) * 1e8;
            feed.push(int256(price), closeTs - (nBefore - i) * 60);
            expected = price;
        }
        for (uint256 i = 0; i < nAfter; i++) {
            feed.push(int256(777e8), closeTs + 1 + i);
        }
        _afterGrace();
        (uint256 p, bool ok) = oracle.observe(address(feed), closeTs);
        assertTrue(ok);
        assertEq(p, expected);
    }
}
