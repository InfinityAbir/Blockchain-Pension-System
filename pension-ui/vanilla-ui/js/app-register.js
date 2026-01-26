import { requireLogin, logout } from "./auth.js";
import { toast, setLoading } from "./ui.js";
import { getRegistryContract, getUserState, STATUS } from "./contracts.js";

requireLogin();

// ✅ FIX: register.html doesn't have btnLogout, so don't crash
document.getElementById("btnLogout")?.addEventListener("click", logout);

/* ===================== CONFIG ===================== */
const BDT_PER_ETH = 300000n;

// PensionProgram enum in contract:
// 0 = GPS
// 1 = PRSS
const PROGRAM = {
  GPS: 0,
  PRSS: 1,
};

/*
  SchemeType enum in contract:
  0 = DPS
  1 = RetirementFund
  2 = ProvidentFund
  3 = InsurancePension
*/
const SCHEME_PLANS = {
  0: [
    {
      id: "dps_500",
      name: "DPS Starter",
      bdt: 500,
      pension: 8000,
      tag: "Starter",
    },
    {
      id: "dps_1000",
      name: "DPS Basic",
      bdt: 1000,
      pension: 12000,
      tag: "Affordable",
    },
    {
      id: "dps_2000",
      name: "DPS Plus",
      bdt: 2000,
      pension: 20000,
      tag: "Growth",
    },
  ],
  1: [
    {
      id: "rf_1000",
      name: "Retirement Silver",
      bdt: 1000,
      pension: 15000,
      tag: "Stable",
    },
    {
      id: "rf_2000",
      name: "Retirement Gold",
      bdt: 2000,
      pension: 25000,
      tag: "Popular",
    },
    {
      id: "rf_3000",
      name: "Retirement Platinum",
      bdt: 3000,
      pension: 35000,
      tag: "Best Value",
    },
  ],
  2: [
    {
      id: "pf_2000",
      name: "Provident Silver",
      bdt: 2000,
      pension: 28000,
      tag: "Secure",
    },
    {
      id: "pf_3000",
      name: "Provident Gold",
      bdt: 3000,
      pension: 38000,
      tag: "Strong",
    },
    {
      id: "pf_5000",
      name: "Provident Elite",
      bdt: 5000,
      pension: 60000,
      tag: "Premium",
    },
  ],
  3: [
    {
      id: "ip_3000",
      name: "Insurance Gold",
      bdt: 3000,
      pension: 42000,
      tag: "Premium",
    },
    {
      id: "ip_5000",
      name: "Insurance Platinum",
      bdt: 5000,
      pension: 65000,
      tag: "Elite",
    },
    {
      id: "ip_10000",
      name: "Insurance Ultra",
      bdt: 10000,
      pension: 120000,
      tag: "Max",
    },
  ],
};

/* ===================== HELPERS ===================== */
function bdtToWei(bdtAmount) {
  const bdt = BigInt(bdtAmount);
  return (bdt * 10n ** 18n) / BDT_PER_ETH;
}

