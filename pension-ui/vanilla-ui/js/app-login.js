import { connectWallet, getUserState, STATUS } from "./contracts.js";
import { saveAccount } from "./auth.js";
import { toast, setLoading } from "./ui.js";

const btn = document.getElementById("btnConnect");

btn.addEventListener("click", async () => {
  try {
    setLoading(btn, true, "Connecting...");

    let account = await connectWallet();

    // ✅ normalize address (prevents bad checksum forever)
    account = ethers.getAddress(String(account).trim());

    // ✅ save clean address
    saveAccount(account);

    toast("Wallet connected ✔", "success");

    const state = await getUserState(account);

    // Admin routing
    if (state.isAdmin) {
      window.location.href = "./admin.html";
      return;
    }

    // ✅ Nominee routing (must come BEFORE register redirect)
    if (state.isNominee) {
      window.location.href = "./nominee.html";
      return;
    }

    // Pensioner routing
    if (
      state.status === STATUS.NOT_REGISTERED ||
      state.status === STATUS.REJECTED
    ) {
      window.location.href = "./register.html";
      return;
    }

    if (state.status === STATUS.PENDING) {
      window.location.href = "./upload.html";
      return;
    }

    if (state.status === STATUS.APPROVED) {
      window.location.href = "./dashboard.html";
      return;
    }

    // fallback
    window.location.href = "./register.html";
  } catch (err) {
    console.error(err);
    toast(err?.message || "Failed to connect", "error");
  } finally {
    setLoading(btn, false);
  }
});
