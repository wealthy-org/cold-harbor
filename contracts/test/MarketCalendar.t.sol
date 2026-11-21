// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";

contract MarketCalendarTest is Test {
    MarketCalendar cal;
    address owner = makeAddr("owner");

    // Reference values computed independently with Python (datetime, UTC).
    uint256 constant D_2026_03_07 = 20519; // Saturday
    uint256 constant D_2026_03_08 = 20520; // Sunday, second Sunday of March: DST starts
    uint256 constant D_2026_10_30 = 20756; // Friday, still DST
    uint256 constant D_2026_10_31 = 20757;
    uint256 constant D_2026_11_01 = 20758; // Sunday, first Sunday of November: DST ends
    uint256 constant D_2026_11_20 = 20777; // Friday
    uint256 constant D_2026_11_23 = 20780; // Monday
    uint256 constant D_2026_11_26 = 20783; // Thursday (US Thanksgiving)
    uint256 constant D_2026_11_27 = 20784; // Friday (day after, early close)

    uint64 constant CLOSE_STD_FRI_NOV20 = 1795208400; // 21:00 UTC
    uint64 constant CLOSE_DST_FRI_OCT30 = 1793390400; // 20:00 UTC
    uint64 constant CLOSE_DST_MON_MAR09 = 1773086400; // 20:00 UTC
    uint64 constant CLOSE_STD_FRI_MAR06 = 1772830800; // 21:00 UTC
    uint64 constant CLOSE_THU_NOV26 = 1795726800;
    uint64 constant EARLY_FRI_NOV27 = 1795802400; // 18:00 UTC = 13:00 New York (EST)
    uint64 constant CLOSE_FRI_NOV27 = 1795813200;

    function setUp() public {
        cal = new MarketCalendar(owner);
    }

    function test_dst_boundaries() public view {
        assertFalse(cal.isDst(D_2026_03_07));
        assertTrue(cal.isDst(D_2026_03_08), "second Sunday of March");
        assertTrue(cal.isDst(D_2026_10_30));
        assertTrue(cal.isDst(D_2026_10_31));
        assertFalse(cal.isDst(D_2026_11_01), "first Sunday of November");
        assertFalse(cal.isDst(D_2026_11_20));
    }

    function test_dst_midSummerAndWinter() public view {
        assertTrue(cal.isDst(20620)); // mid June 2026
        assertFalse(cal.isDst(20454)); // early January 2026
    }

    function test_regularClose_utcHours() public view {
        assertEq(cal.regularCloseOf(D_2026_10_30), CLOSE_DST_FRI_OCT30);
        assertEq(cal.regularCloseOf(D_2026_11_20), CLOSE_STD_FRI_NOV20);
        assertEq(uint256(cal.regularCloseOf(D_2026_11_20)) % 86400, 21 hours);
        assertEq(uint256(cal.regularCloseOf(D_2026_10_30)) % 86400, 20 hours);
    }

    function test_isOfficialClose_basic() public view {
        assertTrue(cal.isOfficialClose(CLOSE_STD_FRI_NOV20));
        assertFalse(cal.isOfficialClose(CLOSE_STD_FRI_NOV20 + 1));
        assertFalse(cal.isOfficialClose(CLOSE_STD_FRI_NOV20 - 3600), "20:00 UTC is not the winter close");
        assertTrue(cal.isOfficialClose(CLOSE_DST_FRI_OCT30));
        assertFalse(cal.isOfficialClose(CLOSE_DST_FRI_OCT30 + 3600), "21:00 UTC is not the summer close");
    }

    function test_closeShiftsAroundDstStart() public view {
        assertTrue(cal.isOfficialClose(CLOSE_STD_FRI_MAR06));
        assertTrue(cal.isOfficialClose(CLOSE_DST_MON_MAR09));
    }

    function test_weekendHasNoClose() public view {
        uint64 sat = uint64((D_2026_11_20 + 1) * 86400 + 21 hours);
        uint64 sun = uint64((D_2026_11_20 + 2) * 86400 + 21 hours);
        assertFalse(cal.isOfficialClose(sat));
        assertFalse(cal.isOfficialClose(sun));
    }

    function test_holiday() public {
        assertTrue(cal.isOfficialClose(CLOSE_THU_NOV26));
        vm.prank(owner);
        cal.setHoliday(D_2026_11_26, true);
        assertFalse(cal.isOfficialClose(CLOSE_THU_NOV26));
        assertFalse(cal.isBusinessDay(D_2026_11_26));
        vm.prank(owner);
        cal.setHoliday(D_2026_11_26, false);
        assertTrue(cal.isOfficialClose(CLOSE_THU_NOV26));
    }

    function test_earlyClose() public {
        vm.prank(owner);
        cal.setEarlyClose(D_2026_11_27, EARLY_FRI_NOV27);
        assertTrue(cal.isOfficialClose(EARLY_FRI_NOV27));
        assertFalse(cal.isOfficialClose(CLOSE_FRI_NOV27), "regular close no longer official");
        vm.prank(owner);
        cal.setEarlyClose(D_2026_11_27, 0);
        assertTrue(cal.isOfficialClose(CLOSE_FRI_NOV27));
    }

    function test_earlyClose_validation() public {
        vm.startPrank(owner);
        vm.expectRevert(MarketCalendar.InvalidEarlyClose.selector);
        cal.setEarlyClose(D_2026_11_27, CLOSE_FRI_NOV27); // not before the regular close
        vm.expectRevert(MarketCalendar.InvalidEarlyClose.selector);
        cal.setEarlyClose(D_2026_11_27, CLOSE_THU_NOV26); // wrong day
        vm.expectRevert(MarketCalendar.InvalidEarlyClose.selector);
        cal.setEarlyClose(D_2026_11_27, uint64(D_2026_11_27 * 86400)); // exactly midnight
        vm.stopPrank();
    }

    function test_nextClose_skipsWeekend() public view {
        assertEq(cal.nextClose(CLOSE_STD_FRI_NOV20), cal.regularCloseOf(D_2026_11_23));
        assertEq(cal.nextClose(CLOSE_STD_FRI_NOV20 - 1), CLOSE_STD_FRI_NOV20);
    }

    function test_nextClose_skipsHoliday() public {
        vm.prank(owner);
        cal.setHoliday(D_2026_11_26, true);
        uint64 wedClose = cal.regularCloseOf(D_2026_11_26 - 1);
        assertEq(cal.nextClose(wedClose), CLOSE_FRI_NOV27, "Thursday holiday skipped");
    }

    function test_lastCloseAtOrBefore() public view {
        uint64 sunday = uint64((D_2026_11_20 + 2) * 86400 + 12 hours);
        assertEq(cal.lastCloseAtOrBefore(sunday), CLOSE_STD_FRI_NOV20);
        assertEq(cal.lastCloseAtOrBefore(CLOSE_STD_FRI_NOV20), CLOSE_STD_FRI_NOV20, "inclusive");
        assertEq(cal.lastCloseAtOrBefore(CLOSE_STD_FRI_NOV20 - 1), cal.regularCloseOf(D_2026_11_20 - 1));
    }

    function test_onlyOwnerAdmin() public {
        vm.expectRevert();
        cal.setHoliday(1, true);
        vm.expectRevert();
        cal.setEarlyClose(D_2026_11_27, EARLY_FRI_NOV27);
    }

    /// Every business day's close is on that day and is exactly 20:00 or 21:00 UTC. Never inside the same hour twice.
    function testFuzz_closeIsOnItsOwnDay(uint256 day) public view {
        day = bound(day, 18000, 25000); // roughly 2019 to 2038
        uint64 c = cal.regularCloseOf(day);
        assertEq(uint256(c) / 86400, day);
        uint256 h = (uint256(c) % 86400) / 3600;
        assertTrue(h == 20 || h == 21);
        assertEq(cal.isDst(day), h == 20);
    }

    /// US DST always lasts 238 or 245 days... but more simply: it covers every day from mid April to mid October.
    function testFuzz_summerAlwaysDst(uint256 year) public view {
        year = bound(year, 2020, 2040);
        (bool ok, uint256 apr15) = _dayOf(year, 4, 15);
        (bool ok2, uint256 oct15) = _dayOf(year, 10, 15);
        assertTrue(ok && ok2);
        assertTrue(cal.isDst(apr15));
        assertTrue(cal.isDst(oct15));
    }

    function _dayOf(uint256 y, uint256 m, uint256 d) private pure returns (bool, uint256) {
        // Hinnant days_from_civil, duplicated here so the test does not depend on the contract's helper.
        if (m <= 2) y -= 1;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return (true, era * 146097 + doe - 719468);
    }
}
