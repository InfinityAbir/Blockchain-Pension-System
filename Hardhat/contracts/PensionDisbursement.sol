// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PensionRegistry.sol";

interface IPensionFund {
    function totalContributions(address pensioner) external view returns (uint256);
    function monthlyPaymentsCount(address pensioner) external view returns (uint256);

    // ✅ Monthly payout routes
    function releaseToPRSSPensioner(address payable pensioner, uint256 amount) external;
    function releaseToGPSPensioner(address payable pensioner, uint256 amount) external;

    // ✅ PRSS lump sum payout (deduct from pensioner even if receiver is nominee)
    function releasePRSSLumpSum(address pensioner, address payable receiver, uint256 amount) external;
}

contract PensionDisbursement {
    PensionRegistry public registry;
    IPensionFund public fund;

    uint256 public constant RETIREMENT_AGE = 60;
    uint256 public constant MONTH = 30 days;

    // payout duration = 20 years (240 months)
    uint256 public constant MONTHS_IN_PENSION = 240;

    // =========================
    // BDT -> WEI conversion
    // =========================
    uint256 private constant BDT_PER_ETH = 300000;
    uint256 private constant WEI_PER_ETH = 1e18;

    function _bdtToWei(uint256 bdt) internal pure returns (uint256) {
        return (bdt * WEI_PER_ETH) / BDT_PER_ETH;
    }

    enum PensionMode {
        NotChosen,
        Monthly,
        LumpSum,
        GratuityTaken // ⚠ kept for backward compatibility (but NOT used anymore for locking)
    }

    struct PensionState {
        bool started;
        uint256 monthlyAmount; // in WEI
        uint256 lastWithdrawal;
        uint256 startedAt;
    }

    mapping(address => PensionState) public pensions;
    mapping(address => PensionMode) public pensionMode;
    mapping(address => bool) public lumpSumWithdrawn;

    // GPS gratuity claimed tracking
    mapping(address => bool) public gpsGratuityClaimed;

    // =========================================================
    // ✅ nominee limited-month pension tracking
    // =========================================================
    mapping(address => uint256) public nomineeMonthlyWithdrawCount;
    // key = pensioner wallet, value = how many months nominee already withdrew

    event PensionStarted(address indexed pensioner, uint256 monthlyAmount, uint256 startedAt);
    event PensionModeChosen(address indexed pensioner, PensionMode mode);

    event MonthlyPensionWithdrawn(address indexed pensioner, uint256 amount, uint256 timestamp);
    event MonthlyNomineePensionWithdrawn(
        address indexed pensioner,
        address indexed nominee,
        uint256 amount,
        uint256 timestamp
    );

    event FullPensionWithdrawn(address indexed pensioner, uint256 amount, uint256 timestamp);
    event FullNomineePensionWithdrawn(
        address indexed pensioner,
        address indexed nominee,
        uint256 amount,
        uint256 timestamp
    );

    event GPSGratuityPaid(address indexed pensioner, uint256 amountWei, uint256 timestamp);

    // ✅ NEW: nominee gratuity payout event
    event GPSGratuityPaidToNominee(
        address indexed pensioner,
        address indexed nominee,
        uint256 amountWei,
        uint256 timestamp
    );

    event NomineeFamilyPensionMonthUsed(
        address indexed pensioner,
        address indexed nominee,
        uint256 usedMonths,
        uint256 maxMonths,
        uint256 timestamp
    );

    constructor(address registryAddress, address fundAddress) {
        require(registryAddress != address(0), "Invalid registry");
        require(fundAddress != address(0), "Invalid fund");

        registry = PensionRegistry(registryAddress);
        fund = IPensionFund(fundAddress);
    }

    /* =========================================================
        ✅ ACCOUNT STATUS CHECK (ACTIVE ONLY)
        0 = ACTIVE (based on your Registry AccountStatus enum)
    ========================================================= */
    modifier onlyActiveAccount(address user) {
        require(registry.getAccountStatus(user) == 0, "Account not active");
        _;
    }

    /* =========================================================
        ✅ DOB FORMAT UPDATE (YYYYMMDD)
        Example stored DOB: 19600101
        So age must be calculated using year comparison.
    ========================================================= */

    function _getYearFromDOB(uint256 dobYMD) internal pure returns (uint256) {
        // dobYMD = YYYYMMDD
        // Year = dobYMD / 10000
        return dobYMD / 10000;
    }

    function _getAge(uint256 dobYMD) internal view returns (uint256) {
        require(dobYMD >= 19000101 && dobYMD <= 21001231, "Invalid DOB format");

        uint256 birthYear = _getYearFromDOB(dobYMD);

        // Current year from block timestamp
        // This is a simplified year extraction (good enough for prototype)
        uint256 currentYear = 1970 + (block.timestamp / 365 days);

        if (currentYear < birthYear) return 0;
        return currentYear - birthYear;
    }

    // =========================
    // PRSS helpers
    // =========================
    function _schemeMultiplier(PensionRegistry.SchemeType scheme)
        internal
        pure
        returns (uint256)
    {
        if (scheme == PensionRegistry.SchemeType.DPS) return 105;
        if (scheme == PensionRegistry.SchemeType.RetirementFund) return 115;
        if (scheme == PensionRegistry.SchemeType.ProvidentFund) return 125;
        if (scheme == PensionRegistry.SchemeType.InsurancePension) return 135;
        return 100;
    }

    function _schemeMinMonths(PensionRegistry.SchemeType scheme)
        internal
        view
        returns (uint256)
    {
        uint256 minMonths = registry.prssMinMonths(scheme);
        if (minMonths == 0) return 12;
        return minMonths;
    }

    // =========================
    // GPS pension percent bands
    // =========================
    function _gpsPensionPct(uint256 years_) internal pure returns (uint256) {
        if (years_ >= 25) return 80;
        if (years_ >= 20) return 64;
        if (years_ >= 15) return 48;
        if (years_ >= 10) return 32;
        return 0;
    }

    function _calculateGPSMonthlyWei(address pensioner) internal view returns (uint256) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        require(p.program == PensionRegistry.PensionProgram.GPS, "Not GPS pensioner");
        require(p.gpsVerified, "GPS data not verified");

        uint256 years_ = p.verifiedServiceYears;
        uint256 pct = _gpsPensionPct(years_);
        require(pct > 0, "Insufficient service to qualify for GPS pension");

        uint256 pensionBDT = (p.verifiedBasicSalaryBDT * pct) / 100;
        require(pensionBDT > 0, "Calculated pension too small");

        return _bdtToWei(pensionBDT);
    }

    function _calculateGPSGratuityWei(address pensioner) internal view returns (uint256) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        require(p.program == PensionRegistry.PensionProgram.GPS, "Not GPS pensioner");
        require(p.gpsVerified, "GPS data not verified");

        uint256 years_ = p.verifiedServiceYears;
        require(years_ >= 1, "Service years too low for gratuity");

        uint256 gratuityBDT = p.verifiedBasicSalaryBDT * years_;
        require(gratuityBDT > 0, "Gratuity too small");

        return _bdtToWei(gratuityBDT);
    }

    // =========================================================
    // nominee max months allowed (relation based)
    // =========================================================
    function _lower(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                b[i] = bytes1(uint8(b[i]) + 32);
            }
        }
        return string(b);
    }

    function _contains(string memory text, string memory key) internal pure returns (bool) {
        bytes memory t = bytes(text);
        bytes memory k = bytes(key);
        if (k.length == 0 || t.length < k.length) return false;

        for (uint256 i = 0; i <= t.length - k.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < k.length; j++) {
                if (t[i + j] != k[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    function nomineeMaxMonthsAllowed(address pensioner) public view returns (uint256) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        // spouse = unlimited (0 means unlimited)
        string memory rel = _lower(p.nomineeRelation);

        if (_contains(rel, "wife") || _contains(rel, "husband") || _contains(rel, "spouse")) {
            return 0; // unlimited
        }

        // child = 10 years (120 months)
        if (_contains(rel, "child") || _contains(rel, "son") || _contains(rel, "daughter")) {
            return 120;
        }

        // parent = 5 years (60 months)
        if (_contains(rel, "father") || _contains(rel, "mother") || _contains(rel, "parent")) {
            return 60;
        }

        // others: monthly not allowed
        return 0;
    }

    function _isOtherRelationMonthlyBlocked(address pensioner) internal view returns (bool) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);
        string memory rel = _lower(p.nomineeRelation);

        bool isSpouse = _contains(rel, "wife") || _contains(rel, "husband") || _contains(rel, "spouse");
        bool isChild = _contains(rel, "child") || _contains(rel, "son") || _contains(rel, "daughter");
        bool isParent = _contains(rel, "father") || _contains(rel, "mother") || _contains(rel, "parent");

        return !(isSpouse || isChild || isParent);
    }

    // =========================================================
    // START PENSION (GPS + PRSS)
    // =========================================================
    function startPension() external onlyActiveAccount(msg.sender) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);

        require(p.wallet == msg.sender, "Not registered");
        require(p.status == PensionRegistry.ApplicationStatus.Approved, "Not approved");
        require(!p.isDeceased, "Pensioner is deceased");
        require(_getAge(p.dateOfBirth) >= RETIREMENT_AGE, "Not retirement age");
        require(!pensions[msg.sender].started, "Pension already started");

        // ✅ REALISTIC FIX:
        // Gratuity claim does NOT block starting pension anymore.
        // (So removed old: require(pensionMode[msg.sender] != PensionMode.GratuityTaken, ...);)

        uint256 monthlyAmount;

        if (p.program == PensionRegistry.PensionProgram.PRSS) {
            uint256 paidMonths = fund.monthlyPaymentsCount(msg.sender);

            uint256 minMonths = _schemeMinMonths(p.scheme);
            require(paidMonths >= minMonths, "Minimum monthly payments not completed");

            uint256 total = fund.totalContributions(msg.sender);
            require(total > 0, "No contributions");

            uint256 multiplier = _schemeMultiplier(p.scheme);

            monthlyAmount = (total * multiplier) / 100 / MONTHS_IN_PENSION;
            require(monthlyAmount > 0, "Pension too small");
        } else if (p.program == PensionRegistry.PensionProgram.GPS) {
            monthlyAmount = _calculateGPSMonthlyWei(msg.sender);
        } else {
            revert("Invalid program");
        }

        pensions[msg.sender] = PensionState({
            started: true,
            monthlyAmount: monthlyAmount,
            lastWithdrawal: 0,
            startedAt: block.timestamp
        });

        pensionMode[msg.sender] = PensionMode.NotChosen;
        lumpSumWithdrawn[msg.sender] = false;

        // reset nominee monthly count when pension starts (fresh)
        nomineeMonthlyWithdrawCount[msg.sender] = 0;

        emit PensionStarted(msg.sender, monthlyAmount, block.timestamp);
    }

    // =========================
    // PENSIONER MODE CHOICE
    // =========================
    function chooseMonthlyPension() external onlyActiveAccount(msg.sender) {
        PensionState storage ps = pensions[msg.sender];
        require(ps.started, "Pension not started");
        require(!registry.isDeceased(msg.sender), "Pensioner is deceased");

        require(pensionMode[msg.sender] == PensionMode.NotChosen, "Mode already chosen");
        require(!lumpSumWithdrawn[msg.sender], "Lump sum already withdrawn");

        // ✅ REALISTIC FIX:
        // Gratuity claim does NOT block monthly pension mode anymore.
        // (So removed old: require(pensionMode[msg.sender] != PensionMode.GratuityTaken, ...);)

        pensionMode[msg.sender] = PensionMode.Monthly;
        emit PensionModeChosen(msg.sender, PensionMode.Monthly);
    }

    // =========================
    // PRSS FULL WITHDRAW (PENSIONER)
    // =========================
    function withdrawFullPension() external onlyActiveAccount(msg.sender) {
        PensionState storage ps = pensions[msg.sender];
        require(ps.started, "Pension not started");
        require(!registry.isDeceased(msg.sender), "Pensioner is deceased");

        require(pensionMode[msg.sender] == PensionMode.NotChosen, "Mode already chosen");
        require(!lumpSumWithdrawn[msg.sender], "Already withdrawn");

        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);
        require(p.program == PensionRegistry.PensionProgram.PRSS, "Only PRSS allows full withdraw");

        uint256 total = fund.totalContributions(msg.sender);
        require(total > 0, "No contributions");

        pensionMode[msg.sender] = PensionMode.LumpSum;
        lumpSumWithdrawn[msg.sender] = true;

        fund.releasePRSSLumpSum(msg.sender, payable(msg.sender), total);

        emit FullPensionWithdrawn(msg.sender, total, block.timestamp);
        emit PensionModeChosen(msg.sender, PensionMode.LumpSum);
    }

    // =========================
    // PRSS FULL WITHDRAW (NOMINEE)
    // =========================
    function nomineeWithdrawFullPension(address pensioner)
        external
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");

        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        require(p.program == PensionRegistry.PensionProgram.PRSS, "Only PRSS nominee can withdraw full");
        require(p.status == PensionRegistry.ApplicationStatus.Approved, "Not approved pensioner");
        require(p.isDeceased, "Pensioner not deceased");

        require(
            p.deathReportStatus == PensionRegistry.DeathReportStatus.VERIFIED,
            "Death not verified"
        );

        require(p.nomineeWallet != address(0), "Nominee wallet missing");
        require(msg.sender == p.nomineeWallet, "Only nominee allowed");

        require(registry.isNomineeApproved(pensioner), "Nominee not approved");

        PensionState storage ps = pensions[pensioner];
        require(ps.started, "Pension not started");

        require(pensionMode[pensioner] == PensionMode.NotChosen, "Mode already chosen");
        require(!lumpSumWithdrawn[pensioner], "Already withdrawn");

        uint256 total = fund.totalContributions(pensioner);
        require(total > 0, "No contributions");

        pensionMode[pensioner] = PensionMode.LumpSum;
        lumpSumWithdrawn[pensioner] = true;

        fund.releasePRSSLumpSum(pensioner, payable(msg.sender), total);

        emit FullNomineePensionWithdrawn(pensioner, msg.sender, total, block.timestamp);
        emit PensionModeChosen(pensioner, PensionMode.LumpSum);
    }

    // =========================
    // MONTHLY CLAIM (GPS + PRSS)
    // =========================
    function withdrawMonthlyPension() external onlyActiveAccount(msg.sender) {
        PensionState storage ps = pensions[msg.sender];
        require(ps.started, "Pension not started");
        require(!registry.isDeceased(msg.sender), "Pensioner is deceased");

        require(pensionMode[msg.sender] == PensionMode.Monthly, "Monthly mode not chosen");
        require(!lumpSumWithdrawn[msg.sender], "Lump sum already withdrawn");

        if (ps.lastWithdrawal != 0) {
            require(block.timestamp >= ps.lastWithdrawal + MONTH, "Too early");
        }

        ps.lastWithdrawal = block.timestamp;

        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);

        if (p.program == PensionRegistry.PensionProgram.PRSS) {
            fund.releaseToPRSSPensioner(payable(msg.sender), ps.monthlyAmount);
        } else if (p.program == PensionRegistry.PensionProgram.GPS) {
            fund.releaseToGPSPensioner(payable(msg.sender), ps.monthlyAmount);
        } else {
            revert("Invalid program");
        }

        emit MonthlyPensionWithdrawn(msg.sender, ps.monthlyAmount, block.timestamp);
    }

    // =========================
    // NOMINEE MONTHLY CLAIM (LIMITED MONTHS)
    // =========================
    function withdrawMonthlyPensionAsNominee(address pensioner)
        external
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");

        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        require(p.status == PensionRegistry.ApplicationStatus.Approved, "Not approved pensioner");
        require(p.isDeceased, "Pensioner not deceased");
        require(p.nomineeWallet != address(0), "Nominee wallet required");

        require(
            p.deathReportStatus == PensionRegistry.DeathReportStatus.VERIFIED,
            "Death not verified"
        );

        require(msg.sender == p.nomineeWallet, "Only nominee allowed");
        require(registry.isNomineeApproved(pensioner), "Nominee not approved");

        // block monthly for "Other" relations
        require(!_isOtherRelationMonthlyBlocked(pensioner), "Monthly nominee pension not allowed for this relation");

        PensionState storage ps = pensions[pensioner];
        require(ps.started, "Pension not started");

        require(pensionMode[pensioner] == PensionMode.Monthly, "Monthly mode not chosen");
        require(!lumpSumWithdrawn[pensioner], "Lump sum already withdrawn");

        if (ps.lastWithdrawal != 0) {
            require(block.timestamp >= ps.lastWithdrawal + MONTH, "Too early");
        }

        // enforce limited months
        uint256 maxMonths = nomineeMaxMonthsAllowed(pensioner);

        // maxMonths == 0 means unlimited (spouse)
        if (maxMonths > 0) {
            require(nomineeMonthlyWithdrawCount[pensioner] < maxMonths, "Nominee family pension period ended");
        }

        ps.lastWithdrawal = block.timestamp;

        if (p.program == PensionRegistry.PensionProgram.PRSS) {
            fund.releaseToPRSSPensioner(payable(msg.sender), ps.monthlyAmount);
        } else if (p.program == PensionRegistry.PensionProgram.GPS) {
            fund.releaseToGPSPensioner(payable(msg.sender), ps.monthlyAmount);
        } else {
            revert("Invalid program");
        }

        nomineeMonthlyWithdrawCount[pensioner] += 1;

        emit MonthlyNomineePensionWithdrawn(pensioner, msg.sender, ps.monthlyAmount, block.timestamp);
        emit NomineeFamilyPensionMonthUsed(
            pensioner,
            msg.sender,
            nomineeMonthlyWithdrawCount[pensioner],
            maxMonths,
            block.timestamp
        );
    }

    // =========================================================
    // GPS ONE-TIME GRATUITY (PENSIONER)  ✅ REALISTIC FIX
    // =========================================================
    function claimGPSGratuity() external onlyActiveAccount(msg.sender) {
        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);

        require(p.wallet == msg.sender, "Not registered");
        require(p.status == PensionRegistry.ApplicationStatus.Approved, "Not approved");
        require(!p.isDeceased, "Pensioner is deceased");
        require(p.program == PensionRegistry.PensionProgram.GPS, "Not GPS pensioner");
        require(p.gpsVerified, "GPS data not verified");

        require(!gpsGratuityClaimed[msg.sender], "Gratuity already claimed");
        require(_getAge(p.dateOfBirth) >= RETIREMENT_AGE, "Not retirement age");

        // ✅ REALISTIC FIX:
        // Gratuity should NOT depend on pension mode choice.
        // Pensioner can claim gratuity even after pension started and monthly mode chosen.

        uint256 gratuityWei = _calculateGPSGratuityWei(msg.sender);
        require(gratuityWei > 0, "Gratuity amount zero");

        gpsGratuityClaimed[msg.sender] = true;

        fund.releaseToGPSPensioner(payable(msg.sender), gratuityWei);

        emit GPSGratuityPaid(msg.sender, gratuityWei, block.timestamp);
    }

    // =========================================================
    // GPS GRATUITY CLAIM BY NOMINEE  ✅ REALISTIC FIX
    // =========================================================
    function nomineeClaimGPSGratuity(address pensioner)
        external
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");

        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);

        require(p.wallet == pensioner, "Not registered");
        require(p.status == PensionRegistry.ApplicationStatus.Approved, "Not approved pensioner");
        require(p.program == PensionRegistry.PensionProgram.GPS, "Not GPS pensioner");
        require(p.gpsVerified, "GPS data not verified");

        // pensioner must be deceased
        require(p.isDeceased, "Pensioner not deceased");

        // death must be verified by admin
        require(
            p.deathReportStatus == PensionRegistry.DeathReportStatus.VERIFIED,
            "Death not verified"
        );

        // nominee checks
        require(p.nomineeWallet != address(0), "Nominee wallet missing");
        require(msg.sender == p.nomineeWallet, "Only nominee allowed");
        require(registry.isNomineeApproved(pensioner), "Nominee not approved");

        // gratuity can be claimed only once
        require(!gpsGratuityClaimed[pensioner], "Gratuity already claimed");

        uint256 gratuityWei = _calculateGPSGratuityWei(pensioner);
        require(gratuityWei > 0, "Gratuity amount zero");

        gpsGratuityClaimed[pensioner] = true;

        fund.releaseToGPSPensioner(payable(msg.sender), gratuityWei);

        emit GPSGratuityPaidToNominee(pensioner, msg.sender, gratuityWei, block.timestamp);
    }

    function getPensionState(address pensioner) external view returns (PensionState memory) {
        return pensions[pensioner];
    }
}
