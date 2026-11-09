#!/bin/bash
# Propulsor — Deploy contracts to Stellar Testnet
# Account "deployer" must already exist and be funded. It becomes the admin
# allowed to upgrade the contracts.
# Run manually after: cargo test (all tests pass)

set -e

ADMIN=$(stellar keys address deployer)
OUT=$(mktemp -d)

echo "Building contracts..."
stellar contract build --out-dir "$OUT"

echo ""
echo "Deploying SplitProtocol..."
SPLIT_ID=$(stellar contract deploy \
  --wasm "$OUT/split_protocol.wasm" \
  --source-account deployer \
  --network testnet \
  -- --admin "$ADMIN")
echo "split_protocol -> $SPLIT_ID"

echo ""
echo "Deploying TimeVault..."
VAULT_ID=$(stellar contract deploy \
  --wasm "$OUT/time_vault.wasm" \
  --source-account deployer \
  --network testnet \
  -- --admin "$ADMIN")
echo "time_vault -> $VAULT_ID"

echo ""
echo "Paste these into your frontend .env:"
echo ""
echo "VITE_SPLIT_CONTRACT_ID=$SPLIT_ID"
echo "VITE_VAULT_CONTRACT_ID=$VAULT_ID"
echo ""

echo "VITE_SPLIT_CONTRACT_ID=$SPLIT_ID" > .env.contracts
echo "VITE_VAULT_CONTRACT_ID=$VAULT_ID" >> .env.contracts
echo "Saved to .env.contracts"
