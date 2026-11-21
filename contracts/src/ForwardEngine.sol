// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMarginVault} from "./MarginVault.sol";
import {IAggregatorV3} from "./OracleAdapter.sol";

interface IOracleAdapter {
    function observe(address feed, uint64 closeTs) external returns (uint256 price, bool ok);
    function referencePrice(address feed) external view returns (uint256 price, bool live);
}

interface IMarketCalendar {
    function isOfficialClose(uint64 ts) external view returns (bool);
    function nextClose(uint64 ts) external view returns (uint64);
}

interface IStockToken {
    function oraclePaused() external view returns (bool);
}

/// @title ForwardEngine
/// @notice Cash-settled forwards on tokenized stocks, collateralised in USDG. Spec: dev brief sections 5.3 and 7.3.
///  - A maker-signed quote (EIP-712) opens a position. Both sides post initial margin in the MarginVault.
///  - Mark to market uses the OracleAdapter reference price. An undercollateralised side gets a margin call,
///    a top-up window, and is liquidated by a keeper only if the price is live.
///  - At maturity (an official market close) anyone calls `settle`; the price is pinned by the OracleAdapter.
///    If no valid price exists the settlement is deferred and can be retried.
///  - Units: qty 18 decimals, price and strike 8 decimals (USDG per token), USDG 6 decimals.
///    notional(USDG) = qty * price / 1e20.
///  - Loss is capped at the loser's posted margin. If a move exceeds it the winner is not made whole (no bad-debt fund).
contract ForwardEngine is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    enum Side {
        Long,
        Short
    } // taker's side
    enum Status {
        None,
        Open,
        Settled,
        Liquidated,
        Closed
    }

    struct ForwardQuote {
        address maker;
        address taker;
        address stockToken;
        Side side;
        uint256 qty;
        uint256 strike;
        uint64 maturityCloseTs;
        uint16 imBps;
        uint16 mmBps;
        uint16 feeBps;
        uint64 expiry;
        uint64 nonceBucket;
        uint128 nonce;
        bytes32 rfqId;
    }

    struct Position {
        address maker;
        address taker;
        address stockToken;
        address feed;
        Side side;
        uint256 qty;
        uint256 strike;
        uint64 maturityCloseTs;
        uint256 makerMargin;
        uint256 takerMargin;
        uint16 mmBps;
        Status status;
        uint64 callDeadline; // 0 = no margin call
        address callParty;
    }

    struct Underlying {
        address feed;
        bool active;
        uint16 minImBps;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "ForwardQuote(address maker,address taker,address stockToken,uint8 side,uint256 qty,uint256 strike,uint64 maturityCloseTs,uint16 imBps,uint16 mmBps,uint16 feeBps,uint64 expiry,uint64 nonceBucket,uint128 nonce,bytes32 rfqId)"
    );
    bytes32 public constant CLOSE_TYPEHASH = keccak256("Close(uint256 id,uint256 price)");

    uint256 private constant BPS = 10_000;
    uint256 private constant NOTIONAL_DIV = 1e20; // qty(1e18) * price(1e8) -> USDG(1e6)

    IMarginVault public immutable VAULT;
    IOracleAdapter public immutable ORACLE;
    IMarketCalendar public immutable CALENDAR;

    address public feeRecipient;
    uint16 public openFeeBps = 20; // taker pays at open (brief: 15 to 25 bps)
    uint16 public liquidationPenaltyBps = 200; // of notional, from the liquidated side
    uint16 public penaltyProtocolShareBps = 1000; // share of the penalty kept by the protocol
    uint64 public topUpWindow = 4 hours;
    uint64 public minTenor = 7 days;
    uint64 public maxTenor = 92 days;
    uint256 public minNotional = 10_000e6;
    uint256 public maxNotional = 1_000_000e6;
    uint64 public constant MAX_ROLL_DAYS = 8 days; // brief 7.5: following-business-day shift cap

    uint256 public nextId = 1;
    mapping(uint256 id => Position) private _pos;
    mapping(address token => Underlying) public underlying;
    mapping(address maker => mapping(address signer => bool)) public isSigner;
    mapping(address maker => mapping(uint64 bucket => mapping(uint120 word => uint256))) private _nonceBitmap;

    event ForwardOpened(
        uint256 indexed id,
        bytes32 indexed rfqId,
        address indexed maker,
        address taker,
        address stockToken,
        Side side,
        uint256 qty,
        uint256 strike,
        uint64 maturityCloseTs,
        uint256 makerMargin,
        uint256 takerMargin
    );
    event MarginToppedUp(uint256 indexed id, address indexed who, uint256 amount);
    event MarginCall(uint256 indexed id, address indexed who, uint256 equity, uint256 required, uint64 deadline);
    event MarginCallCleared(uint256 indexed id);
    event ForwardLiquidated(uint256 indexed id, address indexed liquidatedParty, uint256 price, int256 pnlTaker, uint256 penalty);
    event ForwardSettled(uint256 indexed id, uint256 closePrice, int256 pnlTaker);
    event ForwardClosed(uint256 indexed id, uint256 price, int256 pnlTaker);
    event ObservationDeferred(uint256 indexed id, uint64 closeTs);
    event MaturityRolled(uint256 indexed id, uint64 oldCloseTs, uint64 newCloseTs);
    event UnderlyingSet(address indexed token, address feed, bool active, uint16 minImBps);
    event SignerRegistered(address indexed maker, address signer, bool allowed);
    event NonceCancelled(address indexed maker, uint64 bucket, uint128 nonce);
    event ParamsSet();

    error NotTaker();
    error QuoteExpired();
    error SameParty();
    error UnderlyingNotActive();
    error InvalidTerms();
    error FeeMismatch();
    error NotOfficialClose();
    error TenorOutOfRange();
    error NotionalOutOfRange();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error NotOpen();
    error NotParty();
    error NotLiquidatable();
    error NoMarginCall();
    error TopUpWindowOpen();
    error PriceNotLive();
    error OraclePausedByToken();
    error ZeroAddress();
    error BadParam();
    error StillOfficialClose();
    error RollTooFar();

    constructor(address vault_, address oracle_, address calendar_, address feeRecipient_, address owner_)
        EIP712("Cold Harbor Forwards", "1")
        Ownable(owner_)
    {
        if (vault_ == address(0) || oracle_ == address(0) || calendar_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        VAULT = IMarginVault(vault_);
        ORACLE = IOracleAdapter(oracle_);
        CALENDAR = IMarketCalendar(calendar_);
        feeRecipient = feeRecipient_;
    }

    // ================================================================ admin

    function setUnderlying(address token, address feed, bool active, uint16 minImBps) external onlyOwner {
        if (token == address(0) || feed == address(0)) revert ZeroAddress();
        if (IAggregatorV3(feed).decimals() != 8 || minImBps == 0 || minImBps > BPS) revert BadParam();
        underlying[token] = Underlying(feed, active, minImBps);
        emit UnderlyingSet(token, feed, active, minImBps);
    }

    function setParams(
        uint16 openFeeBps_,
        uint16 penaltyBps_,
        uint16 protocolShareBps_,
        uint64 topUpWindow_,
        uint64 minTenor_,
        uint64 maxTenor_,
        uint256 minNotional_,
        uint256 maxNotional_,
        address feeRecipient_
    ) external onlyOwner {
        if (openFeeBps_ > 100 || penaltyBps_ > 1000 || protocolShareBps_ > BPS) revert BadParam();
        if (minTenor_ > maxTenor_ || minNotional_ > maxNotional_ || feeRecipient_ == address(0)) revert BadParam();
        openFeeBps = openFeeBps_;
        liquidationPenaltyBps = penaltyBps_;
        penaltyProtocolShareBps = protocolShareBps_;
        topUpWindow = topUpWindow_;
        minTenor = minTenor_;
        maxTenor = maxTenor_;
        minNotional = minNotional_;
        maxNotional = maxNotional_;
        feeRecipient = feeRecipient_;
        emit ParamsSet();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ================================================================ maker

    function registerSigner(address signer, bool allowed) external {
        if (signer == address(0)) revert ZeroAddress();
        isSigner[msg.sender][signer] = allowed;
        emit SignerRegistered(msg.sender, signer, allowed);
    }

    function cancelNonce(uint64 bucket, uint128 nonce) external {
        _useNonce(msg.sender, bucket, nonce);
        emit NonceCancelled(msg.sender, bucket, nonce);
    }

    // ================================================================ open

    function openForward(ForwardQuote calldata q, bytes calldata makerSig)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 id)
    {
        address feed = _validateQuote(q);
        _verifyMakerSig(hashQuote(q), q.maker, makerSig);
        _useNonce(q.maker, q.nonceBucket, q.nonce);
        id = _open(q, feed);
    }

    function _validateQuote(ForwardQuote calldata q) private view returns (address feed) {
        if (msg.sender != q.taker) revert NotTaker();
        if (block.timestamp > q.expiry) revert QuoteExpired();
        if (q.maker == q.taker) revert SameParty();
        Underlying memory u = underlying[q.stockToken];
        if (!u.active) revert UnderlyingNotActive();
        if (q.qty == 0 || q.strike == 0) revert InvalidTerms();
        if (q.feeBps != openFeeBps) revert FeeMismatch();
        if (q.imBps < u.minImBps || q.imBps > BPS || q.mmBps == 0 || q.mmBps >= q.imBps) revert InvalidTerms();
        if (!CALENDAR.isOfficialClose(q.maturityCloseTs)) revert NotOfficialClose();
        if (q.maturityCloseTs < block.timestamp + minTenor || q.maturityCloseTs > block.timestamp + maxTenor) {
            revert TenorOutOfRange();
        }
        uint256 n = _notional(q.qty, q.strike);
        if (n < minNotional || n > maxNotional) revert NotionalOutOfRange();
        return u.feed;
    }

    function _open(ForwardQuote calldata q, address feed) private returns (uint256 id) {
        uint256 n = _notional(q.qty, q.strike);
        uint256 im = (n * q.imBps) / BPS;
        uint256 fee = (n * q.feeBps) / BPS;

        VAULT.lock(q.taker, im);
        if (fee != 0) VAULT.charge(q.taker, feeRecipient, fee);
        VAULT.lock(q.maker, im);

        id = nextId++;
        Position storage p = _pos[id];
        p.maker = q.maker;
        p.taker = q.taker;
        p.stockToken = q.stockToken;
        p.feed = feed;
        p.side = q.side;
        p.qty = q.qty;
        p.strike = q.strike;
        p.maturityCloseTs = q.maturityCloseTs;
        p.makerMargin = im;
        p.takerMargin = im;
        p.mmBps = q.mmBps;
        p.status = Status.Open;

        emit ForwardOpened(id, q.rfqId, q.maker, q.taker, q.stockToken, q.side, q.qty, q.strike, q.maturityCloseTs, im, im);
    }

    // ================================================================ margin

    /// @notice Add margin to a position from the caller's free vault balance. Maker or taker only.
    function topUp(uint256 id, uint256 amount) external nonReentrant {
        Position storage p = _openPos(id);
        if (msg.sender != p.maker && msg.sender != p.taker) revert NotParty();
        VAULT.lock(msg.sender, amount);
        if (msg.sender == p.maker) p.makerMargin += amount;
        else p.takerMargin += amount;
        emit MarginToppedUp(id, msg.sender, amount);

        if (p.callDeadline != 0 && _underParty(p, _markPrice(p)) == address(0)) {
            p.callDeadline = 0;
            p.callParty = address(0);
            emit MarginCallCleared(id);
        }
    }

    /// @notice Start the top-up window for an undercollateralised side. Anyone can call it, only while the price is live.
    function flagMarginCall(uint256 id) external nonReentrant {
        Position storage p = _openPos(id);
        (uint256 price, bool live) = ORACLE.referencePrice(p.feed);
        if (!live) revert PriceNotLive();
        address party = _underParty(p, price);
        if (party == address(0)) revert NotLiquidatable();
        if (p.callDeadline != 0) return;
        p.callDeadline = uint64(block.timestamp) + topUpWindow;
        p.callParty = party;
        (uint256 eq, uint256 req) = _equityAndRequired(p, party, price);
        emit MarginCall(id, party, eq, req, p.callDeadline);
    }

    /// @notice Liquidate after the top-up window, only if still undercollateralised and the price is live.
    function liquidate(uint256 id) external nonReentrant {
        Position storage p = _openPos(id);
        if (p.callDeadline == 0) revert NoMarginCall();
        if (block.timestamp <= p.callDeadline) revert TopUpWindowOpen();
        if (_tokenOraclePaused(p.stockToken)) revert OraclePausedByToken();
        (uint256 price, bool live) = ORACLE.referencePrice(p.feed);
        if (!live) revert PriceNotLive();
        address party = _underParty(p, price);
        if (party == address(0)) revert NotLiquidatable();
        _closeAt(id, p, price, Status.Liquidated, party);
    }

    // ================================================================ settle

    /// @notice Settle at maturity using the pinned official close price. Deferred (not reverted) if no valid price yet.
    function settle(uint256 id) external nonReentrant {
        Position storage p = _openPos(id);
        if (_tokenOraclePaused(p.stockToken)) {
            emit ObservationDeferred(id, p.maturityCloseTs);
            return;
        }
        (uint256 price, bool ok) = ORACLE.observe(p.feed, p.maturityCloseTs); // reverts before close + grace
        if (!ok) {
            emit ObservationDeferred(id, p.maturityCloseTs);
            return;
        }
        _closeAt(id, p, price, Status.Settled, address(0));
    }

    /// @notice If a holiday was declared on `maturityCloseTs` after this position opened, shift it to the next
    ///         official close so `settle` is not stuck forever observing a day the market never traded.
    ///         Brief 7.5: capped at 8 calendar days, mirroring Note Systems' following-business-day rule.
    function rollMaturity(uint256 id) external nonReentrant {
        Position storage p = _openPos(id);
        if (CALENDAR.isOfficialClose(p.maturityCloseTs)) revert StillOfficialClose();
        uint64 oldTs = p.maturityCloseTs;
        uint64 newTs = CALENDAR.nextClose(oldTs);
        if (newTs > oldTs + MAX_ROLL_DAYS) revert RollTooFar();
        p.maturityCloseTs = newTs;
        emit MaturityRolled(id, oldTs, newTs);
    }

    /// @notice Early unwind by agreement at `price`. Needs both parties' signatures. Anyone may submit.
    function closeByMutual(uint256 id, uint256 price, bytes calldata makerSig, bytes calldata takerSig)
        external
        nonReentrant
    {
        Position storage p = _openPos(id);
        if (price == 0) revert InvalidTerms();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLOSE_TYPEHASH, id, price)));
        _verifyMakerSig(digest, p.maker, makerSig);
        if (!SignatureChecker.isValidSignatureNow(p.taker, digest, takerSig)) revert InvalidSignature();
        _closeAt(id, p, price, Status.Closed, address(0));
    }

    // ================================================================ views

    function getPosition(uint256 id) external view returns (Position memory) {
        return _pos[id];
    }

    function markToMarket(uint256 id)
        external
        view
        returns (int256 pnlTaker, uint256 equityTaker, uint256 equityMaker, uint256 price, bool live)
    {
        Position storage p = _pos[id];
        (price, live) = ORACLE.referencePrice(p.feed);
        pnlTaker = _pnl(p, price);
        equityTaker = _equity(p.takerMargin, pnlTaker);
        equityMaker = _equity(p.makerMargin, -pnlTaker);
    }

    function requiredMargin(uint256 id) external view returns (uint256) {
        Position storage p = _pos[id];
        return (_notional(p.qty, p.strike) * p.mmBps) / BPS;
    }

    function hashQuote(ForwardQuote calldata q) public view returns (bytes32) {
        bytes memory a = abi.encode(QUOTE_TYPEHASH, q.maker, q.taker, q.stockToken, uint8(q.side), q.qty, q.strike, q.maturityCloseTs);
        bytes memory b = abi.encode(q.imBps, q.mmBps, q.feeBps, q.expiry, q.nonceBucket, q.nonce, q.rfqId);
        return _hashTypedDataV4(keccak256(bytes.concat(a, b)));
    }

    function hashClose(uint256 id, uint256 price) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLOSE_TYPEHASH, id, price)));
    }

    function isNonceUsed(address maker, uint64 bucket, uint128 nonce) external view returns (bool) {
        // forge-lint: disable-next-line(unsafe-typecast) -- nonce >> 8 always fits in 120 bits
        return _nonceBitmap[maker][bucket][uint120(nonce >> 8)] & (1 << (nonce & 0xff)) != 0;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ================================================================ internal

    function _openPos(uint256 id) private view returns (Position storage p) {
        p = _pos[id];
        if (p.status != Status.Open) revert NotOpen();
    }

    function _notional(uint256 qty, uint256 price) private pure returns (uint256) {
        return (qty * price) / NOTIONAL_DIV;
    }

    /// @dev Taker PnL in USDG at `price`. Long gains when price rises, short when it falls.
    function _pnl(Position storage p, uint256 price) private view returns (int256) {
        // forge-lint: disable-next-line(unsafe-typecast) -- prices are 8-decimal feed answers far below int256 max
        int256 delta = int256(price) - int256(p.strike);
        if (p.side == Side.Short) delta = -delta;
        // forge-lint: disable-next-line(unsafe-typecast) -- qty is bounded by notional limits
        return (delta * int256(p.qty)) / int256(NOTIONAL_DIV);
    }

    function _equity(uint256 margin, int256 pnl) private pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast) -- margin is bounded by USDG supply
        int256 e = int256(margin) + pnl;
        // forge-lint: disable-next-line(unsafe-typecast) -- e > 0 checked in the ternary
        return e > 0 ? uint256(e) : 0;
    }

    function _markPrice(Position storage p) private view returns (uint256 price) {
        (price,) = ORACLE.referencePrice(p.feed);
    }

    function _equityAndRequired(Position storage p, address party, uint256 price)
        private
        view
        returns (uint256 eq, uint256 req)
    {
        int256 pnl = _pnl(p, price);
        eq = party == p.taker ? _equity(p.takerMargin, pnl) : _equity(p.makerMargin, -pnl);
        req = (_notional(p.qty, p.strike) * p.mmBps) / BPS;
    }

    /// @dev Returns the side whose equity is below maintenance at `price`, or address(0). Taker is checked first.
    function _underParty(Position storage p, uint256 price) private view returns (address) {
        (uint256 eqT, uint256 req) = _equityAndRequired(p, p.taker, price);
        if (eqT < req) return p.taker;
        (uint256 eqM,) = _equityAndRequired(p, p.maker, price);
        if (eqM < req) return p.maker;
        return address(0);
    }

    function _closeAt(uint256 id, Position storage p, uint256 price, Status st, address liquidated) private {
        int256 pnlTaker = _pnl(p, price);
        (address winner, address loser, uint256 winnerMargin, uint256 loserLeft) = _applyPnl(p, pnlTaker);

        uint256 penalty;
        if (st == Status.Liquidated) {
            // The liquidated side was below maintenance, so it is the loser here.
            if (liquidated != loser) revert NotLiquidatable();
            (penalty, loserLeft) = _applyPenalty(p, loser, winner, loserLeft);
        }
        if (loserLeft != 0) VAULT.unlock(loser, loserLeft);
        if (winnerMargin != 0) VAULT.unlock(winner, winnerMargin);

        p.status = st;
        p.makerMargin = 0;
        p.takerMargin = 0;
        p.callDeadline = 0;
        p.callParty = address(0);

        if (st == Status.Settled) emit ForwardSettled(id, price, pnlTaker);
        else if (st == Status.Liquidated) emit ForwardLiquidated(id, liquidated, price, pnlTaker, penalty);
        else emit ForwardClosed(id, price, pnlTaker);
    }

    /// @dev Moves the PnL from loser margin to winner, capped at the loser's posted margin.
    function _applyPnl(Position storage p, int256 pnlTaker)
        private
        returns (address winner, address loser, uint256 winnerMargin, uint256 loserLeft)
    {
        bool takerWins = pnlTaker >= 0;
        winner = takerWins ? p.taker : p.maker;
        loser = takerWins ? p.maker : p.taker;
        winnerMargin = takerWins ? p.takerMargin : p.makerMargin;
        uint256 loserMargin = takerWins ? p.makerMargin : p.takerMargin;
        // forge-lint: disable-next-line(unsafe-typecast) -- absolute value of a bounded pnl
        uint256 gain = uint256(takerWins ? pnlTaker : -pnlTaker);
        uint256 owed = gain < loserMargin ? gain : loserMargin;
        if (owed != 0) VAULT.seize(loser, winner, owed);
        loserLeft = loserMargin - owed;
    }

    /// @dev Liquidation penalty from the loser's remaining margin: most to the winner, a share to the protocol.
    function _applyPenalty(Position storage p, address loser, address winner, uint256 loserLeft)
        private
        returns (uint256 penalty, uint256 left)
    {
        penalty = (_notional(p.qty, p.strike) * liquidationPenaltyBps) / BPS;
        if (penalty > loserLeft) penalty = loserLeft;
        uint256 protocolCut = (penalty * penaltyProtocolShareBps) / BPS;
        if (penalty - protocolCut != 0) VAULT.seize(loser, winner, penalty - protocolCut);
        if (protocolCut != 0) VAULT.seize(loser, feeRecipient, protocolCut);
        left = loserLeft - penalty;
    }

    function _tokenOraclePaused(address token) private view returns (bool) {
        try IStockToken(token).oraclePaused() returns (bool paused_) {
            return paused_;
        } catch {
            return false; // token without the hook (mocks)
        }
    }

    function _useNonce(address maker, uint64 bucket, uint128 nonce) private {
        uint256 bit = 1 << (nonce & 0xff);
        // forge-lint: disable-next-line(unsafe-typecast) -- nonce >> 8 always fits in 120 bits
        uint120 idx = uint120(nonce >> 8);
        uint256 word = _nonceBitmap[maker][bucket][idx];
        if (word & bit != 0) revert NonceAlreadyUsed();
        _nonceBitmap[maker][bucket][idx] = word | bit;
    }

    function _verifyMakerSig(bytes32 digest, address maker, bytes calldata sig) private view {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err == ECDSA.RecoverError.NoError && recovered != address(0)) {
            if (recovered == maker || isSigner[maker][recovered]) return;
        }
        if (maker.code.length != 0 && SignatureChecker.isValidSignatureNow(maker, digest, sig)) return;
        revert InvalidSignature();
    }
}
