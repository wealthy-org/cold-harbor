// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MarginVault} from "../src/MarginVault.sol";
import {FaucetToken} from "../src/mocks/FaucetToken.sol";

contract MarginVaultTest is Test {
    MarginVault vault;
    FaucetToken usdg;
    address owner = makeAddr("owner");
    address engine = makeAddr("engine");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        usdg = new FaucetToken("USDG", "USDG", 6);
        vault = new MarginVault(address(usdg), owner);
        vm.prank(owner);
        vault.setEngine(engine);
        usdg.mint(alice, 1_000_000e6);
        usdg.mint(bob, 1_000_000e6);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(vault), type(uint256).max);
    }

    function test_depositWithdraw() public {
        vm.startPrank(alice);
        vault.deposit(100e6);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.freeMargin(alice), 100e6);
        vault.withdraw(40e6);
        vm.stopPrank();
        assertEq(vault.freeMargin(alice), 60e6);
        assertEq(usdg.balanceOf(alice), 1_000_000e6 - 60e6);
        assertEq(usdg.balanceOf(address(vault)), 60e6);
    }

    function test_withdrawOnlyFree() public {
        vm.prank(alice);
        vault.deposit(100e6);
        vm.prank(engine);
        vault.lock(alice, 70e6);
        vm.startPrank(alice);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        vault.withdraw(31e6);
        vault.withdraw(30e6);
        vm.stopPrank();
        assertEq(vault.freeMargin(alice), 0);
    }

    function test_zeroAmounts() public {
        vm.startPrank(alice);
        vm.expectRevert(MarginVault.ZeroAmount.selector);
        vault.deposit(0);
        vm.expectRevert(MarginVault.ZeroAmount.selector);
        vault.withdraw(0);
        vm.stopPrank();
    }

    function test_lockUnlock() public {
        vm.prank(alice);
        vault.deposit(100e6);
        vm.startPrank(engine);
        vault.lock(alice, 60e6);
        assertEq(vault.lockedOf(alice), 60e6);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        vault.lock(alice, 41e6);
        vault.unlock(alice, 10e6);
        assertEq(vault.lockedOf(alice), 50e6);
        vm.expectRevert(MarginVault.InsufficientLocked.selector);
        vault.unlock(alice, 51e6);
        vm.stopPrank();
    }

    function test_seizeMovesLockedToFree() public {
        vm.prank(alice);
        vault.deposit(100e6);
        vm.prank(bob);
        vault.deposit(100e6);
        vm.startPrank(engine);
        vault.lock(alice, 100e6);
        vault.seize(alice, bob, 30e6);
        vm.stopPrank();
        assertEq(vault.balanceOf(alice), 70e6);
        assertEq(vault.lockedOf(alice), 70e6);
        assertEq(vault.balanceOf(bob), 130e6);
        assertEq(vault.freeMargin(bob), 130e6);
        assertEq(usdg.balanceOf(address(vault)), 200e6, "vault total unchanged");
    }

    function test_seizeMoreThanLockedReverts() public {
        vm.prank(alice);
        vault.deposit(100e6);
        vm.startPrank(engine);
        vault.lock(alice, 10e6);
        vm.expectRevert(MarginVault.InsufficientLocked.selector);
        vault.seize(alice, bob, 11e6);
        vm.stopPrank();
    }

    function test_chargeTakesFreeOnly() public {
        vm.prank(alice);
        vault.deposit(100e6);
        vm.startPrank(engine);
        vault.lock(alice, 90e6);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        vault.charge(alice, bob, 11e6);
        vault.charge(alice, bob, 10e6);
        vm.stopPrank();
        assertEq(vault.balanceOf(bob), 10e6);
        assertEq(vault.freeMargin(alice), 0);
    }

    function test_onlyEngine() public {
        vm.startPrank(alice);
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.lock(alice, 1);
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.unlock(alice, 1);
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.seize(alice, bob, 1);
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.charge(alice, bob, 1);
        vm.stopPrank();
    }

    function test_engineSetOnce() public {
        vm.startPrank(owner);
        vm.expectRevert(MarginVault.EngineAlreadySet.selector);
        vault.setEngine(makeAddr("other"));
        vm.stopPrank();
        MarginVault v2 = new MarginVault(address(usdg), owner);
        vm.startPrank(owner);
        vm.expectRevert(MarginVault.ZeroAddress.selector);
        v2.setEngine(address(0));
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert();
        v2.setEngine(alice);
    }

    function test_constructorZero() public {
        vm.expectRevert(MarginVault.ZeroAddress.selector);
        new MarginVault(address(0), owner);
    }

    /// Whatever the engine does, vault USDG always equals the sum of internal balances.
    function testFuzz_solvency(uint96 dA, uint96 dB, uint96 lockA, uint96 moveAmt) public {
        dA = uint96(bound(dA, 1, 1_000_000e6));
        dB = uint96(bound(dB, 1, 1_000_000e6));
        vm.prank(alice);
        vault.deposit(dA);
        vm.prank(bob);
        vault.deposit(dB);
        lockA = uint96(bound(lockA, 0, dA));
        moveAmt = uint96(bound(moveAmt, 0, lockA));
        vm.startPrank(engine);
        vault.lock(alice, lockA);
        vault.seize(alice, bob, moveAmt);
        vm.stopPrank();
        assertEq(usdg.balanceOf(address(vault)), vault.balanceOf(alice) + vault.balanceOf(bob));
        assertLe(vault.lockedOf(alice), vault.balanceOf(alice));
    }
}
