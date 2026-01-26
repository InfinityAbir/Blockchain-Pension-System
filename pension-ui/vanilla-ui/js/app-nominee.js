// app-nominee.js
import { requireLogin, logout, shortAddress } from "./auth.js";
import { toast, setLoading } from "./ui.js";
import {
  getRegistryContract,
  getDocumentsContract,
  getDisbursementContract,
  STATUS,
  getProvider,
} from "./contracts.js";
import { uploadToIPFS } from "./ipfs.js";

let account = requireLogin();

try {
  account = ethers.getAddress(String(account).trim());
} catch (e) {
  console.error("Invalid stored account:", account);
  toast("Invalid wallet saved. Please login again.", "error");
  logout();
}

/* ===================== ELEMENTS ===================== */
const btnRefresh = document.getElementById("btnRefresh");

/* Step 1: Report Death */
const btnReportDeath = document.getElementById("btnReportDeath");
const btnOpenDeathProof = document.getElementById("btnOpenDeathProof");
const deathCertCIDInput = document.getElementById("deathCertCID");

/* Upload Death Certificate */
const deathCertFile = document.getElementById("deathCertFile");
const btnUploadDeathCert = document.getElementById("btnUploadDeathCert");

/* Step 2: Apply Claim */
const btnApplyClaim = document.getElementById("btnApplyClaim");
const btnOpenClaimProof = document.getElementById("btnOpenClaimProof");

/* Claim Inputs */
const nomineeNidCIDInput = document.getElementById("nomineeNidCID");
const relationProofCIDInput = document.getElementById("relationProofCID");

/* Upload Claim Proofs */
const nomineeNidFile = document.getElementById("nomineeNidFile");
const btnUploadNomineeNid = document.getElementById("btnUploadNomineeNid");

const relationProofFile = document.getElementById("relationProofFile");
const btnUploadRelationProof = document.getElementById(
  "btnUploadRelationProof",
);

/* Nominee Bank Proof */
const nomineeBankCIDInput = document.getElementById("nomineeBankCID");
const nomineeBankFile = document.getElementById("nomineeBankFile");
const btnUploadNomineeBank = document.getElementById("btnUploadNomineeBank");

/* Step 3: Withdraw (Nominee) */
const nomineePensionStartedEl = document.getElementById(
  "nomineePensionStarted",
);
const nomineeMonthlyAmountEl = document.getElementById("nomineeMonthlyAmount");
const btnWithdrawNominee = document.getElementById("btnWithdrawNominee");
const nomineePensionModeEl = document.getElementById("nomineePensionMode");
const btnNomineeWithdrawFull = document.getElementById(
  "btnNomineeWithdrawFull",
);

/* Eligibility Notice UI */
const nomineeEligibilityBox = document.getElementById("nomineeEligibilityBox");
const nomineeEligibilityTitle = document.getElementById(
  "nomineeEligibilityTitle",
);
const nomineeEligibilityText = document.getElementById(
  "nomineeEligibilityText",
);

/* Family Pension Limit UI */
const familyPensionAllowedEl = document.getElementById("familyPensionAllowed");
const familyPensionHintEl = document.getElementById("familyPensionHint");
const familyPensionUsedMonthsEl = document.getElementById(
  "familyPensionUsedMonths",
);
const familyPensionRemainingMonthsEl = document.getElementById(
  "familyPensionRemainingMonths",
);

/* GPS Nominee Gratuity UI */
const gpsNomineeGratuityBox = document.getElementById("gpsNomineeGratuityBox");
const gpsNomineeGratuityStatusEl = document.getElementById(
  "gpsNomineeGratuityStatus",
);
const gpsNomineeGratuityAmountEl = document.getElementById(
  "gpsNomineeGratuityAmount",
);
const gpsNomineeGratuityEligibleEl = document.getElementById(
  "gpsNomineeGratuityEligible",
);
const btnNomineeClaimGratuity = document.getElementById(
  "btnNomineeClaimGratuity",
);

/* Reject Boxes */
const deathRejectReasonBox = document.getElementById("deathRejectReasonBox");
const deathRejectReasonText = document.getElementById("deathRejectReasonText");

const claimRejectReasonBox = document.getElementById("claimRejectReasonBox");
const claimRejectReasonText = document.getElementById("claimRejectReasonText");

/* History Elements */
const btnLoadNomineeHistory = document.getElementById("btnLoadNomineeHistory");
const deathReportedAtEl = document.getElementById("deathReportedAt");
const claimAppliedAtEl = document.getElementById("claimAppliedAt");
const claimApprovedAtEl = document.getElementById("claimApprovedAt");
const nomineeWithdrawHistoryBody = document.getElementById(
  "nomineeWithdrawHistoryBody",
);

/* ✅ NEW: Pensioner Account Status UI */
const pensionerAccountStatusEl = document.getElementById(
  "pensionerAccountStatus",
);
const pensionerAccountStatusHintEl = document.getElementById(
  "pensionerAccountStatusHint",
);
const accountStatusNoticeBox = document.getElementById(
  "accountStatusNoticeBox",
);
const accountStatusNoticeText = document.getElementById(
  "accountStatusNoticeText",
);

/* ===================== STATE ===================== */
let linkedPensioner = ethers.ZeroAddress;

