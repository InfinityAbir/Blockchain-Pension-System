const { ethers } = require("hardhat");

const results = [];
async function timed(label, txPromise) {
  const t0 = Date.now();
  const sent = await txPromise;
  const tx = sent.deployTransaction || sent;
  const rc = await tx.wait();
  const secs = (Date.now() - t0) / 1000;
  results.push({
    label,
    gas: rc.gasUsed.toString(),
    gwei: (Number(rc.effectiveGasPrice) / 1e9).toFixed(3),
    block: rc.blockNumber,
    hash: rc.transactionHash,
    secs: secs.toFixed(1),
  });
  console.log(`  ${label.padEnd(26)} gas ${rc.gasUsed.toString().padStart(8)}  ${secs.toFixed(1)}s  ${rc.transactionHash}`);
  return sent;
}

async function main() {
  const [d] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log("network:", net.name, "chainId", net.chainId);
  console.log("deployer:", d.address);
  console.log("balance :", ethers.utils.formatEther(await d.getBalance()), "ETH\n");

  const R = await ethers.getContractFactory("PensionRegistry");
  const r = await timed("deploy PensionRegistry", R.deploy(ethers.constants.AddressZero));
  await r.deployed();

  const D = await ethers.getContractFactory("PensionDocuments");
  const doc = await timed("deploy PensionDocuments", D.deploy(r.address));
  await doc.deployed();

  const F = await ethers.getContractFactory("PensionFund");
  const f = await timed("deploy PensionFund", F.deploy(r.address));
  await f.deployed();

  const S = await ethers.getContractFactory("PensionDisbursement");
  const s = await timed("deploy PensionDisbursement", S.deploy(r.address, f.address));
  await s.deployed();

  await timed("wire setDocuments", r.setDocuments(doc.address));
  await timed("wire setDisbursement", f.setPensionDisbursement(s.address));
  await timed("wire setDisbursementContract", r.setDisbursementContract(s.address));

  // One representative user-facing transaction on the live network.
  const tier = ethers.utils.parseEther("500").div(300000);
  await timed("registerPensioner", r.registerPensioner(
    1, 0, tier, 0, 0, "", "", 19500101,
    "0x000000000000000000000000000000000000dEaD", "Nominee", "Wife"
  ));

  console.log("\nADDRESSES");
  console.log("  PensionRegistry     ", r.address);
  console.log("  PensionDocuments    ", doc.address);
  console.log("  PensionFund         ", f.address);
  console.log("  PensionDisbursement ", s.address);

  const totalGas = results.reduce((a, x) => a + BigInt(x.gas), 0n);
  const avgGwei = (results.reduce((a, x) => a + parseFloat(x.gwei), 0) / results.length).toFixed(3);
  const avgSecs = (results.reduce((a, x) => a + parseFloat(x.secs), 0) / results.length).toFixed(1);
  console.log("\nSUMMARY");
  console.log("  total gas       :", totalGas.toString());
  console.log("  avg gas price   :", avgGwei, "gwei");
  console.log("  avg confirmation:", avgSecs, "s");
  console.log("  remaining bal   :", ethers.utils.formatEther(await d.getBalance()), "ETH");
  require("fs").writeFileSync("sepolia-results.json", JSON.stringify(results, null, 2));
}
main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
