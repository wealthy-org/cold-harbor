// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FaucetToken} from "../../src/mocks/FaucetToken.sol";

/// @dev Stock token with the `oraclePaused()` hook that real Robinhood stock tokens expose during corporate actions.
contract MockStockToken is FaucetToken {
    bool public oraclePaused;

    constructor() FaucetToken("Mock Stock", "MSTK", 18) {}

    function setOraclePaused(bool v) external {
        oraclePaused = v;
    }
}
