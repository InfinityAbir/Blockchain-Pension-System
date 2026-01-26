import { requireLogin, logout } from "./auth.js";
import { toast, setLoading } from "./ui.js";
import { uploadToIPFS } from "./ipfs.js";
import {
  getDocumentsContract,
  getRegistryContract,
  getUserState,
  STATUS,
} from "./contracts.js";

const account = requireLogin();

// optional
document.getElementById("btnLogout")?.addEventListener("click", logout);

/* =========================================================
   DOC LISTS (MUST MATCH PensionDocuments.sol enums order)
========================================================= */

// GPS docs (9)
const GPS_DOCS = [
  { id: "nid_front", label: "NID Front Side", docType: 0 },
  { id: "nid_back", label: "NID Back Side", docType: 1 },
  { id: "photo", label: "Passport Photo", docType: 2 },
  { id: "birth", label: "Birth Certificate", docType: 3 },
  { id: "employment", label: "Employment Certificate", docType: 4 },
  { id: "service_record", label: "Service Record", docType: 5 },
  { id: "last_payslip", label: "Last Payslip", docType: 6 },
  { id: "pension_form", label: "Pension Application Form", docType: 7 },
  { id: "bank_proof", label: "Bank Account Proof", docType: 8 },
];

// PRSS docs (9)
const PRSS_DOCS = [
  { id: "nid_front", label: "NID Front Side", docType: 0 },
  { id: "nid_back", label: "NID Back Side", docType: 1 },
  { id: "photo", label: "Passport Photo", docType: 2 },
  { id: "birth", label: "Birth Certificate", docType: 3 },
  { id: "present_address", label: "Present Address Proof", docType: 4 },
  { id: "permanent_address", label: "Permanent Address Proof", docType: 5 },
  {
    id: "bank_proof",
    label: "Bank Account Proof (Cheque/Certificate)",
    docType: 6,
  },
  { id: "nominee_form", label: "Nominee Form", docType: 7 },
  { id: "nominee_nid", label: "Nominee NID", docType: 8 },
];

// Nominee claim docs (4)
const NOMINEE_DOCS = [
  { id: "death_certificate", label: "Death Certificate", docType: 0 },
  { id: "nominee_nid", label: "Nominee NID", docType: 1 },
  { id: "relationship", label: "Relationship Proof", docType: 2 },
  { id: "nominee_bank", label: "Nominee Bank Proof", docType: 3 },
];

/* =========================================================
   STATE
========================================================= */

const files = {}; // selected local files
let isUploading = false;

// current mode
let MODE = "PENSIONER"; // PENSIONER | NOMINEE
let PROGRAM = 1; // 0 GPS, 1 PRSS

let REQUIRED_DOCS = []; // active docs list

// on-chain docs cache
let chainDocs = [];

/* ===================== UI ELEMENTS ===================== */
const docsGrid = document.getElementById("docsGrid");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const btnSubmit = document.getElementById("btnSubmit");
const btnClear = document.getElementById("btnClear");

/* ===================== HELPERS ===================== */
function getDocStatusLabel(statusNum) {
  // DocumentStatus enum:
  // 0 NONE
  // 1 SUBMITTED
  // 2 APPROVED
  // 3 REJECTED
  if (statusNum === 1) return { text: "SUBMITTED", color: "#2563eb" };
  if (statusNum === 2) return { text: "APPROVED", color: "#16a34a" };
  if (statusNum === 3) return { text: "REJECTED", color: "#dc2626" };
  return { text: "MISSING", color: "#f59e0b" };
}

function countReady() {
  let count = 0;

  for (let i = 0; i < REQUIRED_DOCS.length; i++) {
    const doc = REQUIRED_DOCS[i];
    const localSelected = !!files[doc.id];

    const onChain = chainDocs[i];
    const onChainStatus = onChain ? Number(onChain.status) : 0;

    const alreadyOk = onChainStatus === 1 || onChainStatus === 2;

    if (localSelected || alreadyOk) count++;
  }

  return count;
}

function updateProgress() {
  const total = REQUIRED_DOCS.length;
  const ready = countReady();

  if (progressText) progressText.textContent = `${ready}/${total} ready`;

  const percent = total === 0 ? 0 : Math.round((ready / total) * 100);
  if (progressBar) progressBar.style.width = `${percent}%`;
}

