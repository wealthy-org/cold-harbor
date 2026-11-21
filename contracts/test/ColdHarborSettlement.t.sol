// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ColdHarborSettlement as CH, ISignatureTransfer} from "../src/ColdHarborSettlement.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";

contract ERC1271Maker {
    bytes32 public okDigest;

    function set(bytes32 d) external {
        okDigest = d;
    }

    function isValidSignature(bytes32 h, bytes calldata) external view returns (bytes4) {
        return h == okDigest ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function approve(address t, address s, uint256 a) external {
        MockERC20(t).approve(s, a);
    }
}

contract ColdHarborSettlementTest is Test {
    CH ch;
    MockERC20 usdg; // 6 decimals
    MockERC20 nvda; // 18 decimals
    MockPermit2 permit2;

    address owner = makeAddr("owner");
    address feeTo = makeAddr("feeTo");
    address taker = makeAddr("taker");
    uint256 makerPk = 0xA11CE;
    address maker;
    uint256 hotPk = 0xB0B;
    address hot;

    uint16 constant FEE = 8;

    function setUp() public {
        maker = vm.addr(makerPk);
        hot = vm.addr(hotPk);
        usdg = new MockERC20("USDG", "USDG", 6);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        permit2 = new MockPermit2();
        ch = new CH(address(usdg), feeTo, FEE, owner, address(permit2));
        vm.prank(owner);
        ch.setTokenAllowed(address(nvda), true);

        usdg.mint(taker, 10_000_000e6);
        nvda.mint(taker, 100_000e18);
        usdg.mint(maker, 10_000_000e6);
        nvda.mint(maker, 100_000e18);
        vm.startPrank(taker);
        usdg.approve(address(ch), type(uint256).max);
        nvda.approve(address(ch), type(uint256).max);
        usdg.approve(address(permit2), type(uint256).max);
        nvda.approve(address(permit2), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(maker);
        usdg.approve(address(ch), type(uint256).max);
        nvda.approve(address(ch), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ helpers

    function _buyQuote() internal view returns (CH.Quote memory q) {
        // taker buys 5,000 NVDA for 711,600 USDG
        q = CH.Quote({
            maker: maker,
            taker: taker,
            makerToken: address(nvda),
            takerToken: address(usdg),
            makerAmount: 5_000e18,
            takerAmount: 711_600e6,
            expiry: uint64(block.timestamp + 25),
            nonceBucket: 7,
            nonce: 1_029_384,
            feeBps: FEE,
            rfqId: keccak256("rfq-1")
        });
    }

    function _sellQuote() internal view returns (CH.Quote memory q) {
        // taker sells 1,000 NVDA for 142,000 USDG
        q = CH.Quote({
            maker: maker,
            taker: taker,
            makerToken: address(usdg),
            takerToken: address(nvda),
            makerAmount: 142_000e6,
            takerAmount: 1_000e18,
            expiry: uint64(block.timestamp + 25),
            nonceBucket: 7,
            nonce: 5,
            feeBps: FEE,
            rfqId: keccak256("rfq-2")
        });
    }

    function _sign(uint256 pk, CH.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ch.hashQuote(q));
        return abi.encodePacked(r, s, v);
    }

    function _fill(CH.Quote memory q, bytes memory sig) internal {
        vm.prank(q.taker);
        ch.fillQuote(q, sig);
    }

    // ------------------------------------------------------------ happy paths

    function test_buy_movesAssetsAndTakesFeeOnTop() public {
        CH.Quote memory q = _buyQuote();
        uint256 fee = (uint256(711_600e6) * FEE) / 10_000;
        uint256 tU = usdg.balanceOf(taker);
        uint256 mU = usdg.balanceOf(maker);
        uint256 tN = nvda.balanceOf(taker);
        uint256 mN = nvda.balanceOf(maker);

        vm.expectEmit(true, true, true, true);
        emit CH.QuoteFilled(q.rfqId, maker, taker, q.makerToken, q.takerToken, q.makerAmount, q.takerAmount, fee);
        _fill(q, _sign(makerPk, q));

        assertEq(usdg.balanceOf(taker), tU - 711_600e6 - fee, "taker usdg");
        assertEq(usdg.balanceOf(maker), mU + 711_600e6, "maker gets exact signed price");
        assertEq(usdg.balanceOf(feeTo), fee, "fee recipient");
        assertEq(nvda.balanceOf(taker), tN + 5_000e18);
        assertEq(nvda.balanceOf(maker), mN - 5_000e18);
        assertTrue(ch.isNonceUsed(maker, 7, 1_029_384));
    }

    function test_sell_feeDeductedFromTakerProceeds() public {
        CH.Quote memory q = _sellQuote();
        uint256 fee = (uint256(142_000e6) * FEE) / 10_000;
        uint256 tU = usdg.balanceOf(taker);
        uint256 mU = usdg.balanceOf(maker);

        _fill(q, _sign(makerPk, q));

        assertEq(usdg.balanceOf(taker), tU + 142_000e6 - fee, "taker net proceeds");
        assertEq(usdg.balanceOf(maker), mU - 142_000e6, "maker outflow equals signed amount");
        assertEq(usdg.balanceOf(feeTo), fee);
        assertEq(nvda.balanceOf(maker), 100_000e18 + 1_000e18);
    }

    function test_zeroFee() public {
        vm.prank(owner);
        ch.setFeeBps(0);
        CH.Quote memory q = _buyQuote();
        q.feeBps = 0;
        _fill(q, _sign(makerPk, q));
        assertEq(usdg.balanceOf(feeTo), 0);
    }

    function test_registeredHotSignerCanSign() public {
        vm.prank(maker);
        ch.registerSigner(hot, true);
        CH.Quote memory q = _buyQuote();
        _fill(q, _sign(hotPk, q));
        assertEq(nvda.balanceOf(taker), 100_000e18 + 5_000e18);
    }

    function test_erc1271MakerContract() public {
        ERC1271Maker m = new ERC1271Maker();
        usdg.mint(address(m), 10_000_000e6);
        nvda.mint(address(m), 100_000e18);
        m.approve(address(usdg), address(ch), type(uint256).max);
        m.approve(address(nvda), address(ch), type(uint256).max);
        CH.Quote memory q = _buyQuote();
        q.maker = address(m);
        m.set(ch.hashQuote(q));
        _fill(q, hex"1234");
        assertEq(nvda.balanceOf(taker), 100_000e18 + 5_000e18);
    }

    function test_expiryBoundaryInclusive() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.warp(q.expiry);
        _fill(q, sig);
    }

    // ------------------------------------------------------------ rejections

    function test_revert_expired() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.warp(q.expiry + 1);
        vm.expectRevert(CH.QuoteExpired.selector);
        _fill(q, sig);
    }

    function test_revert_notTaker() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(makeAddr("frontrunner"));
        vm.expectRevert(CH.NotTaker.selector);
        ch.fillQuote(q, sig);
    }

    function test_revert_replay() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        _fill(q, sig);
        vm.expectRevert(CH.NonceAlreadyUsed.selector);
        _fill(q, sig);
    }

    function test_revert_wrongSigner() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sigX = _sign(hotPk, q);
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, sigX);
    }

    function test_revert_revokedSigner() public {
        vm.startPrank(maker);
        ch.registerSigner(hot, true);
        ch.registerSigner(hot, false);
        vm.stopPrank();
        CH.Quote memory q = _buyQuote();
        bytes memory sigX = _sign(hotPk, q);
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, sigX);
    }

    function test_revert_garbageSignature() public {
        CH.Quote memory q = _buyQuote();
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, hex"deadbeef");
    }

    function test_revert_tamperedAmount() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        q.makerAmount += 1e18; // taker tries to get more stock than signed
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, sig);
    }

    function test_revert_tokenNotAllowed() public {
        vm.prank(owner);
        ch.setTokenAllowed(address(nvda), false);
        CH.Quote memory q = _buyQuote();
        bytes memory sigX = _sign(makerPk, q);
        vm.expectRevert(abi.encodeWithSelector(CH.TokenNotAllowed.selector, address(nvda)));
        _fill(q, sigX);
    }

    function test_revert_notUsdgPair() public {
        MockERC20 aapl = new MockERC20("AAPL", "AAPL", 18);
        vm.prank(owner);
        ch.setTokenAllowed(address(aapl), true);
        CH.Quote memory q = _buyQuote();
        q.takerToken = address(aapl); // stock for stock
        bytes memory sigX = _sign(makerPk, q);
        vm.expectRevert(CH.NotUsdgPair.selector);
        _fill(q, sigX);
    }

    function test_revert_usdgOnBothSides() public {
        CH.Quote memory q = _buyQuote();
        q.makerToken = address(usdg);
        bytes memory sigX = _sign(makerPk, q);
        vm.expectRevert(CH.NotUsdgPair.selector);
        _fill(q, sigX);
    }

    function test_revert_feeMismatch_makerSignedZero() public {
        CH.Quote memory q = _buyQuote();
        q.feeBps = 0; // maker/taker collude to skip the fee
        bytes memory sigX = _sign(makerPk, q);
        vm.expectRevert(CH.FeeMismatch.selector);
        _fill(q, sigX);
    }

    function test_revert_feeChangeInvalidatesQuote() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(owner);
        ch.setFeeBps(20);
        vm.expectRevert(CH.FeeMismatch.selector);
        _fill(q, sig);
    }

    function test_revert_selfTrade() public {
        CH.Quote memory q = _buyQuote();
        q.taker = maker;
        bytes memory sig = _sign(makerPk, q);
        vm.prank(maker);
        vm.expectRevert(CH.SameParty.selector);
        ch.fillQuote(q, sig);
    }

    function test_revert_zeroAmount() public {
        CH.Quote memory q = _buyQuote();
        q.makerAmount = 0;
        bytes memory sigX = _sign(makerPk, q);
        vm.expectRevert(CH.ZeroAmount.selector);
        _fill(q, sigX);
    }

    function test_revert_paused_thenResume() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(owner);
        ch.pause();
        vm.expectRevert();
        _fill(q, sig);
        vm.prank(owner);
        ch.unpause();
        _fill(q, sig);
    }

    function test_atomic_makerLacksInventory_revertsEverything() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(maker);
        nvda.transfer(address(0xdead), 100_000e18); // maker drained
        uint256 tU = usdg.balanceOf(taker);
        vm.expectRevert();
        _fill(q, sig);
        assertEq(usdg.balanceOf(taker), tU, "taker usdg untouched");
        assertFalse(ch.isNonceUsed(maker, 7, 1_029_384), "nonce not burned on revert");
    }

    // ------------------------------------------------------------ nonces

    function test_cancelNonce_blocksFill() public {
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        vm.prank(maker);
        ch.cancelNonce(7, 1_029_384);
        vm.expectRevert(CH.NonceAlreadyUsed.selector);
        _fill(q, sig);
    }

    function test_cancelNonce_onlyAffectsCaller() public {
        vm.prank(taker);
        ch.cancelNonce(7, 1_029_384); // taker cancelling the same numbers
        CH.Quote memory q = _buyQuote();
        _fill(q, _sign(makerPk, q)); // maker's nonce space is separate
    }

    function test_cancelNonce_twiceReverts() public {
        vm.startPrank(maker);
        ch.cancelNonce(1, 1);
        vm.expectRevert(CH.NonceAlreadyUsed.selector);
        ch.cancelNonce(1, 1);
        vm.stopPrank();
    }

    function test_nonceBitmap_adjacentAndFarNoncesIndependent() public {
        vm.startPrank(maker);
        ch.cancelNonce(1, 255);
        ch.cancelNonce(1, 256);
        ch.cancelNonce(1, type(uint128).max);
        vm.stopPrank();
        assertTrue(ch.isNonceUsed(maker, 1, 255));
        assertTrue(ch.isNonceUsed(maker, 1, 256));
        assertTrue(ch.isNonceUsed(maker, 1, type(uint128).max));
        assertFalse(ch.isNonceUsed(maker, 1, 254));
        assertFalse(ch.isNonceUsed(maker, 1, 257));
        assertFalse(ch.isNonceUsed(maker, 2, 255));
    }

    // ------------------------------------------------------------ admin

    function test_admin_onlyOwner() public {
        vm.startPrank(taker);
        vm.expectRevert();
        ch.setTokenAllowed(address(nvda), false);
        vm.expectRevert();
        ch.setFeeBps(1);
        vm.expectRevert();
        ch.setFeeRecipient(taker);
        vm.expectRevert();
        ch.pause();
        vm.stopPrank();
    }

    function test_admin_feeCap() public {
        vm.prank(owner);
        vm.expectRevert(CH.FeeTooHigh.selector);
        ch.setFeeBps(101);
    }

    function test_constructor_guards() public {
        vm.expectRevert(CH.ZeroAddress.selector);
        new CH(address(0), feeTo, 8, owner, address(permit2));
        vm.expectRevert(CH.ZeroAddress.selector);
        new CH(address(usdg), address(0), 8, owner, address(permit2));
        vm.expectRevert(CH.FeeTooHigh.selector);
        new CH(address(usdg), feeTo, 101, owner, address(permit2));
        vm.expectRevert(CH.ZeroAddress.selector);
        new CH(address(usdg), feeTo, 8, owner, address(0));
    }

    function test_ownership_twoStep() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        ch.transferOwnership(newOwner);
        assertEq(ch.owner(), owner, "not yet transferred");
        vm.prank(newOwner);
        ch.acceptOwnership();
        assertEq(ch.owner(), newOwner);
    }

    function test_domain_matchesBrief() public view {
        (, string memory name, string memory version, uint256 chainId, address vc,,) = ch.eip712Domain();
        assertEq(name, "Cold Harbor");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(vc, address(ch));
    }

    // ------------------------------------------------------------ fuzz

    /// Value is conserved: maker gets exactly the signed amount, taker pays/receives exactly amount +/- fee,
    /// and the contract never retains tokens.
    function testFuzz_buy_conservation(uint96 usdgAmt, uint96 stockAmt, uint16 feeBps_) public {
        usdgAmt = uint96(bound(usdgAmt, 1, 5_000_000e6));
        stockAmt = uint96(bound(stockAmt, 1, 50_000e18));
        feeBps_ = uint16(bound(feeBps_, 0, 100));
        vm.prank(owner);
        ch.setFeeBps(feeBps_);

        CH.Quote memory q = _buyQuote();
        q.takerAmount = usdgAmt;
        q.makerAmount = stockAmt;
        q.feeBps = feeBps_;
        uint256 fee = (uint256(usdgAmt) * feeBps_) / 10_000;
        uint256 tU = usdg.balanceOf(taker);
        uint256 mU = usdg.balanceOf(maker);

        _fill(q, _sign(makerPk, q));

        assertEq(usdg.balanceOf(taker), tU - usdgAmt - fee);
        assertEq(usdg.balanceOf(maker), mU + usdgAmt);
        assertEq(usdg.balanceOf(feeTo), fee);
        assertEq(usdg.balanceOf(address(ch)), 0);
        assertEq(nvda.balanceOf(address(ch)), 0);
    }

    function testFuzz_sell_conservation(uint96 usdgAmt, uint96 stockAmt, uint16 feeBps_) public {
        usdgAmt = uint96(bound(usdgAmt, 1, 5_000_000e6));
        stockAmt = uint96(bound(stockAmt, 1, 50_000e18));
        feeBps_ = uint16(bound(feeBps_, 0, 100));
        vm.prank(owner);
        ch.setFeeBps(feeBps_);

        CH.Quote memory q = _sellQuote();
        q.makerAmount = usdgAmt;
        q.takerAmount = stockAmt;
        q.feeBps = feeBps_;
        uint256 fee = (uint256(usdgAmt) * feeBps_) / 10_000;
        uint256 tU = usdg.balanceOf(taker);
        uint256 mU = usdg.balanceOf(maker);

        _fill(q, _sign(makerPk, q));

        assertEq(usdg.balanceOf(taker), tU + usdgAmt - fee);
        assertEq(usdg.balanceOf(maker), mU - usdgAmt);
        assertEq(usdg.balanceOf(feeTo), fee);
        assertEq(usdg.balanceOf(address(ch)), 0);
    }

    /// Any nonce can be used exactly once per (maker, bucket) and never collides with others.
    function testFuzz_nonceUsedOnce(uint64 bucket, uint128 n1, uint128 n2) public {
        vm.assume(n1 != n2);
        vm.startPrank(maker);
        ch.cancelNonce(bucket, n1);
        assertTrue(ch.isNonceUsed(maker, bucket, n1));
        assertFalse(ch.isNonceUsed(maker, bucket, n2));
        vm.expectRevert(CH.NonceAlreadyUsed.selector);
        ch.cancelNonce(bucket, n1);
        vm.stopPrank();
    }

    /// A signature never validates a quote with any field changed.
    function testFuzz_signatureBindsAmounts(uint96 extra) public {
        extra = uint96(bound(extra, 1, 1e9));
        CH.Quote memory q = _buyQuote();
        bytes memory sig = _sign(makerPk, q);
        q.takerAmount -= 1; // taker shaves the price
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, sig);
        q = _buyQuote();
        q.expiry += uint64(extra);
        vm.expectRevert(CH.InvalidSignature.selector);
        _fill(q, sig);
    }

    // ------------------------------------------------------------ Permit2 (dev brief 7.1)

    function _permit(address token, uint256 amount, uint256 nonce) internal view returns (ISignatureTransfer.PermitTransferFrom memory) {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount}),
            nonce: nonce,
            deadline: block.timestamp + 60
        });
    }

    function test_permit2_buyMovesAssetsAndTakesFeeOnTop() public {
        CH.Quote memory q = _buyQuote(); // takerToken = usdg, takerAmount 711_600e6
        uint256 fee = (uint256(q.takerAmount) * FEE) / 10_000;

        // taker is a plain makeAddr() with no known private key; re-derive one just for Permit2 signing.
        uint256 takerPk = 0x7A4E7;
        address takerAddr = vm.addr(takerPk);
        usdg.mint(takerAddr, 10_000_000e6);
        vm.startPrank(takerAddr);
        usdg.approve(address(permit2), type(uint256).max);
        nvda.approve(address(permit2), type(uint256).max);
        vm.stopPrank();

        q.taker = takerAddr;
        bytes memory makerSig = _sign(makerPk, q);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), q.takerAmount + fee, 2);
        bytes32 digest = permit2.hashPermit(p, address(ch));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(takerPk, digest);
        bytes memory takerSig = abi.encodePacked(r, s, v);

        uint256 makerUsdgBefore = usdg.balanceOf(maker);
        uint256 feeBefore = usdg.balanceOf(feeTo);

        vm.prank(takerAddr);
        ch.fillQuoteWithPermit2(q, makerSig, p, takerSig);

        assertEq(usdg.balanceOf(maker), makerUsdgBefore + q.takerAmount, "maker received takerAmount");
        assertEq(usdg.balanceOf(feeTo), feeBefore + fee, "fee recipient received the fee on top");
        assertEq(nvda.balanceOf(takerAddr), q.makerAmount, "taker received the stock");
    }

    function test_permit2_wrongAmountReverts() public {
        uint256 takerPk = 0x7A4E7;
        address takerAddr = vm.addr(takerPk);
        usdg.mint(takerAddr, 10_000_000e6);
        vm.prank(takerAddr);
        usdg.approve(address(permit2), type(uint256).max);

        CH.Quote memory q = _buyQuote();
        q.taker = takerAddr;
        bytes memory makerSig = _sign(makerPk, q);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), q.takerAmount, 3); // missing the fee on top
        bytes32 digest = permit2.hashPermit(p, address(ch));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(takerPk, digest);
        bytes memory takerSig = abi.encodePacked(r, s, v);

        vm.prank(takerAddr);
        vm.expectRevert(CH.InvalidPermit2Amount.selector);
        ch.fillQuoteWithPermit2(q, makerSig, p, takerSig);
    }

    function test_permit2_replayedNonceReverts() public {
        uint256 takerPk = 0x7A4E7;
        address takerAddr = vm.addr(takerPk);
        usdg.mint(takerAddr, 10_000_000e6);
        nvda.mint(takerAddr, 100_000e18);
        vm.startPrank(takerAddr);
        usdg.approve(address(permit2), type(uint256).max);
        nvda.approve(address(permit2), type(uint256).max);
        vm.stopPrank();

        CH.Quote memory q = _buyQuote();
        q.taker = takerAddr;
        uint256 fee = (uint256(q.takerAmount) * FEE) / 10_000;
        bytes memory makerSig = _sign(makerPk, q);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), q.takerAmount + fee, 9);
        bytes32 digest = permit2.hashPermit(p, address(ch));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(takerPk, digest);
        bytes memory takerSig = abi.encodePacked(r, s, v);

        vm.prank(takerAddr);
        ch.fillQuoteWithPermit2(q, makerSig, p, takerSig);

        // A second, different quote reusing the same Permit2 nonce must fail even though the EIP-712
        // quote nonce differs -- Permit2's own nonce bitmap is the replay guard for the signature itself.
        CH.Quote memory q2 = q;
        q2.nonce = q.nonce + 1;
        q2.rfqId = keccak256("rfq-permit2-replay");
        bytes memory makerSig2 = _sign(makerPk, q2);
        vm.prank(takerAddr);
        vm.expectRevert(MockPermit2.NonceAlreadyUsed.selector);
        ch.fillQuoteWithPermit2(q2, makerSig2, p, takerSig);
    }
}