let lastDeathCertCID = "";
let lastNomineeNidCID = "";
let lastRelationProofCID = "";
let lastNomineeBankCID = "";

/* ===================== ENUMS ===================== */
// keep safe even if ABI changes later
const ACCOUNT_STATUS = {
  ACTIVE: 0,
  CLOSURE_REQUESTED: 1,
  CLOSED: 2,
};

// Program: 0 = GPS, 1 = PRSS
const PROGRAM = {
  GPS: 0,
  PRSS: 1,
};

/* ===================== HELPERS ===================== */
function extractNiceError(err) {
  const msg =
    err?.reason || err?.shortMessage || err?.message || "Transaction failed";

  if (msg.includes("No linked pensioner")) return "No linked pensioner found.";
  if (msg.includes("Invalid pensioner")) return "Invalid pensioner wallet.";
  if (msg.includes("Only nominee")) return "Only nominee wallet can do this.";

  if (msg.includes("Death certificate CID required"))
    return "Death certificate CID is required.";
  if (msg.includes("Already marked deceased"))
    return "This pensioner is already marked deceased.";
  if (msg.includes("Pensioner not approved"))
    return "Pensioner must be approved first.";
  if (msg.includes("Death already reported"))
    return "Death already reported. Wait for admin verification.";

  if (msg.includes("Death not verified"))
    return "Admin must verify the death report first.";

  if (msg.includes("Nominee NID CID required"))
    return "Nominee NID CID is required.";
  if (msg.includes("Relationship CID required"))
    return "Relationship proof CID is required.";
  if (msg.includes("Nominee bank proof CID is required"))
    return "Nominee bank proof CID is required.";

  if (msg.includes("Nominee not approved"))
    return "Admin has not approved your nominee claim yet.";

  if (msg.includes("Pension not started"))
    return "Pension is not started yet. Pensioner must start pension first.";

  if (msg.includes("Too early"))
    return "Too early. You can withdraw once every 30 days.";

  if (msg.includes("Family pension period ended"))
    return "Family pension period ended. You cannot withdraw monthly anymore.";

  if (msg.includes("Monthly nominee pension not allowed for this relation"))
    return "Monthly nominee pension is not allowed for this relation (only spouse/child/parent).";

  if (msg.includes("Not GPS pensioner"))
    return "This option works only for GPS pensioners.";
  if (msg.includes("GPS data not verified"))
    return "GPS service info not verified by admin yet.";
  if (msg.includes("Pensioner not deceased"))
    return "Pensioner must be marked deceased first.";
  if (msg.includes("Gratuity already claimed"))
    return "Gratuity already claimed.";
  if (msg.includes("Gratuity already taken"))
    return "Gratuity already taken earlier.";
  if (msg.includes("Nominee wallet missing"))
    return "Nominee wallet missing in registry.";
  if (msg.includes("Nominee claim is not approved"))
    return "Nominee claim must be approved by admin first.";

  if (msg.includes("Account not active") || msg.includes("Account closed")) {
    return "Pensioner account is not active. Actions are locked.";
  }

  if (msg.includes("deferred error during ABI decoding")) {
    return "Contract read failed (ABI mismatch / wrong address). Check config.js deployed addresses.";
  }

  if (msg.includes("user rejected") || msg.includes("User rejected")) {
    return "You cancelled the transaction in MetaMask.";
  }

  return msg;
}

function claimStatusText(code) {
  const n = Number(code);
  if (n === 0) return "NONE";
  if (n === 1) return "APPLIED";
  if (n === 2) return "APPROVED";
  if (n === 3) return "REJECTED";
  return "UNKNOWN";
}

function statusText(st) {
  const n = Number(st);
  if (n === STATUS.NOT_REGISTERED) return "Not Registered";
  if (n === STATUS.PENDING) return "Pending";
  if (n === STATUS.APPROVED) return "Approved";
  if (n === STATUS.REJECTED) return "Rejected";
  return "Unknown";
}

function openIpfs(cid) {
  if (!cid) return;
  window.open(`https://gateway.pinata.cloud/ipfs/${cid}`, "_blank");
}

function prettyEth(wei) {
  try {
    return ethers.formatEther(BigInt(wei));
  } catch {
    return "0";
  }
}