function formatEthFromWei(wei) {
  const eth = ethers.formatEther(wei);
  const num = Number(eth);

  if (!isFinite(num)) return eth;
  if (num === 0) return "0";
  if (num < 0.000001) return num.toExponential(2);

  return num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function schemeName(code) {
  const n = Number(code);
  if (n === 0) return "DPS";
  if (n === 1) return "Retirement Fund";
  if (n === 2) return "Provident Fund";
  if (n === 3) return "Insurance Pension";
  return "Unknown";
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

/* ===================== DOB FIX (ALLOW TYPING + AUTO-FIX) ===================== */
/**
 * We accept multiple formats and normalize to YYYY-MM-DD.
 * Supported typed formats:
 *  - YYYY-MM-DD
 *  - DD/MM/YYYY
 *  - DD-MM-YYYY
 *  - YYYY/MM/DD
 *  - YYYY.MM.DD
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function isValidCalendarDate(yyyy, mm, dd) {
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd))
    return false;

  if (yyyy < 1900 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  const test = new Date(Date.UTC(yyyy, mm - 1, dd));
  return (
    test.getUTCFullYear() === yyyy &&
    test.getUTCMonth() === mm - 1 &&
    test.getUTCDate() === dd
  );
}

function parseDOBString(rawInput) {
  if (!rawInput) return null;

  const raw = String(rawInput).trim();
  if (!raw) return null;

  // Case 1: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-").map(Number);
    if (!isValidCalendarDate(yyyy, mm, dd)) return null;
    return { yyyy, mm, dd };
  }

  // Replace separators with one type for easier matching
  const cleaned = raw.replace(/[.\s]/g, "/").replace(/-/g, "/");

  // Case 2: DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
    const [dd, mm, yyyy] = cleaned.split("/").map(Number);
    if (!isValidCalendarDate(yyyy, mm, dd)) return null;
    return { yyyy, mm, dd };
  }

  // Case 3: YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(cleaned)) {
    const [yyyy, mm, dd] = cleaned.split("/").map(Number);
    if (!isValidCalendarDate(yyyy, mm, dd)) return null;
    return { yyyy, mm, dd };
  }

  return null;
}

function normalizeDOBToISO(rawInput) {
  const parsed = parseDOBString(rawInput);
  if (!parsed) return "";

  const { yyyy, mm, dd } = parsed;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

/**
 * NEW: Convert DOB input to YYYYMMDD (uint)
 * Example: 1960-01-01 -> 19600101
 */
function dobInputToYYYYMMDD(dobEl) {
  if (!dobEl) return 0;

  // Normalize typed value
  const iso = normalizeDOBToISO(dobEl.value);
  if (!iso) return 0;

  // set input value to valid ISO
  dobEl.value = iso;

  const [yyyy, mm, dd] = iso.split("-").map(Number);
  if (!isValidCalendarDate(yyyy, mm, dd)) return 0;

  return Number(`${yyyy}${pad2(mm)}${pad2(dd)}`);
}

/**
 * UX upgrade:
 * When user finishes typing, auto-convert to YYYY-MM-DD
 */
function attachDOBAutoFix() {
  const dobEl = document.getElementById("dob");
  if (!dobEl) return;

  dobEl.addEventListener("blur", () => {
    const iso = normalizeDOBToISO(dobEl.value);
    if (iso) dobEl.value = iso;
  });

  dobEl.addEventListener("change", () => {
    const iso = normalizeDOBToISO(dobEl.value);
    if (iso) dobEl.value = iso;
  });

  // Calendar button support (if exists)
  const btnDobPicker = document.getElementById("btnDobPicker");
  const dobPicker = document.getElementById("dobPicker");

  btnDobPicker?.addEventListener("click", () => {
    dobPicker?.showPicker?.();
    dobPicker?.click();
  });

  dobPicker?.addEventListener("change", () => {
    if (dobPicker.value) {
      dobEl.value = dobPicker.value; // already YYYY-MM-DD
      const iso = normalizeDOBToISO(dobEl.value);
      if (iso) dobEl.value = iso;
    }
  });
}

attachDOBAutoFix();

/* ===================== UI ELEMENTS ===================== */
const programEl = document.getElementById("program");
const schemeEl = document.getElementById("scheme");
const plansRoot = document.getElementById("plans");

const gpsBox = document.getElementById("gpsFields");
const prssBox = document.getElementById("prssFields");

/* ===================== PLAN UI ===================== */
let selectedPlanId = "";
let currentPlans = [];

function renderPlans(selectedId) {
  if (!plansRoot) return;
  plansRoot.innerHTML = "";

  currentPlans.forEach((p) => {
    const active = p.id === selectedId;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn text-start soft-card p-3 ${
      active ? "border border-primary" : ""
    }`;
    btn.style.borderRadius = "20px";

    const wei = bdtToWei(p.bdt);
    const eth = formatEthFromWei(wei);

    btn.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <div class="fw-bold">${p.name}</div>
          <div class="small text-secondary">${p.tag}</div>
        </div>
        <span class="badge-soft">
          <span class="dot" style="background:${active ? "#2563eb" : "#94a3b8"}"></span>
          ${p.bdt.toLocaleString()} BDT / month
        </span>
      </div>

      <div class="row g-2 mt-2">
        <div class="col-6">
          <div class="p-2 rounded-4" style="background:#f8fafc;border:1px solid #e2e8f0;">
            <div class="small text-secondary">Contribution</div>
            <div class="fw-bold">${p.bdt.toLocaleString()} BDT</div>
            <div class="small text-secondary">(~${eth} ETH)</div>
          </div>
        </div>
        <div class="col-6">
          <div class="p-2 rounded-4" style="background:#f8fafc;border:1px solid #e2e8f0;">
            <div class="small text-secondary">Expected Pension</div>
            <div class="fw-bold">${p.pension.toLocaleString()} BDT</div>
          </div>
        </div>
      </div>
    `;

    btn.addEventListener("click", () => {
      selectedPlanId = p.id;
      updateSelected();
    });

    plansRoot.appendChild(btn);
  });
}

function updateSelected() {
  const p = currentPlans.find((x) => x.id === selectedPlanId);
  if (!p) return;

  const textEl = document.getElementById("selectedPlanText");
  const metaEl = document.getElementById("selectedPlanMeta");

  if (textEl) textEl.textContent = p.name;

  const wei = bdtToWei(p.bdt);
  const eth = formatEthFromWei(wei);

  if (metaEl) {
    metaEl.textContent = `${p.bdt.toLocaleString()} BDT (~${eth} ETH)`;
  }

  renderPlans(selectedPlanId);
}

function loadSchemePlans() {
  const schemeCode = Number(schemeEl?.value ?? 0);

  currentPlans = SCHEME_PLANS[schemeCode] || SCHEME_PLANS[0];
  selectedPlanId = currentPlans?.[0]?.id || "";

  const schemeTitleEl = document.getElementById("schemeTitle");
  if (schemeTitleEl) {
    schemeTitleEl.textContent = `Scheme: ${schemeName(schemeCode)}`;
  }

  updateSelected();
}

/* ===================== PROGRAM SWITCH ===================== */
function updateProgramUI() {
  const prog = Number(programEl?.value ?? PROGRAM.PRSS);

  const isGPS = prog === PROGRAM.GPS;
  const isPRSS = prog === PROGRAM.PRSS;

  show(gpsBox, isGPS);
  show(prssBox, isPRSS);

  show(plansRoot, isPRSS);
  show(document.getElementById("planSection"), isPRSS);

  if (isPRSS) loadSchemePlans();
}

programEl?.addEventListener("change", updateProgramUI);
schemeEl?.addEventListener("change", loadSchemePlans);

// initial UI load
updateProgramUI();

/* ===================== REGISTER ===================== */
const btnRegister = document.getElementById("btnRegister");

btnRegister?.addEventListener("click", async () => {
  try {
    setLoading(btnRegister, true, "Submitting...");

    const account = requireLogin();
    const state = await getUserState(account);

    if (state.status === STATUS.PENDING || state.status === STATUS.APPROVED) {
      toast("You already registered. Redirecting...", "warning");
      window.location.href = "./upload.html";
      return;
    }

    const registry = await getRegistryContract(false);
    const program = Number(programEl?.value ?? PROGRAM.PRSS);

    // ✅ DOB now stored as YYYYMMDD
    const dobEl = document.getElementById("dob");
    const dobYMD = dobInputToYYYYMMDD(dobEl);

    console.log("DOB input value:", dobEl?.value);
    console.log("DOB YYYYMMDD:", dobYMD);

    if (!dobYMD) {
      toast(
        "Invalid Date of Birth. Use YYYY-MM-DD or DD/MM/YYYY (example: 1960-01-01)",
        "error",
      );
      return;
    }

    // Contract rule: 19000101 - 21001231
    if (dobYMD < 19000101 || dobYMD > 21001231) {
      toast("Date of birth must be between year 1900 and 2100.", "error");
      return;
    }

    // Minimum age 18 (year based)
    const birthYear = Math.floor(dobYMD / 10000);
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;

    if (age < 18) {
      toast("You must be at least 18 years old to register.", "error");
      return;
    }

    // nominee info (required for both)
    const nomineeWalletInput = document
      .getElementById("nomineeWallet")
      .value.trim();
    const nomineeName = document.getElementById("nomineeName").value.trim();
    const nomineeRelation = document
      .getElementById("nomineeRelation")
      .value.trim();

    if (!nomineeWalletInput)
      return toast("Nominee wallet address is required", "error");

    let nomineeWallet;
    try {
      nomineeWallet = ethers.getAddress(nomineeWalletInput);
    } catch {
      return toast("Invalid nominee wallet address", "error");
    }

    if (!nomineeName) return toast("Nominee name is required", "error");
    if (!nomineeRelation) return toast("Nominee relation is required", "error");

    const pensionerWallet = ethers.getAddress(account);
    if (nomineeWallet === pensionerWallet) {
      return toast("Nominee cannot be the same as pensioner wallet", "error");
    }

    // ===================== PRSS VALUES =====================
    let scheme = 0;
    let monthlyContributionWei = 0n;

    // ===================== GPS VALUES =====================
    let basicSalaryBDT = 0;
    let serviceYears = 0;
    let employeeId = "";
    let designation = "";

    if (program === PROGRAM.PRSS) {
      scheme = Number(schemeEl?.value ?? 0);

      const plan = currentPlans.find((x) => x.id === selectedPlanId);
      if (!plan) {
        return toast("Please select a monthly contribution plan.", "error");
      }

      monthlyContributionWei = bdtToWei(plan.bdt);
    } else {
      basicSalaryBDT = Number(
        document.getElementById("basicSalaryBDT")?.value || 0,
      );
      serviceYears = Number(
        document.getElementById("serviceYears")?.value || 0,
      );
      employeeId = String(
        document.getElementById("employeeId")?.value || "",
      ).trim();
      designation = String(
        document.getElementById("designation")?.value || "",
      ).trim();

      if (!basicSalaryBDT || basicSalaryBDT <= 0) {
        return toast("Basic salary (BDT) is required", "error");
      }
      if (!serviceYears || serviceYears < 10) {
        return toast("Service years must be at least 10", "error");
      }
      if (!employeeId) return toast("Employee ID is required", "error");
      if (!designation) return toast("Designation is required", "error");
    }

    // ✅ CONTRACT CALL (DOB is now dobYMD)
    const tx = await registry.registerPensioner(
      program,
      scheme,
      monthlyContributionWei,
      basicSalaryBDT,
      serviceYears,
      employeeId,
      designation,
      dobYMD,
      nomineeWallet,
      nomineeName,
      nomineeRelation,
    );

    await tx.wait();

    toast("Registration successful ✔", "success");
    window.location.href = "./upload.html";
  } catch (err) {
    console.error(err);
    toast(
      err?.reason || err?.shortMessage || err?.message || "Registration failed",
      "error",
    );
  } finally {
    setLoading(btnRegister, false);
  }
});
