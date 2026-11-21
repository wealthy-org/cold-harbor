// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Chainlink-style feed with a round history. Round ids start at 1.
contract MockAggregator {
    struct R {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
    }

    R[] public rounds;
    uint8 private _dec = 8;

    function setDecimals(uint8 d) external {
        _dec = d;
    }

    function decimals() external view returns (uint8) {
        return _dec;
    }

    function push(int256 answer, uint256 updatedAt) external {
        rounds.push(R(answer, updatedAt, updatedAt));
    }

    /// @dev For sequencer-uptime style feeds: answer 0 = up, startedAt = when the status began.
    function pushWithStart(int256 answer, uint256 startedAt, uint256 updatedAt) external {
        rounds.push(R(answer, startedAt, updatedAt));
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(rounds.length != 0, "no data");
        R memory r = rounds[rounds.length - 1];
        // forge-lint: disable-next-line(unsafe-typecast)
        return (uint80(rounds.length), r.answer, r.startedAt, r.updatedAt, uint80(rounds.length));
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(id >= 1 && id <= rounds.length, "no round");
        R memory r = rounds[id - 1];
        return (id, r.answer, r.startedAt, r.updatedAt, id);
    }
}