function disableInputs(disabled) {
  if (!docsGrid) return;

  docsGrid.querySelectorAll('input[type="file"]').forEach((inp) => {
    inp.disabled = disabled;
  });

  docsGrid.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.disabled = disabled;
  });

  if (btnClear) btnClear.disabled = disabled;
}

/* =========================================================
   DETECT MODE (Pensioner docs OR Nominee claim docs)
========================================================= */
async function detectUserMode() {
  const state = await getUserState(account);

  // nominee user
  if (state.isNominee) {
    MODE = "NOMINEE";
    REQUIRED_DOCS = NOMINEE_DOCS;
    return;
  }

  MODE = "PENSIONER";

  // pensioner must be pending/rejected for doc upload
  const registry = await getRegistryContract(true);

  // getProgram(user) -> 0 GPS, 1 PRSS
  PROGRAM = Number(await registry.getProgram(account));

  REQUIRED_DOCS = PROGRAM === 0 ? GPS_DOCS : PRSS_DOCS;
}

/* =========================================================
   LOAD DOCS FROM CHAIN (per mode)
========================================================= */
async function loadDocsFromChain() {
  try {
    const docs = await getDocumentsContract(true);

    chainDocs = [];

    for (let i = 0; i < REQUIRED_DOCS.length; i++) {
      const doc = REQUIRED_DOCS[i];

      let d;

      if (MODE === "NOMINEE") {
        d = await docs.getNomineeDocument(account, doc.docType);
      } else {
        // pensioner mode
        if (PROGRAM === 0) {
          d = await docs.getGPSDocument(account, doc.docType);
        } else {
          d = await docs.getPRSSDocument(account, doc.docType);
        }
      }

      chainDocs.push(d);
    }
  } catch (err) {
    console.error("Failed to load chain docs:", err);
    chainDocs = new Array(REQUIRED_DOCS.length).fill(null);
  }
}

/* =========================================================
   RENDER
========================================================= */
function renderDocs() {
  if (!docsGrid) return;

  docsGrid.innerHTML = "";

  REQUIRED_DOCS.forEach((doc, i) => {
    const selectedFile = files[doc.id];
    const onChain = chainDocs[i];

    const statusNum = onChain ? Number(onChain.status) : 0;
    const rejectReason = onChain?.rejectReason || "";

    const statusInfo = getDocStatusLabel(statusNum);

    // allow upload if missing OR rejected
    const canUpload = statusNum === 0 || statusNum === 3;

    const col = document.createElement("div");
    col.className = "col-md-6";

    const reasonHtml =
      statusNum === 3 && rejectReason
        ? `<div class="small mt-2" style="color:#b91c1c;"><b>Rejected Reason:</b> ${rejectReason}</div>`
        : "";

    col.innerHTML = `
      <div class="soft-card p-3">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-bold">${doc.label}</div>
            <div class="small text-secondary">${
              MODE === "NOMINEE"
                ? "Nominee claim document"
                : PROGRAM === 0
                  ? "GPS pensioner document"
                  : "PRSS pensioner document"
            }</div>
            ${reasonHtml}
          </div>

          <span class="badge-soft">
            <span class="dot" style="background:${statusInfo.color};"></span>
            ${statusInfo.text}
          </span>
        </div>

        ${
          selectedFile
            ? `
              <div class="mt-3 p-3 rounded-4" style="background:#f1f5f9;border:1px solid #e2e8f0;">
                <div class="small text-secondary">Selected File</div>
                <div class="fw-bold small mt-1" style="word-break:break-all;">${selectedFile.name}</div>

                <div class="d-flex gap-2 mt-3">
                  <button class="btn btn-outline-soft btn-sm" data-remove="${doc.id}">Remove</button>
                  <label class="btn btn-primary-soft btn-sm mb-0" style="cursor:pointer;">
                    Replace
                    <input type="file" class="d-none" data-doc="${doc.id}" />
                  </label>
                </div>
              </div>
            `
            : `
              <label class="mt-3 d-block p-3 rounded-4"
                style="
                  border:1px dashed #cbd5e1;
                  background:${canUpload ? "#f8fafc" : "#f1f5f9"};
                  cursor:${canUpload ? "pointer" : "not-allowed"};
                  opacity:${canUpload ? "1" : "0.65"};
                "
              >
                <div class="fw-semibold">${
                  canUpload ? "Click to choose file" : "Already submitted"
                }</div>
                <div class="small text-secondary">PDF / JPG / PNG (max 10MB)</div>

                <input type="file" class="d-none" data-doc="${doc.id}" ${
                  canUpload ? "" : "disabled"
                } />
              </label>
            `
        }
      </div>
    `;

    docsGrid.appendChild(col);
  });

  // file inputs
  docsGrid.querySelectorAll('input[type="file"]').forEach((inp) => {
    inp.addEventListener("change", (e) => {
      if (isUploading) return;

      const docId = e.target.dataset.doc;
      const file = e.target.files?.[0];
      if (!file) return;

      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast("File too large. Max 10MB allowed.", "error");
        e.target.value = "";
        return;
      }

      files[docId] = file;
      renderDocs();
      updateProgress();
    });
  });

  // remove buttons
  docsGrid.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isUploading) return;

      const id = btn.dataset.remove;
      delete files[id];
      renderDocs();
      updateProgress();
    });
  });
}

