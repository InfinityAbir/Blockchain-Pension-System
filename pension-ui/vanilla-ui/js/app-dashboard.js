// app-dashboard.js
import { requireLogin, logout } from "./auth.js";
import { toast, setLoading } from "./ui.js";
import {
  getFundContract,
  getDisbursementContract,
  getRegistryContract,
  getUserState,
  STATUS,
  getProvider,
} from "./contracts.js";

let account = requireLogin();

try {
  account = ethers.getAddress(String(account).trim());
} catch (e) {
  console.error("Invalid stored account:", account);
  toast("Invalid wallet saved. Please login again.", "error");
  logout();
}

document.getElementById("btnLogout")?.addEventListener("click", logout);

const btnRefresh = document.getElementById("btnRefresh");
const btnPay = document.getElementById("btnPay");
const btnStart = document.getElementById("btnStart");
const btnWithdraw = document.getElementById("btnWithdraw");

const btnChooseMonthly = document.getElementById("btnChooseMonthly");
const btnWithdrawFull = document.getElementById("btnWithdrawFull");

const btnLoadHistory = document.getElementById("btnLoadHistory");

/* ✅ Account Closure Buttons */
const btnRequestClosure = document.getElementById("btnRequestClosure");
const accountStatusTextEl = document.getElementById("accountStatusText");
const accountClosureNotice = document.getElementById("accountClosureNotice");
const accountClosureNoticeText = document.getElementById(
  "accountClosureNoticeText",
);

/* ✅ GPS Gratuity */
const gpsGratuityBox = document.getElementById("gpsGratuityBox");
const gpsGratuityAmountEl = document.getElementById("gpsGratuityAmount");
const gpsGratuityStatusText = document.getElementById("gpsGratuityStatusText");
const btnClaimGratuity = document.getElementById("btnClaimGratuity");

/* Summary */
const pensionStartedEl = document.getElementById("pensionStarted");
const monthlyAmountEl = document.getElementById("monthlyAmount");
const totalContributionEl = document.getElementById("totalContribution");
const pensionModeTextEl = document.getElementById("pensionModeText");

const userBadgeText = document.getElementById("userBadgeText");
const deceasedBadge = document.getElementById("deceasedBadge");

const programTextEl = document.getElementById("programText");
const gpsInfoBox = document.getElementById("gpsInfoBox");
const prssPayRow = document.getElementById("prssPayRow");
const schemeNote = document.getElementById("schemeNote");

/* Pay column wrapper (so GPS can hide only Pay button) */
const payCol = document.getElementById("payCol");

/* GPS fields */
const gpsSalaryEl = document.getElementById("gpsSalary");
const gpsServiceYearsEl = document.getElementById("gpsServiceYears");
const gpsEmployeeIdEl = document.getElementById("gpsEmployeeId");
const gpsDesignationEl = document.getElementById("gpsDesignation");

/* DOB + AGE UI */
const dobTextEl = document.getElementById("dobText");
const ageTextEl = document.getElementById("ageText");

/* History UI */
const pensionStartedAtEl = document.getElementById("pensionStartedAt");
const monthlyPaymentsCountEl = document.getElementById("monthlyPaymentsCount");
const totalContribHistoryEl = document.getElementById("totalContribHistory");

const contributionHistoryBody = document.getElementById(
  "contributionHistoryBody",
);
const withdrawHistoryBody = document.getElementById("withdrawHistoryBody");

/* ===================== PROGRAM ENUM ===================== */
// 0 = GPS, 1 = PRSS
const PROGRAM = {
  GPS: 0,
  PRSS: 1,
};

function programName(code) {
  const n = Number(code);
  if (n === PROGRAM.GPS) return "GPS (Government Pension Scheme)";
  if (n === PROGRAM.PRSS) return "PRSS (Private Retirement Savings)";
  return "Unknown Program";
}

/* ===================== ACCOUNT STATUS ENUM ===================== */
// matches your Registry enum AccountStatus { ACTIVE, CLOSURE_REQUESTED, CLOSED }
const ACCOUNT_STATUS = {
  ACTIVE: 0,
  CLOSURE_REQUESTED: 1,
  CLOSED: 2,
};

let monthlyContributionWei = 0n;
let totalContributionWei = 0n; // PRSS balance
let gpsRemainingWei = 0n; // GPS balance
let isBusy = false;
let currentProgram = PROGRAM.PRSS;

