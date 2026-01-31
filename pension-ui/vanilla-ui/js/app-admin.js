import { requireLogin, logout, shortAddress } from "./auth.js";
import { toast, setLoading } from "./ui.js";
import {
  getRegistryContract,
  getDocumentsContract,
  getFundContract,
  getDisbursementContract,
  getUserState,
  STATUS,
  getProvider,
} from "./contracts.js";

const account = requireLogin();

/* ===================== BUTTONS / TABLES ===================== */
const btnRefresh = document.getElementById("btnRefresh");

const pendingTable = document.getElementById("pendingTable");
const allTable = document.getElementById("allTable");
const deceasedTable = document.getElementById("deceasedTable");

// Death Reports Tab
const deathReportTable = document.getElementById("deathReportTable");

// ✅ NEW: Closure Requests
const closureTable = document.getElementById("closureTable");

// History
const adminHistoryTable = document.getElementById("adminHistoryTable");
const btnLoadAdminHistory = document.getElementById("btnLoadAdminHistory");

// GPS Fund
const gpsFundTable = document.getElementById("gpsFundTable");
const btnReloadGpsFund = document.getElementById("btnReloadGpsFund");

/* ===================== SECTIONS ===================== */
const pendingSection = document.getElementById("pendingSection");
const allSection = document.getElementById("allSection");
const deceasedSection = document.getElementById("deceasedSection");
const deathReportSection = document.getElementById("deathReportSection");
const historySection = document.getElementById("historySection");
const gpsFundSection = document.getElementById("gpsFundSection");

// ✅ NEW
const closureSection = document.getElementById("closureSection");

/* ===================== TABS ===================== */
const tabPending = document.getElementById("tabPending");
const tabAll = document.getElementById("tabAll");
const tabDeceased = document.getElementById("tabDeceased");
const tabDeathReports = document.getElementById("tabDeathReports");
const tabHistory = document.getElementById("tabHistory");
const tabGpsFund = document.getElementById("tabGpsFund");

// ✅ NEW
const tabClosureRequests = document.getElementById("tabClosureRequests");

/* ===================== MODAL ===================== */
const modalEl = document.getElementById("reviewModal");
const modal = new bootstrap.Modal(modalEl);

// GPS Verify Modal
const gpsVerifyModalEl = document.getElementById("gpsVerifyModal");
const gpsVerifyModal = gpsVerifyModalEl
  ? new bootstrap.Modal(gpsVerifyModalEl)
  : null;

let currentWallet = null;
let currentProgram = 1; // 0 GPS, 1 PRSS

// DocumentGroup enum (PensionDocuments contract)
const DOC_GROUP = {
  GPS_PENSIONER: 0,
  PRSS_PENSIONER: 1,
  NOMINEE_CLAIM: 2,
};

/* ===================== DOC LISTS ===================== */
const GPS_DOCS = [
  { label: "NID Front Side", docType: 0 },
  { label: "NID Back Side", docType: 1 },
  { label: "Passport Photo", docType: 2 },
  { label: "Birth Certificate", docType: 3 },
  { label: "Employment Certificate", docType: 4 },
  { label: "Service Record", docType: 5 },
  { label: "Last Payslip", docType: 6 },
  { label: "Pension Application Form", docType: 7 },
  { label: "Bank Account Proof", docType: 8 },
];

const PRSS_DOCS = [
  { label: "NID Front Side", docType: 0 },
  { label: "NID Back Side", docType: 1 },
  { label: "Passport Photo", docType: 2 },
  { label: "Birth Certificate", docType: 3 },
  { label: "Present Address Proof", docType: 4 },
  { label: "Permanent Address Proof", docType: 5 },
  { label: "Bank Account Proof (Cheque/Certificate)", docType: 6 },
  { label: "Nominee Form", docType: 7 },
  { label: "Nominee NID", docType: 8 },
];

document.getElementById("btnLogout")?.addEventListener("click", logout);

/* ===================== HELPERS ===================== */
function extractNiceError(err) {
  const msg =
    err?.reason || err?.shortMessage || err?.message || "Transaction failed";

  if (msg.includes("Only admin allowed")) return "Only admin can do this.";
  if (msg.includes("Application not pending"))
    return "This pension application is not pending anymore.";

  if (msg.includes("Pensioner documents not approved"))
    return "All pensioner documents must be approved first.";

  if (msg.includes("GPS data not verified"))
    return "GPS service info is not verified yet. Click 'Verify GPS Data' first.";

  if (msg.includes("Doc not submitted"))
    return "This document is not submitted yet (cannot approve/reject).";

  if (msg.includes("No death report"))
    return "Nominee did not report death yet.";
  if (msg.includes("Death already reported"))
    return "Death report already exists.";
  if (msg.includes("Death certificate required"))
    return "Death certificate CID required.";

  if (msg.includes("Nominee not applied"))
    return "Nominee claim is not applied yet.";

  // closure
  if (msg.includes("Not requested"))
    return "Closure was not requested for this account.";
  if (msg.includes("Account closed")) return "Account already closed.";
  if (msg.includes("Not active")) return "Account is not active.";

  if (msg.includes("No ETH sent")) return "Please enter a fund amount.";
  if (msg.includes("Only GPS pensioner allowed"))
    return "Only GPS pensioners can receive GPS fund allocation.";

  if (msg.includes("user rejected") || msg.includes("User rejected")) {
    return "You cancelled the transaction in MetaMask.";
  }

  return msg;
}

function setActiveTab(activeId) {
  const tabs = [
    { id: "pending", btn: tabPending, sec: pendingSection },
    { id: "all", btn: tabAll, sec: allSection },
    { id: "deathReports", btn: tabDeathReports, sec: deathReportSection },
    { id: "deceased", btn: tabDeceased, sec: deceasedSection },

    // ✅ NEW
    { id: "closure", btn: tabClosureRequests, sec: closureSection },

    { id: "gpsFund", btn: tabGpsFund, sec: gpsFundSection },
    { id: "history", btn: tabHistory, sec: historySection },
  ];

  tabs.forEach((t) => {
    if (!t.btn || !t.sec) return;

    const isActive = t.id === activeId;
    t.sec.classList.toggle("d-none", !isActive);

    t.btn.classList.toggle("btn-primary-soft", isActive);
    t.btn.classList.toggle("btn-outline-soft", !isActive);
  });
}

function statusText(st) {
  if (st === STATUS.NOT_REGISTERED) return "Not Registered";
  if (st === STATUS.PENDING) return "Pending";
  if (st === STATUS.APPROVED) return "Approved";
  if (st === STATUS.REJECTED) return "Rejected";
  return "Unknown";
}

