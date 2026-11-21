// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal Permit2 SignatureTransfer interface (Uniswap's canonical deployment, same address on
///      every EVM chain including Robinhood Chain). Lets a taker skip a separate `approve` transaction.
interface ISignatureTransfer {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// @title ColdHarborSettlement
/// @notice Atomic settlement of market-maker-signed RFQ quotes between a tokenized stock and USDG.
/// @dev Non-custodial: the contract never holds user funds between calls. Every fill is one transaction
///      that either moves all assets or reverts. Pattern: 0x OtcOrder / Bebop style signed maker orders.
///
///      Fee model (taker pays, maker is fee-neutral so makers can quote their exact price):
///        - taker BUYS stock  (takerToken == USDG): taker sends takerAmount to maker plus `fee` to the fee recipient.
///        - taker SELLS stock (makerToken == USDG): maker sends makerAmount, of which `fee` goes to the fee
///          recipient and the rest to the taker.
///      where fee = usdgAmount * feeBps / 10_000 and feeBps must equal the protocol fee at fill time.
contract ColdHarborSettlement is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Quote {
        address maker; // maker account (signer may be the maker or a registered hot signer)
        address taker; // must equal msg.sender (private quote)
        address makerToken; // token the maker sends
        address takerToken; // token the taker sends
        uint256 makerAmount;
        uint256 takerAmount;
        uint64 expiry; // unix seconds, inclusive
        uint64 nonceBucket;
        uint128 nonce; // replay protection, see `isNonceUsed`
        uint16 feeBps; // protocol fee the maker signed for; must equal `feeBps` at fill time
        bytes32 rfqId; // off-chain RFQ id
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address maker,address taker,address makerToken,address takerToken,uint256 makerAmount,uint256 takerAmount,uint64 expiry,uint64 nonceBucket,uint128 nonce,uint16 feeBps,bytes32 rfqId)"
    );

    uint16 public constant MAX_FEE_BPS = 100; // hard cap: 1%
    uint256 private constant BPS = 10_000;

    /// @notice The quote currency. Exactly one side of every quote must be USDG.
    address public immutable USDG;
    /// @notice Canonical Permit2 (same address on every chain, including Robinhood Chain). Lets a taker
    ///         sign instead of calling `approve` before `fillQuoteWithPermit2`.
    ISignatureTransfer public immutable PERMIT2;

    uint16 public feeBps;
    address public feeRecipient;

    /// @dev Universe allowlist: official stock tokens (USDG is always allowed on its own side).
    mapping(address token => bool) public tokenAllowed;
    /// @dev maker => hot signer => allowed.
    mapping(address maker => mapping(address signer => bool)) public isSigner;
    /// @dev maker => bucket => word (nonce >> 8) => bitmap (nonce & 0xff).
    mapping(address maker => mapping(uint64 bucket => mapping(uint120 word => uint256))) private _nonceBitmap;

    event QuoteFilled(
        bytes32 indexed rfqId,
        address indexed maker,
        address indexed taker,
        address makerToken,
        address takerToken,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 fee
    );
    event NonceCancelled(address indexed maker, uint64 bucket, uint128 nonce);
    event SignerRegistered(address indexed maker, address signer, bool allowed);
    event TokenAllowedSet(address indexed token, bool allowed);
    event FeeRecipientSet(address indexed recipient);
    event FeeBpsSet(uint16 feeBps);

    error QuoteExpired();
    error NotTaker();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error TokenNotAllowed(address token);
    error NotUsdgPair();
    error ZeroAmount();
    error SameParty();
    error FeeMismatch();
    error FeeTooHigh();
    error ZeroAddress();
    error InvalidPermit2Amount();

    constructor(address usdg, address feeRecipient_, uint16 feeBps_, address owner_, address permit2_)
        EIP712("Cold Harbor", "1")
        Ownable(owner_)
    {
        if (usdg == address(0) || feeRecipient_ == address(0) || permit2_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        USDG = usdg;
        PERMIT2 = ISignatureTransfer(permit2_);
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        emit FeeRecipientSet(feeRecipient_);
        emit FeeBpsSet(feeBps_);
    }

    // ---------------------------------------------------------------- taker

    /// @notice Fill a maker-signed quote. Caller must be `q.taker` and must have approved the contract.
    function fillQuote(Quote calldata q, bytes calldata makerSig) external nonReentrant whenNotPaused {
        bool takerBuysStock = _validate(q);
        _verifyMakerSig(q, makerSig);
        _useNonce(q.maker, q.nonceBucket, q.nonce); // effects before interactions
        uint256 fee = _settle(q, takerBuysStock);
        emit QuoteFilled(q.rfqId, q.maker, q.taker, q.makerToken, q.takerToken, q.makerAmount, q.takerAmount, fee);
    }

    /// @notice Same as `fillQuote`, but the taker's leg is pulled via a Permit2 signature instead of a
    ///         prior `approve` transaction. `p.permitted` must match the taker's token and full outlay
    ///         (takerAmount, plus the fee on top when the taker is buying stock).
    function fillQuoteWithPermit2(
        Quote calldata q,
        bytes calldata makerSig,
        ISignatureTransfer.PermitTransferFrom calldata p,
        bytes calldata takerSig
    ) external nonReentrant whenNotPaused {
        bool takerBuysStock = _validate(q);
        _verifyMakerSig(q, makerSig);
        _useNonce(q.maker, q.nonceBucket, q.nonce); // effects before interactions

        uint256 fee = ((takerBuysStock ? q.takerAmount : q.makerAmount) * feeBps) / BPS;
        uint256 takerOutlay = takerBuysStock ? q.takerAmount + fee : q.takerAmount;
        if (p.permitted.token != q.takerToken || p.permitted.amount != takerOutlay) revert InvalidPermit2Amount();

        PERMIT2.permitTransferFrom(
            p, ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: takerOutlay}), q.taker, takerSig
        );

        if (takerBuysStock) {
            // The taker's full outlay (takerAmount + fee) is already sitting in this contract.
            IERC20(q.takerToken).safeTransfer(q.maker, q.takerAmount);
            if (fee != 0) IERC20(q.takerToken).safeTransfer(feeRecipient, fee);
            IERC20(q.makerToken).safeTransferFrom(q.maker, q.taker, q.makerAmount);
        } else {
            IERC20(q.takerToken).safeTransfer(q.maker, q.takerAmount);
            IERC20(q.makerToken).safeTransferFrom(q.maker, q.taker, q.makerAmount - fee);
            if (fee != 0) IERC20(q.makerToken).safeTransferFrom(q.maker, feeRecipient, fee);
        }

        emit QuoteFilled(q.rfqId, q.maker, q.taker, q.makerToken, q.takerToken, q.makerAmount, q.takerAmount, fee);
    }

    // ---------------------------------------------------------------- maker

    /// @notice Cancel a nonce so a signed quote can no longer be filled. Only the maker can cancel its own.
    function cancelNonce(uint64 bucket, uint128 nonce) external {
        _useNonce(msg.sender, bucket, nonce);
        emit NonceCancelled(msg.sender, bucket, nonce);
    }

    /// @notice Allow or revoke a hot signer that may sign quotes on behalf of msg.sender.
    function registerSigner(address signer, bool allowed) external {
        if (signer == address(0)) revert ZeroAddress();
        isSigner[msg.sender][signer] = allowed;
        emit SignerRegistered(msg.sender, signer, allowed);
    }

    // ---------------------------------------------------------------- admin

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        tokenAllowed[token] = allowed;
        emit TokenAllowedSet(token, allowed);
    }

    function setFeeRecipient(address r) external onlyOwner {
        if (r == address(0)) revert ZeroAddress();
        feeRecipient = r;
        emit FeeRecipientSet(r);
    }

    /// @dev Changing the fee invalidates outstanding quotes (they signed the old `feeBps`).
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeBpsSet(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- views

    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    q.maker,
                    q.taker,
                    q.makerToken,
                    q.takerToken,
                    q.makerAmount,
                    q.takerAmount,
                    q.expiry,
                    q.nonceBucket,
                    q.nonce,
                    q.feeBps,
                    q.rfqId
                )
            )
        );
    }

    function isNonceUsed(address maker, uint64 bucket, uint128 nonce) external view returns (bool) {
        // forge-lint: disable-next-line(unsafe-typecast) -- nonce >> 8 always fits in 120 bits
        return _nonceBitmap[maker][bucket][uint120(nonce >> 8)] & (1 << (nonce & 0xff)) != 0;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------- internal

    function _validate(Quote calldata q) private view returns (bool takerBuysStock) {
        if (msg.sender != q.taker) revert NotTaker();
        if (block.timestamp > q.expiry) revert QuoteExpired();
        if (q.maker == q.taker) revert SameParty();
        if (q.makerAmount == 0 || q.takerAmount == 0) revert ZeroAmount();
        if (q.feeBps != feeBps) revert FeeMismatch();

        takerBuysStock = q.takerToken == USDG;
        if (takerBuysStock == (q.makerToken == USDG)) revert NotUsdgPair(); // both or neither side is USDG
        address stock = takerBuysStock ? q.makerToken : q.takerToken;
        if (!tokenAllowed[stock]) revert TokenNotAllowed(stock);
    }

    function _settle(Quote calldata q, bool takerBuysStock) private returns (uint256 fee) {
        fee = ((takerBuysStock ? q.takerAmount : q.makerAmount) * feeBps) / BPS;
        if (takerBuysStock) {
            // taker pays USDG (+ fee on top), receives stock
            IERC20(q.takerToken).safeTransferFrom(q.taker, q.maker, q.takerAmount);
            if (fee != 0) IERC20(q.takerToken).safeTransferFrom(q.taker, feeRecipient, fee);
            IERC20(q.makerToken).safeTransferFrom(q.maker, q.taker, q.makerAmount);
        } else {
            // taker sells stock, receives USDG minus fee
            IERC20(q.takerToken).safeTransferFrom(q.taker, q.maker, q.takerAmount);
            IERC20(q.makerToken).safeTransferFrom(q.maker, q.taker, q.makerAmount - fee);
            if (fee != 0) IERC20(q.makerToken).safeTransferFrom(q.maker, feeRecipient, fee);
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

    /// @dev Valid if signed by the maker EOA, a signer the maker registered, or (ERC-1271) the maker contract.
    function _verifyMakerSig(Quote calldata q, bytes calldata sig) private view {
        bytes32 digest = hashQuote(q);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err == ECDSA.RecoverError.NoError && recovered != address(0)) {
            if (recovered == q.maker || isSigner[q.maker][recovered]) return;
        }
        if (q.maker.code.length != 0 && SignatureChecker.isValidSignatureNow(q.maker, digest, sig)) return;
        revert InvalidSignature();
    }
}
