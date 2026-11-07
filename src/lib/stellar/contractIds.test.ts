import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPLIT_CONTRACT_ID } from "./client";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const CONTRACT_ID = /\bC[A-Z2-7]{55}\b/;

// These run separately (Railway, Supabase, CI scripts) and can't share a module.
describe.each([
  ["agent/src/config.ts"],
  ["supabase/functions/zk-fetch-user-data/index.ts"],
])("%s", (path) => {
  it("uses the app's SplitProtocol contract", () => {
    expect(read(path).match(CONTRACT_ID)?.[0]).toBe(SPLIT_CONTRACT_ID);
  });
});

it("check:stellar checks the app's SplitProtocol contract", () => {
  expect(read(".env.example")).toContain(`VITE_SPLIT_CONTRACT_ID=${SPLIT_CONTRACT_ID}`);
});
