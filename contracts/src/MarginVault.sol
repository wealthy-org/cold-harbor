// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMarginVault {
    function lock(address acct, uint256 amount) external;
    function unlock(address acct, uint256 amount) external;
    function seize(address from, address to, uint256 amount) external;
    function charge(address from, address to, uint256 amount) external;
    function freeMargin(address acct) external view returns (uint256);
}

/// @title MarginVault
/// @notice Holds USDG margin for forwards. Users deposit and withdraw FREE margin only. The ForwardEngine
///         (set once by the owner) locks margin into positions and moves it between accounts on settlement.
///         Spec: dev brief section 7.2.
contract MarginVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDG;
    address public engine;

    mapping(address acct => uint256) public balanceOf; // total, including locked
    mapping(address acct => uint256) public lockedOf;

    event Deposited(address indexed acct, uint256 amount);
    event Withdrawn(address indexed acct, uint256 amount);
    event EngineSet(address indexed engine);
    event Locked(address indexed acct, uint256 amount);
    event Unlocked(address indexed acct, uint256 amount);
    event Seized(address indexed from, address indexed to, uint256 amount);

    error NotEngine();
    error EngineAlreadySet();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientFree();
    error InsufficientLocked();

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine();
        _;
    }

    constructor(address usdg, address owner_) Ownable(owner_) {
        if (usdg == address(0)) revert ZeroAddress();
        USDG = IERC20(usdg);
    }

    /// @notice One-time wiring. The engine can never be swapped afterwards, which keeps locked funds safe.
    function setEngine(address engine_) external onlyOwner {
        if (engine != address(0)) revert EngineAlreadySet();
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    // ------------------------------------------------------------ users

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender] += amount;
        USDG.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeMargin(msg.sender)) revert InsufficientFree();
        balanceOf[msg.sender] -= amount;
        USDG.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function freeMargin(address acct) public view returns (uint256) {
        return balanceOf[acct] - lockedOf[acct];
    }

    // ------------------------------------------------------------ engine

    function lock(address acct, uint256 amount) external onlyEngine {
        if (amount > freeMargin(acct)) revert InsufficientFree();
        lockedOf[acct] += amount;
        emit Locked(acct, amount);
    }

    function unlock(address acct, uint256 amount) external onlyEngine {
        if (amount > lockedOf[acct]) revert InsufficientLocked();
        lockedOf[acct] -= amount;
        emit Unlocked(acct, amount);
    }

    /// @notice Move locked margin from `from` to `to`'s free balance (settlement, liquidation penalty).
    function seize(address from, address to, uint256 amount) external onlyEngine {
        if (amount > lockedOf[from]) revert InsufficientLocked();
        lockedOf[from] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Seized(from, to, amount);
    }

    /// @notice Move FREE balance from `from` to `to` (opening fee).
    function charge(address from, address to, uint256 amount) external onlyEngine {
        if (amount > freeMargin(from)) revert InsufficientFree();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Seized(from, to, amount);
    }
}
