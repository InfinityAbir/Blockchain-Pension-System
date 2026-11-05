// Generates a fresh random wallet and writes the private key directly into .env.
// The key is never printed - only the address, which you fund from a faucet.
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const wallet = ethers.Wallet.createRandom();

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^SEPOLIA_PRIVATE_KEY=.*$/m.test(env)) {
  env = env.replace(/^SEPOLIA_PRIVATE_KEY=.*$/m, `SEPOLIA_PRIVATE_KEY=${wallet.privateKey.slice(2)}`);
} else {
  env += `\nSEPOLIA_PRIVATE_KEY=${wallet.privateKey.slice(2)}\n`;
}
if (!/^SEPOLIA_RPC_URL=/m.test(env)) {
  env = `SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com\n` + env;
}
fs.writeFileSync(envPath, env);

console.log("\n  New testnet wallet written to Hardhat/.env (gitignored).");
console.log("  The private key was not printed and is not in your shell history.\n");
console.log("  FUND THIS ADDRESS:\n");
console.log("      " + wallet.address + "\n");
console.log("  Needs ~0.02 Sepolia ETH (deployment costs 0.014 at current gas).");
console.log("  Faucet: https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n");