/* ===================== SCHEME RULE HELPERS (PRSS ONLY) ===================== */
function schemeMinMonths(code) {
  const n = Number(code);
  if (n === 0) return 12;
  if (n === 2) return 24;
  if (n === 1) return 36;
  if (n === 3) return 60;
  return 12;
}

/* ===================== DOB + AGE HELPERS ===================== */
function isProbablyYYYYMMDD(n) {
  return Number.isFinite(n) && n >= 19000101 && n <= 21001231;
}

function yyyymmddToParts(yyyymmdd) {
  const n = Number(yyyymmdd || 0);
  const yyyy = Math.floor(n / 10000);
  const mm = Math.floor((n % 10000) / 100);
  const dd = n % 100;
  return { yyyy, mm, dd };
}

function formatDOB(dobRaw) {
  try {
    const n = Number(dobRaw || 0);
    if (!n) return "—";

    if (isProbablyYYYYMMDD(n)) {
      const { yyyy, mm, dd } = yyyymmddToParts(n);
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }

    if (n < 100000) return "—";

    const d = new Date(n * 1000);
    if (isNaN(d.getTime())) return "—";

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "—";
  }
}

function calcAgeFromDOB(dobRaw) {
  try {
    const n = Number(dobRaw || 0);
    if (!n) return 0;

    if (isProbablyYYYYMMDD(n)) {
      const { yyyy, mm, dd } = yyyymmddToParts(n);

      const today = new Date();
      const nowY = today.getFullYear();
      const nowM = today.getMonth() + 1;
      const nowD = today.getDate();

      let age = nowY - yyyy;
      if (nowM < mm || (nowM === mm && nowD < dd)) age--;

      return age < 0 ? 0 : age;
    }

    const now = Math.floor(Date.now() / 1000);
    const age = Math.floor((now - n) / (365.25 * 24 * 60 * 60));
    return age < 0 ? 0 : age;
  } catch {
    return 0;
  }
}

function pensionModeName(code) {
  const n = Number(code);
  if (n === 0) return "Not Chosen";
  if (n === 1) return "Monthly";
  if (n === 2) return "Lump Sum";
  if (n === 3) return "Gratuity Taken";
  return "Unknown";
}

/* ===================== UTIL ===================== */
function prettyEth(wei) {
  try {
    return ethers.formatEther(BigInt(wei));
  } catch {
    return "0";
  }
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

function extractNiceError(err) {
  const msg =
    err?.reason || err?.shortMessage || err?.message || "Transaction failed";

  if (msg.includes("Account closed")) {
    return "Your account is closed. Please contact admin.";
  }

  if (msg.includes("Not active")) {
    return "Your account is not active. Please contact admin.";
  }

  if (msg.includes("Already paid this month"))
    return "You already paid this month. Try again next month.";

  if (msg.includes("Not retirement age"))
    return "You are not eligible yet. Retirement age must be 60+.";

  if (msg.includes("No contributions"))
    return "You have no contributions. Please pay at least 1 contribution first.";

  if (msg.includes("Monthly mode not chosen"))
    return "You must choose Monthly Mode first.";

  if (msg.includes("Mode already chosen"))
    return "You already selected a pension mode.";

  if (msg.includes("GPS data not verified"))
    return "Admin has not verified your GPS information yet.";

  if (msg.includes("deferred error during ABI decoding")) {
    return "Contract read failed (ABI mismatch / wrong address). Re-check config.js deployed addresses.";
  }

  if (msg.includes("user rejected") || msg.includes("User rejected")) {
    return "You cancelled the transaction in MetaMask.";
  }

  return msg;
}

function disableAllActions(reason = "") {
  if (btnPay) {
    btnPay.disabled = true;
    btnPay.title = reason;
  }
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.title = reason;
  }
  if (btnWithdraw) {
    btnWithdraw.disabled = true;
    btnWithdraw.title = reason;
  }
  if (btnChooseMonthly) {
    btnChooseMonthly.disabled = true;
    btnChooseMonthly.title = reason;
  }
  if (btnWithdrawFull) {
    btnWithdrawFull.disabled = true;
    btnWithdrawFull.title = reason;
  }
  if (btnClaimGratuity) {
    btnClaimGratuity.disabled = true;
    btnClaimGratuity.title = reason;
  }
}

