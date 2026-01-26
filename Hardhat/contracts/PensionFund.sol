// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PensionRegistry.sol";

contract PensionFund {
    PensionRegistry public registry;
    address public pensionDisbursement;

    uint256 public constant MONTH = 30 days;

    // =========================
    // PRSS savings (user deposits)
    // =========================
    mapping(address => uint256) public totalContributions;
    mapping(address => uint256[]) private contributionHistory;

    mapping(address => uint256) public lastContributionAt;
    mapping(address => uint256) public monthlyPaymentsCount;

    // =========================
    // GPS govt allocated fund (admin deposits)
    // =========================
    mapping(address => uint256) public gpsAllocatedFund;

    event ContributionMade(address indexed pensioner, uint256 amount, uint256 timestamp);
    event PensionPaid(address indexed receiver, uint256 amount, uint256 timestamp);
    event PensionDisbursementSet(address indexed disbursement);

    // ✅ UPDATED: include admin address so UI can show it in history
    event GPSFundAllocated(
        address indexed admin,
        address indexed pensioner,
        uint256 amount,
        uint256 timestamp
    );

    event GPSFundWithdrawn(address indexed admin, address indexed to, uint256 amount, uint256 timestamp);

    modifier onlyDisbursement() {
        require(pensionDisbursement != address(0), "Disbursement not set");
        require(msg.sender == pensionDisbursement, "Only disbursement contract allowed");
        _;
    }

    modifier onlyAdmin() {
        require(registry.isAdmin(msg.sender), "Only admin allowed");
        _;
    }

    // ✅ NEW: account must be ACTIVE
    modifier onlyActiveAccount(address user) {
        // 0 = ACTIVE (based on your Registry AccountStatus enum)
        require(registry.getAccountStatus(user) == 0, "Account not active");
        _;
    }

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Invalid registry");
        registry = PensionRegistry(registryAddress);
    }

    function setPensionDisbursement(address _disbursement) external onlyAdmin {
        require(_disbursement != address(0), "Invalid disbursement");
        require(pensionDisbursement == address(0), "Disbursement already set");

        pensionDisbursement = _disbursement;
        emit PensionDisbursementSet(_disbursement);
    }

    /* ============================================================
        ✅ PRSS: Monthly contribution (user pays fixed tier)
    ============================================================ */
    function contributeMonthly() external payable onlyActiveAccount(msg.sender) {
        require(msg.value > 0, "No ETH sent");

        require(
            registry.getStatus(msg.sender) == PensionRegistry.ApplicationStatus.Approved,
            "Pensioner not approved"
        );

        require(!registry.isDeceased(msg.sender), "Pensioner is deceased");

        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);
        require(p.wallet == msg.sender, "Not registered pensioner");

        require(
            p.program == PensionRegistry.PensionProgram.PRSS,
            "GPS pensioners cannot contribute monthly"
        );

        require(p.monthlyContribution > 0, "Monthly contribution not set");

        require(
            msg.value == p.monthlyContribution,
            "Contribution must match scheme monthly amount"
        );

        uint256 lastPaid = lastContributionAt[msg.sender];
        require(lastPaid == 0 || block.timestamp >= lastPaid + MONTH, "Already paid this month");

        totalContributions[msg.sender] += msg.value;
        contributionHistory[msg.sender].push(msg.value);

        lastContributionAt[msg.sender] = block.timestamp;
        monthlyPaymentsCount[msg.sender] += 1;

        emit ContributionMade(msg.sender, msg.value, block.timestamp);
    }

    /* ============================================================
        ✅ PRSS: Optional extra top-up
    ============================================================ */
    function contribute() external payable onlyActiveAccount(msg.sender) {
        require(msg.value > 0, "No ETH sent");

        require(
            registry.getStatus(msg.sender) == PensionRegistry.ApplicationStatus.Approved,
            "Pensioner not approved"
        );

        require(!registry.isDeceased(msg.sender), "Pensioner is deceased");

        PensionRegistry.Pensioner memory p = registry.getPensioner(msg.sender);
        require(p.wallet == msg.sender, "Not registered pensioner");

        require(
            p.program == PensionRegistry.PensionProgram.PRSS,
            "GPS pensioners cannot contribute"
        );

        totalContributions[msg.sender] += msg.value;
        contributionHistory[msg.sender].push(msg.value);

        emit ContributionMade(msg.sender, msg.value, block.timestamp);
    }

    /* ============================================================
        ✅ GPS: Govt allocates fund to pensioner
    ============================================================ */
    function allocateGPSFund(address pensioner)
        external
        payable
        onlyAdmin
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");
        require(msg.value > 0, "No ETH sent");

        require(
            registry.getStatus(pensioner) == PensionRegistry.ApplicationStatus.Approved,
            "Pensioner not approved"
        );

        require(!registry.isDeceased(pensioner), "Pensioner is deceased");

        PensionRegistry.Pensioner memory p = registry.getPensioner(pensioner);
        require(p.wallet == pensioner, "Not registered pensioner");

        require(
            p.program == PensionRegistry.PensionProgram.GPS,
            "Only GPS pensioner allowed"
        );

        gpsAllocatedFund[pensioner] += msg.value;

        // ✅ UPDATED EMIT: includes admin wallet
        emit GPSFundAllocated(msg.sender, pensioner, msg.value, block.timestamp);
    }

    /* ============================================================
        ✅ Admin withdraw unallocated ETH (for demo realism)
    ============================================================ */
    function withdrawGPSUnallocated(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "Invalid receiver");
        require(amount > 0, "Invalid amount");
        require(address(this).balance >= amount, "Contract balance low");

        (bool sent, ) = to.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit GPSFundWithdrawn(msg.sender, to, amount, block.timestamp);
    }

    /* ============================================================
        ✅ PRSS: Pay monthly pension from PRSS savings pool
    ============================================================ */
    function releaseToPRSSPensioner(address payable pensioner, uint256 amount)
        external
        onlyDisbursement
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");
        require(amount > 0, "Invalid amount");

        require(totalContributions[pensioner] >= amount, "Insufficient PRSS balance");
        require(address(this).balance >= amount, "Contract balance low");

        totalContributions[pensioner] -= amount;

        (bool sent, ) = pensioner.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit PensionPaid(pensioner, amount, block.timestamp);
    }

    /* ============================================================
        ✅ GPS: Pay monthly pension from GPS allocated fund
    ============================================================ */
    function releaseToGPSPensioner(address payable pensioner, uint256 amount)
        external
        onlyDisbursement
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");
        require(amount > 0, "Invalid amount");

        require(gpsAllocatedFund[pensioner] >= amount, "Insufficient GPS allocated fund");
        require(address(this).balance >= amount, "Contract balance low");

        gpsAllocatedFund[pensioner] -= amount;

        (bool sent, ) = pensioner.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit PensionPaid(pensioner, amount, block.timestamp);
    }

    /* ============================================================
        ✅ PRSS: Lump sum withdraw (pensioner OR nominee)
    ============================================================ */
    function releasePRSSLumpSum(
        address pensioner,
        address payable receiver,
        uint256 amount
    )
        external
        onlyDisbursement
        onlyActiveAccount(pensioner)
    {
        require(pensioner != address(0), "Invalid pensioner");
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Invalid amount");

        require(totalContributions[pensioner] >= amount, "Insufficient PRSS balance");
        require(address(this).balance >= amount, "Contract balance low");

        totalContributions[pensioner] -= amount;

        (bool sent, ) = receiver.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit PensionPaid(receiver, amount, block.timestamp);
    }

    /* ============================================================
        ⚠️ Generic release function (fallback)
        - Does NOT deduct from balances
    ============================================================ */
    function releaseTo(address payable receiver, uint256 amount)
        external
        onlyDisbursement
    {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Invalid amount");
        require(address(this).balance >= amount, "Insufficient fund balance");

        (bool sent, ) = receiver.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit PensionPaid(receiver, amount, block.timestamp);
    }

    /* ===================== VIEWS ===================== */
    function getContributionHistory(address pensioner)
        external
        view
        returns (uint256[] memory)
    {
        return contributionHistory[pensioner];
    }

    function getMyContributionHistory() external view returns (uint256[] memory) {
        return contributionHistory[msg.sender];
    }

    function getMyBalances() external view returns (uint256 prssBalance, uint256 gpsBalance) {
        return (totalContributions[msg.sender], gpsAllocatedFund[msg.sender]);
    }

    receive() external payable {}
}
