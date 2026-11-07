declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array | ArrayBuffer,
      zkeyFile: string | Uint8Array | ArrayBuffer,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    prove(
      zkey: unknown,
      wtns: unknown,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(
      vk: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
  export const plonk: unknown;
  export const wtns: unknown;
  export const zKey: unknown;
}
