// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title TestnetFeed
/// @notice TESTNET ONLY, NOT AN ORACLE. Chainlink-shaped price feed that ANY address can push to, because
///         Robinhood Chain testnet has no Chainlink feeds. A pusher can choose the round timestamp (never in
///         the future, never before the previous round) so a close price can be recorded for a past close.
///         The only protection is a cap on the move per push. Never deploy on mainnet.
contract TestnetFeed {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    uint8 public constant decimals = 8;
    uint256 public immutable MAX_MOVE_BPS;
    string public description;
    Round[] private _rounds;

    event Pushed(uint80 indexed roundId, int256 answer, uint256 updatedAt, address indexed by);

    error BadPrice();
    error BadTimestamp();
    error MoveTooLarge();

    constructor(string memory description_, uint256 maxMoveBps) {
        description = description_;
        MAX_MOVE_BPS = maxMoveBps;
    }

    function push(uint256 price) external {
        _push(price, block.timestamp);
    }

    function pushAt(uint256 price, uint256 ts) external {
        _push(price, ts);
    }

    function _push(uint256 price, uint256 ts) private {
        if (price == 0 || price > uint256(uint128(type(int128).max))) revert BadPrice();
        uint256 n = _rounds.length;
        if (n != 0) {
            Round memory last = _rounds[n - 1];
            if (ts < last.updatedAt) revert BadTimestamp();
            uint256 prev = uint256(last.answer);
            uint256 diff = price > prev ? price - prev : prev - price;
            if (diff * 10_000 > prev * MAX_MOVE_BPS) revert MoveTooLarge();
        }
        if (ts > block.timestamp) revert BadTimestamp();
        // forge-lint: disable-next-line(unsafe-typecast) -- price bounded above
        _rounds.push(Round(int256(price), ts));
        // forge-lint: disable-next-line(unsafe-typecast) -- round count is tiny
        emit Pushed(uint80(n + 1), int256(price), ts, msg.sender);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        uint256 n = _rounds.length;
        require(n != 0, "no data");
        Round memory r = _rounds[n - 1];
        // forge-lint: disable-next-line(unsafe-typecast)
        return (uint80(n), r.answer, r.updatedAt, r.updatedAt, uint80(n));
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(id >= 1 && id <= _rounds.length, "no round");
        Round memory r = _rounds[id - 1];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}
