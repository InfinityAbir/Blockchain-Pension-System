require("@nomiclabs/hardhat-ethers");
const fs = require("fs");
const path = require("path");

// Minimal .env reader so testnet credentials live in a gitignored file rather
// than in the shell history. No dotenv dependency required.
function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

// Public-testnet deployment is opt-in and credential-driven, so the default
// local workflow still needs no configuration. Put SEPOLIA_RPC_URL and
// SEPOLIA_PRIVATE_KEY in Hardhat/.env, then:
//   npx hardhat run scripts/deploy.js --network sepolia
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    ...(SEPOLIA_RPC_URL && SEPOLIA_PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [SEPOLIA_PRIVATE_KEY] } }
      : {}),
  },
};