function statusBadge(st) {
  if (st === STATUS.PENDING)
    return `<span class="badge-soft"><span class="dot" style="background:#f59e0b;"></span> Pending</span>`;
  if (st === STATUS.APPROVED)
    return `<span class="badge-soft"><span class="dot" style="background:#16a34a;"></span> Approved</span>`;
  if (st === STATUS.REJECTED)
    return `<span class="badge-soft"><span class="dot" style="background:#dc2626;"></span> Rejected</span>`;
  return `<span class="badge-soft"><span class="dot"></span> ${statusText(st)}</span>`;
}

function boolBadge(v) {
  if (v)
    return `<span class="badge-soft"><span class="dot" style="background:#111827;"></span> Yes</span>`;
  return `<span class="badge-soft"><span class="dot" style="background:#94a3b8;"></span> No</span>`;
}

function nomineeClaimBadge(code) {
  const n = Number(code);
  if (n === 0)
    return `<span class="badge-soft"><span class="dot" style="background:#94a3b8;"></span> NONE</span>`;
  if (n === 1)
    return `<span class="badge-soft"><span class="dot" style="background:#f59e0b;"></span> APPLIED</span>`;
  if (n === 2)
    return `<span class="badge-soft"><span class="dot" style="background:#16a34a;"></span> APPROVED</span>`;
  if (n === 3)
    return `<span class="badge-soft"><span class="dot" style="background:#dc2626;"></span> REJECTED</span>`;
  return `<span class="badge-soft"><span class="dot"></span> Unknown</span>`;
}

function deathReportBadge(code) {
  const n = Number(code);

  if (n === 0)
    return `<span class="badge-soft"><span class="dot" style="background:#94a3b8;"></span> NONE</span>`;
  if (n === 1)
    return `<span class="badge-soft"><span class="dot" style="background:#f59e0b;"></span> REPORTED</span>`;
  if (n === 2)
    return `<span class="badge-soft"><span class="dot" style="background:#16a34a;"></span> VERIFIED</span>`;
  if (n === 3)
    return `<span class="badge-soft"><span class="dot" style="background:#dc2626;"></span> REJECTED</span>`;

  return `<span class="badge-soft"><span class="dot"></span> Unknown</span>`;
}

function getDocBadge(status) {
  if (status === 1)
    return `<span class="badge-soft"><span class="dot" style="background:#2563eb;"></span> SUBMITTED</span>`;
  if (status === 2)
    return `<span class="badge-soft"><span class="dot" style="background:#16a34a;"></span> APPROVED</span>`;
  if (status === 3)
    return `<span class="badge-soft"><span class="dot" style="background:#dc2626;"></span> REJECTED</span>`;
  return `<span class="badge-soft"><span class="dot" style="background:#f59e0b;"></span> MISSING</span>`;
}

function shortTx(hash) {
  if (!hash) return "—";
  return hash.slice(0, 10) + "..." + hash.slice(-8);
}

