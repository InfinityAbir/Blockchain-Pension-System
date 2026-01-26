# 🏦 Blockchain Pension System (Prototype)

A **Blockchain-based Pension Management System** prototype built using **Hardhat + Solidity** for smart contracts and a **Vanilla JavaScript + Bootstrap UI** for the frontend.

This project simulates a realistic pension workflow based on Bangladesh-style pension rules:
- Pensioner registration + document verification
- Admin approval system
- Monthly contribution tracking
- Pension start eligibility checks
- Monthly pension withdrawals
- Nominee death-report + claim + withdrawals
- Batch document upload & batch admin review (reduces MetaMask popups)

---

## 📌 Project Structure

This repository contains **two main folders**:


✅ **Hardhat** handles blockchain + contracts  
✅ **pension-ui** is the web interface for Admin, Pensioner, and Nominee

---

## 🚀 Features

### 👤 Pensioner Features
- Register pensioner with:
  - Scheme selection
  - Monthly contribution tier selection
  - Date of Birth validation (age rules)
  - Nominee wallet + nominee details
- Upload **12 required documents** (stored on IPFS/Pinata)
- **Batch document submission** (only 1 MetaMask popup)
- Monthly contribution system:
  - Enforced monthly lock (30 days)
  - Exact tier payment enforcement
- Start pension only if:
  - Admin approved
  - Age ≥ 60
  - Minimum contribution months completed (scheme-wise)
  - Documents fully approved
- Withdraw pension:
  - Monthly withdrawal option (once per 30 days)
  - **Option A supported:** Lump sum withdrawal disables monthly pension forever *(if implemented in disbursement contract update)*

---

### 👮 Admin Features
- Admin dashboard:
  - Pending applications list
  - All pensioners list
  - Deceased & claims list
  - Death reports list
- Review documents:
  - Approve / Reject each document
  - Reject with reason
  - **Batch approve/reject documents** (1 MetaMask popup)
- Approve or reject pensioner applications
- Verify death report submitted by nominee
- Approve/reject nominee claim with reasons
- Admin event history (logs read from blockchain events)

---

### 🧑‍🤝‍🧑 Nominee Features
- Report pensioner death with Death Certificate CID
- Apply nominee claim with:
  - Nominee NID proof CID
  - Relationship proof CID
- Withdraw pension monthly after:
  - Pensioner is marked deceased
  - Admin approves nominee claim
  - Pension was started
- Nominee withdrawal history tracking via blockchain logs

---

## 🛠️ Technologies Used

### Smart Contracts
- **Solidity**
- **Hardhat**
- **Ethers.js (v6)**

### Frontend
- **HTML / CSS / Bootstrap**
- **Vanilla JavaScript**
- **Ethers.js (v6.13.4)**

### Storage
- **IPFS (Pinata gateway support)**

---

## ⚙️ Requirements

Make sure you have installed:

- **Node.js** (Recommended: v18+)
- **npm**
- **MetaMask extension**
- **VS Code** (recommended)
- **Live Server extension** (recommended)

---

## ✅ How to Run Locally (Full Setup)

### 1️⃣ Clone the Repository
    git clone https://github.com/InfinityAbir/Blockchain-Pension-System.git
    cd Blockchain-Pension-System

## 🔥 Part 1: Run Hardhat (Blockchain + Contracts)

### 2️⃣ Install Hardhat Dependencies
    cd Hardhat
    npm install
### 3️⃣ Start Local Hardhat Blockchain
Open a terminal inside Hardhat/ and run:
    
    npx hardhat node
Keep this terminal running.
It will give you local accounts + private keys for testing.

### 4️⃣ Deploy Contracts to Localhost
Open a new terminal inside Hardhat/ and run:

    npx hardhat run scripts/deploy.js --network localhost

After deploy, you will get contract addresses like:
- Registry
- Documents
- Fund
- Disbursement

### 5️⃣ Update Frontend Contract Addresses
Go to:
    
    pension-ui/js/config.js
Update contract addresses based on your deployment output.
Example format:

    export const CONFIG = {
      chainId: 31337,
    
      REGISTRY_ADDRESS: "0x...",
      DOCUMENTS_ADDRESS: "0x...",
      FUND_ADDRESS: "0x...",
      DISBURSEMENT_ADDRESS: "0x...",
    };
## 🌐 Part 2: Run Frontend UI (pension-ui)

### 6️⃣ Open pension-ui with Live Server
Go back to project root:

    cd ..
    cd pension-ui
Now open the folder in VS Code:
    
    code .

Then:
- Right-click login.html
- Click Open with Live Server
Your UI will run on something like:
    
    http://127.0.0.1:5500/pension-ui/

## 🦊 MetaMask Setup (IMPORTANT)

### 7️⃣ Add Hardhat Local Network in MetaMask
Network settings:
- Network Name: Hardhat Local
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Currency Symbol: ETH

### 8️⃣ Import Test Accounts into MetaMask
From the terminal where npx hardhat node is running, copy any private key and import it into MetaMask.
You can use:
- 1 account as Admin
- 1 account as Pensioner
- 1 account as Nominee
---
## 🧪 How to Use the System (Basic Flow)
### ✅ Pensioner Flow
- Register as pensioner (scheme + tier)
- Upload 12 documents (batch submit)
- Wait for admin approval
- Pay monthly contribution for required months
- Start pension (age must be ≥ 60)
- Withdraw monthly pension OR full withdrawal (depending on option)

### ✅ Admin Flow

- Open admin panel
- Review pending applications
- Batch approve documents
- Approve pensioner
- Verify death reports
- Approve nominee claims

### ✅ Nominee Flow
- Report death with Death Certificate CID
- Apply nominee claim
- After approval, withdraw monthly pension

## 🧾 Document System (12 Required Docs)
Documents required (fixed order):
1. NID Front
2. NID Back
3. Passport Photo
4. Birth Certificate
5. Present Address Proof
6. Permanent Address Proof
7. Bank Account Proof
8. Bank Statement
9. Nominee Form
10. Nominee NID
11. Employment Certificate
12. Income Certificate

---

## 👨‍💻 Author
Abir (InfinityAbir)
