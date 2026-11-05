const { ethers } = require("hardhat");
async function main() {
  const LIMIT = 24576;
  const out = [];
  const R = await ethers.getContractFactory("PensionRegistry");
  const r = await R.deploy(ethers.constants.AddressZero); await r.deployed();
  out.push(["PensionRegistry", (await r.deployTransaction.wait()).gasUsed]);

  const D = await ethers.getContractFactory("PensionDocuments");
  const d = await D.deploy(r.address); await d.deployed();
  out.push(["PensionDocuments", (await d.deployTransaction.wait()).gasUsed]);

  const F = await ethers.getContractFactory("PensionFund");
  const f = await F.deploy(r.address); await f.deployed();
  out.push(["PensionFund", (await f.deployTransaction.wait()).gasUsed]);

  const S = await ethers.getContractFactory("PensionDisbursement");
  const s = await S.deploy(r.address, f.address); await s.deployed();
  out.push(["PensionDisbursement", (await s.deployTransaction.wait()).gasUsed]);

  let total = ethers.BigNumber.from(0);
  console.log("\nDeployment gas (Solidity 0.8.28, optimiser 200, viaIR)");
  console.log("-".repeat(64));
  for (const [n, g] of out) {
    total = total.add(g);
    const eth = Number(g) * 20 / 1e9;
    console.log(n.padEnd(22), String(g).padStart(9), (eth.toFixed(6)+" ETH").padStart(15), ("$"+(eth*2500).toFixed(2)).padStart(9));
  }
  const te = Number(total) * 20 / 1e9;
  console.log("-".repeat(64));
  console.log("TOTAL".padEnd(22), String(total).padStart(9), (te.toFixed(6)+" ETH").padStart(15), ("$"+(te*2500).toFixed(2)).padStart(9));
}
main().catch(e => { console.error(e); process.exit(1); });
