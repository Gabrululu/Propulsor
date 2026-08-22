declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array | ArrayBuffer,
      zkeyFile: string | Uint8Array | ArrayBuffer
    ): Promise<{ proof: any; publicSignals: string[] }>;
    prove(zkey: unknown, wtns: unknown): Promise<{ proof: any; publicSignals: string[] }>;
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
  export const plonk: any;
  export const wtns: any;
  export const zKey: any;
}
