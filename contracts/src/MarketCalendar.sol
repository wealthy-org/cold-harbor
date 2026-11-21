// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MarketCalendar
/// @notice Official US equity market closes, computed on chain. Regular close is 16:00 New York:
///         20:00 UTC during US daylight saving time (second Sunday of March to first Sunday of November),
///         21:00 UTC otherwise. Business days are Monday to Friday minus holidays set by the owner.
///         Early closes (for example 13:00 New York) are set per day by the owner.
/// @dev Day index = unix timestamp / 86400 (UTC day). The regular close always falls on the same UTC day
///      as the New York date, so the day index identifies the trading day.
///      Spec: dev brief section 7.5, modelled on Note Systems' MarketCalendar.
contract MarketCalendar is Ownable2Step {
    uint256 private constant MAX_SCAN_DAYS = 15;

    mapping(uint256 dayIndex => bool) public isHoliday;
    mapping(uint256 dayIndex => uint64) public earlyClose; // 0 = regular close

    event HolidaySet(uint256 indexed dayIndex, bool holiday);
    event EarlyCloseSet(uint256 indexed dayIndex, uint64 closeTs);

    error NoCloseFound();
    error InvalidEarlyClose();

    constructor(address owner_) Ownable(owner_) {}

    // ------------------------------------------------------------ admin

    function setHoliday(uint256 dayIndex, bool holiday) external onlyOwner {
        isHoliday[dayIndex] = holiday;
        emit HolidaySet(dayIndex, holiday);
    }

    /// @param closeTs the early close timestamp, or 0 to clear. Must be on `dayIndex` and before the regular close.
    function setEarlyClose(uint256 dayIndex, uint64 closeTs) external onlyOwner {
        if (closeTs != 0) {
            if (closeTs / 86400 != dayIndex || closeTs >= regularCloseOf(dayIndex)) revert InvalidEarlyClose();
            if (closeTs <= dayIndex * 86400) revert InvalidEarlyClose();
        }
        earlyClose[dayIndex] = closeTs;
        emit EarlyCloseSet(dayIndex, closeTs);
    }

    // ------------------------------------------------------------ views

    function isBusinessDay(uint256 dayIndex) public view returns (bool) {
        return _weekday(dayIndex) < 5 && !isHoliday[dayIndex];
    }

    function regularCloseOf(uint256 dayIndex) public pure returns (uint64) {
        // The hour literal must be widened first: `(cond ? 20 : 21) * 3600` is typed uint16 and overflows at 75600.
        uint256 closeHourUtc = isDst(dayIndex) ? 20 : 21;
        return uint64(dayIndex * 86400 + closeHourUtc * 3600);
    }

    function closeOf(uint256 dayIndex) public view returns (uint64) {
        uint64 e = earlyClose[dayIndex];
        return e != 0 ? e : regularCloseOf(dayIndex);
    }

    /// @notice True if `ts` is exactly the official close of a trading day.
    function isOfficialClose(uint64 ts) external view returns (bool) {
        uint256 d = ts / 86400;
        return isBusinessDay(d) && closeOf(d) == ts;
    }

    /// @notice First official close strictly after `ts`.
    function nextClose(uint64 ts) external view returns (uint64) {
        uint256 d = ts / 86400;
        for (uint256 i = 0; i < MAX_SCAN_DAYS; i++) {
            if (isBusinessDay(d + i)) {
                uint64 c = closeOf(d + i);
                if (c > ts) return c;
            }
        }
        revert NoCloseFound();
    }

    /// @notice Latest official close at or before `ts`.
    function lastCloseAtOrBefore(uint64 ts) external view returns (uint64) {
        uint256 d = ts / 86400;
        for (uint256 i = 0; i < MAX_SCAN_DAYS && i <= d; i++) {
            if (isBusinessDay(d - i)) {
                uint64 c = closeOf(d - i);
                if (c <= ts) return c;
            }
        }
        revert NoCloseFound();
    }

    /// @notice US daylight saving time in effect on the New York date of `dayIndex`.
    function isDst(uint256 dayIndex) public pure returns (bool) {
        (uint256 y, uint256 m,) = _civil(dayIndex);
        if (m < 3 || m > 11) return false;
        if (m > 3 && m < 11) return true;
        if (m == 3) return dayIndex >= _nthSunday(y, 3, 2);
        return dayIndex < _nthSunday(y, 11, 1);
    }

    // ------------------------------------------------------------ date math

    /// @dev Monday = 0 ... Sunday = 6. 1970-01-01 (day 0) was a Thursday.
    function _weekday(uint256 dayIndex) private pure returns (uint256) {
        return (dayIndex + 3) % 7;
    }

    /// @dev Day index of the nth Sunday (1-based) of month `m` in year `y`.
    function _nthSunday(uint256 y, uint256 m, uint256 n) private pure returns (uint256) {
        uint256 first = _daysFromCivil(y, m, 1);
        uint256 wd = _weekday(first);
        return first + ((6 + 7 - wd) % 7) + 7 * (n - 1);
    }

    /// @dev Howard Hinnant's days_from_civil for dates after 1970.
    function _daysFromCivil(uint256 y, uint256 m, uint256 d) private pure returns (uint256) {
        if (m <= 2) y -= 1;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    /// @dev Howard Hinnant's civil_from_days for dates after 1970.
    function _civil(uint256 dayIndex) private pure returns (uint256 y, uint256 m, uint256 d) {
        uint256 z = dayIndex + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        d = doy - (153 * mp + 2) / 5 + 1;
        m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
    }
}
