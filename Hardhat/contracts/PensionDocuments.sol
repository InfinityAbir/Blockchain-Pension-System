// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* -------------------- REGISTRY INTERFACE -------------------- */
interface IPensionRegistry {
    function isAdmin(address user) external view returns (bool);
    function getStatus(address user) external view returns (uint8);

    // PensionProgram from PensionRegistry:
    // 0 = GPS
    // 1 = PRSS
    function getProgram(address user) external view returns (uint8);

    // nominee -> pensioner mapping
    function nomineeToPensioner(address nominee) external view returns (address);

    // deceased status
    function isDeceased(address pensioner) external view returns (bool);

    // nominee claim approval
    function isNomineeApproved(address pensioner) external view returns (bool);

    // ✅ NEW: Account Status (Closure system)
    // 0 = ACTIVE
    // 1 = CLOSURE_REQUESTED
    // 2 = CLOSED
    function getAccountStatus(address user) external view returns (uint8);
}

/*
ApplicationStatus from PensionRegistry:
0 = NotRegistered
1 = Pending
2 = Approved
3 = Rejected
*/

contract PensionDocuments {
    enum DocumentStatus {
        NONE,
        SUBMITTED,
        APPROVED,
        REJECTED
    }

    // ============================================================
    // Document Groups
    // ============================================================
    enum DocumentGroup {
        GPS_PENSIONER,
        PRSS_PENSIONER,
        NOMINEE_CLAIM
    }

    // ============================================================
    // Documents for GPS pensioner (Govt Pension Scheme)
    // ============================================================
    enum GPSDocumentType {
        NID_FRONT,
        NID_BACK,
        PASSPORT_PHOTO,
        BIRTH_CERTIFICATE,
        EMPLOYMENT_CERTIFICATE,
        SERVICE_RECORD,
        LAST_PAYSLIP,
        PENSION_APPLICATION_FORM,
        BANK_ACCOUNT_PROOF
    }

    // ============================================================
    // Documents for PRSS pensioner (Private Retirement Savings)
    // ============================================================
    enum PRSSDocumentType {
        NID_FRONT,
        NID_BACK,
        PASSPORT_PHOTO,
        BIRTH_CERTIFICATE,
        PRESENT_ADDRESS_PROOF,
        PERMANENT_ADDRESS_PROOF,
        BANK_ACCOUNT_PROOF,
        NOMINEE_FORM,
        NOMINEE_NID
    }

    // ============================================================
    // Documents for nominee claim
    // ============================================================
    enum NomineeDocumentType {
        DEATH_CERTIFICATE,
        NOMINEE_NID,
        RELATIONSHIP_PROOF,
        NOMINEE_BANK_PROOF
    }

    struct Document {
        string ipfsHash;
        DocumentStatus status;
        string rejectReason;
        uint256 updatedAt;
    }

    IPensionRegistry public registry;

    // ==============================
    // STORAGE
    // ==============================
    mapping(address => mapping(GPSDocumentType => Document)) private gpsDocs;
    mapping(address => mapping(PRSSDocumentType => Document)) private prssDocs;

    // nominee docs are stored under nominee wallet address
    mapping(address => mapping(NomineeDocumentType => Document)) private nomineeDocs;

    // submission counts
    mapping(address => uint256) private gpsSubmittedCount;
    mapping(address => uint256) private prssSubmittedCount;
    mapping(address => uint256) private nomineeSubmittedCount;

    // required counts
    uint256 public constant GPS_REQUIRED_DOCS = 9;
    uint256 public constant PRSS_REQUIRED_DOCS = 9;
    uint256 public constant NOMINEE_REQUIRED_DOCS = 4;

    /* -------------------- EVENTS -------------------- */
    event DocumentSubmitted(
        address indexed user,
        DocumentGroup indexed group,
        uint256 indexed docType,
        string ipfsHash,
        uint256 timestamp
    );

    event DocumentApproved(
        address indexed user,
        DocumentGroup indexed group,
        uint256 indexed docType,
        uint256 timestamp
    );

    event DocumentRejected(
        address indexed user,
        DocumentGroup indexed group,
        uint256 indexed docType,
        string reason,
        uint256 timestamp
    );

    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    event DocumentsBatchSubmitted(
        address indexed user,
        DocumentGroup indexed group,
        uint256 count,
        uint256 timestamp
    );

    event DocumentsBatchReviewed(
        address indexed user,
        DocumentGroup indexed group,
        uint256 count,
        uint256 timestamp
    );

    /* -------------------- CONSTRUCTOR -------------------- */
    constructor(address _registryAddress) {
        require(_registryAddress != address(0), "Invalid registry address");
        registry = IPensionRegistry(_registryAddress);
    }

    /* -------------------- MODIFIERS -------------------- */
    modifier onlyAdmin() {
        require(registry.isAdmin(msg.sender), "Only admin allowed");
        _;
    }

    // ✅ Account must be ACTIVE
    modifier onlyActiveAccount(address user) {
        require(registry.getAccountStatus(user) == 0, "Account not active");
        _;
    }

    // pensioner can submit docs when Pending OR Rejected (resubmission)
    modifier onlyPendingOrRejectedPensioner() {
        uint8 s = registry.getStatus(msg.sender);
        require(s == 1 || s == 3, "Not allowed to submit docs now");
        _;
    }

    // nominee can submit claim docs only if they are nominee of a pensioner
    modifier onlyNominee() {
        address pensioner = registry.nomineeToPensioner(msg.sender);
        require(pensioner != address(0), "Not nominee");
        _;
    }

    /* -------------------- ADMIN CONFIG -------------------- */
    function setRegistry(address newRegistry) external onlyAdmin {
        require(newRegistry != address(0), "Invalid registry address");

        address old = address(registry);
        registry = IPensionRegistry(newRegistry);

        emit RegistryUpdated(old, newRegistry);
    }

    function getRegistryAddress() external view returns (address) {
        return address(registry);
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    function _submitGPS(address pensioner, GPSDocumentType docType, string calldata ipfsHash) internal {
        require(bytes(ipfsHash).length > 0, "Invalid IPFS hash");

        Document storage d = gpsDocs[pensioner][docType];

        if (d.status == DocumentStatus.NONE) {
            gpsSubmittedCount[pensioner] += 1;
        }

        d.ipfsHash = ipfsHash;
        d.status = DocumentStatus.SUBMITTED;
        d.rejectReason = "";
        d.updatedAt = block.timestamp;

        emit DocumentSubmitted(
            pensioner,
            DocumentGroup.GPS_PENSIONER,
            uint256(docType),
            ipfsHash,
            block.timestamp
        );
    }

    function _submitPRSS(address pensioner, PRSSDocumentType docType, string calldata ipfsHash) internal {
        require(bytes(ipfsHash).length > 0, "Invalid IPFS hash");

        Document storage d = prssDocs[pensioner][docType];

        if (d.status == DocumentStatus.NONE) {
            prssSubmittedCount[pensioner] += 1;
        }

        d.ipfsHash = ipfsHash;
        d.status = DocumentStatus.SUBMITTED;
        d.rejectReason = "";
        d.updatedAt = block.timestamp;

        emit DocumentSubmitted(
            pensioner,
            DocumentGroup.PRSS_PENSIONER,
            uint256(docType),
            ipfsHash,
            block.timestamp
        );
    }

    function _submitNominee(address nominee, NomineeDocumentType docType, string calldata ipfsHash) internal {
        require(bytes(ipfsHash).length > 0, "Invalid IPFS hash");

        Document storage d = nomineeDocs[nominee][docType];

        if (d.status == DocumentStatus.NONE) {
            nomineeSubmittedCount[nominee] += 1;
        }

        d.ipfsHash = ipfsHash;
        d.status = DocumentStatus.SUBMITTED;
        d.rejectReason = "";
        d.updatedAt = block.timestamp;

        emit DocumentSubmitted(
            nominee,
            DocumentGroup.NOMINEE_CLAIM,
            uint256(docType),
            ipfsHash,
            block.timestamp
        );
    }

    // ============================================================
    // PENSIONER SUBMISSION (AUTO GPS/PRSS)
    // ============================================================

    function submitPensionerDocument(uint256 docType, string calldata ipfsHash)
        external
        onlyActiveAccount(msg.sender)
        onlyPendingOrRejectedPensioner
    {
        uint8 program = registry.getProgram(msg.sender);

        if (program == 0) {
            require(docType < GPS_REQUIRED_DOCS, "Invalid GPS doc type");
            _submitGPS(msg.sender, GPSDocumentType(docType), ipfsHash);
        } else if (program == 1) {
            require(docType < PRSS_REQUIRED_DOCS, "Invalid PRSS doc type");
            _submitPRSS(msg.sender, PRSSDocumentType(docType), ipfsHash);
        } else {
            revert("Invalid program");
        }
    }

    function submitPensionerDocumentsBatch(uint256[] calldata docTypes, string[] calldata ipfsHashes)
        external
        onlyActiveAccount(msg.sender)
        onlyPendingOrRejectedPensioner
    {
        require(docTypes.length > 0, "No documents");
        require(docTypes.length == ipfsHashes.length, "Length mismatch");

        uint8 program = registry.getProgram(msg.sender);

        if (program == 0) {
            require(docTypes.length <= GPS_REQUIRED_DOCS, "Too many GPS docs");
            for (uint256 i = 0; i < docTypes.length; i++) {
                require(docTypes[i] < GPS_REQUIRED_DOCS, "Invalid GPS doc type");
                _submitGPS(msg.sender, GPSDocumentType(docTypes[i]), ipfsHashes[i]);
            }
            emit DocumentsBatchSubmitted(msg.sender, DocumentGroup.GPS_PENSIONER, docTypes.length, block.timestamp);
        } else if (program == 1) {
            require(docTypes.length <= PRSS_REQUIRED_DOCS, "Too many PRSS docs");
            for (uint256 i = 0; i < docTypes.length; i++) {
                require(docTypes[i] < PRSS_REQUIRED_DOCS, "Invalid PRSS doc type");
                _submitPRSS(msg.sender, PRSSDocumentType(docTypes[i]), ipfsHashes[i]);
            }
            emit DocumentsBatchSubmitted(msg.sender, DocumentGroup.PRSS_PENSIONER, docTypes.length, block.timestamp);
        } else {
            revert("Invalid program");
        }
    }

    // ============================================================
    // NOMINEE SUBMISSION (CLAIM DOCS)
    // ============================================================

    function submitNomineeClaimDocument(uint256 docType, string calldata ipfsHash)
        external
        onlyNominee
    {
        require(docType < NOMINEE_REQUIRED_DOCS, "Invalid nominee doc type");

        address pensioner = registry.nomineeToPensioner(msg.sender);

        // ✅ pensioner must be ACTIVE (not closed)
        require(registry.getAccountStatus(pensioner) == 0, "Pensioner account not active");

        // nominee can submit only after pensioner is marked deceased
        require(registry.isDeceased(pensioner), "Pensioner not deceased");

        _submitNominee(msg.sender, NomineeDocumentType(docType), ipfsHash);
    }

    function submitNomineeClaimDocumentsBatch(uint256[] calldata docTypes, string[] calldata ipfsHashes)
        external
        onlyNominee
    {
        require(docTypes.length > 0, "No documents");
        require(docTypes.length == ipfsHashes.length, "Length mismatch");
        require(docTypes.length <= NOMINEE_REQUIRED_DOCS, "Too many nominee docs");

        address pensioner = registry.nomineeToPensioner(msg.sender);

        // ✅ pensioner must be ACTIVE (not closed)
        require(registry.getAccountStatus(pensioner) == 0, "Pensioner account not active");

        require(registry.isDeceased(pensioner), "Pensioner not deceased");

        for (uint256 i = 0; i < docTypes.length; i++) {
            require(docTypes[i] < NOMINEE_REQUIRED_DOCS, "Invalid nominee doc type");
            _submitNominee(msg.sender, NomineeDocumentType(docTypes[i]), ipfsHashes[i]);
        }

        emit DocumentsBatchSubmitted(msg.sender, DocumentGroup.NOMINEE_CLAIM, docTypes.length, block.timestamp);
    }

    // ============================================================
    // ADMIN REVIEW (SINGLE)
    // ============================================================

    function approveDocument(address user, DocumentGroup group, uint256 docType) external onlyAdmin {
        require(user != address(0), "Invalid user");

        if (group == DocumentGroup.GPS_PENSIONER) {
            require(docType < GPS_REQUIRED_DOCS, "Invalid GPS doc type");
            Document storage d = gpsDocs[user][GPSDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.APPROVED;
            d.rejectReason = "";
            d.updatedAt = block.timestamp;
        }
        else if (group == DocumentGroup.PRSS_PENSIONER) {
            require(docType < PRSS_REQUIRED_DOCS, "Invalid PRSS doc type");
            Document storage d = prssDocs[user][PRSSDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.APPROVED;
            d.rejectReason = "";
            d.updatedAt = block.timestamp;
        }
        else {
            require(docType < NOMINEE_REQUIRED_DOCS, "Invalid nominee doc type");
            Document storage d = nomineeDocs[user][NomineeDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.APPROVED;
            d.rejectReason = "";
            d.updatedAt = block.timestamp;
        }

        emit DocumentApproved(user, group, docType, block.timestamp);
    }

    function rejectDocument(address user, DocumentGroup group, uint256 docType, string calldata reason)
        external
        onlyAdmin
    {
        require(user != address(0), "Invalid user");
        require(bytes(reason).length > 0, "Reason required");

        if (group == DocumentGroup.GPS_PENSIONER) {
            require(docType < GPS_REQUIRED_DOCS, "Invalid GPS doc type");
            Document storage d = gpsDocs[user][GPSDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.REJECTED;
            d.rejectReason = reason;
            d.updatedAt = block.timestamp;
        }
        else if (group == DocumentGroup.PRSS_PENSIONER) {
            require(docType < PRSS_REQUIRED_DOCS, "Invalid PRSS doc type");
            Document storage d = prssDocs[user][PRSSDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.REJECTED;
            d.rejectReason = reason;
            d.updatedAt = block.timestamp;
        }
        else {
            require(docType < NOMINEE_REQUIRED_DOCS, "Invalid nominee doc type");
            Document storage d = nomineeDocs[user][NomineeDocumentType(docType)];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");
            d.status = DocumentStatus.REJECTED;
            d.rejectReason = reason;
            d.updatedAt = block.timestamp;
        }

        emit DocumentRejected(user, group, docType, reason, block.timestamp);
    }

    // ============================================================
    // ✅ ADMIN REVIEW (BATCH)
    // ============================================================

    function reviewGPSDocumentsBatch(
        address pensioner,
        uint256[] calldata docTypes,
        bool[] calldata decisions,
        string[] calldata reasons
    ) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");
        require(docTypes.length > 0, "No documents");
        require(docTypes.length == decisions.length, "Length mismatch");
        require(docTypes.length == reasons.length, "Length mismatch");

        for (uint256 i = 0; i < docTypes.length; i++) {
            require(docTypes[i] < GPS_REQUIRED_DOCS, "Invalid GPS doc type");

            Document storage d = gpsDocs[pensioner][GPSDocumentType(docTypes[i])];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");

            if (decisions[i]) {
                d.status = DocumentStatus.APPROVED;
                d.rejectReason = "";
                d.updatedAt = block.timestamp;

                emit DocumentApproved(
                    pensioner,
                    DocumentGroup.GPS_PENSIONER,
                    docTypes[i],
                    block.timestamp
                );
            } else {
                require(bytes(reasons[i]).length > 0, "Reason required");

                d.status = DocumentStatus.REJECTED;
                d.rejectReason = reasons[i];
                d.updatedAt = block.timestamp;

                emit DocumentRejected(
                    pensioner,
                    DocumentGroup.GPS_PENSIONER,
                    docTypes[i],
                    reasons[i],
                    block.timestamp
                );
            }
        }

        emit DocumentsBatchReviewed(pensioner, DocumentGroup.GPS_PENSIONER, docTypes.length, block.timestamp);
    }

    function reviewPRSSDocumentsBatch(
        address pensioner,
        uint256[] calldata docTypes,
        bool[] calldata decisions,
        string[] calldata reasons
    ) external onlyAdmin {
        require(pensioner != address(0), "Invalid pensioner");
        require(docTypes.length > 0, "No documents");
        require(docTypes.length == decisions.length, "Length mismatch");
        require(docTypes.length == reasons.length, "Length mismatch");

        for (uint256 i = 0; i < docTypes.length; i++) {
            require(docTypes[i] < PRSS_REQUIRED_DOCS, "Invalid PRSS doc type");

            Document storage d = prssDocs[pensioner][PRSSDocumentType(docTypes[i])];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");

            if (decisions[i]) {
                d.status = DocumentStatus.APPROVED;
                d.rejectReason = "";
                d.updatedAt = block.timestamp;

                emit DocumentApproved(
                    pensioner,
                    DocumentGroup.PRSS_PENSIONER,
                    docTypes[i],
                    block.timestamp
                );
            } else {
                require(bytes(reasons[i]).length > 0, "Reason required");

                d.status = DocumentStatus.REJECTED;
                d.rejectReason = reasons[i];
                d.updatedAt = block.timestamp;

                emit DocumentRejected(
                    pensioner,
                    DocumentGroup.PRSS_PENSIONER,
                    docTypes[i],
                    reasons[i],
                    block.timestamp
                );
            }
        }

        emit DocumentsBatchReviewed(pensioner, DocumentGroup.PRSS_PENSIONER, docTypes.length, block.timestamp);
    }

    function reviewNomineeDocumentsBatch(
        address nominee,
        uint256[] calldata docTypes,
        bool[] calldata decisions,
        string[] calldata reasons
    ) external onlyAdmin {
        require(nominee != address(0), "Invalid nominee");
        require(docTypes.length > 0, "No documents");
        require(docTypes.length == decisions.length, "Length mismatch");
        require(docTypes.length == reasons.length, "Length mismatch");

        for (uint256 i = 0; i < docTypes.length; i++) {
            require(docTypes[i] < NOMINEE_REQUIRED_DOCS, "Invalid nominee doc type");

            Document storage d = nomineeDocs[nominee][NomineeDocumentType(docTypes[i])];
            require(d.status == DocumentStatus.SUBMITTED, "Doc not submitted");

            if (decisions[i]) {
                d.status = DocumentStatus.APPROVED;
                d.rejectReason = "";
                d.updatedAt = block.timestamp;

                emit DocumentApproved(
                    nominee,
                    DocumentGroup.NOMINEE_CLAIM,
                    docTypes[i],
                    block.timestamp
                );
            } else {
                require(bytes(reasons[i]).length > 0, "Reason required");

                d.status = DocumentStatus.REJECTED;
                d.rejectReason = reasons[i];
                d.updatedAt = block.timestamp;

                emit DocumentRejected(
                    nominee,
                    DocumentGroup.NOMINEE_CLAIM,
                    docTypes[i],
                    reasons[i],
                    block.timestamp
                );
            }
        }

        emit DocumentsBatchReviewed(nominee, DocumentGroup.NOMINEE_CLAIM, docTypes.length, block.timestamp);
    }

    // ============================================================
    // CHECKERS (Used by Registry approve)
    // ============================================================

    function areAllDocumentsApproved(address pensioner) external view returns (bool) {
        return _areAllPensionerDocumentsApproved(pensioner);
    }

    function areAllPensionerDocumentsApproved(address pensioner) external view returns (bool) {
        return _areAllPensionerDocumentsApproved(pensioner);
    }

    function _areAllPensionerDocumentsApproved(address pensioner) internal view returns (bool) {
        if (pensioner == address(0)) return false;

        uint8 program = registry.getProgram(pensioner);

        if (program == 0) {
            if (gpsSubmittedCount[pensioner] < GPS_REQUIRED_DOCS) return false;

            for (uint256 i = 0; i < GPS_REQUIRED_DOCS; i++) {
                if (gpsDocs[pensioner][GPSDocumentType(i)].status != DocumentStatus.APPROVED) {
                    return false;
                }
            }
            return true;
        }

        if (program == 1) {
            if (prssSubmittedCount[pensioner] < PRSS_REQUIRED_DOCS) return false;

            for (uint256 i = 0; i < PRSS_REQUIRED_DOCS; i++) {
                if (prssDocs[pensioner][PRSSDocumentType(i)].status != DocumentStatus.APPROVED) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    function areAllNomineeDocumentsApproved(address nominee) external view returns (bool) {
        if (nominee == address(0)) return false;

        if (nomineeSubmittedCount[nominee] < NOMINEE_REQUIRED_DOCS) return false;

        for (uint256 i = 0; i < NOMINEE_REQUIRED_DOCS; i++) {
            if (nomineeDocs[nominee][NomineeDocumentType(i)].status != DocumentStatus.APPROVED) {
                return false;
            }
        }

        return true;
    }

    // ============================================================
    // VIEW HELPERS
    // ============================================================

    function getGPSDocument(address pensioner, uint256 docType) external view returns (Document memory) {
        require(pensioner != address(0), "Invalid pensioner");
        require(docType < GPS_REQUIRED_DOCS, "Invalid doc type");
        return gpsDocs[pensioner][GPSDocumentType(docType)];
    }

    function getPRSSDocument(address pensioner, uint256 docType) external view returns (Document memory) {
        require(pensioner != address(0), "Invalid pensioner");
        require(docType < PRSS_REQUIRED_DOCS, "Invalid doc type");
        return prssDocs[pensioner][PRSSDocumentType(docType)];
    }

    function getNomineeDocument(address nominee, uint256 docType) external view returns (Document memory) {
        require(nominee != address(0), "Invalid nominee");
        require(docType < NOMINEE_REQUIRED_DOCS, "Invalid doc type");
        return nomineeDocs[nominee][NomineeDocumentType(docType)];
    }

    function getGPSSubmittedCount(address pensioner) external view returns (uint256) {
        return gpsSubmittedCount[pensioner];
    }

    function getPRSSSubmittedCount(address pensioner) external view returns (uint256) {
        return prssSubmittedCount[pensioner];
    }

    function getNomineeSubmittedCount(address nominee) external view returns (uint256) {
        return nomineeSubmittedCount[nominee];
    }
}