function setBadge(stateStatus, isDeceased) {
  if (!userBadgeText) return;

  if (stateStatus === STATUS.APPROVED)
    userBadgeText.textContent = "Approved Pensioner";
  else if (stateStatus === STATUS.PENDING)
    userBadgeText.textContent = "Pending Verification";
  else if (stateStatus === STATUS.REJECTED)
    userBadgeText.textContent = "Rejected";
  else userBadgeText.textContent = "Not Registered";

  if (deceasedBadge) deceasedBadge.classList.toggle("d-none", !isDeceased);
}

function setLoadingSkeleton() {
  if (pensionStartedEl) pensionStartedEl.textContent = "—";
  if (pensionModeTextEl) pensionModeTextEl.textContent = "—";
  if (monthlyAmountEl) monthlyAmountEl.textContent = "—";
  if (totalContributionEl) totalContributionEl.textContent = "—";

  if (gpsGratuityAmountEl) gpsGratuityAmountEl.textContent = "—";
  if (gpsGratuityStatusText) gpsGratuityStatusText.textContent = "—";

  if (dobTextEl) dobTextEl.textContent = "—";
  if (ageTextEl) ageTextEl.textContent = "—";
}

async function safeRead(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error("Read failed:", err);
    return fallback;
  }
}

/* ===================== HISTORY HELPERS ===================== */
async function getBlockTimestamp(provider, blockNumber) {
  if (!blockNumber && blockNumber !== 0) return 0;
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
    setEmptyTable(tbody, "No history found yet.");
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

/* ===================== LOAD HISTORY ===================== */
async function loadHistory() {
  try {
    if (btnLoadHistory) setLoading(btnLoadHistory, true, "Loading...");

    const state = await getUserState(account);
    if (state.status !== STATUS.APPROVED) {
      toast("History is available only for approved pensioners.", "warning");
      return;
    }

    const provider = await getProvider();
    const fund = await getFundContract(true);
    const disb = await getDisbursementContract(true);
    const registry = await getRegistryContract(true);

    const program = Number(
      await safeRead(() => registry.getProgram(account), 1),
    );
    const isGPS = program === PROGRAM.GPS;

    const totalPRSS = await safeRead(
      () => fund.totalContributions(account),
      0n,
    );
    const monthlyCountPRSS = await safeRead(
      () => fund.monthlyPaymentsCount(account),
      0n,
    );

    const gpsRemain = await safeRead(() => fund.gpsAllocatedFund(account), 0n);

    if (totalContribHistoryEl) {
      if (isGPS) {
        totalContribHistoryEl.textContent =
          prettyEth(gpsRemain) + " ETH (GPS Remaining)";
      } else {
        totalContribHistoryEl.textContent =
          prettyEth(totalPRSS) + " ETH (PRSS Total)";
      }
    }

    // ✅ FIX: GPS monthly "payments count" should show number of monthly withdrawals (event count)
    if (monthlyPaymentsCountEl) {
      if (isGPS) {
        try {
          const wFilter = disb.filters.MonthlyPensionWithdrawn(
            account,
            null,
            null,
          );
          const wLogs = await disb.queryFilter(wFilter, 0, "latest");
          monthlyPaymentsCountEl.textContent = String(wLogs.length || 0);
        } catch (e) {
          console.warn("GPS monthly withdrawal count read failed:", e);
          monthlyPaymentsCountEl.textContent = "0";
        }
      } else {
        monthlyPaymentsCountEl.textContent = String(monthlyCountPRSS || 0);
      }
    }

    let startedAtText = "Not started yet";
    try {
      const startFilter = disb.filters.PensionStarted(account, null, null);
      const startLogs = await disb.queryFilter(startFilter, 0, "latest");

      if (startLogs.length > 0) {
        const last = startLogs[startLogs.length - 1];
        const eventTs = Number(last?.args?.startedAt || 0);

        if (eventTs) startedAtText = formatTime(eventTs);
        else {
          const ts = await getBlockTimestamp(provider, last.blockNumber);
          startedAtText = formatTime(ts);
        }
      }
    } catch (e) {
      console.warn("PensionStarted event read failed:", e);
      startedAtText = "—";
    }

    if (pensionStartedAtEl) pensionStartedAtEl.textContent = startedAtText;

    try {
      const rows = [];

      if (!isGPS) {
        const contribFilter = fund.filters.ContributionMade(
          account,
          null,
          null,
        );
        const contribLogs = await fund.queryFilter(contribFilter, 0, "latest");

        for (const log of contribLogs) {
          const amount = log?.args?.amount ?? 0n;
          const ts = log?.args?.timestamp ?? 0n;

          rows.push({
            amountEth: prettyEth(amount) + " ETH (PRSS)",
            time: formatTime(ts),
            txHash: log.transactionHash,
            sortTs: Number(ts || 0),
          });
        }
      } else {
        const gpsFilter = fund.filters.GPSFundAllocated(account, null, null);
        const gpsLogs = await fund.queryFilter(gpsFilter, 0, "latest");

        for (const log of gpsLogs) {
          const amount = log?.args?.amount ?? 0n;
          const ts = log?.args?.timestamp ?? 0n;

          rows.push({
            amountEth: prettyEth(amount) + " ETH (GPS Allocated)",
            time: formatTime(ts),
            txHash: log.transactionHash,
            sortTs: Number(ts || 0),
          });
        }
      }

      rows.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
      renderRows(contributionHistoryBody, rows);
    } catch (e) {
      console.warn("Contribution/GPS history read failed:", e);
      setEmptyTable(contributionHistoryBody, "Failed to load fund history.");
    }

    try {
      const rows = [];

      const wFilter = disb.filters.MonthlyPensionWithdrawn(account, null, null);
      const wLogs = await disb.queryFilter(wFilter, 0, "latest");

      for (const log of wLogs) {
        const amount = log?.args?.amount ?? 0n;
        const ts = log?.args?.timestamp ?? 0n;

        rows.push({
          amountEth: prettyEth(amount) + " ETH (MONTHLY)",
          time: formatTime(ts),
          txHash: log.transactionHash,
          sortTs: Number(ts || 0),
        });
      }

      const fFilter = disb.filters.FullPensionWithdrawn(account, null, null);
      const fLogs = await disb.queryFilter(fFilter, 0, "latest");

      for (const log of fLogs) {
        const amount = log?.args?.amount ?? 0n;
        const ts = log?.args?.timestamp ?? 0n;

        rows.push({
          amountEth: prettyEth(amount) + " ETH (FULL)",
          time: formatTime(ts),
          txHash: log.transactionHash,
          sortTs: Number(ts || 0),
        });
      }

      // Optional: show gratuity claim in withdrawal history for GPS
      if (isGPS) {
        try {
          const gFilter = disb.filters.GPSGratuityPaid(account, null, null);
          const gLogs = await disb.queryFilter(gFilter, 0, "latest");

          for (const log of gLogs) {
            const amount = log?.args?.amountWei ?? 0n;
            const ts = log?.args?.timestamp ?? 0n;

            rows.push({
              amountEth: prettyEth(amount) + " ETH (GRATUITY)",
              time: formatTime(ts),
              txHash: log.transactionHash,
              sortTs: Number(ts || 0),
            });
          }
        } catch (e) {
          console.warn("GPS gratuity logs read failed:", e);
        }
      }

      rows.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
      renderRows(withdrawHistoryBody, rows);
    } catch (e) {
      console.warn("Withdraw history read failed:", e);
      setEmptyTable(withdrawHistoryBody, "Failed to load withdrawals.");
    }

    toast("History loaded ✔", "success");
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Failed to load history", "error");
  } finally {
    if (btnLoadHistory) setLoading(btnLoadHistory, false);
  }
}

/* ===================== ACCOUNT STATUS UI ===================== */
function renderAccountStatusUI(accountStatus) {
  const st = Number(accountStatus);

  if (accountStatusTextEl) {
    if (st === ACCOUNT_STATUS.ACTIVE)
      accountStatusTextEl.textContent = "Account: Active";
    else if (st === ACCOUNT_STATUS.CLOSURE_REQUESTED)
      accountStatusTextEl.textContent = "Account: Closure Requested";
    else if (st === ACCOUNT_STATUS.CLOSED)
      accountStatusTextEl.textContent = "Account: Closed";
    else accountStatusTextEl.textContent = `Account: Unknown (${st})`;
  }

  if (!accountClosureNotice || !accountClosureNoticeText) return;

  if (st === ACCOUNT_STATUS.ACTIVE) {
    accountClosureNotice.classList.add("d-none");
    accountClosureNoticeText.textContent = "";
  } else if (st === ACCOUNT_STATUS.CLOSURE_REQUESTED) {
    accountClosureNotice.classList.remove("d-none");
    accountClosureNoticeText.innerHTML = `
      Your account closure request is <b>pending admin review</b>.
      <br/>
      Dashboard actions are temporarily locked until admin decision.
    `;
  } else if (st === ACCOUNT_STATUS.CLOSED) {
    accountClosureNotice.classList.remove("d-none");
    accountClosureNoticeText.innerHTML = `
      Your account is <b>closed</b>.
      <br/>
      You cannot pay, start pension, withdraw, or claim gratuity anymore.
    `;
  } else {
    accountClosureNotice.classList.remove("d-none");
    accountClosureNoticeText.textContent =
      "Account status could not be determined.";
  }

  if (btnRequestClosure) {
    btnRequestClosure.disabled = st !== ACCOUNT_STATUS.ACTIVE;
    btnRequestClosure.title =
      st === ACCOUNT_STATUS.ACTIVE
        ? ""
        : "Closure request already submitted or account closed.";
  }

  if (st !== ACCOUNT_STATUS.ACTIVE) {
    disableAllActions("Account is not active.");
  }
}

/* ===================== MAIN DASHBOARD ===================== */
async function loadDashboard() {
  try {
    setLoadingSkeleton();

    const fund = await getFundContract(true);
    const disb = await getDisbursementContract(true);
    const registry = await getRegistryContract(true);

    const state = await getUserState(account);

    // getAccountStatus is in your Registry
    const accountStatus = Number(
      await safeRead(() => registry.getAccountStatus(account), 0),
    );
    renderAccountStatusUI(accountStatus);

    if (state.status !== STATUS.APPROVED) {
      setBadge(state.status, false);
      disableAllActions("Only approved pensioners can use dashboard actions.");
      return;
    }

    // if account not active, stop further logic
    if (accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      setBadge(state.status, false);
      return;
    }

    /* PROGRAM */
    currentProgram = Number(
      await safeRead(() => registry.getProgram(account), 1),
    );
    const isGPS = currentProgram === PROGRAM.GPS;

    if (programTextEl) {
      programTextEl.textContent = `Program: ${programName(currentProgram)}`;
    }

    if (btnWithdrawFull) {
      btnWithdrawFull.classList.toggle("d-none", isGPS);
    }

    /* PENSIONER INFO */
    const pensioner = await registry.getPensioner(account);
    const isDeceased = Boolean(pensioner.isDeceased);

    setBadge(state.status, isDeceased);

    const dobRaw = pensioner.dateOfBirth ?? 0;
    const dobNice = formatDOB(dobRaw);
    const age = calcAgeFromDOB(dobRaw);

    if (dobTextEl) dobTextEl.textContent = dobNice;
    if (ageTextEl) ageTextEl.textContent = age ? `${age} years` : "—";

    if (isDeceased) {
      pensionStartedEl.textContent = "LOCKED";
      pensionModeTextEl.textContent = "LOCKED";
      monthlyAmountEl.textContent = "—";
      totalContributionEl.textContent = "—";

      if (gpsGratuityBox) gpsGratuityBox.classList.add("d-none");

      disableAllActions("This pensioner is marked deceased.");
      return;
    }

    /* SECTION VISIBILITY */
    gpsInfoBox?.classList.toggle("d-none", !isGPS);

    prssPayRow?.classList.remove("d-none");
    payCol?.classList.toggle("d-none", isGPS);

    gpsGratuityBox?.classList.toggle("d-none", !isGPS);

    /* GPS INFO */
    if (isGPS) {
      gpsSalaryEl.textContent = String(pensioner.verifiedBasicSalaryBDT || 0);
      gpsServiceYearsEl.textContent = String(
        pensioner.verifiedServiceYears || 0,
      );
      gpsEmployeeIdEl.textContent = pensioner.verifiedEmployeeId || "—";
      gpsDesignationEl.textContent = pensioner.designation || "—";

      schemeNote.textContent =
        "⚠ GPS pension is funded by government allocation. No monthly contribution required.";
    } else {
      schemeNote.textContent =
        "⚠ Minimum monthly payments depend on selected PRSS scheme.";
    }

    /* FUND BALANCES */
    if (isGPS) {
      gpsRemainingWei = BigInt(
        await safeRead(() => fund.gpsAllocatedFund(account), 0n),
      );
      totalContributionEl.textContent =
        prettyEth(gpsRemainingWei) + " ETH (GPS Remaining)";
    } else {
      totalContributionWei = BigInt(
        await safeRead(() => fund.totalContributions(account), 0n),
      );
      totalContributionEl.textContent =
        prettyEth(totalContributionWei) + " ETH (PRSS)";
    }

    /* PENSION STATE */
    const ps = await disb.pensions(account);

    pensionStartedEl.textContent = ps.started ? "YES" : "NO";
    monthlyAmountEl.textContent =
      ps.started && ps.monthlyAmount > 0
        ? prettyEth(ps.monthlyAmount) + " ETH"
        : "—";

    const modeCode = Number(await safeRead(() => disb.pensionMode(account), 0));
    const lumpDone = Boolean(
      await safeRead(() => disb.lumpSumWithdrawn(account), false),
    );

    pensionModeTextEl.textContent = pensionModeName(modeCode);

    /* GPS GRATUITY */
    if (isGPS) {
      const gratuityClaimed = Boolean(
        await safeRead(() => disb.gpsGratuityClaimed(account), false),
      );

      if (gpsGratuityStatusText) {
        gpsGratuityStatusText.textContent = gratuityClaimed
          ? "CLAIMED"
          : "NOT CLAIMED";
      }

      const salaryBDT = Number(pensioner.verifiedBasicSalaryBDT || 0);
      const years = Number(pensioner.verifiedServiceYears || 0);

      const gratuityBDT = salaryBDT * years;
      const gratuityEth = gratuityBDT / 300000;

      if (gpsGratuityAmountEl) {
        gpsGratuityAmountEl.textContent =
          gratuityEth > 0 ? gratuityEth.toFixed(6) + " ETH" : "0 ETH";
      }

      // ✅ REALISTIC FIX: Gratuity should NOT be blocked after choosing monthly mode
      if (btnClaimGratuity) {
        if (age < 60) {
          btnClaimGratuity.disabled = true;
          btnClaimGratuity.title = "Gratuity available only after age 60.";
        } else if (gratuityClaimed) {
          btnClaimGratuity.disabled = true;
          btnClaimGratuity.title = "Gratuity already claimed.";
        } else {
          btnClaimGratuity.disabled = false;
          btnClaimGratuity.title = "";
        }
      }
    }

    /* BUTTON RULES */
    if (btnPay) {
      if (isGPS) {
        btnPay.disabled = true;
      } else {
        monthlyContributionWei = BigInt(pensioner.monthlyContribution || 0);
        btnPay.disabled = monthlyContributionWei === 0n;
      }
    }

    if (btnStart) {
      if (ps.started) {
        btnStart.disabled = true;
        btnStart.title = "Pension already started.";
      } else if (age < 60) {
        btnStart.disabled = true;
        btnStart.title = "You must be age 60+ to start pension.";
      } else if (!isGPS) {
        const paidMonths = Number(
          await safeRead(() => fund.monthlyPaymentsCount(account), 0n),
        );
        const minMonths = schemeMinMonths(Number(pensioner.scheme || 0));

        btnStart.disabled =
          totalContributionWei === 0n || paidMonths < minMonths;

        btnStart.title = btnStart.disabled
          ? `Need contributions + minimum months (${minMonths}). Paid: ${paidMonths}`
          : "";
      } else {
        btnStart.disabled = false;
        btnStart.title = "";
      }
    }

    if (btnChooseMonthly) {
      btnChooseMonthly.disabled = !ps.started || modeCode !== 0 || lumpDone;
    }

    if (btnWithdrawFull) {
      btnWithdrawFull.disabled = !ps.started || modeCode !== 0 || lumpDone;
    }

    if (btnWithdraw) {
      btnWithdraw.disabled = !ps.started || modeCode !== 1 || lumpDone;
    }
  } catch (err) {
    console.error(err);
    disableAllActions("Failed to load dashboard.");
    toast(extractNiceError(err), "error");
  }
}

/* ===================== EVENTS ===================== */
btnRefresh?.addEventListener("click", loadDashboard);
btnLoadHistory?.addEventListener("click", loadHistory);

/* ===================== ACCOUNT CLOSURE EVENT ===================== */
btnRequestClosure?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    const reason = prompt(
      "Enter reason for account closure request (required):",
      "I want to close my pension account.",
    );

    if (!reason || !String(reason).trim()) {
      toast("Closure reason is required.", "warning");
      return;
    }

    const ok = confirm(
      "Are you sure you want to request account closure?\n\nAfter request, your dashboard actions will be locked until admin decision.",
    );
    if (!ok) return;

    isBusy = true;
    setLoading(btnRequestClosure, true, "Requesting...");

    const registry = await getRegistryContract(false);

    // contract function: requestAccountClosure(string reason)
    const tx = await registry.requestAccountClosure(String(reason).trim());
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Closure request submitted ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Closure request failed", "error");
  } finally {
    isBusy = false;
    setLoading(btnRequestClosure, false);
  }
});

