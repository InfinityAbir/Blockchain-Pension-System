export function saveAccount(account) {
  if (!account) return;

  // clean spaces/newlines
  const clean = String(account).trim();

  localStorage.setItem("bp_account", clean);
}

export function getAccount() {
  const acc = localStorage.getItem("bp_account");
  if (!acc) return null;

  return String(acc).trim();
}

export function logout() {
  localStorage.removeItem("bp_account");
  window.location.href = "./login.html";
}

export function requireLogin() {
  const acc = getAccount();
  if (!acc) {
    window.location.href = "./login.html";
    return null;
  }
  return acc;
}

export function shortAddress(addr) {
  if (!addr) return "";
  const a = String(addr).trim();
  return a.slice(0, 6) + "..." + a.slice(-4);
}
