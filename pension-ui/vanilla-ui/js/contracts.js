// contracts.js
import { CONFIG } from "./config.js";

/* -------------------- ABI Loaders -------------------- */
async function loadABIFromPath(path) {
  const res = await fetch(path);
  if (!res.ok)
    throw new Error(`Failed to load ABI: ${path} (HTTP ${res.status})`);
  return res.json();
}

export async function loadABI(contractName) {
  if (!contractName) throw new Error("Contract name is required");
  return loadABIFromPath(`./abi/${contractName}.json`);
}

/* -------------------- Address Cleaner -------------------- */
export function cleanAddress(addr, label = "address") {
  if (!addr) throw new Error(`${label} is missing in config.js`);

  let cleaned = String(addr).trim();
  cleaned = cleaned.replace(/^["']+|["']+$/g, ""); // remove quotes
  cleaned = cleaned.replace(/[^0-9a-fA-Fx]/g, ""); // remove weird chars

  if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) {
    throw new Error(`${label} is invalid: "${addr}" -> cleaned: "${cleaned}"`);
  }

  return ethers.getAddress(cleaned);
}

/* -------------------- Addresses Export -------------------- */
export const ADDRESSES = {
  REGISTRY: cleanAddress(CONFIG.REGISTRY_ADDRESS, "REGISTRY_ADDRESS"),
  DOCUMENTS: cleanAddress(CONFIG.DOCUMENTS_ADDRESS, "DOCUMENTS_ADDRESS"),
  FUND: cleanAddress(CONFIG.FUND_ADDRESS, "FUND_ADDRESS"),
  DISBURSEMENT: cleanAddress(
    CONFIG.DISBURSEMENT_ADDRESS,
    "DISBURSEMENT_ADDRESS",
  ),
};

/* -------------------- Provider / Signer -------------------- */
export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const provider = await getProvider();
  return provider.getSigner();
}

export async function connectWallet() {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return signer.getAddress();
}

export async function getAccount() {
  const signer = await getSigner();
  return signer.getAddress();
}

/* -------------------- Contract Factories -------------------- */
async function makeContract(address, abiName, readOnly = true) {
  const abiJson = await loadABI(abiName);
  const provider = await getProvider();

  if (readOnly) {
    return new ethers.Contract(address, abiJson.abi, provider);
  }

  const signer = await provider.getSigner();
  return new ethers.Contract(address, abiJson.abi, signer);
}

export async function getRegistryContract(readOnly = true) {
  return makeContract(ADDRESSES.REGISTRY, "PensionRegistry", readOnly);
}

export async function getDocumentsContract(readOnly = true) {
  return makeContract(ADDRESSES.DOCUMENTS, "PensionDocuments", readOnly);
}

export async function getFundContract(readOnly = true) {
  return makeContract(ADDRESSES.FUND, "PensionFund", readOnly);
}

export async function getDisbursementContract(readOnly = true) {
  return makeContract(ADDRESSES.DISBURSEMENT, "PensionDisbursement", readOnly);
}

/* -------------------- Status Helpers -------------------- */
export const STATUS = {
  NOT_REGISTERED: 0,
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
};

/* -------------------- Account Status Helpers -------------------- */
/*
AccountStatus (from PensionRegistry)
0 = ACTIVE
1 = CLOSURE_REQUESTED
2 = CLOSED
*/
export const ACCOUNT_STATUS = {
  ACTIVE: 0,
  CLOSURE_REQUESTED: 1,
  CLOSED: 2,
};

export function accountStatusText(v) {
  const n = Number(v);
  if (n === ACCOUNT_STATUS.ACTIVE) return "Active";
  if (n === ACCOUNT_STATUS.CLOSURE_REQUESTED) return "Closure Requested";
  if (n === ACCOUNT_STATUS.CLOSED) return "Closed";
  return `Unknown (${n})`;
}

export async function getAccountStatus(address) {
  const registry = await getRegistryContract(true);
  const user = cleanAddress(address, "USER_ADDRESS");

  try {
    // new registry version
    const st = await registry.getAccountStatus(user);
    return Number(st);
  } catch (e) {
    // fallback for older registry (if ABI mismatch)
    console.warn("getAccountStatus not available in registry ABI yet:", e);
    return ACCOUNT_STATUS.ACTIVE;
  }
}

/* -------------------- User State Helper -------------------- */
export async function getUserState(address) {
  const registry = await getRegistryContract(true);
  const user = cleanAddress(address, "USER_ADDRESS");

  const isAdmin = await registry.isAdmin(user);
  const st = Number(await registry.getStatus(user));

  // ✅ account status (Active / Closure Requested / Closed)
  let accountStatus = ACCOUNT_STATUS.ACTIVE;
  try {
    accountStatus = Number(await registry.getAccountStatus(user));
  } catch (e) {
    accountStatus = ACCOUNT_STATUS.ACTIVE;
  }

  // ✅ nominee detection
  let isNominee = false;
  let nomineePensioner = ethers.ZeroAddress;

  try {
    isNominee = await registry.isNominee(user);
    if (isNominee) {
      nomineePensioner = await registry.nomineeToPensioner(user);
    }
  } catch (e) {
    // if ABI mismatch / older contract, ignore safely
    isNominee = false;
    nomineePensioner = ethers.ZeroAddress;
  }

  let rejectionReason = "";
  if (st === STATUS.REJECTED) {
    const p = await registry.getPensioner(user);
    rejectionReason = p?.rejectionReason ?? p?.[7] ?? "";
  }

  return {
    isAdmin,
    status: st,
    rejectionReason,

    // ✅ new nominee fields
    isNominee,
    nomineePensioner,

    // ✅ new account status fields
    accountStatus,
    accountStatusText: accountStatusText(accountStatus),
  };
}

/* -------------------- Debug Helper (VERY USEFUL) -------------------- */
export async function debugContracts() {
  const provider = await getProvider();

  async function codeAt(label, addr) {
    const code = await provider.getCode(addr);
    console.log(`${label}:`, addr, "codeLen:", code.length);
    return code;
  }

  await codeAt("REGISTRY", ADDRESSES.REGISTRY);
  await codeAt("DOCUMENTS", ADDRESSES.DOCUMENTS);
  await codeAt("FUND", ADDRESSES.FUND);
  await codeAt("DISBURSEMENT", ADDRESSES.DISBURSEMENT);
}
