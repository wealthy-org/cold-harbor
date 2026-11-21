// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ForwardEngine as FE} from "../src/ForwardEngine.sol";
import {MarginVault} from "../src/MarginVault.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";
import {FaucetToken} from "../src/mocks/FaucetToken.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";

contract ForwardEngineTest is Test {
    FE engine;
    MarginVault vault;
    OracleAdapter oracle;
    MarketCalendar cal;
    FaucetToken usdg;
    MockStockToken stock;
    MockAggregator feed;

    address owner = makeAddr("owner");
    address feeTo = makeAddr("feeTo");
    uint256 makerPk = 0xA11CE;
    uint256 takerPk = 0xB0B;
    address maker;
    address taker;

    uint256 constant NOW = 1795435200; // Mon 2026-11-23 12:00 UTC
    uint64 constant MATURITY = 1796418000; // Fri 2026-12-04 21:00 UTC, an official close
    uint256 constant STRIKE = 150e8;
    uint256 constant QTY = 1000e18; // notional 150,000 USDG
    uint256 constant NOTIONAL = 150_000e6;
    uint256 constant IM = 30_000e6; // 20%
    uint256 constant FEE = 300e6; // 20 bps
    uint256 constant REQ = 15_000e6; // 10% maintenance
    uint256 constant DEPOSIT = 5_000_000e6;

    function setUp() public {
        vm.warp(NOW);
        maker = vm.addr(makerPk);
        taker = vm.addr(takerPk);
        usdg = new FaucetToken("USDG", "USDG", 6);
        stock = new MockStockToken();
        feed = new MockAggregator();
        cal = new MarketCalendar(owner);
        oracle = new OracleAdapter(owner);
        vault = new MarginVault(address(usdg), owner);
        engine = new FE(address(vault), address(oracle), address(cal), feeTo, owner);
        vm.startPrank(owner);
        vault.setEngine(address(engine));
        engine.setUnderlying(address(stock), address(feed), true, 1000);
        vm.stopPrank();
        feed.push(int256(STRIKE), block.timestamp);

        _fund(maker);
        _fund(taker);
    }

    // ------------------------------------------------------------ helpers

    function _fund(address who) internal {
        usdg.mint(who, DEPOSIT);
        vm.startPrank(who);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function _quote() internal view returns (FE.ForwardQuote memory q) {
        q = FE.ForwardQuote({
            maker: maker,
            taker: taker,
            stockToken: address(stock),
            side: FE.Side.Long,
            qty: QTY,
            strike: STRIKE,
            maturityCloseTs: MATURITY,
            imBps: 2000,
            mmBps: 1000,
            feeBps: 20,
            expiry: uint64(block.timestamp + 25),
            nonceBucket: 1,
            nonce: 42,
            rfqId: keccak256("fwd-1")
        });
    }

    function _sign(uint256 pk, FE.ForwardQuote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, engine.hashQuote(q));
        return abi.encodePacked(r, s, v);
    }

    function _open(FE.ForwardQuote memory q) internal returns (uint256 id) {
        bytes memory sig = _sign(makerPk, q);
        vm.prank(q.taker);
        id = engine.openForward(q, sig);
    }

    function _openDefault() internal returns (uint256) {
        return _open(_quote());
    }

    function _price(uint256 p, uint256 at) internal {
        feed.push(int256(p), at);
    }

    /// Price printed just before the maturity close, then move past close + grace.
    function _toSettlement(uint256 closePrice) internal {
        feed.push(int256(closePrice), MATURITY - 100);
        vm.warp(uint256(MATURITY) + 301);
    }

    function _bal(address a) internal view returns (uint256) {
        return vault.balanceOf(a);
    }

    // ------------------------------------------------------------ open

    function test_open_locksBothSidesAndChargesTakerFee() public {
        FE.ForwardQuote memory q = _quote();
        vm.expectEmit(true, true, true, true);
        emit FE.ForwardOpened(1, q.rfqId, maker, taker, address(stock), FE.Side.Long, QTY, STRIKE, MATURITY, IM, IM);
        uint256 id = _open(q);
        assertEq(id, 1);
        assertEq(vault.lockedOf(maker), IM);
        assertEq(vault.lockedOf(taker), IM);
        assertEq(_bal(taker), DEPOSIT - FEE, "taker paid the open fee");
        assertEq(_bal(maker), DEPOSIT, "maker pays no fee");
        assertEq(_bal(feeTo), FEE);
        FE.Position memory p = engine.getPosition(id);
        assertEq(uint8(p.status), uint8(FE.Status.Open));
        assertEq(p.feed, address(feed));
        assertEq(p.makerMargin, IM);
        assertEq(engine.requiredMargin(id), REQ);
    }

    function test_open_nonceIsConsumed() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        engine.openForward(q, sig);
        assertTrue(engine.isNonceUsed(maker, 1, 42));
        vm.prank(taker);
        vm.expectRevert(FE.NonceAlreadyUsed.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_notTaker() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(FE.NotTaker.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_expired() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.warp(q.expiry + 1);
        vm.prank(taker);
        vm.expectRevert(FE.QuoteExpired.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_badSignature() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(takerPk, q); // signed by the wrong key
        vm.prank(taker);
        vm.expectRevert(FE.InvalidSignature.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_tamperedTerms() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        q.strike = STRIKE - 1e8; // taker lowers the strike after signing
        vm.prank(taker);
        vm.expectRevert(FE.InvalidSignature.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_sameParty() public {
        FE.ForwardQuote memory q = _quote();
        q.taker = maker;
        bytes memory sig = _sign(makerPk, q);
        vm.prank(maker);
        vm.expectRevert(FE.SameParty.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_underlyingNotActive() public {
        vm.prank(owner);
        engine.setUnderlying(address(stock), address(feed), false, 1000);
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.UnderlyingNotActive.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_feeMismatch() public {
        FE.ForwardQuote memory q = _quote();
        q.feeBps = 0;
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.FeeMismatch.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_marginTermsInvalid() public {
        FE.ForwardQuote memory q = _quote();
        q.imBps = 900; // below the 10% minimum for this underlying
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.InvalidTerms.selector);
        engine.openForward(q, sig);

        q = _quote();
        q.mmBps = q.imBps; // maintenance must be below initial
        sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.InvalidTerms.selector);
        engine.openForward(q, sig);

        q = _quote();
        q.qty = 0;
        sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.InvalidTerms.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_maturityNotOfficialClose() public {
        FE.ForwardQuote memory q = _quote();
        q.maturityCloseTs = MATURITY + 1;
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.NotOfficialClose.selector);
        engine.openForward(q, sig);

        // Saturday 21:00 UTC is not a close either.
        q = _quote();
        q.maturityCloseTs = uint64((uint256(MATURITY) / 86400 + 1) * 86400 + 21 hours);
        sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.NotOfficialClose.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_holidayMaturity() public {
        vm.prank(owner);
        cal.setHoliday(uint256(MATURITY) / 86400, true);
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.NotOfficialClose.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_tenorTooShortOrLong() public {
        FE.ForwardQuote memory q = _quote();
        q.maturityCloseTs = 1795813200; // Fri 2026-11-27, only 4 days away
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.TenorOutOfRange.selector);
        engine.openForward(q, sig);

        q = _quote();
        q.maturityCloseTs = cal.nextClose(uint64(block.timestamp + 120 days));
        sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.TenorOutOfRange.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_notionalOutOfRange() public {
        FE.ForwardQuote memory q = _quote();
        q.qty = 10e18; // 1,500 USDG
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.NotionalOutOfRange.selector);
        engine.openForward(q, sig);

        q = _quote();
        q.qty = 10_000e18; // 1,500,000 USDG
        sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(FE.NotionalOutOfRange.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_makerHasNoFreeMargin() public {
        address poor = makeAddr("poor");
        FE.ForwardQuote memory q = _quote();
        q.maker = poor;
        // Sign with a key whose address is `poor`: use a registered signer instead.
        vm.prank(poor);
        engine.registerSigner(maker, true);
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        engine.openForward(q, sig);
    }

    function test_open_revert_takerHasNoFreeMargin() public {
        FE.ForwardQuote memory q = _quote();
        vm.prank(taker);
        vault.withdraw(DEPOSIT);
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        engine.openForward(q, sig);
    }

    function test_open_hotSignerAndRevocation() public {
        uint256 hotPk = 0xCAFE;
        address hot = vm.addr(hotPk);
        vm.prank(maker);
        engine.registerSigner(hot, true);
        FE.ForwardQuote memory q = _quote();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(hotPk, engine.hashQuote(q));
        vm.prank(taker);
        engine.openForward(q, abi.encodePacked(r, s, v));

        vm.prank(maker);
        engine.registerSigner(hot, false);
        q.nonce = 43;
        (v, r, s) = vm.sign(hotPk, engine.hashQuote(q));
        bytes memory sig2 = abi.encodePacked(r, s, v);
        vm.prank(taker);
        vm.expectRevert(FE.InvalidSignature.selector);
        engine.openForward(q, sig2);
    }

    function test_open_cancelNonce() public {
        FE.ForwardQuote memory q = _quote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(maker);
        engine.cancelNonce(1, 42);
        vm.prank(taker);
        vm.expectRevert(FE.NonceAlreadyUsed.selector);
        engine.openForward(q, sig);
    }

    function test_open_pausedBlocksOpenButNotSettle() public {
        uint256 id = _openDefault();
        vm.prank(owner);
        engine.pause();
        FE.ForwardQuote memory q = _quote();
        q.nonce = 99;
        bytes memory sig = _sign(makerPk, q);
        vm.prank(taker);
        vm.expectRevert();
        engine.openForward(q, sig);

        _toSettlement(STRIKE); // flat
        engine.settle(id); // still works while paused
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Settled));
    }

    // ------------------------------------------------------------ settle

    function test_settle_longWins() public {
        uint256 id = _openDefault();
        _toSettlement(165e8); // +15 per token * 1000 = +15,000 USDG
        vm.expectEmit(true, false, false, true);
        emit FE.ForwardSettled(id, 165e8, int256(15_000e6));
        engine.settle(id);
        assertEq(_bal(taker), DEPOSIT - FEE + 15_000e6);
        assertEq(_bal(maker), DEPOSIT - 15_000e6);
        assertEq(vault.lockedOf(taker), 0);
        assertEq(vault.lockedOf(maker), 0);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Settled));
    }

    function test_settle_shortWinsWhenPriceFalls() public {
        FE.ForwardQuote memory q = _quote();
        q.side = FE.Side.Short;
        uint256 id = _open(q);
        _toSettlement(140e8); // -10 per token: short taker gains 10,000
        engine.settle(id);
        assertEq(_bal(taker), DEPOSIT - FEE + 10_000e6);
        assertEq(_bal(maker), DEPOSIT - 10_000e6);
    }

    function test_settle_flatPriceReturnsAllMargin() public {
        uint256 id = _openDefault();
        _toSettlement(STRIKE);
        engine.settle(id);
        assertEq(_bal(taker), DEPOSIT - FEE);
        assertEq(_bal(maker), DEPOSIT);
        assertEq(vault.freeMargin(taker), DEPOSIT - FEE);
    }

    function test_settle_lossCappedAtPostedMargin() public {
        uint256 id = _openDefault();
        _toSettlement(200e8); // +50,000 owed, but maker only posted 30,000
        engine.settle(id);
        assertEq(_bal(taker), DEPOSIT - FEE + IM, "winner receives at most the loser's margin");
        assertEq(_bal(maker), DEPOSIT - IM);
    }

    function test_settle_tooEarlyReverts() public {
        uint256 id = _openDefault();
        vm.warp(uint256(MATURITY) + 299);
        vm.expectRevert(OracleAdapter.TooEarly.selector);
        engine.settle(id);
    }

    function test_settle_deferredThenResolved() public {
        uint256 id = _openDefault();
        vm.warp(uint256(MATURITY) + 301); // only a round from 11 days ago exists: too old
        vm.expectEmit(true, false, false, true);
        emit FE.ObservationDeferred(id, MATURITY);
        engine.settle(id);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Open), "still open");

        feed.push(int256(160e8), MATURITY - 50); // late print of the true close price
        engine.settle(id);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Settled));
        assertEq(_bal(taker), DEPOSIT - FEE + 10_000e6);
    }

    function test_settle_deferredWhileTokenOraclePaused() public {
        uint256 id = _openDefault();
        _toSettlement(160e8);
        stock.setOraclePaused(true); // corporate action in progress
        vm.expectEmit(true, false, false, true);
        emit FE.ObservationDeferred(id, MATURITY);
        engine.settle(id);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Open));
        stock.setOraclePaused(false);
        engine.settle(id);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Settled));
    }

    function test_settle_cannotSettleTwice() public {
        uint256 id = _openDefault();
        _toSettlement(STRIKE);
        engine.settle(id);
        vm.expectRevert(FE.NotOpen.selector);
        engine.settle(id);
    }

    function test_settle_unknownPosition() public {
        vm.expectRevert(FE.NotOpen.selector);
        engine.settle(777);
    }

    function test_settle_priceIsPinnedAgainstLaterRounds() public {
        uint256 id = _openDefault();
        _toSettlement(160e8);
        // Another position at the same maturity must see the same pinned price.
        FE.ForwardQuote memory q = _quote();
        q.nonce = 7;
        // open before the warp is not possible now, so only check the oracle pin directly
        engine.settle(id);
        (uint256 pinnedPrice, bool resolved) = oracle.pinned(address(feed), MATURITY);
        assertTrue(resolved);
        assertEq(pinnedPrice, 160e8);
        feed.push(int256(999e8), MATURITY - 10);
        (uint256 again,) = oracle.observe(address(feed), MATURITY);
        assertEq(again, 160e8);
    }

    // ------------------------------------------------------------ margin call and liquidation

    function test_markToMarket_values() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp);
        (int256 pnl, uint256 eqT, uint256 eqM, uint256 price, bool live) = engine.markToMarket(id);
        assertEq(pnl, -20_000e6);
        assertEq(eqT, 10_000e6);
        assertEq(eqM, 50_000e6);
        assertEq(price, 130e8);
        assertTrue(live);
    }

    function test_marginCall_flagTopUpClears() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp); // taker equity 10,000 < 15,000
        vm.expectEmit(true, true, false, true);
        emit FE.MarginCall(id, taker, 10_000e6, REQ, uint64(block.timestamp + 4 hours));
        engine.flagMarginCall(id);
        assertEq(engine.getPosition(id).callParty, taker);

        vm.expectRevert(FE.TopUpWindowOpen.selector);
        engine.liquidate(id);

        vm.prank(taker);
        engine.topUp(id, 10_000e6); // equity 20,000 >= 15,000
        assertEq(engine.getPosition(id).callDeadline, 0, "call cleared");
        assertEq(engine.getPosition(id).takerMargin, IM + 10_000e6);
        vm.expectRevert(FE.NoMarginCall.selector);
        engine.liquidate(id);
    }

    function test_marginCall_partialTopUpDoesNotClear() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp);
        engine.flagMarginCall(id);
        vm.prank(taker);
        engine.topUp(id, 1_000e6); // equity 11,000, still below 15,000
        assertTrue(engine.getPosition(id).callDeadline != 0);
    }

    function test_liquidate_takerAfterWindow() public {
        uint256 id = _openDefault();
        _price(120e8, block.timestamp); // pnl -30,000, equity 0... margin 30,000 -> equity 0
        engine.flagMarginCall(id);
        vm.warp(block.timestamp + 4 hours + 1);
        _price(120e8, block.timestamp); // keep the mark fresh (live)

        // The loss (30,000) equals the whole taker margin, so nothing is left to take a penalty from.
        engine.liquidate(id);
        FE.Position memory p = engine.getPosition(id);
        assertEq(uint8(p.status), uint8(FE.Status.Liquidated));
        assertEq(_bal(maker), DEPOSIT + 30_000e6);
        assertEq(_bal(taker), DEPOSIT - FEE - 30_000e6);
        assertEq(vault.lockedOf(maker), 0);
        assertEq(vault.lockedOf(taker), 0);
    }

    function test_liquidate_penaltySplitWhenMarginRemains() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp); // equity 10,000 < 15,000
        engine.flagMarginCall(id);
        vm.warp(block.timestamp + 4 hours + 1);
        _price(130e8, block.timestamp);

        // loss 20,000 to maker; taker margin left 10,000; penalty 2% of 150,000 = 3,000
        // protocol cut 10% = 300, maker gets 2,700; taker keeps 7,000.
        uint256 feeBefore = _bal(feeTo);
        engine.liquidate(id);
        assertEq(_bal(maker), DEPOSIT + 20_000e6 + 2_700e6);
        assertEq(_bal(feeTo), feeBefore + 300e6);
        assertEq(_bal(taker), DEPOSIT - FEE - 20_000e6 - 3_000e6);
        assertEq(vault.lockedOf(taker), 0);
        assertEq(vault.freeMargin(taker), DEPOSIT - FEE - 23_000e6);
    }

    function test_liquidate_makerWhenPriceRises() public {
        uint256 id = _openDefault();
        _price(170e8, block.timestamp); // taker +20,000; maker equity 10,000 < 15,000
        engine.flagMarginCall(id);
        assertEq(engine.getPosition(id).callParty, maker);
        vm.warp(block.timestamp + 4 hours + 1);
        _price(170e8, block.timestamp);
        engine.liquidate(id);
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Liquidated));
        assertEq(_bal(taker), DEPOSIT - FEE + 20_000e6 + 2_700e6);
        assertEq(_bal(maker), DEPOSIT - 20_000e6 - 3_000e6);
    }

    function test_liquidate_requiresLivePrice() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp);
        engine.flagMarginCall(id);
        vm.warp(block.timestamp + 4 hours + 1); // the 130 print is now older than liveMaxAge
        vm.expectRevert(FE.PriceNotLive.selector);
        engine.liquidate(id);
    }

    function test_flag_requiresLivePriceAndUndercollateral() public {
        uint256 id = _openDefault();
        vm.expectRevert(FE.NotLiquidatable.selector);
        engine.flagMarginCall(id); // healthy at the strike

        _price(130e8, block.timestamp);
        vm.warp(block.timestamp + 2 hours); // stale mark
        vm.expectRevert(FE.PriceNotLive.selector);
        engine.flagMarginCall(id);
    }

    function test_liquidate_blockedWhileTokenOraclePaused() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp);
        engine.flagMarginCall(id);
        vm.warp(block.timestamp + 4 hours + 1);
        _price(130e8, block.timestamp);
        stock.setOraclePaused(true);
        vm.expectRevert(FE.OraclePausedByToken.selector);
        engine.liquidate(id);
        stock.setOraclePaused(false);
        engine.liquidate(id);
    }

    function test_liquidate_notLiquidatableIfPriceRecovered() public {
        uint256 id = _openDefault();
        _price(130e8, block.timestamp);
        engine.flagMarginCall(id);
        vm.warp(block.timestamp + 4 hours + 1);
        _price(150e8, block.timestamp); // recovered
        vm.expectRevert(FE.NotLiquidatable.selector);
        engine.liquidate(id);
    }

    function test_topUp_onlyPartiesAndOnlyOpen() public {
        uint256 id = _openDefault();
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(FE.NotParty.selector);
        engine.topUp(id, 1e6);

        vm.prank(maker);
        engine.topUp(id, 5_000e6);
        assertEq(engine.getPosition(id).makerMargin, IM + 5_000e6);

        _toSettlement(STRIKE);
        engine.settle(id);
        vm.prank(maker);
        vm.expectRevert(FE.NotOpen.selector);
        engine.topUp(id, 1e6);
    }

    function test_topUp_needsFreeMargin() public {
        uint256 id = _openDefault();
        uint256 free = vault.freeMargin(taker); // read before pranking: a call in the arguments consumes the prank
        vm.prank(taker);
        vault.withdraw(free);
        vm.prank(taker);
        vm.expectRevert(MarginVault.InsufficientFree.selector);
        engine.topUp(id, 1);
    }

    // ------------------------------------------------------------ mutual close

    function _closeSigs(uint256 id, uint256 price) internal view returns (bytes memory ms, bytes memory ts) {
        bytes32 d = engine.hashClose(id, price);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, d);
        ms = abi.encodePacked(r, s, v);
        (v, r, s) = vm.sign(takerPk, d);
        ts = abi.encodePacked(r, s, v);
    }

    function test_closeByMutual() public {
        uint256 id = _openDefault();
        (bytes memory ms, bytes memory ts) = _closeSigs(id, 155e8);
        engine.closeByMutual(id, 155e8, ms, ts); // anyone can submit
        assertEq(uint8(engine.getPosition(id).status), uint8(FE.Status.Closed));
        assertEq(_bal(taker), DEPOSIT - FEE + 5_000e6);
        assertEq(_bal(maker), DEPOSIT - 5_000e6);
        assertEq(vault.lockedOf(taker), 0);
    }

    function test_closeByMutual_wrongPriceOrSigner() public {
        uint256 id = _openDefault();
        (bytes memory ms, bytes memory ts) = _closeSigs(id, 155e8);
        vm.expectRevert(FE.InvalidSignature.selector);
        engine.closeByMutual(id, 156e8, ms, ts); // price differs from what was signed

        vm.expectRevert(FE.InvalidSignature.selector);
        engine.closeByMutual(id, 155e8, ts, ms); // swapped signatures

        vm.expectRevert(FE.InvalidTerms.selector);
        engine.closeByMutual(id, 0, ms, ts);
    }

    function test_closeByMutual_cannotReuseOnClosedPosition() public {
        uint256 id = _openDefault();
        (bytes memory ms, bytes memory ts) = _closeSigs(id, 155e8);
        engine.closeByMutual(id, 155e8, ms, ts);
        vm.expectRevert(FE.NotOpen.selector);
        engine.closeByMutual(id, 155e8, ms, ts);
    }

    // ------------------------------------------------------------ admin

    function test_admin_onlyOwner() public {
        vm.startPrank(makeAddr("stranger"));
        vm.expectRevert();
        engine.setUnderlying(address(stock), address(feed), true, 1000);
        vm.expectRevert();
        engine.setParams(20, 200, 1000, 4 hours, 7 days, 92 days, 10_000e6, 1_000_000e6, feeTo);
        vm.expectRevert();
        engine.pause();
        vm.stopPrank();
    }

    function test_admin_boundsAndFeedDecimals() public {
        vm.startPrank(owner);
        vm.expectRevert(FE.BadParam.selector);
        engine.setParams(101, 200, 1000, 4 hours, 7 days, 92 days, 10_000e6, 1_000_000e6, feeTo);
        vm.expectRevert(FE.BadParam.selector);
        engine.setParams(20, 1001, 1000, 4 hours, 7 days, 92 days, 10_000e6, 1_000_000e6, feeTo);
        vm.expectRevert(FE.BadParam.selector);
        engine.setParams(20, 200, 1000, 4 hours, 93 days, 92 days, 10_000e6, 1_000_000e6, feeTo);
        MockAggregator wrong = new MockAggregator();
        wrong.setDecimals(18);
        vm.expectRevert(FE.BadParam.selector);
        engine.setUnderlying(address(stock), address(wrong), true, 1000);
        vm.stopPrank();
    }

    function test_domain() public view {
        (, string memory name, string memory version,, address vc,,) = engine.eip712Domain();
        assertEq(name, "Cold Harbor Forwards");
        assertEq(version, "1");
        assertEq(vc, address(engine));
    }

    // ------------------------------------------------------------ properties

    /// Whatever the settlement price, no USDG is created or destroyed, nothing stays locked,
    /// and neither side can lose more than it posted.
    function testFuzz_settle_conservation(uint256 closePrice, bool short) public {
        closePrice = bound(closePrice, 1e8, 1000e8);
        FE.ForwardQuote memory q = _quote();
        if (short) q.side = FE.Side.Short;
        uint256 id = _open(q);
        uint256 total = _bal(maker) + _bal(taker) + _bal(feeTo);
        _toSettlement(closePrice);
        engine.settle(id);

        assertEq(_bal(maker) + _bal(taker) + _bal(feeTo), total, "no value created or lost");
        assertEq(vault.lockedOf(maker), 0);
        assertEq(vault.lockedOf(taker), 0);
        assertEq(usdg.balanceOf(address(vault)), _bal(maker) + _bal(taker) + _bal(feeTo));
        assertGe(_bal(maker), DEPOSIT - IM, "maker loses at most its margin");
        assertGe(_bal(taker), DEPOSIT - FEE - IM, "taker loses at most its margin plus the fee");
    }

    /// Settlement is symmetric: the long side and the short side of the same price move are exact opposites.
    function testFuzz_settle_longShortMirror(uint256 closePrice) public {
        closePrice = bound(closePrice, 120e8, 180e8); // inside margin so nothing is capped
        _snap();
        FE.ForwardQuote memory q = _quote();
        uint256 id = _open(q);
        _toSettlement(closePrice);
        engine.settle(id);
        int256 longDelta = int256(_bal(taker)) - int256(DEPOSIT - FEE);

        // fresh deployment state for the short case
        vm.revertToState(snapshotId);
        FE.ForwardQuote memory q2 = _quote();
        q2.side = FE.Side.Short;
        uint256 id2 = _open(q2);
        _toSettlement(closePrice);
        engine.settle(id2);
        int256 shortDelta = int256(_bal(taker)) - int256(DEPOSIT - FEE);
        assertEq(longDelta, -shortDelta);
    }

    uint256 snapshotId;

    function _snap() internal {
        snapshotId = vm.snapshotState();
    }
}
