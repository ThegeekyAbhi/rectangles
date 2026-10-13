import type { RandomSource } from "../contract/context.ts";

const UINT32_RANGE = 2 ** 32;
const WARM_UP_ROUNDS = 15;

/** MurmurHash3's 32-bit finaliser: spreads every input bit across the output. */
function mix32(value: number): number {
  let hash = value | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash | 0;
}

/** FNV-1a over UTF-16 code units. */
function hashLabel(label: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < label.length; index++) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * sfc32 (Chris Doty-Humphrey's "Small Fast Counter"): 128 bits of state, 32-bit
 * operations only, so it is fast in JavaScript and identical on every platform.
 */
export class Prng implements RandomSource {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /**
   * @param seed The run seed, a non-negative safe integer.
   * @param streamLabel Names an independent stream of the same seed. Two labels never
   * share draws, so one node's randomness does not depend on what other nodes exist.
   */
  constructor(seed: number, streamLabel = "") {
    this.a = mix32(seed % UINT32_RANGE);
    this.b = mix32(Math.floor(seed / UINT32_RANGE) ^ 0x9e3779b9);
    this.c = mix32(hashLabel(streamLabel) ^ 0x7f4a7c15);
    this.d = 1;
    for (let round = 0; round < WARM_UP_ROUNDS; round++) {
      this.nextUint32();
    }
  }

  nextUint32(): number {
    const sum = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + sum) | 0;
    return sum >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  nextExponential(mean: number): number {
    // 1 - u lies in (0, 1], so the logarithm is always finite.
    return -mean * Math.log(1 - this.nextFloat());
  }
}