/* ===================== EXISTING EVENTS ===================== */
btnPay?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    if (currentProgram === PROGRAM.GPS) {
      toast("GPS pensioners do not pay monthly contributions here.", "warning");
      return;
    }

    if (!monthlyContributionWei || monthlyContributionWei === 0n) {
      toast("Monthly contribution not found. Please register again.", "error");
      return;
    }

    isBusy = true;
    setLoading(btnPay, true, "Paying...");

    const fund = await getFundContract(false);

    const tx = await fund.contributeMonthly({
      value: monthlyContributionWei,
    });

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Monthly contribution paid ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err), "error");
  } finally {
    isBusy = false;
    setLoading(btnPay, false);
  }
});

btnStart?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    isBusy = true;
    setLoading(btnStart, true, "Starting...");

    const disb = await getDisbursementContract(false);

    const tx = await disb.startPension();
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Pension started ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Start pension failed", "error");
  } finally {
    isBusy = false;
    setLoading(btnStart, false);
  }
});

btnChooseMonthly?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    isBusy = true;
    setLoading(btnChooseMonthly, true, "Selecting...");

    const disb = await getDisbursementContract(false);

    const tx = await disb.chooseMonthlyPension();
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Monthly mode selected ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Failed to choose monthly mode", "error");
  } finally {
    isBusy = false;
    setLoading(btnChooseMonthly, false);
  }
});

