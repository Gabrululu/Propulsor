#!/bin/bash
# Propulsor — Deploy contracts to Stellar Testnet
# Account "deployer" must already exist and be funded.
# Run manually after: cargo test (all tests pass)

set -e

echo "Building contracts..."
stellar contract build

echo ""
echo "Deploying SplitProtocol..."
SPLIT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/split_protocol.wasm \
  --source-account deployer \
  --network testnet)
echo "split_protocol -> $SPLIT_ID"

echo ""
echo "Deploying TimeVault..."
VAULT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/time_vault.wasm \
  --source-account deployer \
  --network testnet)
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
