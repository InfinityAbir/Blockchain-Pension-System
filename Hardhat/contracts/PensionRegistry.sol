// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* ===================== DOCUMENTS INTERFACE ===================== */
interface IPensionDocuments {
    function areAllPensionerDocumentsApproved(address pensioner)
        external
        view
        returns (bool);

    function areAllNomineeDocumentsApproved(address nominee)
        external
        view
        returns (bool);
}

contract PensionRegistry {
    /* ===================== ROLES ===================== */
    address public admin;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin allowed");
        _;
    }

    /* ===================== ENUMS ===================== */
    enum ApplicationStatus {
        NotRegistered,
        Pending,
        Approved,
        Rejected
    }

    // Bangladesh full pension system
    enum PensionProgram {
        GPS,  // Government Pension Scheme
        PRSS  // Private Retirement Savings Scheme
    }

    // PRSS Schemes
    enum SchemeType {
        DPS,
        RetirementFund,
        ProvidentFund,
        InsurancePension
    }

    enum NomineeClaimStatus {
        NONE,
        APPLIED,
        APPROVED,
        REJECTED
    }

    // Nominee reports first, admin verifies
    enum DeathReportStatus {
        NONE,
        REPORTED,
        VERIFIED,
        REJECTED
    }

    // ✅ NEW: Account lifecycle (instead of delete)
    enum AccountStatus {
        ACTIVE,
        CLOSURE_REQUESTED,
        CLOSED
    }

    /* ===================== STRUCT ===================== */
    struct Pensioner {
        address wallet;

        // GPS/PRSS program
        PensionProgram program;

        // ===================== PRSS ONLY =====================
        SchemeType scheme;
        uint256 monthlyContribution;

        // ===================== GPS ONLY (Submitted by user) =====================
        uint256 basicSalaryBDT;
        uint256 serviceYears;
        string employeeId;
        string designation;

        // ===================== GPS ONLY (Verified by admin) =====================
        bool gpsVerified;
        uint256 verifiedBasicSalaryBDT;
        uint256 verifiedServiceYears;
        string verifiedEmployeeId;

        // common
        // ✅ DOB FORMAT UPDATED: YYYYMMDD (example: 19600101)
        uint256 dateOfBirth;

        ApplicationStatus status;
        uint256 appliedAt;
        uint256 reviewedAt;
        string rejectionReason;

        // nominee info
        address nomineeWallet;
        string nomineeName;
        string nomineeRelation;

        // deceased info (admin verified)
        bool isDeceased;
        uint256 deceasedAt;
        string deathProofCID;

        // death report info (nominee submits first)
        DeathReportStatus deathReportStatus;
        uint256 deathReportedAt;
        uint256 deathReviewedAt;
        string deathReportProofCID;
        string deathReportRejectReason;

        // nominee claim info
        NomineeClaimStatus nomineeClaimStatus;
        uint256 nomineeAppliedAt;
        uint256 nomineeReviewedAt;

        // claim proofs (optional on-chain record)
        string nomineeNidProofCID;
        string relationshipProofCID;

        string nomineeRejectReason;

        // ✅ NEW: Account status (deactivate system)
        AccountStatus accountStatus;
        uint256 closureRequestedAt;
        uint256 closedAt;
        string closureReason;
    }

    /* ===================== STORAGE ===================== */
    mapping(address => Pensioner) private pensioners;

    address[] private applicants;
    mapping(address => bool) private isApplicantAdded;

    // nominee -> pensioner mapping
    mapping(address => address) public nomineeToPensioner;

    IPensionDocuments public documents;

    /* ===================== EVENTS ===================== */
    event PensionerRegistered(
        address indexed user,
        PensionProgram program,
        SchemeType scheme,
        uint256 monthlyContribution,
        uint256 basicSalaryBDT,
        uint256 serviceYears,
        string employeeId,
        uint256 dateOfBirth,
        uint256 appliedAt
    );

    // ✅ UPDATED: Added indexed admin parameter
    event PensionerApproved(
        address indexed user,
        address indexed admin,
        uint256 reviewedAt
    );

    // ✅ UPDATED: Added indexed admin parameter
    event PensionerRejected(
        address indexed user,
        address indexed admin,
        string reason,
        uint256 reviewedAt
    );

    event DocumentsContractUpdated(address indexed documentsAddress);

    // ✅ UPDATED: Added indexed admin parameter
    event GPSDataVerified(
        address indexed pensioner,
        address indexed admin,
        uint256 verifiedBasicSalaryBDT,
        uint256 verifiedServiceYears,
        string verifiedEmployeeId,
        uint256 timestamp
    );

    event PRSSMinMonthsUpdated(SchemeType scheme, uint256 minMonths, uint256 timestamp);

    event DeathReportedByNominee(
        address indexed pensioner,
        address indexed nominee,
        string deathCertificateCID,
        uint256 timestamp
    );

    // ✅ UPDATED: Added indexed admin parameter
    event DeathReportVerified(
        address indexed pensioner,
        address indexed nominee,
        address indexed admin,
        uint256 timestamp
    );

    // ✅ UPDATED: Added indexed admin parameter
    event DeathReportRejected(
        address indexed pensioner,
        address indexed nominee,
        address indexed admin,
        string reason,
        uint256 timestamp
    );

    event NomineeClaimApplied(
        address indexed pensioner,
        address indexed nominee,
        string nomineeNidCID,
        string relationshipCID,
        uint256 timestamp
    );

    // ✅ UPDATED: Added indexed admin parameter
    event NomineeClaimApproved(
        address indexed pensioner,
        address indexed nominee,
        address indexed admin,
        uint256 timestamp
    );

    // ✅ UPDATED: Added indexed admin parameter
    event NomineeClaimRejected(
        address indexed pensioner,
        address indexed nominee,
        address indexed admin,
        string reason,
        uint256 timestamp
    );

    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ✅ NEW: Deactivate / closure events
    event AccountClosureRequested(address indexed pensioner, string reason, uint256 timestamp);

    // ✅ UPDATED: Added indexed admin parameter
    event AccountClosed(
        address indexed pensioner,
        address indexed admin,
        uint256 timestamp
    );

    /* ===================== CONSTRUCTOR ===================== */
    constructor(address documentsAddress) {
        admin = msg.sender;

        if (documentsAddress != address(0)) {
            documents = IPensionDocuments(documentsAddress);
        }

        // default realistic PRSS minimum durations
        prssMinMonths[SchemeType.DPS] = 12;
        prssMinMonths[SchemeType.RetirementFund] = 24;
        prssMinMonths[SchemeType.ProvidentFund] = 36;
        prssMinMonths[SchemeType.InsurancePension] = 60;
    }

    /* ============================================================
        DOB VALIDATION HELPERS (YYYYMMDD)
        Example: 19600101
    ============================================================ */
    function _isValidDOB(uint256 yyyymmdd) internal pure returns (bool) {
        // basic range
        if (yyyymmdd < 19000101 || yyyymmdd > 21001231) return false;

        uint256 yyyy = yyyymmdd / 10000;
        uint256 mm = (yyyymmdd / 100) % 100;
        uint256 dd = yyyymmdd % 100;

        if (yyyy < 1900 || yyyy > 2100) return false;
        if (mm < 1 || mm > 12) return false;
        if (dd < 1 || dd > 31) return false;

        // basic month-day validation (simple)
        if (mm == 2 && dd > 29) return false;
        if ((mm == 4 || mm == 6 || mm == 9 || mm == 11) && dd > 30) return false;

        return true;
    }

    /* ============================================================
        BDT -> WEI conversion
    ============================================================ */
    uint256 private constant BDT_PER_ETH = 300000;
    uint256 private constant WEI_PER_ETH = 1e18;

    function _bdtToWei(uint256 bdt) internal pure returns (uint256) {
        return (bdt * WEI_PER_ETH) / BDT_PER_ETH;
    }

    /* ============================================================
        PRSS Minimum Months (admin controlled)
    ============================================================ */
    mapping(SchemeType => uint256) public prssMinMonths;

    function setPRSSMinMonths(SchemeType scheme, uint256 minMonths) external onlyAdmin {
        require(minMonths >= 6, "Min months too low");
        require(minMonths <= 240, "Min months too high");

        prssMinMonths[scheme] = minMonths;
        emit PRSSMinMonthsUpdated(scheme, minMonths, block.timestamp);
    }

    /* ============================================================
        PRSS Tier Validation (realistic tiers per scheme)
    ============================================================ */
    function _isAllowedTier(SchemeType scheme, uint256 monthlyContribution)
        internal
        pure
        returns (bool)
    {
        if (scheme == SchemeType.DPS) {
            return (
                monthlyContribution == _bdtToWei(500) ||
                monthlyContribution == _bdtToWei(1000) ||
                monthlyContribution == _bdtToWei(2000)
            );
        }

        if (scheme == SchemeType.RetirementFund) {
            return (
                monthlyContribution == _bdtToWei(1000) ||
                monthlyContribution == _bdtToWei(2000) ||
                monthlyContribution == _bdtToWei(3000)
            );
        }

        if (scheme == SchemeType.ProvidentFund) {
            return (
                monthlyContribution == _bdtToWei(2000) ||
                monthlyContribution == _bdtToWei(3000) ||
                monthlyContribution == _bdtToWei(5000)
            );
        }

        if (scheme == SchemeType.InsurancePension) {
            return (
                monthlyContribution == _bdtToWei(3000) ||
                monthlyContribution == _bdtToWei(5000) ||
                monthlyContribution == _bdtToWei(10000)
            );
        }

        return false;
    }

    /* ============================================================
        GPS VALIDATION HELPERS
    ============================================================ */
    uint256 public constant GPS_MIN_SERVICE_YEARS = 10;
    uint256 public constant GPS_MAX_SERVICE_YEARS = 40;

    function _isValidGpsServiceYears(uint256 years_) internal pure returns (bool) {
        return years_ >= GPS_MIN_SERVICE_YEARS && years_ <= GPS_MAX_SERVICE_YEARS;
    }

    /* ===================== ADMIN CONFIG ===================== */
    function setDocuments(address _documents) external onlyAdmin {
        require(_documents != address(0), "Invalid documents address");
        documents = IPensionDocuments(_documents);
        emit DocumentsContractUpdated(_documents);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin address");
        require(newAdmin != admin, "Already admin");

        address old = admin;
        admin = newAdmin;

        emit AdminTransferred(old, newAdmin);
    }

    /* ============================================================
        GPS ADMIN VERIFICATION
    ============================================================ */
    function verifyGPSData(
        address pensioner,
        uint256 verifiedBasicSalaryBDT,
        uint256 verifiedServiceYears,
        string calldata verifiedEmployeeId
    ) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.status == ApplicationStatus.Pending, "Application not pending");
        require(p.program == PensionProgram.GPS, "Not GPS pensioner");

        // ✅ account must be active
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        require(verifiedBasicSalaryBDT > 0, "Invalid basic salary");
        require(_isValidGpsServiceYears(verifiedServiceYears), "Invalid service years");
        require(bytes(verifiedEmployeeId).length > 0, "Employee ID required");

        p.gpsVerified = true;
        p.verifiedBasicSalaryBDT = verifiedBasicSalaryBDT;
        p.verifiedServiceYears = verifiedServiceYears;
        p.verifiedEmployeeId = verifiedEmployeeId;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit GPSDataVerified(
            pensioner,
            msg.sender,
            verifiedBasicSalaryBDT,
            verifiedServiceYears,
            verifiedEmployeeId,
            block.timestamp
        );
    }

    /* ===================== REGISTRATION ===================== */
    function registerPensioner(
        PensionProgram _program,

        // PRSS only
        SchemeType _scheme,
        uint256 _monthlyContribution,

        // GPS only (user submitted)
        uint256 _basicSalaryBDT,
        uint256 _serviceYears,
        string calldata _employeeId,
        string calldata _designation,

        // common
        uint256 _dateOfBirth,
        address _nomineeWallet,
        string calldata _nomineeName,
        string calldata _nomineeRelation
    ) external {
        ApplicationStatus currentStatus = pensioners[msg.sender].status;

        require(
            currentStatus == ApplicationStatus.NotRegistered ||
                currentStatus == ApplicationStatus.Rejected,
            "Already registered or pending"
        );

        // if previously closed, block re-register
        require(pensioners[msg.sender].accountStatus != AccountStatus.CLOSED, "Account closed");

        // ✅ DOB FIX: now expects YYYYMMDD
        require(_isValidDOB(_dateOfBirth), "Invalid date of birth");

        require(_nomineeWallet != address(0), "Nominee wallet required");
        require(_nomineeWallet != msg.sender, "Nominee cannot be same as pensioner");
        require(bytes(_nomineeName).length > 0, "Nominee name required");
        require(bytes(_nomineeRelation).length > 0, "Nominee relation required");

        if (_program == PensionProgram.GPS) {
            require(_monthlyContribution == 0, "GPS monthly contribution must be 0");

            require(_basicSalaryBDT > 0, "Basic salary required (BDT)");
            require(_isValidGpsServiceYears(_serviceYears), "Invalid service years");
            require(bytes(_employeeId).length > 0, "Employee ID required");
        } else {
            require(_monthlyContribution > 0, "Invalid contribution");
            require(_isAllowedTier(_scheme, _monthlyContribution), "Invalid tier for scheme");

            require(_basicSalaryBDT == 0, "PRSS salary must be 0");
            require(_serviceYears == 0, "PRSS service years must be 0");
            require(bytes(_employeeId).length == 0, "PRSS employeeId must be empty");
        }

        // nominee mapping cleanup
        address oldNominee = pensioners[msg.sender].nomineeWallet;
        if (oldNominee != address(0) && nomineeToPensioner[oldNominee] == msg.sender) {
            nomineeToPensioner[oldNominee] = address(0);
        }

        address existingPensioner = nomineeToPensioner[_nomineeWallet];
        require(existingPensioner == address(0) || existingPensioner == msg.sender, "Nominee already used");

        nomineeToPensioner[_nomineeWallet] = msg.sender;

        pensioners[msg.sender] = Pensioner({
            wallet: msg.sender,

            program: _program,

            scheme: _scheme,
            monthlyContribution: _monthlyContribution,

            basicSalaryBDT: _basicSalaryBDT,
            serviceYears: _serviceYears,
            employeeId: _employeeId,
            designation: _designation,

            gpsVerified: false,
            verifiedBasicSalaryBDT: 0,
            verifiedServiceYears: 0,
            verifiedEmployeeId: "",

            dateOfBirth: _dateOfBirth,

            status: ApplicationStatus.Pending,
            appliedAt: block.timestamp,
            reviewedAt: 0,
            rejectionReason: "",

            nomineeWallet: _nomineeWallet,
            nomineeName: _nomineeName,
            nomineeRelation: _nomineeRelation,

            isDeceased: false,
            deceasedAt: 0,
            deathProofCID: "",

            deathReportStatus: DeathReportStatus.NONE,
            deathReportedAt: 0,
            deathReviewedAt: 0,
            deathReportProofCID: "",
            deathReportRejectReason: "",

            nomineeClaimStatus: NomineeClaimStatus.NONE,
            nomineeAppliedAt: 0,
            nomineeReviewedAt: 0,

            nomineeNidProofCID: "",
            relationshipProofCID: "",

            nomineeRejectReason: "",

            // ✅ NEW defaults
            accountStatus: AccountStatus.ACTIVE,
            closureRequestedAt: 0,
            closedAt: 0,
            closureReason: ""
        });

        if (!isApplicantAdded[msg.sender]) {
            applicants.push(msg.sender);
            isApplicantAdded[msg.sender] = true;
        }

        emit PensionerRegistered(
            msg.sender,
            _program,
            _scheme,
            _monthlyContribution,
            _basicSalaryBDT,
            _serviceYears,
            _employeeId,
            _dateOfBirth,
            block.timestamp
        );
    }

    /* ===================== ADMIN ACTIONS ===================== */
    function approvePensioner(address _user) external onlyAdmin {
        require(_user != address(0), "Invalid user");
        require(pensioners[_user].status == ApplicationStatus.Pending, "Application not pending");

        require(pensioners[_user].accountStatus != AccountStatus.CLOSED, "Account closed");

        require(address(documents) != address(0), "Documents contract not set");
        require(
            documents.areAllPensionerDocumentsApproved(_user),
            "Pensioner documents not approved"
        );

        if (pensioners[_user].program == PensionProgram.GPS) {
            require(pensioners[_user].gpsVerified, "GPS data not verified");
            require(pensioners[_user].verifiedBasicSalaryBDT > 0, "GPS salary missing");
            require(pensioners[_user].verifiedServiceYears > 0, "GPS service years missing");
        }

        pensioners[_user].status = ApplicationStatus.Approved;
        pensioners[_user].reviewedAt = block.timestamp;
        pensioners[_user].rejectionReason = "";

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit PensionerApproved(_user, msg.sender, block.timestamp);
    }

    function rejectPensioner(address _user, string calldata _reason) external onlyAdmin {
        require(_user != address(0), "Invalid user");
        require(pensioners[_user].status == ApplicationStatus.Pending, "Application not pending");
        require(bytes(_reason).length > 0, "Reason required");

        require(pensioners[_user].accountStatus != AccountStatus.CLOSED, "Account closed");

        pensioners[_user].status = ApplicationStatus.Rejected;
        pensioners[_user].reviewedAt = block.timestamp;
        pensioners[_user].rejectionReason = _reason;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit PensionerRejected(_user, msg.sender, _reason, block.timestamp);
    }

    /* ============================================================
        ✅ NEW: ACCOUNT CLOSURE (instead of delete)
    ============================================================ */

    // Pensioner requests closure (soft delete)
    function requestAccountClosure(string calldata reason) external {
        Pensioner storage p = pensioners[msg.sender];
        require(p.wallet == msg.sender, "Not registered");
        require(p.status != ApplicationStatus.NotRegistered, "Not registered");
        require(p.accountStatus == AccountStatus.ACTIVE, "Not active");
        require(!p.isDeceased, "Pensioner is deceased");
        require(bytes(reason).length > 0, "Reason required");

        p.accountStatus = AccountStatus.CLOSURE_REQUESTED;
        p.closureRequestedAt = block.timestamp;
        p.closureReason = reason;

        emit AccountClosureRequested(msg.sender, reason, block.timestamp);
    }

    // Admin confirms closure
    function closeAccount(address pensioner) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.accountStatus == AccountStatus.CLOSURE_REQUESTED, "Not requested");
        require(!p.isDeceased, "Pensioner is deceased");

        // remove nominee mapping so nominee can be reused
        address nominee = p.nomineeWallet;
        if (nominee != address(0) && nomineeToPensioner[nominee] == pensioner) {
            nomineeToPensioner[nominee] = address(0);
        }

        // lock account
        p.accountStatus = AccountStatus.CLOSED;
        p.closedAt = block.timestamp;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit AccountClosed(pensioner, msg.sender, block.timestamp);
    }

    // view helper
    function getAccountStatus(address user) external view returns (uint8) {
        return uint8(pensioners[user].accountStatus);
    }

    /* ============================================================
        NOMINEE FLOW (Apply + Admin Approve/Reject)
    ============================================================ */
    function applyNomineeClaim(
        string calldata nomineeNidCID,
        string calldata relationshipCID
    ) external {
        address pensioner = nomineeToPensioner[msg.sender];
        require(pensioner != address(0), "No pensioner linked");

        Pensioner storage p = pensioners[pensioner];

        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");
        require(p.status == ApplicationStatus.Approved, "Pensioner not approved");
        require(p.nomineeWallet == msg.sender, "Not nominee wallet");

        require(
            p.nomineeClaimStatus == NomineeClaimStatus.NONE ||
                p.nomineeClaimStatus == NomineeClaimStatus.REJECTED,
            "Nominee already applied"
        );

        require(bytes(nomineeNidCID).length > 0, "Nominee NID CID required");
        require(bytes(relationshipCID).length > 0, "Relationship CID required");

        p.nomineeClaimStatus = NomineeClaimStatus.APPLIED;
        p.nomineeAppliedAt = block.timestamp;
        p.nomineeReviewedAt = 0;

        p.nomineeNidProofCID = nomineeNidCID;
        p.relationshipProofCID = relationshipCID;

        p.nomineeRejectReason = "";

        emit NomineeClaimApplied(pensioner, msg.sender, nomineeNidCID, relationshipCID, block.timestamp);
    }

    function approveNomineeClaim(address pensioner) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.status == ApplicationStatus.Approved, "Pensioner not approved");
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        require(p.nomineeWallet != address(0), "No nominee wallet");
        require(p.nomineeClaimStatus == NomineeClaimStatus.APPLIED, "Nominee not applied");

        require(address(documents) != address(0), "Documents contract not set");
        require(
            documents.areAllNomineeDocumentsApproved(p.nomineeWallet),
            "Nominee documents not approved"
        );

        p.nomineeClaimStatus = NomineeClaimStatus.APPROVED;
        p.nomineeReviewedAt = block.timestamp;
        p.nomineeRejectReason = "";

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit NomineeClaimApproved(pensioner, p.nomineeWallet, msg.sender, block.timestamp);
    }

    function rejectNomineeClaim(address pensioner, string calldata reason) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");
        require(bytes(reason).length > 0, "Reason required");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.nomineeClaimStatus == NomineeClaimStatus.APPLIED, "Nominee not applied");
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        p.nomineeClaimStatus = NomineeClaimStatus.REJECTED;
        p.nomineeReviewedAt = block.timestamp;
        p.nomineeRejectReason = reason;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit NomineeClaimRejected(pensioner, p.nomineeWallet, msg.sender, reason, block.timestamp);
    }

    /* ============================================================
        DEATH REPORT FLOW (Nominee reports -> Admin verifies)
    ============================================================ */
    function reportDeathByNominee(string calldata deathCertificateCID) external {
        address pensioner = nomineeToPensioner[msg.sender];
        require(pensioner != address(0), "No pensioner linked");

        Pensioner storage p = pensioners[pensioner];

        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");
        require(p.status == ApplicationStatus.Approved, "Pensioner not approved");
        require(p.nomineeWallet == msg.sender, "Not nominee wallet");

        require(p.nomineeClaimStatus == NomineeClaimStatus.APPROVED, "Nominee not approved");
        require(!p.isDeceased, "Already marked deceased");

        require(bytes(deathCertificateCID).length > 0, "Death certificate CID required");

        require(
            p.deathReportStatus == DeathReportStatus.NONE ||
                p.deathReportStatus == DeathReportStatus.REJECTED,
            "Death already reported"
        );

        p.deathReportStatus = DeathReportStatus.REPORTED;
        p.deathReportedAt = block.timestamp;
        p.deathReviewedAt = 0;
        p.deathReportProofCID = deathCertificateCID;
        p.deathReportRejectReason = "";

        emit DeathReportedByNominee(pensioner, msg.sender, deathCertificateCID, block.timestamp);
    }

    // ✅ UI-Friendly: Admin can verify death using the already reported CID
    function verifyDeathReport(address pensioner) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.deathReportStatus == DeathReportStatus.REPORTED, "No death report");
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        require(bytes(p.deathReportProofCID).length > 0, "Death certificate required");

        p.deathReportStatus = DeathReportStatus.VERIFIED;
        p.deathReviewedAt = block.timestamp;

        // mark deceased
        p.isDeceased = true;
        p.deceasedAt = block.timestamp;
        p.deathProofCID = p.deathReportProofCID;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit DeathReportVerified(pensioner, p.nomineeWallet, msg.sender, block.timestamp);
    }

    // Keep your original version too (optional)
    function verifyDeathReport(address pensioner, string calldata proofCID) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");

        require(p.deathReportStatus == DeathReportStatus.REPORTED, "No death report");
        require(bytes(proofCID).length > 0, "Proof CID required");
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        p.deathReportStatus = DeathReportStatus.VERIFIED;
        p.deathReviewedAt = block.timestamp;

        // mark deceased
        p.isDeceased = true;
        p.deceasedAt = block.timestamp;
        p.deathProofCID = proofCID;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit DeathReportVerified(pensioner, p.nomineeWallet, msg.sender, block.timestamp);
    }

    function rejectDeathReport(address pensioner, string calldata reason) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");
        require(bytes(reason).length > 0, "Reason required");

        Pensioner storage p = pensioners[pensioner];
        require(p.wallet == pensioner, "Not registered");
        require(p.deathReportStatus == DeathReportStatus.REPORTED, "No death report");
        require(p.accountStatus != AccountStatus.CLOSED, "Account closed");

        p.deathReportStatus = DeathReportStatus.REJECTED;
        p.deathReviewedAt = block.timestamp;
        p.deathReportRejectReason = reason;

        // ✅ UPDATED: Now includes msg.sender (admin)
        emit DeathReportRejected(pensioner, p.nomineeWallet, msg.sender, reason, block.timestamp);
    }

    /* ===================== REQUIRED FOR DOCUMENTS CONTRACT ===================== */
    function getProgram(address user) external view returns (uint8) {
        return uint8(pensioners[user].program);
    }

    /* ===================== APPLICANTS LIST (ADMIN UI NEEDS THIS) ===================== */
    function getApplicants() external view returns (address[] memory) {
        return applicants;
    }

    // ✅ Alias for your Admin UI (it calls getAllApplicants())
    function getAllApplicants() external view returns (address[] memory) {
        return applicants;
    }

    function getApplicantsCount() external view returns (uint256) {
        return applicants.length;
    }

    function getApplicantAt(uint256 index) external view returns (address) {
        require(index < applicants.length, "Index out of range");
        return applicants[index];
    }

    // ✅ Returns only Pending applicants (Admin Pending tab)
    function getPendingApplicants() external view returns (address[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].status == ApplicationStatus.Pending) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 k = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].status == ApplicationStatus.Pending) {
                result[k] = applicants[i];
                k++;
            }
        }

        return result;
    }

    // ✅ Returns pensioners who REPORTED death (Admin Death Reports tab)
    function getDeathReportedApplicants() external view returns (address[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].deathReportStatus == DeathReportStatus.REPORTED) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 k = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].deathReportStatus == DeathReportStatus.REPORTED) {
                result[k] = applicants[i];
                k++;
            }
        }

        return result;
    }

    // ✅ Returns pensioners marked deceased (Admin Deceased tab)
    function getDeceasedApplicants() external view returns (address[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].isDeceased) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 k = 0;

        for (uint256 i = 0; i < applicants.length; i++) {
            if (pensioners[applicants[i]].isDeceased) {
                result[k] = applicants[i];
                k++;
            }
        }

        return result;
    }

    /* ===================== VIEW HELPERS ===================== */
    function getMyPensioner() external view returns (Pensioner memory) {
        return pensioners[msg.sender];
    }

    function getStatus(address _user) external view returns (ApplicationStatus) {
        return pensioners[_user].status;
    }

    function getPensioner(address _user) external view returns (Pensioner memory) {
        return pensioners[_user];
    }

    function isRegistered(address _user) external view returns (bool) {
        return pensioners[_user].status != ApplicationStatus.NotRegistered;
    }

    function isAdmin(address _user) external view returns (bool) {
        return _user == admin;
    }

    function isDeceased(address _user) external view returns (bool) {
        return pensioners[_user].isDeceased;
    }

    function getNominee(address _pensioner) external view returns (address) {
        return pensioners[_pensioner].nomineeWallet;
    }

    function isNomineeApproved(address _pensioner) external view returns (bool) {
        return pensioners[_pensioner].nomineeClaimStatus == NomineeClaimStatus.APPROVED;
    }

    function isNominee(address _nominee) external view returns (bool) {
        return nomineeToPensioner[_nominee] != address(0);
    }
}