btnWithdrawFull?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    const ok = confirm(
      "Full withdrawal is ONE-TIME and will permanently disable monthly pension. Continue?",
    );
    if (!ok) return;

    isBusy = true;
    setLoading(btnWithdrawFull, true, "Withdrawing...");

    const disb = await getDisbursementContract(false);

    const tx = await disb.withdrawFullPension();
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Full pension withdrawn ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Full withdraw failed", "error");
  } finally {
    isBusy = false;
    setLoading(btnWithdrawFull, false);
  }
});

btnWithdraw?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    isBusy = true;
    setLoading(btnWithdraw, true, "Withdrawing...");

    const disb = await getDisbursementContract(false);

    const tx = await disb.withdrawMonthlyPension();
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Monthly pension withdrawn ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Withdraw failed", "error");
  } finally {
    isBusy = false;
    setLoading(btnWithdraw, false);
  }
});

/* GPS Gratuity Claim */
btnClaimGratuity?.addEventListener("click", async () => {
  if (isBusy) return;

  try {
    if (currentProgram !== PROGRAM.GPS) {
      toast("Only GPS pensioners can claim gratuity.", "warning");
      return;
    }

    // ✅ REALISTIC FIX: no more "GratuityTaken lock"
    const ok = confirm(
      "GPS Gratuity is ONE-TIME.\n\nYou can still withdraw monthly pension after claiming gratuity.\n\nContinue?",
    );
    if (!ok) return;

    isBusy = true;
    setLoading(btnClaimGratuity, true, "Claiming...");

    const disb = await getDisbursementContract(false);

    const tx = await disb.claimGPSGratuity();
    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("GPS gratuity claimed ✔", "success");
    await loadDashboard();
  } catch (err) {
    console.error(err);
    toast(extractNiceError(err) || "Gratuity claim failed", "error");
  } finally {
    isBusy = false;
    setLoading(btnClaimGratuity, false);
  }
});

/* ===================== INIT ===================== */
loadDashboard();