/* =========================================================
   CLEAR
========================================================= */
btnClear?.addEventListener("click", () => {
  if (isUploading) return;

  REQUIRED_DOCS.forEach((d) => delete files[d.id]);
  renderDocs();
  updateProgress();
});

/* =========================================================
   SUBMIT (BATCH)
========================================================= */
btnSubmit?.addEventListener("click", async () => {
  if (isUploading) return;

  try {
    isUploading = true;
    disableInputs(true);
    setLoading(btnSubmit, true, "Uploading...");

    const state = await getUserState(account);

    // nominee can upload claim docs only if linked pensioner is deceased (contract checks)
    // pensioner can upload only when Pending or Rejected (contract checks)
    if (MODE === "PENSIONER") {
      if (state.status !== STATUS.PENDING && state.status !== STATUS.REJECTED) {
        toast(
          "You can upload only when status is Pending or Rejected.",
          "warning",
        );
        return;
      }
    }

    const documents = await getDocumentsContract(false);

    const docTypes = [];
    const ipfsHashes = [];

    for (let i = 0; i < REQUIRED_DOCS.length; i++) {
      const doc = REQUIRED_DOCS[i];
      const selectedFile = files[doc.id];

      const onChain = chainDocs[i];
      const statusNum = onChain ? Number(onChain.status) : 0;

      const needsUpload = statusNum === 0 || statusNum === 3;
      if (!needsUpload) continue;

      if (!selectedFile) {
        toast(`Please select: ${doc.label}`, "error");
        return;
      }

      toast(`Uploading to IPFS: ${doc.label}`, "info");
      const cid = await uploadToIPFS(selectedFile);

      docTypes.push(doc.docType);
      ipfsHashes.push(cid);
    }

    if (docTypes.length === 0) {
      toast("No documents needed to upload.", "warning");
      return;
    }

    toast("Submitting all documents in one transaction...", "info");

    let tx;
    if (MODE === "NOMINEE") {
      tx = await documents.submitNomineeClaimDocumentsBatch(
        docTypes,
        ipfsHashes,
      );
    } else {
      tx = await documents.submitPensionerDocumentsBatch(docTypes, ipfsHashes);
    }

    toast("Confirming transaction…", "info");
    await tx.wait();

    toast("Documents submitted successfully ✔", "success");

    // clear local selected files
    REQUIRED_DOCS.forEach((d) => delete files[d.id]);

    await loadDocsFromChain();
    renderDocs();
    updateProgress();
  } catch (err) {
    console.error(err);
    toast(err?.reason || err?.message || "Upload failed", "error");
  } finally {
    isUploading = false;
    disableInputs(false);
    setLoading(btnSubmit, false);
  }
});

/* =========================================================
   INIT
========================================================= */
(async function init() {
  await detectUserMode();
  await loadDocsFromChain();
  renderDocs();
  updateProgress();
})();
