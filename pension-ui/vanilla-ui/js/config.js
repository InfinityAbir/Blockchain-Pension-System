// config.js
// ✅ Central place for all addresses + Pinata keys
// ⚠️ Keep this file inside: vanilla-ui/js/config.js

export const CONFIG = {
  /* ===================== NETWORK ===================== */
  NETWORK_NAME: "Hardhat Localhost",
  CHAIN_ID: 31337,

  /* ===================== CONTRACT ADDRESSES ===================== */
  // ✅ Your deployed localhost addresses (Hardhat default deploy)
  REGISTRY_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  DOCUMENTS_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  FUND_ADDRESS: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  DISBURSEMENT_ADDRESS: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",

  /* ===================== PINATA (IPFS) ===================== */
  // ⚠️ Put your Pinata API keys here
  // Example:
  // PINATA_API_KEY: "xxxxxxxxxxxxxxxxxxxx",
  // PINATA_SECRET_KEY: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

  PINATA_API_KEY: "75b8bdb336cceddf1040",
  PINATA_SECRET_KEY:
    "c969148df39ca2d449b5f6ffa3ec3187bb429f6e7921324e4a36c3e9f0641c3b",

  /* ===================== PINATA SETTINGS ===================== */
  PINATA_GATEWAY: "https://gateway.pinata.cloud/ipfs/",
};
