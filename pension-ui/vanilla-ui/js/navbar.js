// navbar.js
import { requireLogin, logout, shortAddress } from "./auth.js";
import { getRegistryContract, getUserState, STATUS } from "./contracts.js";

function navItem(label, href, icon) {
  const current = window.location.pathname.split("/").pop();
  const active = current === href;

  return `
    <a class="bp-link ${active ? "active" : ""}" href="./${href}">
      <span class="bp-icon">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

function divider(title) {
  return `
    <div class="bp-divider">
      <div class="bp-divider-line"></div>
      <div class="bp-divider-title">${title}</div>
    </div>
  `;
}

export async function loadNavbar() {
  const mount = document.getElementById("bpNavbar");
  if (!mount) return;

  // Load navbar.html into the page
  const res = await fetch("./navbar.html");
  const html = await res.text();
  mount.innerHTML = html;

  // Attach logout
  const logoutBtn = document.getElementById("bpLogoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // Get logged account
  const account = requireLogin();
  document.getElementById("bpWalletShort").textContent = shortAddress(account);

  const navLinks = document.getElementById("bpNavLinks");
  const roleText = document.getElementById("bpRoleText");

  try {
    // Get role/status from contract
    const state = await getUserState(account);

    // ===================== ADMIN NAV =====================
    // ===================== ADMIN NAV =====================
    if (state.isAdmin) {
      roleText.textContent = "Admin Panel";

      navLinks.innerHTML = `
    ${divider("Admin")}
    <a class="bp-link" href="#" data-admin-tab="pending">
      <span class="bp-icon">🟡</span>
      <span>Pending Applications</span>
    </a>

    <a class="bp-link" href="#" data-admin-tab="all">
      <span class="bp-icon">📋</span>
      <span>All Pensioners</span>
    </a>

    <a class="bp-link" href="#" data-admin-tab="deathReports">
      <span class="bp-icon">🪦</span>
      <span>Death Reports</span>
    </a>

    <a class="bp-link" href="#" data-admin-tab="deceased">
      <span class="bp-icon">⚫</span>
      <span>Deceased & Claims</span>
    </a>
  `;

      // ✅ make sidebar buttons switch tabs on admin.html
      setTimeout(() => {
        document.querySelectorAll("[data-admin-tab]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();

            const tab = a.dataset.adminTab;

            if (tab === "pending")
              document.getElementById("tabPending")?.click();
            if (tab === "all") document.getElementById("tabAll")?.click();
            if (tab === "deathReports")
              document.getElementById("tabDeathReports")?.click();
            if (tab === "deceased")
              document.getElementById("tabDeceased")?.click();
          });
        });
      }, 200);

      return;
    }

    // ===================== NOMINEE CHECK =====================
    let isNominee = false;
    let linkedPensioner = ethers.ZeroAddress;

    // These help us decide if we show nominee claim menu
    let showNomineeClaimMenu = false;

    try {
      const registry = await getRegistryContract(true);
      linkedPensioner = await registry.nomineeToPensioner(account);

      if (linkedPensioner && linkedPensioner !== ethers.ZeroAddress) {
        isNominee = true;

        // Load linked pensioner data to decide if claim menu should show
        const p = await registry.getPensioner(linkedPensioner);

        const isDeceased = Boolean(p.isDeceased);
        const deathReportStatus = Number(p.deathReportStatus ?? 0); // NONE=0, REPORTED=1, VERIFIED=2, REJECTED=3

        // Show nominee claim menu only if:
        // - pensioner is deceased OR
        // - death report is already reported (nominee can track + apply later)
        showNomineeClaimMenu = isDeceased || deathReportStatus === 1;
      }
    } catch (e) {
      // If mapping doesn't exist or contract mismatch, ignore nominee mode safely
      isNominee = false;
      showNomineeClaimMenu = false;
    }

    // ===================== USER NAV =====================

    // NOT REGISTERED
    if (state.status === STATUS.NOT_REGISTERED) {
      roleText.textContent = isNominee ? "Nominee" : "Not Registered";

      navLinks.innerHTML = `
        ${divider("Get Started")}
        ${navItem("Register", "register.html", "📝")}
        ${navItem("Login", "login.html", "🔐")}

        ${
          showNomineeClaimMenu
            ? `
              ${divider("Nominee")}
              ${navItem("Nominee Claim", "nominee.html", "👤")}
            `
            : ""
        }
      `;
      return;
    }

    // PENDING
    if (state.status === STATUS.PENDING) {
      roleText.textContent = "Pending Verification";

      navLinks.innerHTML = `
        ${divider("Pensioner")}
        ${navItem("Registration", "register.html", "📝")}
        ${navItem("Upload Docs", "upload.html", "📄")}

        ${
          showNomineeClaimMenu
            ? `
              ${divider("Nominee")}
              ${navItem("Nominee Claim", "nominee.html", "👤")}
            `
            : ""
        }
      `;
      return;
    }

    // APPROVED
    if (state.status === STATUS.APPROVED) {
      roleText.textContent = "Approved Pensioner";

      navLinks.innerHTML = `
        ${divider("Pensioner")}
        ${navItem("Dashboard", "dashboard.html", "📊")}
        ${navItem("Upload Docs", "upload.html", "📄")}

        ${
          showNomineeClaimMenu
            ? `
              ${divider("Nominee")}
              ${navItem("Nominee Claim", "nominee.html", "👤")}
            `
            : ""
        }
      `;
      return;
    }

    // REJECTED
    if (state.status === STATUS.REJECTED) {
      roleText.textContent = "Rejected";

      navLinks.innerHTML = `
        ${divider("Retry")}
        ${navItem("Register Again", "register.html", "📝")}

        ${
          showNomineeClaimMenu
            ? `
              ${divider("Nominee")}
              ${navItem("Nominee Claim", "nominee.html", "👤")}
            `
            : ""
        }
      `;
      return;
    }

    // fallback
    roleText.textContent = "User";
    navLinks.innerHTML = `
      ${divider("Menu")}
      ${navItem("Login", "login.html", "🔐")}

      ${
        showNomineeClaimMenu
          ? `
            ${divider("Nominee")}
            ${navItem("Nominee Claim", "nominee.html", "👤")}
          `
          : ""
      }
    `;
  } catch (err) {
    console.error("Navbar load error:", err);

    roleText.textContent = "User";
    navLinks.innerHTML = `
      ${divider("Menu")}
      ${navItem("Login", "login.html", "🔐")}
    `;
  }
}
