/**
 * Closed-form results from queueing theory, used only to check the engine.
 * Rates are per second and the returned times are in seconds.
 */

/** Erlang C: the probability that an arrival to an M/M/c queue has to wait. */
export function erlangC(serverCount: number, offeredLoad: number): number {
  // Builds the Erlang B blocking probability iteratively, which stays stable for
  // large server counts, then converts it to Erlang C.
  let erlangB = 1;
  for (let servers = 1; servers <= serverCount; servers++) {
    erlangB = (offeredLoad * erlangB) / (servers + offeredLoad * erlangB);
  }
  const utilisation = offeredLoad / serverCount;
  return erlangB / (1 - utilisation * (1 - erlangB));
}

/** Mean time an arrival waits for a server in an M/M/c queue. */
export function meanWaitSecondsMmc(
  arrivalsPerSecond: number,
  servicesPerSecond: number,
  serverCount: number,
): number {
  const offeredLoad = arrivalsPerSecond / servicesPerSecond;
  return erlangC(serverCount, offeredLoad) / (serverCount * servicesPerSecond - arrivalsPerSecond);
}

/**
 * Probability that an arrival to an M/M/1/K queue is turned away. `systemCapacity`
 * counts the request in service as well as those waiting.
 */
export function blockingProbabilityMm1k(utilisation: number, systemCapacity: number): number {
  return (
    ((1 - utilisation) * utilisation ** systemCapacity) / (1 - utilisation ** (systemCapacity + 1))
  );
}