function formatTime(ts) {
  const n = Number(ts || 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

function shortTx(hash) {
  if (!hash) return "—";
  return hash.slice(0, 10) + "..." + hash.slice(-8);
}

async function getBlockTimestamp(provider, blockNumber) {
  const block = await provider.getBlock(blockNumber);
  return Number(block?.timestamp || 0);
}

function setEmptyTable(tbody, msg) {
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="text-secondary small">${msg}</td>
    </tr>
  `;
}

function renderRows(tbody, rows) {
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    setEmptyTable(tbody, "No withdrawal history found yet.");
    return;
  }

  tbody.innerHTML = rows
    .map((r, idx) => {
      return `
        <tr>
          <td class="text-secondary small">${idx + 1}</td>
          <td class="fw-semibold">${r.amountEth}</td>
          <td class="text-secondary small">${r.time}</td>
          <td class="text-secondary small" style="word-break:break-all;">
            ${shortTx(r.txHash)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function pensionModeName(code) {
  const n = Number(code);
  if (n === 0) return "Not Chosen";
  if (n === 1) return "Monthly";
  if (n === 2) return "Lump Sum";
  if (n === 3) return "Gratuity Taken";
  return "Unknown";
}

function lockAllNomineeActions(reason = "") {
  const btns = [
    btnReportDeath,
    btnOpenDeathProof,
    btnApplyClaim,
    btnOpenClaimProof,
    btnUploadDeathCert,
    btnUploadNomineeNid,
    btnUploadRelationProof,
    btnUploadNomineeBank,
    btnWithdrawNominee,
    btnNomineeWithdrawFull,
    btnNomineeClaimGratuity,
  ];

  for (const b of btns) {
    if (!b) continue;
    b.disabled = true;
    b.title = reason;
  }
}

function renderAccountStatusUI(st) {
  const s = Number(st);

  if (pensionerAccountStatusEl) {
    if (s === ACCOUNT_STATUS.ACTIVE)
      pensionerAccountStatusEl.textContent = "ACTIVE";
    else if (s === ACCOUNT_STATUS.CLOSURE_REQUESTED)
      pensionerAccountStatusEl.textContent = "CLOSURE REQUESTED";
    else if (s === ACCOUNT_STATUS.CLOSED)
      pensionerAccountStatusEl.textContent = "CLOSED";
    else pensionerAccountStatusEl.textContent = `UNKNOWN (${s})`;
  }

  if (pensionerAccountStatusHintEl) {
    if (s === ACCOUNT_STATUS.ACTIVE)
      pensionerAccountStatusHintEl.textContent =
        "Nominee actions can proceed normally.";
    else if (s === ACCOUNT_STATUS.CLOSURE_REQUESTED)
      pensionerAccountStatusHintEl.textContent =
        "Admin review pending. Actions may be locked.";
    else if (s === ACCOUNT_STATUS.CLOSED)
      pensionerAccountStatusHintEl.textContent =
        "Account closed. Nominee actions are locked.";
    else pensionerAccountStatusHintEl.textContent = "—";
  }

  if (!accountStatusNoticeBox || !accountStatusNoticeText) return;

  if (s === ACCOUNT_STATUS.ACTIVE) {
    accountStatusNoticeBox.classList.add("d-none");
    accountStatusNoticeText.textContent = "";
  } else if (s === ACCOUNT_STATUS.CLOSURE_REQUESTED) {
    accountStatusNoticeBox.classList.remove("d-none");
    accountStatusNoticeText.innerHTML = `
      Pensioner account closure request is <b>pending admin review</b>.
      <br/>
      Nominee actions are locked until admin decision.
    `;
  } else if (s === ACCOUNT_STATUS.CLOSED) {
    accountStatusNoticeBox.classList.remove("d-none");
    accountStatusNoticeText.innerHTML = `
      Pensioner account is <b>closed</b>.
      <br/>
      You cannot report death, apply claim, or withdraw anymore.
    `;
  } else {
    accountStatusNoticeBox.classList.remove("d-none");
    accountStatusNoticeText.textContent =
      "Account status could not be determined.";
  }
}

/* ===================== LOAD NOMINEE DOCS ===================== */
async function loadNomineeDocsFromChain() {
  try {
    const docs = await getDocumentsContract(true);

    const d0 = await docs.getNomineeDocument(account, 0);
    const d1 = await docs.getNomineeDocument(account, 1);
    const d2 = await docs.getNomineeDocument(account, 2);
    const d3 = await docs.getNomineeDocument(account, 3);

    lastDeathCertCID = d0?.ipfsHash || "";
    lastNomineeNidCID = d1?.ipfsHash || "";
    lastRelationProofCID = d2?.ipfsHash || "";
    lastNomineeBankCID = d3?.ipfsHash || "";

    if (deathCertCIDInput) deathCertCIDInput.value = lastDeathCertCID || "";
    if (nomineeNidCIDInput) nomineeNidCIDInput.value = lastNomineeNidCID || "";
    if (relationProofCIDInput)
      relationProofCIDInput.value = lastRelationProofCID || "";
    if (nomineeBankCIDInput)
      nomineeBankCIDInput.value = lastNomineeBankCID || "";
  } catch (e) {
    console.warn("loadNomineeDocsFromChain failed:", e);
  }
}

/* ===================== LOAD HISTORY ===================== */
async function loadNomineeHistory() {
  try {
    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    if (btnLoadNomineeHistory)
      setLoading(btnLoadNomineeHistory, true, "Loading...");

    const provider = await getProvider();
    const registry = await getRegistryContract(true);
    const disb = await getDisbursementContract(true);

    if (deathReportedAtEl) deathReportedAtEl.textContent = "—";
    if (claimAppliedAtEl) claimAppliedAtEl.textContent = "—";
    if (claimApprovedAtEl) claimApprovedAtEl.textContent = "—";

    // Death report submitted time
    let deathReportedAt = 0;
    try {
      const f1 = registry.filters.DeathReportedByNominee(
        linkedPensioner,
        null,
        null,
        null,
      );

      const logs = await registry.queryFilter(f1, 0, "latest");
      if (logs.length > 0) {
        const last = logs[logs.length - 1];
        deathReportedAt = Number(last?.args?.timestamp || 0);
        if (!deathReportedAt) {
          deathReportedAt = await getBlockTimestamp(provider, last.blockNumber);
        }
      }
    } catch (e) {
      console.warn("DeathReportedByNominee event failed:", e);
    }

    if (deathReportedAtEl) {
      deathReportedAtEl.textContent = deathReportedAt
        ? formatTime(deathReportedAt)
        : "Not submitted yet";
    }

    // Claim applied time
    let claimAppliedAt = 0;
    try {
      const f2 = registry.filters.NomineeClaimApplied(
        linkedPensioner,
        null,
        null,
        null,
        null,
      );

      const logs = await registry.queryFilter(f2, 0, "latest");
      if (logs.length > 0) {
        const last = logs[logs.length - 1];
        claimAppliedAt = Number(last?.args?.timestamp || 0);
        if (!claimAppliedAt) {
          claimAppliedAt = await getBlockTimestamp(provider, last.blockNumber);
        }
      }
    } catch (e) {
      console.warn("NomineeClaimApplied event failed:", e);
    }

    if (claimAppliedAtEl) {
      claimAppliedAtEl.textContent = claimAppliedAt
        ? formatTime(claimAppliedAt)
        : "Not applied yet";
    }

    // Claim approved time
    let claimApprovedAt = 0;
    try {
      const f3 = registry.filters.NomineeClaimApproved(
        linkedPensioner,
        null,
        null,
      );

      const logs = await registry.queryFilter(f3, 0, "latest");
      if (logs.length > 0) {
        const last = logs[logs.length - 1];
        claimApprovedAt = Number(last?.args?.timestamp || 0);
        if (!claimApprovedAt) {
          claimApprovedAt = await getBlockTimestamp(provider, last.blockNumber);
        }
      }
    } catch (e) {
      console.warn("NomineeClaimApproved event failed:", e);
    }

    if (claimApprovedAtEl) {
      claimApprovedAtEl.textContent = claimApprovedAt
        ? formatTime(claimApprovedAt)
        : "Not approved yet";
    }

    // Withdraw history
    try {
      const rows = [];

      const wFilter = disb.filters.MonthlyNomineePensionWithdrawn?.(
        linkedPensioner,
        account,
        null,
        null,
      );

      if (wFilter) {
        const logs = await disb.queryFilter(wFilter, 0, "latest");

        for (const log of logs) {
          const amount = log?.args?.amount ?? 0n;
          const ts = log?.args?.timestamp ?? 0n;

          rows.push({
            amountEth: prettyEth(amount) + " ETH (MONTHLY)",
            time: formatTime(ts),
            txHash: log.transactionHash,
            sortTs: Number(ts || 0),
          });
        }
      }

      const fFilter = disb.filters.FullNomineePensionWithdrawn?.(
        linkedPensioner,
        account,
        null,
        null,
      );

      if (fFilter) {
        const logs2 = await disb.queryFilter(fFilter, 0, "latest");

        for (const log of logs2) {
          const amount = log?.args?.amount ?? 0n;
          const ts = log?.args?.timestamp ?? 0n;

          rows.push({
            amountEth: prettyEth(amount) + " ETH (FULL)",
            time: formatTime(ts),
            txHash: log.transactionHash,
            sortTs: Number(ts || 0),
          });
        }
      }

      const gFilter = disb.filters.GPSGratuityPaidToNominee?.(
        linkedPensioner,
        account,
        null,
        null,
      );

      if (gFilter) {
        const logs3 = await disb.queryFilter(gFilter, 0, "latest");

        for (const log of logs3) {
          const amount = log?.args?.amountWei ?? 0n;
          const ts = log?.args?.timestamp ?? 0n;

          rows.push({
            amountEth: prettyEth(amount) + " ETH (GRATUITY)",
            time: formatTime(ts),
            txHash: log.transactionHash,
            sortTs: Number(ts || 0),
          });
        }
      }

      rows.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
      renderRows(nomineeWithdrawHistoryBody, rows);
    } catch (e) {
      console.warn("Nominee withdraw history failed:", e);
      setEmptyTable(nomineeWithdrawHistoryBody, "Failed to load withdrawals.");
    }

    toast("Nominee history loaded ✔", "success");
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Failed to load nominee history", "error");
  } finally {
    if (btnLoadNomineeHistory) setLoading(btnLoadNomineeHistory, false);
  }
}

/* ===================== LOAD PAGE ===================== */
async function loadNomineePage() {
  try {
    const registry = await getRegistryContract(true);

    linkedPensioner = await registry.nomineeToPensioner(account);

    // reset step3 UI defaults
    if (nomineePensionStartedEl) nomineePensionStartedEl.textContent = "—";
    if (nomineePensionModeEl) nomineePensionModeEl.textContent = "—";
    if (nomineeMonthlyAmountEl) nomineeMonthlyAmountEl.textContent = "—";

    if (familyPensionAllowedEl) familyPensionAllowedEl.textContent = "—";
    if (familyPensionHintEl) familyPensionHintEl.textContent = "—";
    if (familyPensionUsedMonthsEl) familyPensionUsedMonthsEl.textContent = "—";
    if (familyPensionRemainingMonthsEl)
      familyPensionRemainingMonthsEl.textContent = "—";

    // eligibility box reset
    if (nomineeEligibilityBox) nomineeEligibilityBox.classList.add("d-none");
    if (nomineeEligibilityTitle) nomineeEligibilityTitle.textContent = "—";
    if (nomineeEligibilityText) nomineeEligibilityText.textContent = "—";

    // account status reset
    if (pensionerAccountStatusEl) pensionerAccountStatusEl.textContent = "—";
    if (pensionerAccountStatusHintEl)
      pensionerAccountStatusHintEl.textContent = "—";
    accountStatusNoticeBox?.classList.add("d-none");
    if (accountStatusNoticeText) accountStatusNoticeText.textContent = "—";

    // GPS gratuity reset
    gpsNomineeGratuityBox?.classList.add("d-none");
    if (gpsNomineeGratuityStatusEl)
      gpsNomineeGratuityStatusEl.textContent = "—";
    if (gpsNomineeGratuityAmountEl)
      gpsNomineeGratuityAmountEl.textContent = "—";
    if (gpsNomineeGratuityEligibleEl)
      gpsNomineeGratuityEligibleEl.textContent = "—";
    if (btnNomineeClaimGratuity) btnNomineeClaimGratuity.disabled = true;

    if (btnWithdrawNominee) btnWithdrawNominee.disabled = true;
    if (btnNomineeWithdrawFull) btnNomineeWithdrawFull.disabled = true;

    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      document.getElementById("linkedPensioner").textContent = "Not Linked";
      document.getElementById("linkedPensionerFull").textContent =
        "This wallet is not a nominee for any pensioner.";

      document.getElementById("deceasedStatus").textContent = "—";
      document.getElementById("claimStatus").textContent = "—";

      document.getElementById("pensionerAccountStatus").textContent = "—";
      document.getElementById("pensionerAccountStatusHint").textContent = "—";

      document.getElementById("pensionerBox").innerHTML = `
        <div class="text-secondary small">
          ❌ No pensioner linked with this nominee wallet.
          <br/>
          Ask the pensioner to register again with your wallet as nominee.
        </div>
      `;

      lockAllNomineeActions("No linked pensioner.");
      btnLoadNomineeHistory && (btnLoadNomineeHistory.disabled = true);
      return;
    }

    btnLoadNomineeHistory && (btnLoadNomineeHistory.disabled = false);

    document.getElementById("linkedPensioner").textContent =
      shortAddress(linkedPensioner);
    document.getElementById("linkedPensionerFull").textContent =
      linkedPensioner;

    const p = await registry.getPensioner(linkedPensioner);

    const appStatus = Number(p.status);
    const isDeceased = Boolean(p.isDeceased);
    const claimStatus = Number(p.nomineeClaimStatus);
    const deathReportStatus = Number(p.deathReportStatus);

    // ✅ Account Status from Pensioner struct
    const accountStatus = Number(p.accountStatus ?? 0);
    renderAccountStatusUI(accountStatus);

    document.getElementById("deceasedStatus").textContent = isDeceased
      ? "YES"
      : "NO";

    document.getElementById("claimStatus").textContent =
      claimStatusText(claimStatus);

    const boxHtml = `
      <div class="row g-2">
        <div class="col-md-6">
          <div class="small text-secondary">Application Status</div>
          <div class="fw-bold">${statusText(appStatus)}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Monthly Contribution</div>
          <div class="fw-bold" style="word-break:break-all;">${String(
            p.monthlyContribution,
          )}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Nominee Wallet</div>
          <div class="fw-bold" style="word-break:break-all;">
            ${p.nomineeWallet}
          </div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Nominee Name</div>
          <div class="fw-bold">${p.nomineeName}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Relation</div>
          <div class="fw-bold">${p.nomineeRelation}</div>
        </div>
      </div>
    `;

    document.getElementById("pensionerBox").innerHTML = boxHtml;

    await loadNomineeDocsFromChain();

    // Reject reason boxes
    if (p.deathReportRejectReason && p.deathReportRejectReason.length > 0) {
      deathRejectReasonBox?.classList.remove("d-none");
      if (deathRejectReasonText)
        deathRejectReasonText.textContent = p.deathReportRejectReason;
    } else {
      deathRejectReasonBox?.classList.add("d-none");
      if (deathRejectReasonText) deathRejectReasonText.textContent = "";
    }

    if (p.nomineeRejectReason && p.nomineeRejectReason.length > 0) {
      claimRejectReasonBox?.classList.remove("d-none");
      if (claimRejectReasonText)
        claimRejectReasonText.textContent = p.nomineeRejectReason;
    } else {
      claimRejectReasonBox?.classList.add("d-none");
      if (claimRejectReasonText) claimRejectReasonText.textContent = "";
    }

    // 🔒 If pensioner account not active -> lock everything
    if (accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      lockAllNomineeActions("Pensioner account is not active.");
      toast(
        "Pensioner account is not active. Nominee actions locked.",
        "warning",
      );
      return;
    }

    /* ===================== BUTTON RULES ===================== */

    const canReportDeath =
      appStatus === STATUS.APPROVED &&
      !isDeceased &&
      (deathReportStatus === 0 || deathReportStatus === 3);

    if (btnReportDeath) btnReportDeath.disabled = !canReportDeath;
    if (btnOpenDeathProof) btnOpenDeathProof.disabled = !lastDeathCertCID;

    // Apply claim only after deceased
    const canApplyClaim =
      isDeceased && (claimStatus === 0 || claimStatus === 3);
    if (btnApplyClaim) btnApplyClaim.disabled = !canApplyClaim;

    if (btnOpenClaimProof) {
      const hasClaimProof =
        !!lastNomineeNidCID || !!lastRelationProofCID || !!lastNomineeBankCID;
      btnOpenClaimProof.disabled = !hasClaimProof;
    }

    // enable uploads if linked
    btnUploadDeathCert && (btnUploadDeathCert.disabled = false);
    btnUploadNomineeNid && (btnUploadNomineeNid.disabled = false);
    btnUploadRelationProof && (btnUploadRelationProof.disabled = false);
    btnUploadNomineeBank && (btnUploadNomineeBank.disabled = false);

    /* ===================== STEP 3: MODE + WITHDRAW (NOMINEE) ===================== */
    const disb = await getDisbursementContract(true);
    const ps = await disb.pensions(linkedPensioner);

    const started = Boolean(ps.started);
    const monthlyAmount = ps.monthlyAmount ?? 0n;

    if (nomineePensionStartedEl) {
      nomineePensionStartedEl.textContent = started ? "YES" : "NO";
    }

    if (nomineeMonthlyAmountEl) {
      nomineeMonthlyAmountEl.textContent = prettyEth(monthlyAmount) + " ETH";
    }

    const modeCode = Number(await disb.pensionMode(linkedPensioner));
    const lumpDone = Boolean(await disb.lumpSumWithdrawn(linkedPensioner));

    if (nomineePensionModeEl) {
      nomineePensionModeEl.textContent = pensionModeName(modeCode);
    }

    // MAIN RULE: nominee needs deceased + claim approved + pension started
    const baseEligible = isDeceased && claimStatus === 2 && started;

    // Show eligibility notice always
    if (nomineeEligibilityBox) nomineeEligibilityBox.classList.remove("d-none");

    if (!isDeceased) {
      nomineeEligibilityTitle.textContent = "⛔ Claim Locked";
      nomineeEligibilityText.textContent =
        "Pensioner is not marked deceased yet. Nominee actions will unlock after death report is verified by admin.";
    } else if (claimStatus !== 2) {
      nomineeEligibilityTitle.textContent = "⛔ Claim Pending Admin Approval";
      nomineeEligibilityText.textContent =
        "Nominee claim must be approved by admin before withdrawals are allowed.";
    } else if (!started) {
      nomineeEligibilityTitle.textContent = "⛔ Pension Not Started";
      nomineeEligibilityText.textContent =
        "Pensioner did not start pension before death. Monthly/Full nominee withdrawals are locked by system rules.";
    } else {
      nomineeEligibilityTitle.textContent = "✅ Eligible";
      nomineeEligibilityText.textContent =
        "Nominee can withdraw based on pension mode and family pension rules.";
    }

    // Load nominee family pension limit info
    let maxMonths = 0;
    let usedMonths = 0;
    let remainingMonths = 0;
    let unlimited = false;

    try {
      maxMonths = Number(await disb.nomineeMaxMonthsAllowed(linkedPensioner));
      usedMonths = Number(
        await disb.nomineeMonthlyWithdrawCount(linkedPensioner),
      );

      if (maxMonths === 0) {
        unlimited = true;
        remainingMonths = 999999;
      } else {
        remainingMonths = Math.max(0, maxMonths - usedMonths);
      }
    } catch (e) {
      console.warn("Failed to load nominee limit info:", e);
    }

    // Render family pension limit UI
    if (familyPensionAllowedEl) {
      if (!baseEligible) {
        familyPensionAllowedEl.textContent = "—";
      } else {
        familyPensionAllowedEl.textContent = unlimited
          ? "Unlimited (Spouse)"
          : `${maxMonths} Months`;
      }
    }

    if (familyPensionHintEl) {
      if (!baseEligible) {
        familyPensionHintEl.textContent =
          "Needs: Deceased + Claim Approved + Pension Started";
      } else {
        familyPensionHintEl.textContent = unlimited
          ? "No time limit for spouse family pension."
          : "Limited family pension based on nominee relation.";
      }
    }

    if (familyPensionUsedMonthsEl) {
      familyPensionUsedMonthsEl.textContent = baseEligible
        ? String(usedMonths)
        : "—";
    }

    if (familyPensionRemainingMonthsEl) {
      if (!baseEligible) {
        familyPensionRemainingMonthsEl.textContent = "—";
      } else {
        familyPensionRemainingMonthsEl.textContent = unlimited
          ? "Unlimited"
          : String(remainingMonths);
      }
    }

    const nomineeMonthsEnded =
      !unlimited && maxMonths > 0 && usedMonths >= maxMonths;

    // Monthly withdraw allowed only if pensionMode == Monthly
    if (btnWithdrawNominee) {
      btnWithdrawNominee.disabled = !(
        baseEligible &&
        modeCode === 1 &&
        !lumpDone &&
        !nomineeMonthsEnded
      );

      if (!started && isDeceased && claimStatus === 2) {
        btnWithdrawNominee.textContent = "⛔ Pension Not Started (Locked)";
      } else if (nomineeMonthsEnded) {
        btnWithdrawNominee.textContent =
          "⛔ Family Pension Ended (Monthly Disabled)";
      } else {
        btnWithdrawNominee.textContent =
          "💸 Withdraw Monthly Pension (Nominee)";
      }
    }

    // Full withdraw only if mode is NotChosen (PRSS only, contract side)
    if (btnNomineeWithdrawFull) {
      btnNomineeWithdrawFull.disabled = !(
        baseEligible &&
        modeCode === 0 &&
        !lumpDone
      );

      if (!started && isDeceased && claimStatus === 2) {
        btnNomineeWithdrawFull.textContent = "⛔ Pension Not Started (Locked)";
      } else {
        btnNomineeWithdrawFull.textContent =
          "💰 Withdraw Full Amount (Nominee One Time)";
      }
    }

    /* ===================== GPS NOMINEE GRATUITY ===================== */
    const programCode = Number(p.program); // 0 GPS, 1 PRSS
    const isGPS = programCode === PROGRAM.GPS;

    if (isGPS) {
      gpsNomineeGratuityBox?.classList.remove("d-none");

      let gratuityClaimed = false;
      try {
        gratuityClaimed = Boolean(
          await disb.gpsGratuityClaimed(linkedPensioner),
        );
      } catch (e) {
        console.warn("gpsGratuityClaimed read failed:", e);
      }

      if (gpsNomineeGratuityStatusEl) {
        gpsNomineeGratuityStatusEl.textContent = gratuityClaimed
          ? "CLAIMED"
          : "NOT CLAIMED";
      }

      const salaryBDT = Number(p.verifiedBasicSalaryBDT || 0);
      const years = Number(p.verifiedServiceYears || 0);

      const gratuityBDT = salaryBDT * years;
      const gratuityEth = gratuityBDT / 300000;

      if (gpsNomineeGratuityAmountEl) {
        gpsNomineeGratuityAmountEl.textContent =
          gratuityEth > 0 ? gratuityEth.toFixed(6) + " ETH" : "0 ETH";
      }

      // ✅ UPDATED: gratuity does NOT depend on pensionMode
      // Only needs: deceased + claim approved + gpsVerified + not claimed
      const eligibleForGratuity =
        isDeceased &&
        claimStatus === 2 &&
        !gratuityClaimed &&
        Boolean(p.gpsVerified);

      if (gpsNomineeGratuityEligibleEl) {
        gpsNomineeGratuityEligibleEl.textContent = eligibleForGratuity
          ? "YES"
          : "NO";
      }

      if (btnNomineeClaimGratuity) {
        btnNomineeClaimGratuity.disabled = !eligibleForGratuity;
        btnNomineeClaimGratuity.title = eligibleForGratuity
          ? ""
          : "Needs: Deceased + Claim Approved + GPS Verified + Not Claimed";
      }
    } else {
      gpsNomineeGratuityBox?.classList.add("d-none");
    }
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Failed to load nominee page", "error");

    lockAllNomineeActions("Failed to load nominee page.");
    btnLoadNomineeHistory && (btnLoadNomineeHistory.disabled = true);
    gpsNomineeGratuityBox?.classList.add("d-none");
  }
}

/* ===================== EVENTS ===================== */
btnRefresh?.addEventListener("click", loadNomineePage);
btnLoadNomineeHistory?.addEventListener("click", loadNomineeHistory);

/* Upload Death Certificate */
btnUploadDeathCert?.addEventListener("click", async () => {
  try {
    const file = deathCertFile?.files?.[0];
    if (!file) {
      toast("Select a death certificate file first.", "error");
      return;
    }

    setLoading(btnUploadDeathCert, true, "Uploading...");
    toast("Uploading death certificate to IPFS...", "info");

    const cid = await uploadToIPFS(file);
    if (deathCertCIDInput) deathCertCIDInput.value = cid;

    const docs = await getDocumentsContract(false);
    const tx = await docs.submitNomineeDocument(0, cid);
    await tx.wait();

    toast("Death certificate uploaded + saved ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Upload failed", "error");
  } finally {
    setLoading(btnUploadDeathCert, false);
  }
});

/* Upload Nominee NID */
btnUploadNomineeNid?.addEventListener("click", async () => {
  try {
    const file = nomineeNidFile?.files?.[0];
    if (!file) {
      toast("Select a nominee NID file first.", "error");
      return;
    }

    setLoading(btnUploadNomineeNid, true, "Uploading...");
    toast("Uploading nominee NID to IPFS...", "info");

    const cid = await uploadToIPFS(file);
    if (nomineeNidCIDInput) nomineeNidCIDInput.value = cid;

    const docs = await getDocumentsContract(false);
    const tx = await docs.submitNomineeDocument(1, cid);
    await tx.wait();

    toast("Nominee NID uploaded + saved ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Upload failed", "error");
  } finally {
    setLoading(btnUploadNomineeNid, false);
  }
});

/* Upload Relationship Proof */
btnUploadRelationProof?.addEventListener("click", async () => {
  try {
    const file = relationProofFile?.files?.[0];
    if (!file) {
      toast("Select a relationship proof file first.", "error");
      return;
    }

    setLoading(btnUploadRelationProof, true, "Uploading...");
    toast("Uploading relationship proof to IPFS...", "info");

    const cid = await uploadToIPFS(file);
    if (relationProofCIDInput) relationProofCIDInput.value = cid;

    const docs = await getDocumentsContract(false);
    const tx = await docs.submitNomineeDocument(2, cid);
    await tx.wait();

    toast("Relationship proof uploaded + saved ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Upload failed", "error");
  } finally {
    setLoading(btnUploadRelationProof, false);
  }
});

/* Upload Nominee Bank Proof */
btnUploadNomineeBank?.addEventListener("click", async () => {
  try {
    const file = nomineeBankFile?.files?.[0];
    if (!file) {
      toast("Select nominee bank proof file first.", "error");
      return;
    }

    setLoading(btnUploadNomineeBank, true, "Uploading...");
    toast("Uploading nominee bank proof to IPFS...", "info");

    const cid = await uploadToIPFS(file);
    if (nomineeBankCIDInput) nomineeBankCIDInput.value = cid;

    const docs = await getDocumentsContract(false);
    const tx = await docs.submitNomineeDocument(3, cid);
    await tx.wait();

    toast("Nominee bank proof uploaded + saved ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Upload failed", "error");
  } finally {
    setLoading(btnUploadNomineeBank, false);
  }
});

/* Open Death Proof */
btnOpenDeathProof?.addEventListener("click", () => {
  if (!lastDeathCertCID) {
    toast("No death certificate submitted yet.", "error");
    return;
  }
  openIpfs(lastDeathCertCID);
});

/* Open Claim Proof */
btnOpenClaimProof?.addEventListener("click", () => {
  if (!lastNomineeNidCID && !lastRelationProofCID && !lastNomineeBankCID) {
    toast("No claim proof submitted yet.", "error");
    return;
  }

  if (lastNomineeNidCID) openIpfs(lastNomineeNidCID);
  if (lastRelationProofCID) openIpfs(lastRelationProofCID);
  if (lastNomineeBankCID) openIpfs(lastNomineeBankCID);
});

/* Report Death */
btnReportDeath?.addEventListener("click", async () => {
  try {
    const cid = deathCertCIDInput?.value?.trim();
    if (!cid) {
      toast("Death certificate CID is required.", "error");
      return;
    }

    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    setLoading(btnReportDeath, true, "Reporting...");
    toast("Submitting death report...", "info");

    const registry = await getRegistryContract(false);
    const tx = await registry.reportDeathByNominee(cid);

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Death report submitted ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  } finally {
    setLoading(btnReportDeath, false);
  }
});

/* Apply Claim */
btnApplyClaim?.addEventListener("click", async () => {
  try {
    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    const nidCid = nomineeNidCIDInput?.value?.trim();
    const relCid = relationProofCIDInput?.value?.trim();
    const bankCid = nomineeBankCIDInput?.value?.trim();

    if (!nidCid) {
      toast("Nominee NID CID is required.", "error");
      return;
    }
    if (!relCid) {
      toast("Relationship proof CID is required.", "error");
      return;
    }
    if (!bankCid) {
      toast("Nominee bank proof CID is required.", "error");
      return;
    }

    setLoading(btnApplyClaim, true, "Applying...");
    toast("Submitting nominee claim...", "info");

    const registry = await getRegistryContract(false);

    // applyNomineeClaim only accepts (nidCid, relCid)
    const tx = await registry.applyNomineeClaim(nidCid, relCid);

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Nominee claim applied ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  } finally {
    setLoading(btnApplyClaim, false);
  }
});

/* Nominee Full Withdraw */
btnNomineeWithdrawFull?.addEventListener("click", async () => {
  try {
    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    const ok = confirm(
      "Full withdrawal is ONE-TIME and will permanently disable monthly pension. Continue?",
    );
    if (!ok) return;

    setLoading(btnNomineeWithdrawFull, true, "Withdrawing...");
    toast("Withdrawing full pension as nominee...", "info");

    const disb = await getDisbursementContract(false);
    const tx = await disb.nomineeWithdrawFullPension(linkedPensioner);

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Full pension withdrawn ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Full withdraw failed", "error");
  } finally {
    setLoading(btnNomineeWithdrawFull, false);
  }
});

/* Withdraw Monthly Pension (Nominee) */
btnWithdrawNominee?.addEventListener("click", async () => {
  try {
    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    setLoading(btnWithdrawNominee, true, "Withdrawing...");
    toast("Withdrawing monthly pension as nominee...", "info");

    const disb = await getDisbursementContract(false);
    const tx = await disb.withdrawMonthlyPensionAsNominee(linkedPensioner);

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Monthly pension withdrawn ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Withdraw failed", "error");
  } finally {
    setLoading(btnWithdrawNominee, false);
  }
});

/* Claim GPS Gratuity (Nominee) */
btnNomineeClaimGratuity?.addEventListener("click", async () => {
  try {
    if (!linkedPensioner || linkedPensioner === ethers.ZeroAddress) {
      toast("No linked pensioner found.", "error");
      return;
    }

    const ok = confirm(
      "GPS Gratuity is ONE-TIME. After claiming, it cannot be claimed again. Continue?",
    );
    if (!ok) return;

    setLoading(btnNomineeClaimGratuity, true, "Claiming...");
    toast("Claiming GPS gratuity as nominee...", "info");

    const disb = await getDisbursementContract(false);
    const tx = await disb.nomineeClaimGPSGratuity(linkedPensioner);

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("GPS gratuity claimed successfully ✔", "success");
    await loadNomineePage();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Gratuity claim failed", "error");
  } finally {
    setLoading(btnNomineeClaimGratuity, false);
  }
});

/* ===================== INIT ===================== */
loadNomineePage();
