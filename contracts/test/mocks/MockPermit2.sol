// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "../../src/ColdHarborSettlement.sol";

/// @notice Minimal stand-in for Uniswap's canonical Permit2 SignatureTransfer, for unit tests only.
///         Mirrors the real contract's behaviour closely enough to exercise our integration: the owner
///         must still `approve` this contract once (same as the real Permit2), then each signed permit
///         authorizes one transfer of up to `permitted.amount`, replay-protected by a nonce bitmap.
contract MockPermit2 is EIP712 {
    bytes32 private constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 private constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    mapping(address owner => mapping(uint256 word => uint256 bitmap)) public nonceBitmap;

    error Expired();
    error NonceAlreadyUsed();
    error AmountExceedsPermit();
    error InvalidSignature();

    constructor() EIP712("Permit2", "1") {}

    function hashPermit(ISignatureTransfer.PermitTransferFrom calldata permit, address spender) external view returns (bytes32) {
        bytes32 tokenPermissionsHash = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount));
        return _hashTypedDataV4(keccak256(abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, tokenPermissionsHash, spender, permit.nonce, permit.deadline)));
    }

    function permitTransferFrom(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external {
        if (block.timestamp > permit.deadline) revert Expired();
        _useNonce(owner, permit.nonce);
        if (transferDetails.requestedAmount > permit.permitted.amount) revert AmountExceedsPermit();

        bytes32 digest = this.hashPermit(permit, msg.sender);
        if (ECDSA.recover(digest, signature) != owner) revert InvalidSignature();

        bool ok = IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
        require(ok, "transferFrom failed");
    }

    function _useNonce(address owner, uint256 nonce) private {
        uint256 word = nonce >> 8;
        uint256 bit = 1 << (nonce & 0xff);
        uint256 bitmap = nonceBitmap[owner][word];
        if (bitmap & bit != 0) revert NonceAlreadyUsed();
        nonceBitmap[owner][word] = bitmap | bit;
    }
}
