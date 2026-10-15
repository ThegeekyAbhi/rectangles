import type { RandomSource } from "./context.ts";

/** Draws a key from 0 to `keyCount - 1`. */
export type KeySampler = (random: RandomSource) => number;

/** Below this, a series expansion replaces `log1p(x) / x` and `expm1(x) / x`, which lose precision near 0. */
const SERIES_THRESHOLD = 1e-8;

/** `log1p(x) / x`, continuous at 0. */
function log1pOverX(x: number): number {
  return Math.abs(x) > SERIES_THRESHOLD ? Math.log1p(x) / x : 1 - x * (0.5 - x * (1 / 3 - 0.25 * x));
}

/** `expm1(x) / x`, continuous at 0. */
function expm1OverX(x: number): number {
  return Math.abs(x) > SERIES_THRESHOLD ? Math.expm1(x) / x : 1 + x * 0.5 * (1 + (x / 3) * (1 + 0.25 * x));
}

/**
 * A sampler for keys whose popularity follows Zipf's law: the key ranked `k` (from 1) is
 * drawn with probability proportional to `1 / k^skew`. Skew 0 is uniform; around 1 is the
 * classic "a few hot keys" shape of real traffic.
 *
 * Uses rejection-inversion (Hörmann and Derflinger, 1996), the method behind Apache
 * Commons RNG's `RejectionInversionZipfSampler`: constant time per draw and no table, so
 * millions of keys cost no memory. Key 0 is the most popular.
 */
export function createZipfSampler(keyCount: number, skew: number): KeySampler {
  if (keyCount <= 1) {
    return () => 0;
  }
  if (skew === 0) {
    return (random) => Math.floor(random.nextFloat() * keyCount);
  }
  const oneMinusSkew = 1 - skew;
  const density = (x: number) => Math.exp(-skew * Math.log(x));
  const integral = (x: number) => {
    const logX = Math.log(x);
    return expm1OverX(oneMinusSkew * logX) * logX;
  };
  const inverseIntegral = (x: number) => Math.exp(log1pOverX(Math.max(-1, x * oneMinusSkew)) * x);

  const integralAtFirst = integral(1.5) - 1;
  const integralAtLast = integral(keyCount + 0.5);
  const acceptWithin = 2 - inverseIntegral(integral(2.5) - density(2));

  return (random) => {
    for (;;) {
      const u = integralAtLast + random.nextFloat() * (integralAtFirst - integralAtLast);
      const x = inverseIntegral(u);
      const rank = Math.min(keyCount, Math.max(1, Math.round(x)));
      if (rank - x <= acceptWithin || u >= integral(rank + 0.5) - density(rank)) {
        return rank - 1;
      }
    }
  };
}
