import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const database = new PGlite();
const userId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const draft = {
  version: 1,
  publicKey: "GACCOUNT",
  name: "Ana",
  profileType: "jefa_hogar",
  vaultNames: ["Hogar", "Fondo", "Meta"],
  percentages: [60, 30, 10],
};
try {
  await database.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    INSERT INTO auth.users VALUES ('${userId}'), ('${otherId}');`);
  await database.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20260308173717_436206fc-0805-4a6a-a2ce-0330130a1751.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await database.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261107090000_recover_onboarding.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await database.exec(
    `GRANT SELECT, INSERT, UPDATE ON public.users_profile TO authenticated; GRANT SELECT ON public.users_profile TO anon; SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}';`,
  );
  await database.query(
    "SELECT public.save_onboarding_draft($1::uuid, $2::jsonb)",
    [userId, JSON.stringify(draft)],
  );
  const submitted = { ...draft, transaction: { hash, expiresAt: 2000000000 } };
  await database.query(
    "SELECT public.save_onboarding_draft($1::uuid, $2::jsonb)",
    [userId, JSON.stringify(submitted)],
  );
  await assert.rejects(
    database.query("SELECT public.save_onboarding_draft($1::uuid, $2::jsonb)", [
      userId,
      JSON.stringify({
        ...submitted,
        transaction: { ...submitted.transaction, hash: "b".repeat(64) },
      }),
    ]),
    /ONBOARDING_CONFLICT/,
  );
  await assert.rejects(
    database.query("SELECT public.save_onboarding_draft($1::uuid, $2::jsonb)", [
      userId,
      JSON.stringify(draft),
    ]),
    /ONBOARDING_CONFLICT/,
  );
  await assert.rejects(
    database.query("SELECT public.complete_onboarding($1::uuid, $2)", [
      userId,
      "b".repeat(64),
    ]),
    /ONBOARDING_CONFLICT/,
  );
  await database.query("SELECT public.complete_onboarding($1::uuid, $2)", [
    userId,
    hash,
  ]);
  await database.query("SELECT public.complete_onboarding($1::uuid, $2)", [
    userId,
    hash,
  ]);
  const { rows } = await database.query(
    "SELECT name, onboarding_complete, split_contract_tx, onboarding_draft FROM public.users_profile",
  );
  assert.deepEqual(rows, [
    {
      name: "Ana",
      onboarding_complete: true,
      split_contract_tx: hash,
      onboarding_draft: null,
    },
  ]);
  await database.exec(`SET request.jwt.claim.sub = '${otherId}';`);
  assert.equal(
    (await database.query("SELECT * FROM public.users_profile")).rows.length,
    0,
  );
  await assert.rejects(
    database.query("SELECT public.complete_onboarding($1::uuid, $2)", [
      userId,
      hash,
    ]),
    /Authentication required/,
  );
  await database.exec("SET ROLE anon; SET request.jwt.claim.sub = '';");
  await assert.rejects(
    database.query("SELECT public.complete_onboarding($1::uuid, $2)", [
      userId,
      hash,
    ]),
    /permission denied/,
  );
  console.log(
    "Migration passed: owner RLS, private drafts, conflict protection, atomic completion, idempotent retry and anonymous access denied.",
  );
} finally {
  await database.close();
}
