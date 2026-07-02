## Proof-of-Vault — Circom + Groth16 + BLS12-381 setup
##
## Prerequisites:
##   npm install -g circom snarkjs
##   npm install circomlib  (in this directory)
##
## Usage:
##   make deps      install circomlib
##   make compile   compile circuit → r1cs + wasm
##   make setup     run trusted setup (phase 1 + 2)
##   make test      generate + verify a sample proof
##   make all       compile + setup + test

CIRCUIT    := circuit
PTAU_SIZE  := 12
PTAU_FILE  := pot$(PTAU_SIZE)_final.ptau
ZKEY_FILE  := $(CIRCUIT).zkey
VK_FILE    := verification_key.json

.PHONY: deps compile setup test all clean

all: deps compile setup test

deps:
	npm install circomlib

compile:
	@echo "→ Compiling with BLS12-381 curve..."
	circom $(CIRCUIT).circom --r1cs --wasm --sym -p bls12381 -o build/
	@echo "✓ r1cs + wasm generated in build/"

setup:
	@echo "→ Phase 1: Powers of Tau (BLS12-381, size=$(PTAU_SIZE))..."
	snarkjs powersoftau new bls12-381 $(PTAU_SIZE) pot$(PTAU_SIZE)_0000.ptau -v
	snarkjs powersoftau contribute pot$(PTAU_SIZE)_0000.ptau pot$(PTAU_SIZE)_0001.ptau \
	  --name="Propulsor hackathon" -e="propulsor zk proof of vault"
	snarkjs powersoftau prepare phase2 pot$(PTAU_SIZE)_0001.ptau $(PTAU_FILE) -v
	@echo "→ Phase 2: Groth16 circuit-specific setup..."
	snarkjs groth16 setup build/$(CIRCUIT).r1cs $(PTAU_FILE) $(ZKEY_FILE)
	@echo "→ Exporting verification key..."
	snarkjs zkey export verificationkey $(ZKEY_FILE) $(VK_FILE)
	@echo "✓ $(VK_FILE) ready — use encode_vk.ts to convert for Soroban"
	@echo "✓ $(ZKEY_FILE) + build/$(CIRCUIT)_js/ needed for browser proof generation"

test:
	@echo "→ Generating witness from sample input..."
	@echo '{"actual_balance":"1000000000","threshold":"500000000"}' > input_test.json
	node build/$(CIRCUIT)_js/generate_witness.js build/$(CIRCUIT)_js/$(CIRCUIT).wasm \
	  input_test.json witness_test.wtns
	snarkjs groth16 prove $(ZKEY_FILE) witness_test.wtns proof_test.json public_test.json
	snarkjs groth16 verify $(VK_FILE) public_test.json proof_test.json
	@echo "✓ Sample proof verified off-chain"

clean:
	rm -rf build/ *.ptau *.zkey *.wtns *_test.json
