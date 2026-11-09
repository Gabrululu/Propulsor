import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSISTENT_SAVING_VERIFIER_CONTRACT_ID,
  SPLIT_CONTRACT_ID,
  VAULT_CONTRACT_ID,
  ZK_VERIFIER_CONTRACT_ID,
} from "./client";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const CONTRACT_ID = /\bC[A-Z2-7]{55}\b/;

// These run separately (Railway, Supabase, GitHub Actions) and can't share a module.
describe.each([
  ["agent/src/config.ts", SPLIT_CONTRACT_ID],
  ["supabase/functions/zk-fetch-user-data/index.ts", SPLIT_CONTRACT_ID],
  ["zk/scripts/verify_onchain_consistent_saving.ts", CONSISTENT_SAVING_VERIFIER_CONTRACT_ID],
])("%s", (path, id) => {
  it("uses the app's contract", () => {
    expect(read(path).match(CONTRACT_ID)?.[0]).toBe(id);
  });
});

it.each([
  ["SPLIT", SPLIT_CONTRACT_ID],
  ["VAULT", VAULT_CONTRACT_ID],
  ["ZK_VERIFIER", ZK_VERIFIER_CONTRACT_ID],
  ["CONSISTENT_SAVING_VERIFIER", CONSISTENT_SAVING_VERIFIER_CONTRACT_ID],
])("check:stellar checks the app's %s contract", (name, id) => {
  expect(read(".env.example")).toContain(`VITE_${name}_CONTRACT_ID=${id}`);
});
