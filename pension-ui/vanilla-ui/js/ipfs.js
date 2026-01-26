import axios from "https://cdn.jsdelivr.net/npm/axios@1.6.8/+esm";
import { CONFIG } from "./config.js";

const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export async function uploadToIPFS(file) {
  if (!file) throw new Error("No file selected");

  const PINATA_API_KEY = CONFIG.PINATA_API_KEY;
  const PINATA_SECRET_KEY = CONFIG.PINATA_SECRET_KEY;

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("Pinata API key or secret is missing");
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error("File size exceeds 10 MB limit");
  }

  const formData = new FormData();
  formData.append("file", file);

  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: file.name,
    }),
  );

  const response = await axios.post(PINATA_URL, formData, {
    maxBodyLength: Infinity,
    headers: {
      "Content-Type": "multipart/form-data",
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  const cid = response?.data?.IpfsHash;

  if (!cid || typeof cid !== "string") {
    console.log("Pinata response:", response.data);
    throw new Error("Upload succeeded but CID not found in Pinata response");
  }

  return cid;
}
