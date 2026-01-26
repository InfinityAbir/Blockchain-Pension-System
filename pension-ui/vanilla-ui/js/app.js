// app.js
import { saveAccount, getAccount, logout } from "./auth.js";
import { connectWallet, getUserState, STATUS } from "./contracts.js";
import { toast, setLoading } from "./ui.js";
import { loadNavbar } from "./navbar.js";

function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function redirectTo(page) {
  window.location.href = `./${page}`;
}

async function routeUser(account) {
  const state = await getUserState(account);

  // Admin routing
  if (state.isAdmin) {
    if (currentPage() !== "admin.html") redirectTo("admin.html");
    return;
  }

  // ✅ Nominee routing (must come BEFORE pensioner register redirect)
  if (state.isNominee) {
    if (currentPage() !== "nominee.html") redirectTo("nominee.html");
    return;
  }

  // Pensioner routing
  if (state.status === STATUS.NOT_REGISTERED) {
    if (currentPage() !== "register.html") redirectTo("register.html");
    return;
  }

  if (state.status === STATUS.REJECTED) {
    if (currentPage() !== "register.html") redirectTo("register.html");
    return;
  }

  if (state.status === STATUS.PENDING) {
    if (currentPage() !== "upload.html") redirectTo("upload.html");
    return;
  }

  if (state.status === STATUS.APPROVED) {
    if (currentPage() !== "dashboard.html") redirectTo("dashboard.html");
    return;
  }

  // fallback
  redirectTo("login.html");
}

async function initNavbarIfExists() {
  try {
    // navbar mount must exist in html
    await loadNavbar();
  } catch (err) {
    console.error("Navbar load failed:", err);
  }
}

async function initApp() {
  // Load navbar if page contains <div id="bpNavbar"></div>
  await initNavbarIfExists();

  const page = currentPage();

  // Login page handles its own connect button
  if (page === "login.html") return;

  // Auto-protect pages (must be logged in)
  const saved = getAccount();
  if (!saved) {
    redirectTo("login.html");
    return;
  }

  // Validate address format
  let account;
  try {
    account = ethers.getAddress(String(saved).trim());
  } catch (e) {
    console.error("Invalid saved account:", saved);
    toast("Invalid wallet saved. Please login again.", "error");
    logout();
    return;
  }

  // Auto-route based on role/status
  try {
    await routeUser(account);
  } catch (err) {
    console.error(err);
    toast(err?.message || "Failed to load user state", "error");
  }
}

/* ===================== OPTIONAL CONNECT BUTTON SUPPORT ===================== */
/*
  If any page has a button with id="btnConnect",
  this will auto-enable wallet connect there too.
*/
async function attachConnectButtonIfExists() {
  const btn = document.getElementById("btnConnect");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      setLoading(btn, true, "Connecting...");

      let account = await connectWallet();
      account = ethers.getAddress(String(account).trim());

      saveAccount(account);
      toast("Wallet connected ✔", "success");

      await routeUser(account);
    } catch (err) {
      console.error(err);
      toast(err?.message || "Failed to connect wallet", "error");
    } finally {
      setLoading(btn, false);
    }
  });
}

initApp();
attachConnectButtonIfExists();
