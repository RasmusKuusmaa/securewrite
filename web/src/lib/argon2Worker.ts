import { argon2id } from "hash-wasm";

// Runs Argon2id off the main thread. hash-wasm's WASM call blocks whatever
// thread invokes it (a Promise resolving doesn't mean the work was async) -
// without this worker, every unlock attempt would freeze the whole tab
// (unresponsive clicks/typing/render) for the several seconds the 64 MiB
// cost parameter takes to compute.
export interface Argon2Request {
  password: Uint8Array;
  salt: Uint8Array;
  parallelism: number;
  iterations: number;
  memorySize: number;
  hashLength: number;
}

self.onmessage = async (e: MessageEvent<Argon2Request>) => {
  try {
    const { password, salt, parallelism, iterations, memorySize, hashLength } = e.data;
    const hash = await argon2id({
      password,
      salt,
      parallelism,
      iterations,
      memorySize,
      hashLength,
      outputType: "binary",
    });
    (self as unknown as Worker).postMessage({ result: hash }, [hash.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
