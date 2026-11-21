// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @dev Chainlink AggregatorV3-compatible feed. A backup feed (for example a Pyth Pro wrapper) uses the same shape.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @title OracleAdapter
/// @notice Settlement and mark prices for forwards. Spec: dev brief section 7.4 (pattern from Note Systems).
///  - `observe(feed, closeTs)`: price of the last round at or before the official close. Callable only after
///    `closeTs + closeGrace`. Walks back Chainlink rounds, optionally cross-checks a backup feed, and PINS the
///    result so it can never change. If no valid price exists it returns `(0, false)` and anyone may retry.
///  - `referencePrice(feed)`: mark price. Fresh primary, else fresh backup, else last known (`live = false`).
///    The L2 sequencer uptime feed, when set, forces `live = false` while the sequencer is down or recovering.
contract OracleAdapter is Ownable2Step {
    struct Obs {
        uint256 price;
        bool resolved;
    }

    uint256 public constant BPS = 10_000;

    uint64 public closeGrace = 300; // seconds after the close before the price may be read
    uint64 public maxPreCloseLag = 1 days; // a round older than this before the close is rejected
    uint64 public liveMaxAge = 1 hours; // a mark older than this is not "live"
    uint16 public maxRoundWalk = 500;
    uint16 public maxDeviationBps = 100; // primary vs backup tolerance at the close
    address public sequencerFeed; // Chainlink L2 sequencer uptime feed, optional
    uint64 public sequencerGrace = 1 hours;
    uint64 public deferralWindow = 1 days; // how long observe() must keep failing before governance may propose a forced price
    uint64 public forceObserveTimelock = 2 days; // delay between proposing and executing a forced price

    struct ForcedProposal {
        uint256 price;
        uint64 proposedAt;
    }

    mapping(address feed => address backup) public backupOf;
    mapping(address feed => mapping(uint64 closeTs => Obs)) private _pinned;
    mapping(address feed => mapping(uint64 closeTs => ForcedProposal)) private _forced;

    event ObservationPinned(address indexed feed, uint64 indexed closeTs, uint256 price, bool usedBackup);
    event BackupFeedSet(address indexed feed, address backup);
    event ParamsSet();
    event ForceObserveProposed(address indexed feed, uint64 indexed closeTs, uint256 price, uint64 executableAt);
    event ForceObserveCancelled(address indexed feed, uint64 indexed closeTs);
    event ForceObserveExecuted(address indexed feed, uint64 indexed closeTs, uint256 price);

    error TooEarly();
    error BadParam();
    error AlreadyResolved();
    error TooSoonToPropose();
    error NoProposal();
    error TimelockNotElapsed();

    constructor(address owner_) Ownable(owner_) {}

    // ------------------------------------------------------------ admin

    function setBackupFeed(address feed, address backup) external onlyOwner {
        if (backup != address(0) && IAggregatorV3(backup).decimals() != IAggregatorV3(feed).decimals()) revert BadParam();
        backupOf[feed] = backup;
        emit BackupFeedSet(feed, backup);
    }

    function setParams(
        uint64 closeGrace_,
        uint64 maxPreCloseLag_,
        uint64 liveMaxAge_,
        uint16 maxRoundWalk_,
        uint16 maxDeviationBps_,
        address sequencerFeed_,
        uint64 sequencerGrace_
    ) external onlyOwner {
        if (maxRoundWalk_ == 0 || maxRoundWalk_ > 2000 || maxDeviationBps_ > BPS) revert BadParam();
        closeGrace = closeGrace_;
        maxPreCloseLag = maxPreCloseLag_;
        liveMaxAge = liveMaxAge_;
        maxRoundWalk = maxRoundWalk_;
        maxDeviationBps = maxDeviationBps_;
        sequencerFeed = sequencerFeed_;
        sequencerGrace = sequencerGrace_;
        emit ParamsSet();
    }

    function setDeferralParams(uint64 deferralWindow_, uint64 forceObserveTimelock_) external onlyOwner {
        deferralWindow = deferralWindow_;
        forceObserveTimelock = forceObserveTimelock_;
        emit ParamsSet();
    }

    /// @notice Governance last resort when `observe` has failed for `deferralWindow` with no valid price
    ///         (brief 7.4). Starts a timelock; the price cannot take effect until `executeForceObserve`.
    function proposeForceObserve(address feed, uint64 closeTs, uint256 price) external onlyOwner {
        if (price == 0) revert BadParam();
        if (_pinned[feed][closeTs].resolved) revert AlreadyResolved();
        if (block.timestamp < uint256(closeTs) + closeGrace + deferralWindow) revert TooSoonToPropose();
        _forced[feed][closeTs] = ForcedProposal(price, uint64(block.timestamp));
        emit ForceObserveProposed(feed, closeTs, price, uint64(block.timestamp) + forceObserveTimelock);
    }

    function cancelForceObserve(address feed, uint64 closeTs) external onlyOwner {
        delete _forced[feed][closeTs];
        emit ForceObserveCancelled(feed, closeTs);
    }

    /// @notice Pins the proposed price once the timelock has elapsed. A real `observe()` resolving first wins.
    function executeForceObserve(address feed, uint64 closeTs) external onlyOwner {
        Obs storage o = _pinned[feed][closeTs];
        if (o.resolved) revert AlreadyResolved();
        ForcedProposal storage fp = _forced[feed][closeTs];
        if (fp.proposedAt == 0) revert NoProposal();
        if (block.timestamp < uint256(fp.proposedAt) + forceObserveTimelock) revert TimelockNotElapsed();
        o.price = fp.price;
        o.resolved = true;
        delete _forced[feed][closeTs];
        emit ForceObserveExecuted(feed, closeTs, fp.price);
        emit ObservationPinned(feed, closeTs, fp.price, false);
    }

    // ------------------------------------------------------------ settlement price

    function pinned(address feed, uint64 closeTs) external view returns (uint256 price, bool resolved) {
        Obs storage o = _pinned[feed][closeTs];
        return (o.price, o.resolved);
    }

    function observe(address feed, uint64 closeTs) external returns (uint256 price, bool ok) {
        if (block.timestamp < uint256(closeTs) + closeGrace) revert TooEarly();
        Obs storage o = _pinned[feed][closeTs];
        if (o.resolved) return (o.price, true);

        (uint256 p1, bool ok1) = _priceAtClose(feed, closeTs);
        address backup = backupOf[feed];
        (uint256 p2, bool ok2) = backup == address(0) ? (uint256(0), false) : _priceAtClose(backup, closeTs);

        bool usedBackup;
        if (ok1 && ok2) {
            uint256 hi = p1 > p2 ? p1 : p2;
            uint256 lo = p1 > p2 ? p2 : p1;
            if (((hi - lo) * BPS) / lo > maxDeviationBps) return (0, false); // disagree: defer, do not guess
            price = p1;
        } else if (ok1) {
            price = p1;
        } else if (ok2) {
            price = p2;
            usedBackup = true;
        } else {
            return (0, false);
        }
        o.price = price;
        o.resolved = true;
        emit ObservationPinned(feed, closeTs, price, usedBackup);
        return (price, true);
    }

    /// @dev Last round with updatedAt <= closeTs and not older than maxPreCloseLag before it.
    function _priceAtClose(address feed, uint64 closeTs) private view returns (uint256, bool) {
        uint80 roundId;
        try IAggregatorV3(feed).latestRoundData() returns (uint80 r, int256, uint256, uint256, uint80) {
            roundId = r;
        } catch {
            return (0, false); // a broken primary must not block the backup
        }
        for (uint256 i = 0; i < maxRoundWalk; i++) {
            try IAggregatorV3(feed).getRoundData(roundId) returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
                if (updatedAt == 0) return (0, false);
                if (updatedAt <= closeTs) {
                    if (closeTs - updatedAt > maxPreCloseLag || answer <= 0) return (0, false);
                    // forge-lint: disable-next-line(unsafe-typecast) -- answer > 0 checked above
                    return (uint256(answer), true);
                }
            } catch {
                return (0, false);
            }
            if (roundId == 0) return (0, false);
            roundId -= 1;
        }
        return (0, false);
    }

    // ------------------------------------------------------------ mark price

    /// @return price latest usable price (feed decimals)
    /// @return live true if it is fresh and the sequencer is healthy. Liquidation requires `live`.
    function referencePrice(address feed) external view returns (uint256 price, bool live) {
        bool seqOk = _sequencerOk();
        (uint256 p, uint256 age, bool good) = _latest(feed);
        if (good && age <= liveMaxAge) return (p, seqOk);
        address backup = backupOf[feed];
        if (backup != address(0)) {
            (uint256 bp, uint256 bAge, bool bGood) = _latest(backup);
            if (bGood && bAge <= liveMaxAge) return (bp, seqOk);
        }
        return (p, false); // last known
    }

    function _latest(address feed) private view returns (uint256 price, uint256 age, bool good) {
        try IAggregatorV3(feed).latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) return (0, type(uint256).max, false);
            // forge-lint: disable-next-line(unsafe-typecast) -- answer > 0 checked above
            return (uint256(answer), block.timestamp - updatedAt, true);
        } catch {
            return (0, type(uint256).max, false);
        }
    }

    function _sequencerOk() private view returns (bool) {
        address s = sequencerFeed;
        if (s == address(0)) return true;
        try IAggregatorV3(s).latestRoundData() returns (uint80, int256 answer, uint256 startedAt, uint256, uint80) {
            return answer == 0 && block.timestamp >= startedAt + sequencerGrace;
        } catch {
            return false;
        }
    }
}