function formatTime(ts) {
  const n = Number(ts || 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

async function getBlockTimestamp(provider, blockNumber) {
  const block = await provider.getBlock(blockNumber);
  return Number(block?.timestamp || 0);
}

function setEmptyTable(tbody, msg, colspan = 4) {
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}" class="text-secondary small">${msg}</td>
    </tr>
  `;
}

function getPensionerDocGroupByProgram(program) {
  return program === 0 ? DOC_GROUP.GPS_PENSIONER : DOC_GROUP.PRSS_PENSIONER;
}

function programName(program) {
  return Number(program) === 0 ? "GPS" : "PRSS";
}

function formatEth(weiLike) {
  try {
    return Number(ethers.formatEther(weiLike || 0)).toFixed(4) + " ETH";
  } catch {
    return "0.0000 ETH";
  }
}

/* ===================== GPS FINANCE CALCULATIONS ===================== */
const BDT_PER_ETH = 300000n;
const WEI_PER_ETH = 1000000000000000000n;

function bdtToWei(bdtNumber) {
  try {
    const bdt = BigInt(Math.floor(Number(bdtNumber || 0)));
    return (bdt * WEI_PER_ETH) / BDT_PER_ETH;
  } catch {
    return 0n;
  }
}

function gpsPercentByYears(serviceYears) {
  const y = Number(serviceYears || 0);
  if (y >= 25) return 80;
  if (y >= 20) return 64;
  if (y >= 15) return 48;
  if (y >= 10) return 32;
  return 0;
}

const RECOMMENDED_MONTHS = 12;

/* ===================== CONTRACT DOC LOADERS ===================== */
async function getPensionerDocsList(pensionerWallet) {
  const registry = await getRegistryContract(true);
  const docs = await getDocumentsContract(true);

  const program = Number(await registry.getProgram(pensionerWallet));
  currentProgram = program;

  const required = program === 0 ? GPS_DOCS : PRSS_DOCS;

  const list = [];
  for (const doc of required) {
    let d;
    if (program === 0) {
      d = await docs.getGPSDocument(pensionerWallet, doc.docType);
    } else {
      d = await docs.getPRSSDocument(pensionerWallet, doc.docType);
    }
    list.push(d);
  }

  return { required, list, program };
}

async function requireAdminOrRedirect() {
  const state = await getUserState(account);
  if (!state.isAdmin) {
    toast("You are not admin. Redirecting...", "error");
    window.location.href = "./login.html";
    return false;
  }
  return true;
}

/* ===================== LOADERS ===================== */
async function loadPending() {
  if (!pendingTable) return;

  pendingTable.innerHTML = `
    <tr><td colspan="4" class="text-secondary small">Loading...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);
    const all = await registry.getApplicants();

    const pending = [];
    for (const addr of all) {
      const p = await registry.getPensioner(addr);
      if (Number(p.status) === STATUS.PENDING) pending.push(addr);
    }

    if (!pending || pending.length === 0) {
      pendingTable.innerHTML = `
        <tr><td colspan="4" class="text-secondary small">No pending applicants</td></tr>
      `;
      return;
    }

    pendingTable.innerHTML = "";
    pending.forEach((addr, idx) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="small text-secondary">${idx + 1}</td>
        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>
        <td>${statusBadge(STATUS.PENDING)}</td>
        <td>
          <button class="btn btn-primary-soft btn-sm" data-review="${addr}">
            Review
          </button>
        </td>
      `;

      pendingTable.appendChild(tr);
    });

    document.querySelectorAll("#pendingTable [data-review]").forEach((btn) => {
      btn.addEventListener("click", () => openReview(btn.dataset.review));
    });
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

async function loadAllPensioners() {
  if (!allTable) return;

  allTable.innerHTML = `
    <tr><td colspan="7" class="text-secondary small">Loading...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);
    const list = await registry.getApplicants();

    if (!list || list.length === 0) {
      allTable.innerHTML = `
        <tr><td colspan="7" class="text-secondary small">No applicants found</td></tr>
      `;
      return;
    }

    allTable.innerHTML = "";

    for (let i = 0; i < list.length; i++) {
      const addr = list[i];
      const p = await registry.getPensioner(addr);

      const st = Number(p.status);
      const deceased = Boolean(p.isDeceased);
      const nomineeClaimStatus = Number(p.nomineeClaimStatus);
      const drStatus = Number(p.deathReportStatus ?? 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="small text-secondary">${i + 1}</td>

        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>

        <td>${statusBadge(st)}</td>
        <td>${deathReportBadge(drStatus)}</td>
        <td>${boolBadge(deceased)}</td>
        <td>${nomineeClaimBadge(nomineeClaimStatus)}</td>

        <td>
          <button class="btn btn-outline-soft btn-sm" data-review="${addr}">
            View
          </button>
        </td>
      `;

      allTable.appendChild(tr);
    }

    document.querySelectorAll("#allTable [data-review]").forEach((btn) => {
      btn.addEventListener("click", () => openReview(btn.dataset.review));
    });
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

async function loadDeathReports() {
  if (!deathReportTable) return;

  deathReportTable.innerHTML = `
    <tr><td colspan="5" class="text-secondary small">Loading...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);

    let list = [];
    if (typeof registry.getDeathReportedApplicants === "function") {
      list = await registry.getDeathReportedApplicants();
    } else {
      const all = await registry.getApplicants();
      for (const addr of all) {
        const p = await registry.getPensioner(addr);
        const dr = Number(p.deathReportStatus ?? 0);
        if (dr === 1 || dr === 2 || dr === 3) list.push(addr);
      }
    }

    if (!list || list.length === 0) {
      deathReportTable.innerHTML = `
        <tr><td colspan="5" class="text-secondary small">No death reports</td></tr>
      `;
      return;
    }

    deathReportTable.innerHTML = "";

    for (let i = 0; i < list.length; i++) {
      const addr = list[i];
      const p = await registry.getPensioner(addr);

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="small text-secondary">${i + 1}</td>
        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>
        <td>${deathReportBadge(Number(p.deathReportStatus ?? 0))}</td>
        <td>
          ${
            p.deathReportProofCID && p.deathReportProofCID.length > 0
              ? `<a target="_blank" class="small" href="https://gateway.pinata.cloud/ipfs/${p.deathReportProofCID}">
                  Open Death Certificate
                </a>`
              : `<span class="small text-secondary">—</span>`
          }
        </td>
        <td>
          <button class="btn btn-outline-soft btn-sm" data-review="${addr}">
            Review
          </button>
        </td>
      `;

      deathReportTable.appendChild(tr);
    }

    document
      .querySelectorAll("#deathReportTable [data-review]")
      .forEach((btn) => {
        btn.addEventListener("click", () => openReview(btn.dataset.review));
      });
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

async function loadDeceased() {
  if (!deceasedTable) return;

  deceasedTable.innerHTML = `
    <tr><td colspan="5" class="text-secondary small">Loading...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);

    let deceasedList = [];
    if (typeof registry.getDeceasedApplicants === "function") {
      deceasedList = await registry.getDeceasedApplicants();
    } else {
      const all = await registry.getApplicants();
      for (const addr of all) {
        const p = await registry.getPensioner(addr);
        if (Boolean(p.isDeceased)) deceasedList.push(addr);
      }
    }

    if (!deceasedList || deceasedList.length === 0) {
      deceasedTable.innerHTML = `
        <tr><td colspan="5" class="text-secondary small">No deceased pensioners</td></tr>
      `;
      return;
    }

    deceasedTable.innerHTML = "";

    for (let i = 0; i < deceasedList.length; i++) {
      const addr = deceasedList[i];
      const p = await registry.getPensioner(addr);

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="small text-secondary">${i + 1}</td>
        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>
        <td>${boolBadge(true)}</td>
        <td>${nomineeClaimBadge(Number(p.nomineeClaimStatus))}</td>
        <td>
          <button class="btn btn-outline-soft btn-sm" data-review="${addr}">
            Review
          </button>
        </td>
      `;

      deceasedTable.appendChild(tr);
    }

    document.querySelectorAll("#deceasedTable [data-review]").forEach((btn) => {
      btn.addEventListener("click", () => openReview(btn.dataset.review));
    });
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

/* ===================== ✅ NEW: CLOSURE REQUESTS ===================== */
/**
 * AccountStatus enum in contract:
 * 0 ACTIVE
 * 1 CLOSURE_REQUESTED
 * 2 CLOSED
 */
const ACCOUNT_STATUS = {
  ACTIVE: 0,
  CLOSURE_REQUESTED: 1,
  CLOSED: 2,
};

async function loadClosureRequests() {
  if (!closureTable) return;

  closureTable.innerHTML = `
    <tr><td colspan="5" class="text-secondary small">Loading...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);
    const all = await registry.getApplicants();

    const closureList = [];

    for (const addr of all) {
      const p = await registry.getPensioner(addr);

      // read accountStatus from struct (preferred)
      const accStatus = Number(p.accountStatus ?? -1);

      if (accStatus === ACCOUNT_STATUS.CLOSURE_REQUESTED) {
        closureList.push({ addr, p });
      }
    }

    if (!closureList.length) {
      setEmptyTable(closureTable, "No closure requests found.", 5);
      return;
    }

    closureTable.innerHTML = "";

    closureList.forEach((row, idx) => {
      const addr = row.addr;
      const p = row.p;

      const reason = String(p.closureReason || "—");
      const requestedAt = Number(p.closureRequestedAt || 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="small text-secondary">${idx + 1}</td>

        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>

        <td class="small" style="max-width:260px;">
          <div style="white-space:normal;word-break:break-word;">
            ${reason}
          </div>
        </td>

        <td class="small text-secondary">${formatTime(requestedAt)}</td>

        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-soft btn-sm" data-review="${addr}">
              View
            </button>

            <button class="btn btn-primary-soft btn-sm" data-close="${addr}">
              Approve Closure
            </button>
          </div>
        </td>
      `;

      closureTable.appendChild(tr);
    });

    document.querySelectorAll("#closureTable [data-review]").forEach((btn) => {
      btn.addEventListener("click", () => openReview(btn.dataset.review));
    });

    document.querySelectorAll("#closureTable [data-close]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pensioner = btn.dataset.close;
        await approveClosure(pensioner, btn);
      });
    });

    toast("Closure requests loaded ✔", "success");
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
    setEmptyTable(closureTable, "Failed to load closure requests.", 5);
  }
}

async function approveClosure(pensionerWallet, btn) {
  const ok = confirm(
    `Close this account?\n\nPensioner: ${pensionerWallet}\n\nThis will permanently disable the account.`,
  );
  if (!ok) return;

  try {
    setLoading(btn, true, "Closing...");
    toast("Closing account on blockchain...", "info");

    const registry = await getRegistryContract(false);
    const tx = await registry.closeAccount(pensionerWallet);
    await tx.wait();

    toast("Account closed ✔", "success");

    // refresh closure list + other tabs
    await loadClosureRequests();
    await loadAllPensioners();
    await loadPending();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  } finally {
    setLoading(btn, false);
  }
}

/* ===================== GPS FUND DASHBOARD ===================== */
async function loadGpsFundManagement() {
  if (!gpsFundTable) return;

  gpsFundTable.innerHTML = `
    <tr><td colspan="11" class="text-secondary small">Loading GPS finance data...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    const registry = await getRegistryContract(true);
    const fund = await getFundContract(true);

    const all = await registry.getApplicants();

    const gpsApproved = [];
    for (const addr of all) {
      const p = await registry.getPensioner(addr);
      const program = Number(await registry.getProgram(addr));
      const st = Number(p.status);

      if (program === 0 && st === STATUS.APPROVED) {
        gpsApproved.push(addr);
      }
    }

    if (!gpsApproved.length) {
      setEmptyTable(gpsFundTable, "No approved GPS pensioners found.", 11);
      return;
    }

    let allocLogs = [];
    try {
      if (fund.filters?.GPSFundAllocated) {
        allocLogs = await fund.queryFilter(
          fund.filters.GPSFundAllocated(),
          1,
          "latest",
        );
      }
    } catch (e) {
      console.warn("GPSFundAllocated query failed:", e);
      allocLogs = [];
    }

    let paidLogs = [];
    try {
      if (fund.filters?.PensionPaid) {
        paidLogs = await fund.queryFilter(
          fund.filters.PensionPaid(),
          1,
          "latest",
        );
      }
    } catch (e) {
      console.warn("PensionPaid query failed:", e);
      paidLogs = [];
    }

    const totalAllocatedMap = {};
    const totalPaidMap = {};

    for (const log of allocLogs) {
      const pensioner = log?.args?.pensioner ?? log?.args?.[0];
      const amount = log?.args?.amount ?? log?.args?.[1] ?? 0n;
      if (!pensioner) continue;

      const key = String(pensioner).toLowerCase();
      totalAllocatedMap[key] = (totalAllocatedMap[key] || 0n) + BigInt(amount);
    }

    for (const log of paidLogs) {
      const receiver = log?.args?.receiver ?? log?.args?.[0];
      const amount = log?.args?.amount ?? log?.args?.[1] ?? 0n;
      if (!receiver) continue;

      const key = String(receiver).toLowerCase();
      totalPaidMap[key] = (totalPaidMap[key] || 0n) + BigInt(amount);
    }

    gpsFundTable.innerHTML = "";

    for (let i = 0; i < gpsApproved.length; i++) {
      const addr = gpsApproved[i];

      const remainingWei = await fund.gpsAllocatedFund(addr);

      const allocWei = totalAllocatedMap[String(addr).toLowerCase()] || 0n;
      const paidWei = totalPaidMap[String(addr).toLowerCase()] || 0n;

      const p = await registry.getPensioner(addr);

      const verifiedSalaryBDT = Number(p.verifiedBasicSalaryBDT || 0);
      const verifiedYears = Number(p.verifiedServiceYears || 0);

      const percent = gpsPercentByYears(verifiedYears);
      const monthlyPensionBDT = Math.floor((verifiedSalaryBDT * percent) / 100);
      const monthlyPensionWei = bdtToWei(monthlyPensionBDT);

      const gratuityBDT = Math.floor(verifiedSalaryBDT * verifiedYears);
      const gratuityWei = bdtToWei(gratuityBDT);

      const recommendedWei =
        gratuityWei + monthlyPensionWei * BigInt(RECOMMENDED_MONTHS);

      let needWei = 0n;
      if (recommendedWei > allocWei) needWei = recommendedWei - allocWei;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="small text-secondary">${i + 1}</td>

        <td>
          <div class="fw-bold">${shortAddress(addr)}</div>
          <div class="small text-secondary" style="word-break:break-all;">${addr}</div>
        </td>

        <td><span class="badge-soft"><span class="dot"></span> GPS</span></td>

        <td class="fw-semibold">${formatEth(monthlyPensionWei)}</td>
        <td class="fw-semibold">${formatEth(gratuityWei)}</td>
        <td class="fw-semibold">${formatEth(recommendedWei)}</td>

        <td class="fw-semibold">${formatEth(allocWei)}</td>
        <td class="fw-semibold">${formatEth(paidWei)}</td>
        <td class="fw-semibold">${formatEth(remainingWei)}</td>

        <td class="fw-semibold">${
          needWei > 0n
            ? `<span style="color:#b45309;">${formatEth(needWei)}</span>`
            : `<span style="color:#16a34a;">0.0000 ETH</span>`
        }</td>

        <td>
          <div class="d-flex gap-2 flex-wrap">
            <input
              class="form-control form-control-sm input-soft"
              style="max-width: 140px"
              placeholder="Amount ETH"
              type="number"
              min="0"
              step="0.0001"
              id="gpsAllocInp_${addr}"
            />
            <button class="btn btn-primary-soft btn-sm" data-alloc="${addr}">
              Allocate
            </button>

            <button
              class="btn btn-outline-soft btn-sm"
              data-autoalloc="${addr}"
              title="Allocate Needed Amount"
            >
              Auto
            </button>
          </div>
          <div class="small text-secondary mt-1">
            Recommended: gratuity + ${RECOMMENDED_MONTHS} months pension
          </div>
        </td>
      `;

      gpsFundTable.appendChild(tr);

      tr.dataset.needWei = String(needWei);
    }

    document.querySelectorAll("[data-alloc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pensioner = btn.dataset.alloc;
        const inp = document.getElementById(`gpsAllocInp_${pensioner}`);
        const ethAmount = Number(inp?.value || 0);

        if (!ethAmount || ethAmount <= 0) {
          toast("Enter a valid ETH amount", "error");
          return;
        }

        await allocateGpsFund(pensioner, ethAmount, btn);
      });
    });

    document.querySelectorAll("[data-autoalloc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pensioner = btn.dataset.autoalloc;
        const row = btn.closest("tr");

        const needWei = row?.dataset?.needWei
          ? BigInt(row.dataset.needWei)
          : 0n;

        if (!needWei || needWei <= 0n) {
          toast("No allocation needed (already enough).", "success");
          return;
        }

        const eth = Number(ethers.formatEther(needWei));
        await allocateGpsFund(pensioner, eth, btn);
      });
    });

    toast("GPS Fund dashboard loaded ✔", "success");
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
    setEmptyTable(gpsFundTable, "Failed to load GPS Fund dashboard.", 11);
  }
}

async function allocateGpsFund(pensionerWallet, ethAmount, btn) {
  try {
    setLoading(btn, true, "Allocating...");
    toast("Allocating GPS fund...", "info");

    const fund = await getFundContract(false);

    const value = ethers.parseEther(String(ethAmount));
    const tx = await fund.allocateGPSFund(pensionerWallet, { value });
    await tx.wait();

    toast("GPS fund allocated ✔", "success");
    await loadGpsFundManagement();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  } finally {
    setLoading(btn, false);
  }
}

/* ===================== ADMIN HISTORY ===================== */
async function loadAdminHistory() {
  if (!adminHistoryTable) return;

  adminHistoryTable.innerHTML = `
    <tr><td colspan="7" class="text-secondary small">Loading history...</td></tr>
  `;

  try {
    const ok = await requireAdminOrRedirect();
    if (!ok) return;

    if (btnLoadAdminHistory)
      setLoading(btnLoadAdminHistory, true, "Loading...");

    const provider = await getProvider();
    const registry = await getRegistryContract(true);
    const fund = await getFundContract(true);

    const logsAll = [];

    async function safeLoadEvent(contract, eventName, label, cfg) {
      try {
        if (
          !contract.filters ||
          typeof contract.filters[eventName] !== "function"
        ) {
          console.warn(`Event not found in ABI: ${eventName}`);
          return;
        }

        const f = contract.filters[eventName](...cfg.filterArgs);
        const logs = await contract.queryFilter(f, 1, "latest");

        for (const log of logs) {
          const parsed = cfg.parse(log);

          let ts = Number(parsed.timestamp || 0);
          if (!ts) ts = await getBlockTimestamp(provider, log.blockNumber);

          logsAll.push({
            type: label,
            pensioner: parsed.pensioner || "—",
            nominee: parsed.nominee || "—",
            admin: parsed.admin || "—",
            time: formatTime(ts),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
      } catch (e) {
        console.warn(`${eventName} logs failed:`, e);
      }
    }

    // ✅ UPDATED: Now captures admin parameter (args[1])
    await safeLoadEvent(registry, "PensionerApproved", "Pensioner Approved", {
      filterArgs: [null, null],
      parse: (log) => ({
        pensioner: log?.args?.user ?? log?.args?.[0],
        nominee: "—",
        admin: log?.args?.admin ?? log?.args?.[1] ?? "—",
        timestamp: log?.args?.reviewedAt ?? log?.args?.[2],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[1])
    await safeLoadEvent(registry, "PensionerRejected", "Pensioner Rejected", {
      filterArgs: [null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.user ?? log?.args?.[0],
        nominee: "—",
        admin: log?.args?.admin ?? log?.args?.[1] ?? "—",
        timestamp: log?.args?.reviewedAt ?? log?.args?.[3],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[1])
    await safeLoadEvent(registry, "GPSDataVerified", "GPS Data Verified", {
      filterArgs: [null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: "—",
        admin: log?.args?.admin ?? log?.args?.[1] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[5],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[2])
    await safeLoadEvent(registry, "DeathReportVerified", "Death Verified", {
      filterArgs: [null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: log?.args?.nominee ?? log?.args?.[1],
        admin: log?.args?.admin ?? log?.args?.[2] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[3],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[2])
    await safeLoadEvent(registry, "DeathReportRejected", "Death Rejected", {
      filterArgs: [null, null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: log?.args?.nominee ?? log?.args?.[1],
        admin: log?.args?.admin ?? log?.args?.[2] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[4],
      }),
    });

    await safeLoadEvent(registry, "NomineeClaimApplied", "Claim Applied", {
      filterArgs: [null, null, null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: log?.args?.nominee ?? log?.args?.[1],
        admin: "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[4],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[2])
    await safeLoadEvent(registry, "NomineeClaimApproved", "Claim Approved", {
      filterArgs: [null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: log?.args?.nominee ?? log?.args?.[1],
        admin: log?.args?.admin ?? log?.args?.[2] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[3],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[2])
    await safeLoadEvent(registry, "NomineeClaimRejected", "Claim Rejected", {
      filterArgs: [null, null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: log?.args?.nominee ?? log?.args?.[1],
        admin: log?.args?.admin ?? log?.args?.[2] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[4],
      }),
    });

    // ✅ UPDATED: Now captures admin parameter (args[1])
    await safeLoadEvent(registry, "AccountClosed", "Account Closed", {
      filterArgs: [null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: "—",
        admin: log?.args?.admin ?? log?.args?.[1] ?? "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[2],
      }),
    });

    await safeLoadEvent(fund, "GPSFundAllocated", "GPS Fund Allocated", {
      filterArgs: [null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.pensioner ?? log?.args?.[0],
        nominee: "—",
        admin: "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[2],
      }),
    });

    await safeLoadEvent(fund, "PensionPaid", "Pension Paid", {
      filterArgs: [null, null, null],
      parse: (log) => ({
        pensioner: log?.args?.receiver ?? log?.args?.[0],
        nominee: "—",
        admin: "—",
        timestamp: log?.args?.timestamp ?? log?.args?.[2],
      }),
    });

    logsAll.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));

    if (!logsAll.length) {
      setEmptyTable(adminHistoryTable, "No admin history found yet.", 7);
      return;
    }

    // ✅ Fetch nominee addresses for events that don't have them
    for (const log of logsAll) {
      if (log.nominee === "—" && log.pensioner !== "—") {
        try {
          const p = await registry.getPensioner(log.pensioner);
          log.nominee = p.nomineeWallet || "—";
        } catch (e) {
          console.warn("Failed to fetch nominee for", log.pensioner, e);
        }
      }
    }

    adminHistoryTable.innerHTML = logsAll
      .map((r, idx) => {
        const nomineeFixed =
          r.nominee &&
          r.nominee !== "0x0000000000000000000000000000000000000000"
            ? r.nominee
            : "—";

        return `
          <tr>
            <td class="small text-secondary">${idx + 1}</td>
            <td class="fw-semibold">${r.type}</td>

            <td>
              <div class="fw-bold">${shortAddress(r.pensioner)}</div>
              <div class="small text-secondary" style="word-break:break-all;">${r.pensioner}</div>
            </td>

            <td>
              ${
                nomineeFixed !== "—"
                  ? `<div class="fw-bold">${shortAddress(nomineeFixed)}</div>
                     <div class="small text-secondary" style="word-break:break-all;">${nomineeFixed}</div>`
                  : `<span class="small text-secondary">—</span>`
              }
            </td>

            <td>
              ${
                r.admin !== "—"
                  ? `<div class="fw-bold">${shortAddress(r.admin)}</div>
                     <div class="small text-secondary" style="word-break:break-all;">${r.admin}</div>`
                  : `<span class="small text-secondary">—</span>`
              }
            </td>

            <td class="small text-secondary">${r.time}</td>

            <td class="small text-secondary" style="word-break:break-all;">
              ${shortTx(r.txHash)}
            </td>
          </tr>
        `;
      })
      .join("");

    toast("Admin history loaded ✔", "success");
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Failed to load admin history", "error");
    setEmptyTable(adminHistoryTable, "Failed to load admin history.", 7);
  } finally {
    if (btnLoadAdminHistory) setLoading(btnLoadAdminHistory, false);
  }
}

/* ===================== GPS UI HELPERS ===================== */
function setGpsVerifiedBadge(isVerified) {
  const badge = document.getElementById("gpsVerifiedBadge");
  if (!badge) return;

  if (isVerified) {
    badge.innerHTML = `<span class="dot" style="background:#16a34a;"></span> Verified`;
  } else {
    badge.innerHTML = `<span class="dot" style="background:#f59e0b;"></span> Not Verified`;
  }
}

function openGpsVerifyModal(pensioner) {
  if (!gpsVerifyModal) {
    toast("GPS Verify modal not found in HTML", "error");
    return;
  }

  document.getElementById("gpsVerifyWallet").textContent = currentWallet || "—";

  const inpSalary = document.getElementById("gpsVerifiedSalary");
  const inpYears = document.getElementById("gpsVerifiedYears");
  const inpEmpId = document.getElementById("gpsVerifiedEmpId");

  if (inpSalary)
    inpSalary.value = String(Number(pensioner.basicSalaryBDT || 0));
  if (inpYears) inpYears.value = String(Number(pensioner.serviceYears || 0));
  if (inpEmpId) inpEmpId.value = String(pensioner.employeeId || "");

  gpsVerifyModal.show();
}

/* ===================== MODAL REVIEW ===================== */
async function openReview(wallet) {
  currentWallet = wallet;

  document.getElementById("modalWallet").textContent = wallet;
  document.getElementById("docsList").innerHTML = "Loading documents...";
  document.getElementById("profileBox").innerHTML = "Loading...";
  document.getElementById("nomineeClaimBox").innerHTML = "Loading...";

  document.getElementById("gpsInfoBox").innerHTML = "Loading...";
  document.getElementById("gpsVerifySection")?.classList.add("d-none");
  setGpsVerifiedBadge(false);

  document.getElementById("rejectReason").value = "";
  document.getElementById("nomineeRejectReason").value = "";
  document.getElementById("deathRejectReason").value = "";

  modal.show();

  try {
    const registry = await getRegistryContract(true);
    const pensioner = await registry.getPensioner(wallet);

    const program = Number(await registry.getProgram(wallet));
    currentProgram = program;

    const gpsVerified = program === 0 ? Boolean(pensioner.gpsVerified) : false;

    const profileHtml = `
      <div class="row g-2">
        <div class="col-md-6">
          <div class="small text-secondary">Program</div>
          <div class="fw-bold">${programName(program)}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Status</div>
          <div class="fw-bold">${statusText(Number(pensioner.status))}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Deceased</div>
          <div class="fw-bold">${pensioner.isDeceased ? "Yes" : "No"}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Death Report</div>
          <div class="fw-bold">${deathReportBadge(
            Number(pensioner.deathReportStatus ?? 0),
          )}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Monthly Contribution (Wei)</div>
          <div class="fw-bold" style="word-break:break-all;">${String(
            pensioner.monthlyContribution,
          )}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Nominee Wallet</div>
          <div class="fw-bold" style="word-break:break-all;">
            ${pensioner.nomineeWallet}
          </div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Nominee Name</div>
          <div class="fw-bold">${pensioner.nomineeName}</div>
        </div>

        <div class="col-md-6">
          <div class="small text-secondary">Relation</div>
          <div class="fw-bold">${pensioner.nomineeRelation}</div>
        </div>

        <div class="col-12 mt-2">
          <div class="small text-secondary">Account Status</div>
          <div class="fw-bold">${Number(pensioner.accountStatus) === 1 ? "CLOSURE_REQUESTED" : Number(pensioner.accountStatus) === 2 ? "CLOSED" : "ACTIVE"}</div>
        </div>
      </div>
    `;
    document.getElementById("profileBox").innerHTML = profileHtml;

    const gpsSection = document.getElementById("gpsVerifySection");
    const gpsInfoBox = document.getElementById("gpsInfoBox");
    const btnVerifyGPS = document.getElementById("btnVerifyGPS");

    if (program === 0) {
      gpsSection?.classList.remove("d-none");
      setGpsVerifiedBadge(gpsVerified);

      const gpsHtml = `
        <div class="row g-2">
          <div class="col-md-6">
            <div class="small text-secondary">Basic Salary (BDT)</div>
            <div class="fw-bold">${Number(pensioner.basicSalaryBDT || 0)}</div>
          </div>

          <div class="col-md-6">
            <div class="small text-secondary">Service Years</div>
            <div class="fw-bold">${Number(pensioner.serviceYears || 0)}</div>
          </div>

          <div class="col-md-6">
            <div class="small text-secondary">Employee ID</div>
            <div class="fw-bold" style="word-break:break-all;">${
              pensioner.employeeId || "—"
            }</div>
          </div>

          <div class="col-md-6">
            <div class="small text-secondary">Designation</div>
            <div class="fw-bold">${pensioner.designation || "—"}</div>
          </div>

          <div class="col-12">
            <div class="small text-secondary mt-2">Verified (Admin)</div>
            <div class="small">
              Salary: <b>${Number(pensioner.verifiedBasicSalaryBDT || 0)}</b> BDT |
              Years: <b>${Number(pensioner.verifiedServiceYears || 0)}</b> |
              EmpID: <b>${pensioner.verifiedEmployeeId || "—"}</b>
            </div>
          </div>
        </div>
      `;
      if (gpsInfoBox) gpsInfoBox.innerHTML = gpsHtml;

      if (btnVerifyGPS) {
        btnVerifyGPS.disabled = gpsVerified;
      }
    }

    const claimHtml = `
      <div class="d-flex flex-column gap-2">
        <div>
          <div class="small text-secondary">Death Certificate CID (Reported)</div>
          ${
            pensioner.deathReportProofCID &&
            pensioner.deathReportProofCID.length > 0
              ? `<a target="_blank" class="small" href="https://gateway.pinata.cloud/ipfs/${pensioner.deathReportProofCID}">
                  Open Death Certificate
                </a>
                <div class="small text-secondary" style="word-break:break-all;">
                  CID: ${pensioner.deathReportProofCID}
                </div>`
              : `<div class="small text-secondary">—</div>`
          }
        </div>

        ${
          pensioner.deathReportRejectReason &&
          pensioner.deathReportRejectReason.length > 0
            ? `<div class="small" style="color:#b91c1c;"><b>Death Reject Reason:</b> ${pensioner.deathReportRejectReason}</div>`
            : ""
        }

        <div class="mt-2">
          <div class="small text-secondary">Nominee Claim Status</div>
          <div>${nomineeClaimBadge(Number(pensioner.nomineeClaimStatus))}</div>
        </div>

        ${
          pensioner.nomineeRejectReason && pensioner.nomineeRejectReason.length
            ? `<div class="small" style="color:#b91c1c;"><b>Claim Reject Reason:</b> ${pensioner.nomineeRejectReason}</div>`
            : ""
        }
      </div>
    `;
    document.getElementById("nomineeClaimBox").innerHTML = claimHtml;

    const { required, list } = await getPensionerDocsList(wallet);
    const progName = programName(program);

    const docsHtml = required
      .map((doc, i) => {
        const d = list[i];

        const status = d ? Number(d.status) : 0;
        const cid = d?.ipfsHash || "";
        const rejectReason = d?.rejectReason || "";

        const badge = getDocBadge(status);

        const rejectReasonHtml =
          status === 3 && rejectReason
            ? `<div class="small mt-2" style="color:#b91c1c;"><b>Reason:</b> ${rejectReason}</div>`
            : "";

        const cidHtml = cid
          ? `<div class="small text-secondary" style="word-break:break-all;">CID: ${cid}</div>`
          : `<div class="small text-secondary">CID: Not uploaded</div>`;

        const openBtn = cid
          ? `<button class="btn btn-outline-soft btn-sm" data-open="https://gateway.pinata.cloud/ipfs/${cid}">
              Open
            </button>`
          : "";

        const canReview = status === 1;

        return `
          <div class="soft-card p-3 mb-2">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-bold">${doc.label}</div>
                <div class="small text-secondary">${progName} document</div>
                ${cidHtml}
                ${rejectReasonHtml}
              </div>
              ${badge}
            </div>

            <div class="d-flex gap-2 mt-2 flex-wrap">
              ${openBtn}

              <button class="btn btn-primary-soft btn-sm"
                data-approve="${doc.docType}"
                ${canReview ? "" : "disabled"}
              >
                Approve
              </button>

              <button class="btn btn-sm"
                style="background:#fee2e2;border:1px solid #fecaca;color:#b91c1c;font-weight:700;border-radius:12px;"
                data-reject="${doc.docType}"
                ${canReview ? "" : "disabled"}
              >
                Reject
              </button>
            </div>

            ${
              !canReview && status !== 0
                ? `<div class="small text-secondary mt-2">Only SUBMITTED documents can be reviewed.</div>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    document.getElementById("docsList").innerHTML = docsHtml;

    document.querySelectorAll("[data-open]").forEach((b) => {
      b.addEventListener("click", () => window.open(b.dataset.open, "_blank"));
    });

    document.querySelectorAll("[data-approve]").forEach((b) => {
      b.addEventListener("click", () => approveDoc(Number(b.dataset.approve)));
    });

    document.querySelectorAll("[data-reject]").forEach((b) => {
      b.addEventListener("click", () => rejectDoc(Number(b.dataset.reject)));
    });

    bindModalActionsOnce();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

/* ===================== DOC REVIEW ===================== */
async function approveDoc(docType) {
  try {
    toast("Approving document...", "info");

    const docs = await getDocumentsContract(false);
    const group = getPensionerDocGroupByProgram(currentProgram);

    const tx = await docs.approveDocument(currentWallet, group, docType);
    await tx.wait();

    toast("Document approved ✔", "success");
    openReview(currentWallet);
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

async function rejectDoc(docType) {
  const reason = prompt("Reject reason:");
  if (!reason) return;

  try {
    toast("Rejecting document...", "warning");

    const docs = await getDocumentsContract(false);
    const group = getPensionerDocGroupByProgram(currentProgram);

    const tx = await docs.rejectDocument(currentWallet, group, docType, reason);
    await tx.wait();

    toast("Document rejected ✔", "success");
    openReview(currentWallet);
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  }
}

/* ===================== MODAL ACTIONS ===================== */
let modalActionsBound = false;

function bindModalActionsOnce() {
  if (modalActionsBound) return;
  modalActionsBound = true;

  const btnApproveAll = document.getElementById("btnApproveAll");
  const btnRejectPensioner = document.getElementById("btnRejectPensioner");

  const btnVerifyDeath = document.getElementById("btnVerifyDeath");
  const btnRejectDeath = document.getElementById("btnRejectDeath");

  const btnApproveNominee = document.getElementById("btnApproveNominee");
  const btnRejectNominee = document.getElementById("btnRejectNominee");

  const btnVerifyGPS = document.getElementById("btnVerifyGPS");
  const btnGpsVerifyConfirm = document.getElementById("btnGpsVerifyConfirm");

  btnVerifyGPS?.addEventListener("click", async () => {
    if (!currentWallet) return;

    try {
      const registryRead = await getRegistryContract(true);
      const p = await registryRead.getPensioner(currentWallet);
      openGpsVerifyModal(p);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    }
  });

  btnGpsVerifyConfirm?.addEventListener("click", async () => {
    if (!currentWallet) return;

    const inpSalary = document.getElementById("gpsVerifiedSalary");
    const inpYears = document.getElementById("gpsVerifiedYears");
    const inpEmpId = document.getElementById("gpsVerifiedEmpId");

    const salary = Number(inpSalary?.value || 0);
    const years = Number(inpYears?.value || 0);
    const empId = String(inpEmpId?.value || "").trim();

    if (!salary || salary <= 0) {
      toast("Verified salary must be greater than 0", "error");
      return;
    }

    if (!years || years <= 0) {
      toast("Verified service years must be greater than 0", "error");
      return;
    }

    if (!empId) {
      toast("Verified employee ID is required", "error");
      return;
    }

    try {
      setLoading(btnGpsVerifyConfirm, true, "Verifying...");
      toast("Verifying GPS data on blockchain...", "info");

      const registry = await getRegistryContract(false);

      const tx = await registry.verifyGPSData(
        currentWallet,
        salary,
        years,
        empId,
      );
      await tx.wait();

      toast("GPS data verified ✔", "success");

      gpsVerifyModal?.hide();
      openReview(currentWallet);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnGpsVerifyConfirm, false);
    }
  });

  btnApproveAll?.addEventListener("click", async () => {
    if (!currentWallet) return;

    try {
      setLoading(btnApproveAll, true, "Approving...");
      toast("Preparing approval...", "info");

      const registryRead = await getRegistryContract(true);
      const program = Number(await registryRead.getProgram(currentWallet));

      if (program === 0) {
        const p = await registryRead.getPensioner(currentWallet);
        const gpsVerified = Boolean(p.gpsVerified);

        if (!gpsVerified) {
          const salary = Number(p.basicSalaryBDT || 0);
          const years = Number(p.serviceYears || 0);
          const empId = String(p.employeeId || "").trim();

          if (!salary || !years || !empId) {
            toast("GPS info missing. Cannot auto-verify.", "error");
            return;
          }

          toast("Auto verifying GPS data...", "info");

          const registryWrite = await getRegistryContract(false);
          const txV = await registryWrite.verifyGPSData(
            currentWallet,
            salary,
            years,
            empId,
          );
          await txV.wait();

          toast("GPS verified ✔", "success");
        }
      }

      const { required, list } = await getPensionerDocsList(currentWallet);
      const docsWrite = await getDocumentsContract(false);

      const docTypes = [];
      const decisions = [];
      const reasons = [];

      for (let i = 0; i < required.length; i++) {
        const d = list[i];
        const status = d ? Number(d.status) : 0;

        if (status === 1) {
          docTypes.push(required[i].docType);
          decisions.push(true);
          reasons.push("");
        }
      }

      if (docTypes.length > 0) {
        toast(`Approving ${docTypes.length} docs in one tx...`, "info");

        let tx;
        if (program === 0) {
          tx = await docsWrite.reviewGPSDocumentsBatch(
            currentWallet,
            docTypes,
            decisions,
            reasons,
          );
        } else {
          tx = await docsWrite.reviewPRSSDocumentsBatch(
            currentWallet,
            docTypes,
            decisions,
            reasons,
          );
        }

        await tx.wait();
        toast("Documents approved ✔", "success");
      } else {
        toast("No submitted docs to approve.", "warning");
      }

      toast("Approving pensioner...", "info");
      const registry = await getRegistryContract(false);
      const tx2 = await registry.approvePensioner(currentWallet);
      await tx2.wait();

      toast("Pensioner approved ✔", "success");
      modal.hide();

      await loadPending();
      await loadAllPensioners();
      await loadDeceased();
      await loadDeathReports();
      await loadClosureRequests();
      await loadGpsFundManagement();
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnApproveAll, false);
    }
  });

  btnRejectPensioner?.addEventListener("click", async () => {
    if (!currentWallet) return;

    const reason = document.getElementById("rejectReason")?.value?.trim();
    if (!reason) {
      toast("Rejection reason required", "error");
      return;
    }

    try {
      setLoading(btnRejectPensioner, true, "Rejecting...");

      const registry = await getRegistryContract(false);
      const tx = await registry.rejectPensioner(currentWallet, reason);
      await tx.wait();

      toast("Pensioner rejected ✔", "success");
      modal.hide();

      await loadPending();
      await loadAllPensioners();
      await loadDeceased();
      await loadDeathReports();
      await loadClosureRequests();
      await loadGpsFundManagement();
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnRejectPensioner, false);
    }
  });

  btnVerifyDeath?.addEventListener("click", async () => {
    if (!currentWallet) return;

    const proofCID = prompt("Enter verified death proof CID (Admin Upload):");
    if (!proofCID) {
      toast("Proof CID is required to verify death.", "error");
      return;
    }

    try {
      setLoading(btnVerifyDeath, true, "Verifying...");
      toast("Verifying death report...", "info");

      const registry = await getRegistryContract(false);
      const tx = await registry.verifyDeathReport(currentWallet, proofCID);
      await tx.wait();

      toast("Death verified ✔ Pensioner marked deceased", "success");

      await loadAllPensioners();
      await loadDeceased();
      await loadDeathReports();
      await loadClosureRequests();
      await loadGpsFundManagement();
      openReview(currentWallet);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnVerifyDeath, false);
    }
  });

  btnRejectDeath?.addEventListener("click", async () => {
    if (!currentWallet) return;

    const reason = document.getElementById("deathRejectReason")?.value?.trim();
    if (!reason) {
      toast("Death reject reason required", "error");
      return;
    }

    try {
      setLoading(btnRejectDeath, true, "Rejecting...");
      toast("Rejecting death report...", "warning");

      const registry = await getRegistryContract(false);
      const tx = await registry.rejectDeathReport(currentWallet, reason);
      await tx.wait();

      toast("Death report rejected ✔", "success");

      await loadAllPensioners();
      await loadDeathReports();
      await loadClosureRequests();
      await loadGpsFundManagement();
      openReview(currentWallet);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnRejectDeath, false);
    }
  });

  btnApproveNominee?.addEventListener("click", async () => {
    if (!currentWallet) return;

    try {
      setLoading(btnApproveNominee, true, "Approving...");
      toast("Approving nominee claim...", "info");

      const registry = await getRegistryContract(false);
      const tx = await registry.approveNomineeClaim(currentWallet);
      await tx.wait();

      toast("Nominee claim approved ✔", "success");

      await loadAllPensioners();
      await loadDeceased();
      await loadClosureRequests();
      await loadGpsFundManagement();
      openReview(currentWallet);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnApproveNominee, false);
    }
  });

  btnRejectNominee?.addEventListener("click", async () => {
    if (!currentWallet) return;

    const reason = document
      .getElementById("nomineeRejectReason")
      ?.value?.trim();
    if (!reason) {
      toast("Reject reason required", "error");
      return;
    }

    try {
      setLoading(btnRejectNominee, true, "Rejecting...");
      toast("Rejecting nominee claim...", "warning");

      const registry = await getRegistryContract(false);
      const tx = await registry.rejectNomineeClaim(currentWallet, reason);
      await tx.wait();

      toast("Nominee claim rejected ✔", "success");

      await loadAllPensioners();
      await loadDeceased();
      await loadClosureRequests();
      await loadGpsFundManagement();
      openReview(currentWallet);
    } catch (err) {
      console.error(err);
      toast(extractNiceError(err), "error");
    } finally {
      setLoading(btnRejectNominee, false);
    }
  });
}

/* ===================== EVENTS ===================== */
btnRefresh?.addEventListener("click", async () => {
  const activePending = !pendingSection.classList.contains("d-none");
  const activeAll = !allSection.classList.contains("d-none");
  const activeDeceased = !deceasedSection.classList.contains("d-none");
  const activeDeathReports = !deathReportSection?.classList.contains("d-none");
  const activeHistory = !historySection?.classList.contains("d-none");
  const activeGpsFund = !gpsFundSection?.classList.contains("d-none");
  const activeClosure = !closureSection?.classList.contains("d-none");

  if (activePending) return loadPending();
  if (activeAll) return loadAllPensioners();
  if (activeDeathReports) return loadDeathReports();
  if (activeDeceased) return loadDeceased();
  if (activeClosure) return loadClosureRequests();
  if (activeGpsFund) return loadGpsFundManagement();
  if (activeHistory) return loadAdminHistory();
});

tabPending?.addEventListener("click", async () => {
  setActiveTab("pending");
  await loadPending();
});

tabAll?.addEventListener("click", async () => {
  setActiveTab("all");
  await loadAllPensioners();
});

tabDeathReports?.addEventListener("click", async () => {
  setActiveTab("deathReports");
  await loadDeathReports();
});

tabDeceased?.addEventListener("click", async () => {
  setActiveTab("deceased");
  await loadDeceased();
});

// ✅ NEW
tabClosureRequests?.addEventListener("click", async () => {
  setActiveTab("closure");
  await loadClosureRequests();
});

tabGpsFund?.addEventListener("click", async () => {
  setActiveTab("gpsFund");
  await loadGpsFundManagement();
});

tabHistory?.addEventListener("click", async () => {
  setActiveTab("history");
  await loadAdminHistory();
});

btnLoadAdminHistory?.addEventListener("click", loadAdminHistory);
btnReloadGpsFund?.addEventListener("click", loadGpsFundManagement);

/* ===================== INIT ===================== */
(async function init() {
  const ok = await requireAdminOrRedirect();
  if (!ok) return;

  setActiveTab("pending");
  await loadPending();
})();
