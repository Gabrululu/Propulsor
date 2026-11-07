import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";

const facilitator = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "stellar:testnet",
          extra: { areFeesSponsored: false },
        },
      ],
      extensions: [],
      signers: {},
    }),
  );
});
facilitator.listen(0, "127.0.0.1");
await once(facilitator, "listening");
const reserved = createServer();
reserved.listen(0, "127.0.0.1");
await once(reserved, "listening");
const port = reserved.address().port;
await new Promise((resolve) => reserved.close(resolve));
const child = spawn(process.execPath, ["dist/server.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    SERVER_STELLAR_SECRET: Keypair.random().secret(),
    INTERNAL_API_KEY: "local-test-only",
    FACILITATOR_URL: `http://127.0.0.1:${facilitator.address().port}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Agent exited: ${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const result = await response.json();
      healthy =
        response.ok && result.ok && result.network === "stellar:testnet";
      if (healthy) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(healthy, "Agent health check failed");
  const unauthorized = await fetch(`http://127.0.0.1:${port}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);
  const invalid = await fetch(`http://127.0.0.1:${port}/split`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer local-test-only",
    },
    body: "{}",
  });
  assert.equal(invalid.status, 400);
  const payment = await fetch(`http://127.0.0.1:${port}/execute-split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(payment.status, 402);
  assert(
    payment.headers.get("payment-required"),
    "x402 payment requirements missing",
  );
  console.log(
    "Agent smoke passed: health, bearer authorization, input validation, x402 payment challenge. No on-chain transaction sent.",
  );
} finally {
  child.kill();
  await new Promise((resolve) => facilitator.close(resolve));
}
