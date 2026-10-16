# Rectangles — Realism and Scale

**Status:** Proposed · **Last updated:** 2026-10-17 · Follows on from
[simulation-algorithm.md](simulation-algorithm.md)

`simulation-algorithm.md` explains how the engine simulates and why next-event discrete-event
simulation (DES) is the right core. This document asks the next question: **what stops the
engine from behaving like a real system**, and **how do we reach a million requests per second**
without giving up "every number is explainable".

File references are relative to `packages/engine/src/` and were checked on the date above.

## 1. Short answer

- **The algorithm is fine. The model is the weakness.** Every component hand-rolls its own
  private capacity: "slots", "connections", "cores", "rows in memory". The engine has no shared
  idea of **CPU, RAM, disk and network**, so they never compete. Every real bottleneck is one of
  those four, or waiting on something (a lock, the network, another service).
- **The next planned component would show nothing.** Connections cost nothing today, so a
  connection pooler (PgBouncer) would not help any design. That is W1, the first thing to fix.
- **Fix: resources as kernel-owned building blocks** (§3). Components use CPU, memory, disk and
  link primitives. The kernel queues, accounts and attributes them in one place.
- **Scale: a three-tier engine** (§6). Exact DES stays the reference. A new **fluid + tagged
  request** tier handles any traffic rate. It rests on proven results: fluid limits of
  many-server queues are what exact simulation converges to at high load. Before we commit to
  it, a spike (§7) decides go or no-go.
- **Research, second pass (§9):** eleven techniques worth taking, led by an analytic fast path, steady-state fast-forward and a speed-up map, plus the metrics they add.
- **Trust: the engine says when it might be wrong** (§4). It shows confidence bands, which
  defaults were assumed, which fields matter most, and where its own tiers disagree.

## 2. Weaknesses, worst first

| # | Weakness | Where | Why it matters |
| --- | --- | --- | --- |
| W1 | **Connections are free.** Going past `cpuCores` only adds a wait in `coreQueue`. There is no memory per connection, no cost to open one, and no slowdown from many | `components/database/behaviour.ts` `requestCore` | A real Postgres backend uses about 5–10 MB of RAM and a fork plus auth to open, and throughput *falls* past the core count. PgBouncer exists to fix exactly this, and would show no effect |
| W2 | **Service time ignores load.** Same mean at 10% and 99% busy | `api-server/behaviour.ts` `startService`, `database/behaviour.ts` `startExecution` | It is optimistic near saturation, the regime users come to study. There is no retrograde throughput (Universal Scalability Law) |
| W3 | **RAM is not bytes.** The buffer cache counts rows. Nothing else holds memory | `database/buffer-cache.ts` | shared_buffers, connections × per-backend memory, work_mem and queue backlog never compete. No OOM, no swap |
| W4 | **Disk is an infinitely parallel fixed delay** | `database/behaviour.ts` `TIMER_DISK_READ_DONE` | No IOPS or bandwidth limit and no queue. No WAL fsync or group commit. A miss storm costs nothing extra |
| W5 | **Links are instant and have no bandwidth** (K3) | `kernel/call-router.ts` `send`, `reply` | No payload sizes or NIC limits. Rules out CDN, regions, "chatty I/O" |
| W6 | **The workload is too uniform** | `components/client/` | Open-loop Poisson only, with no closed-loop users and no burstiness. Exponential or constant service times, no heavy tails. One key and one read/write flag, no query classes or sizes. Retries without jitter or budget |
| W7 | **Instances are idealised** | `api-server/definition.ts` `notModeled` | All instances share one queue (M/M/c), which is better than per-instance queues behind an LB. No faults (K4): no crashes, GC pauses or slow nodes |
| W8 | **Call lifetime defect** (K5) | `kernel/call-pool.ts` `release` | A record goes back to the pool while children still name it as `parent`. It breaks the first time a middle component answers early: a pooler timeout, a circuit breaker, a hedged request |
| W9 | **Results look certain** | `metrics/` | One seed, one number. No confidence interval, no warm-up removal (the cache starts cold), no mark on assumed defaults. Percentiles keep every sample, so memory grows with traffic |
| W10 | **Numbers cannot explain themselves** | `apps/web/src/modules/metrics/lib/capacity-state.ts` | Nothing records why a request was slow (queue, CPU, disk, lock, net) or what holds a resource. The PRD promises "every number is explainable" |

## 3. First principles: requests are demand vectors, components are resources

A request asks each component it touches for a **demand vector**:

| Resource | Demand | Units |
| --- | --- | --- |
| CPU | Work to execute | µs of one core |
| Memory | Bytes held, for how long | bytes × time |
| Disk | Operations and bytes | I/Os, bytes |
| Network | Bytes in and out per hop | bytes |
| Waits | Locks, other services | — |

A component is a set of resources, each with a **discipline** (FCFS, processor-sharing, a
pool) and some **policies** (retry, evict, reject). With that, the operational laws already give
throughput and utilisation: utilisation `U = X · D`, Little's law `N = X · R`, and the
bottleneck bound `X ≤ 1 / D_max` (Lazowska et al., *Quantitative System Performance*). These
need no simulation. **Simulation is needed for what the laws cannot give: transients, tails and
feedback** (retries, timeouts, eviction).

### 3.1 Resource primitives

Offered through `Context`, implemented in the kernel, known by no component name.

| Primitive | Model | What emerges |
| --- | --- | --- |
| `cpu(cores, discipline, contention)` | `fcfs` (today's slots) or `processor-sharing`. Optional contention curve (USL σ, κ): effective speed falls as runnable work exceeds cores | Throughput peaks then collapses. Too many connections hurts |
| `memory(bytes)` | A ledger of named reservations: `connections`, `buffer-cache`, `work-mem`, `queue-backlog`. Over capacity → refuse, evict cache, swap (slowdown) or crash (needs K4) | "RAM rose because 300 connections × 9 MB = 2.7 GB". The cache shrinks and the hit rate drops |
| `disk(iops, mbPerSecond, latencyMs)` | Queueing device. Service = latency + bytes ÷ bandwidth. fsync with optional group commit | Miss storms queue. Writes cap at fsync rate |
| `link(latencyMs, bandwidthMbps)` | K3 extended. Transmit = bytes ÷ bandwidth, then propagation. Shared bandwidth by max-min fairness, as in SimGrid | Big payloads cost time. NICs saturate |

Each primitive emits standard metrics (`cpu.utilisation`, `memory.used` by reservation,
`disk.iops`, `disk.queue-depth`, `network.throughput`). The canvas and the bottleneck rules then
work for every component. They are declared next to `CAPACITY_METRIC_IDS` in
`contract/metric.ts`.

### 3.2 Database and PgBouncer on top

- **Database** = connection slots (each reserves `perConnectionMemoryMb` and pays
  `connectSetupMs` when opened) + CPU with a contention curve + memory (shared_buffers holding
  the buffer cache, connections, work_mem) + disk (miss reads, WAL fsync) + the existing row
  locks.
- **PgBouncer** (`session` or `transaction` pool mode) = many cheap client connections onto
  `default_pool_size` server connections, with its own wait queue and `query_wait_timeout`. Its
  benefit now emerges: fewer backends mean less RAM, less contention and no setup cost. It needs
  W1, K5 and a client-side pool on api-server first.

### 3.3 What cannot be shown is shown as a cause

If a value is neither controllable nor observable, we do not invent it. Each definition declares
how its fields **influence** resources and metrics, as data:

```
maxConnections ↑ → memory.connections ↑ → buffer-cache share ↓ → hit rate ↓ → disk.iops ↑ → p99 ↑
```

`ComponentDefinition` gains `influences: { field, affects, direction, formula }[]`. The
inspector draws the chain next to the field, so moving a slider explains itself.

### 3.4 Request classes

K1 grows from `operation` and `key` into **classes** of demand vectors: `point-read`,
`range-scan`, `write`, `upload`, and so on. Each class has a size in bytes and a distribution
per resource. A component maps each class to its own demands. For example, a database
`range-scan` costs N rows × (CPU per row + miss chance × disk read). Service times gain gamma
and lognormal draws (K7). The client gains closed-loop users with think time, bursty arrivals,
and retry jitter and budgets.

## 4. Showing the user when we might be wrong

| Mechanism | What the user sees |
| --- | --- |
| **Assumption ledger.** Each field carries `provenance: user, default-typical or default-guess`, plus an optional `source` | "This p99 rests on 3 values you did not set" |
| **Replications.** N seeds in the worker | Mean with a 95% band on every chart. "±12%", not one confident number |
| **Sensitivity with common random numbers.** Each field ±20%, same seed, so per-node PRNG streams match and differences come from config, not noise | A tornado chart: which settings move p99 and throughput most |
| **Model-confidence warnings.** Rule-based, shown only when they apply | "Utilisation above 0.95: small input errors swing results a lot." "Connections ≫ cores: the contention curve is an estimate." "This design depends on something in `notModeled`" |
| **Analytic shadow.** Erlang C, M/M/1/K, MVA for closed loops, next to the run | A badge when they agree. When they disagree, an explanation of what the simulation shows that the formula cannot |
| **Warm-up removal** (MSER-5) | Steady-state numbers leave out the cold start. The cut is marked on the chart |
| **Tier cross-check** (§6) | "Fluid mode is within 3% of exact on this design" |

## 5. Beyond the numbers: what makes it feel the best

1. **Per-request traces.** 1 in k requests records spans per hop (queue, CPU, disk, lock, net),
   shown as a waterfall: "click the slowest request". Runs are deterministic, so any request can
   be replayed exactly.
2. **Latency decomposition.** The same spans, summed: "p99 is 61% waiting for a connection, 22%
   disk, 17% CPU". This is the bottleneck explanation with its arithmetic shown.
3. **Live what-if.** Change a field mid-run. The worker forks from a checkpoint, and the two
   timelines overlay.
4. **Processor-sharing CPU with a virtual-time clock** (the fair-queueing trick), so it costs
   O(log n) per event.
5. **Calibrated presets** ("Postgres on db.r6g.large", "PgBouncer default"), taken from public
   benchmarks with the source cited, so defaults become `default-typical`.

## 6. Scale: is there something better than per-request DES?

### 6.1 What the literature offers

Checked 2026-10-17. The figures are as reported by the authors.

| Method | Evidence | Fit for Rectangles |
| --- | --- | --- |
| **Many-server fluid limits** (Whitt 2006; Liu & Whitt 2011, 2014) | Proven: as servers and load grow together, G_t/GI/s_t+GI networks converge to **deterministic ODEs** plus Gaussian noise. This holds with time-varying arrivals, abandonment (our timeouts) and routing | **Strongest.** At 1M req/s fluid is not an approximation to apologise for. It is what exact DES converges to. Covers ramps, spikes and timeouts |
| **Hybrid fluid + packet** (Kiddle et al. PADS 2003; Georgia Tech 2002) | Background traffic as rates, foreground discrete: up to **20×** faster, latency within 4% | **Strong.** Already the idea behind `simulation-algorithm.md` §8 step 4 |
| **Decomposition** (Parsimon, NSDI 2023) | Simulate each link alone with derived input, then combine delay distributions along paths: **154–492×** faster than ns-3, p99 off by about 8% | **Strong for tails.** One component per Web Worker, in parallel |
| **Flow-level max-min sharing** (SimGrid) | Accurate in symmetric cases, weaker in asymmetric ones | The sharing model for network and disk bandwidth |
| ML surrogates (m3 SIGCOMM 2024, m4 2025) | About 1,200× faster with about 10% error, but 18% off on unfamiliar networks. Needs training data | **No.** Opaque, which breaks "every number is explainable" |
| GPU parallel DES | About 800M events/s peak on three GPUs | **No.** Not in a browser on low-end machines. Determinism is hard |
| Differentiable DES (arXiv 2409.03740) | Smoothed DES yields gradients | **Later, maybe.** Could power "which change helps most" |
| µqSim, PerfSim | Queueing-network DES, validated against real clusters | Confirms our core and our framing. Not faster |

### 6.2 Three tiers on one resource layer

All tiers use the same CPU, memory, disk and link primitives, so a design means the same thing
in each.

| Tier | How | Range | Role |
| --- | --- | --- | --- |
| 1. Exact | Every request discrete (today) | Up to ~10k requests/s | The reference |
| 2. Fluid + tagged requests | Each component's state (in service, queued, memory held, bytes in flight) is an ODE driven by rates. It is stepped with an adaptive step that shrinks when state changes fast. A sample of **tagged requests** (for example 2,000/s) runs as real DES against the fluid-backed state, for percentiles and traces | Any rate. Cost follows the sample rate, not the traffic rate | High-traffic designs, interview numbers |
| 3. Decomposed tails | Parsimon-style per-component runs in parallel workers | Any rate | Only if tier 2's tails disagree with tier 1 |

Wherever tier 1 is feasible, tier 2 runs next to it and the difference is shown. This is how
the engine checks itself.

## 7. Feasibility spike

Before any of §6 enters `src/`, a throwaway prototype in `packages/engine/bench/fluid-spike/`:

- A fluid + tagged-request model of client → api-server → database. Steady, ramp and spike
  traffic, with timeouts and retries.
- Compare it with exact DES at 1k, 5k and 10k requests/s on throughput, utilisation, queue
  length, p50 and p99.
- Time it at 1M requests/s.

**Go** if means are within 5%, p99 is within 10–15%, and a 60 s run at 1M requests/s takes
under 2 s. **No-go** falls back to `simulation-algorithm.md` §8 step 3 (simulate 1 in k).

Result: *pending*, recorded here when the spike is done.

## 8. Order of work

| Phase | Work | Key files |
| --- | --- | --- |
| 0 | This document | `new-algorithm.md` |
| 0a | Analytic fast path (§9.2 T1): operational laws, Erlang C, MOL, shown before Run and used as a cross-check | `src/analysis/` (new), web `metrics` module |
| 0b | Fluid spike (§7), checked against exact DES and T1 | `bench/fluid-spike/` |
| 1 | K5: calls stay out of the pool while children are live; `call.isOpen` | `kernel/call-pool.ts`, `kernel/call-router.ts`, `contract/request.ts` |
| 2 | Resource contract and kernel implementation (CPU, memory, disk), checked against theory | `contract/resources.ts`, `kernel/resources/` |
| 3 | Database on resources: memory, disk, connection cost, contention | `components/database/` |
| 4 | api-server per-instance queues and its own pool. Request sizes and classes, closed-loop clients, retry jitter | `components/api-server/`, `components/client/`, `contract/request.ts` |
| 5 | K3 link latency and bandwidth | `kernel/design-graph.ts`, `kernel/call-router.ts` |
| 6 | PgBouncer | `components/pgbouncer/` |
| 7 | Trust layer (§4) | `contract/config-field.ts`, web `simulation` and `metrics` modules |
| 8 | Traces, latency decomposition, what-if (§5) | `metrics/`, web `metrics` module |

**Tests that prove the realism, PRD style.** A database with 500 connections and contention
has *lower* throughput than with 50, and PgBouncer restores it. With memory fixed, raising
`maxConnections` lowers the buffer-cache hit rate. The memory ledger always balances: the
reservations add up to the memory used.

## 9. Research review, second pass

Two research briefs were checked claim by claim on 2026-10-17. The figures are as reported by
the authors and have not been reproduced.

### 9.1 Which citations hold up

| Cited work | Exists? | What it actually shows |
| --- | --- | --- |
| Slowpoke (NSDI 2026) | Yes | Causal profiling of black-box microservices: "what throughput if service X were faster", predicted by slowing the *other* services. RMSE 2.07% on four apps. A third-party extension (NetPoke) reports it over-predicts by up to 25% under network bottlenecks |
| Towards Performance Robustness for Microservices / PERCs (NSDI 2026) | Yes | A certificate such as (p99, 120 ms): p99 stays under 120 ms across a stated range of arrival-rate, service-speed and interference perturbations. Built from queueing theory, formal methods and gradient estimation |
| Pilot Execution (NSDI 2026) | Yes | From 75 real recovery failures, most came from **interactions between components**. A dry run of recovery in production found 17 of 20 |
| Wormhole (NSDI 2026) | Yes | Packet simulation of LLM training. It memoises repeated contention states and fast-forwards steady flow rates: 744× over ns-3, error under 1%. The speed-up depends on the repetitive traffic of training jobs |
| HyGra (arXiv 2603.12671, 2026) | Yes | Switches between packet level (unsteady phases) and flow level (steady phases). Up to 15.4× faster. Uses a learned model to restore state when switching back |
| PaTGen (ACM TACO 2026) | Yes | Proxy benchmarks that match how metrics evolve over time, not only their averages. >97% global similarity over 15 workloads |
| Redbench (PVLDB 19(9), 2026) | Yes | Database workloads from Redshift traces. Real streams repeat queries a lot. Result caching helps on them, but hardly at all on round-robin benchmarks |
| SMART (AAAI 2026) | Yes | GNN + LLM surrogate for application runtime on Dragonfly HPC networks. About 1.8% MAPE, but trained per system |
| "A-Rabbit" index tuning | **Not found** | The closest real work: attention-based reliable and active index-benefit estimation (2025), UTune uncertainty-aware index tuning (2026), and Esc early stopping for budget-aware tuning (PVLDB 2025) |
| 2026 autoregressive neural model of time-varying multi-server queues | **Not found** | The closest real work: neural networks for steady-state GI/G/K queues (2026) and Pender & Ko's non-learned transient approximations |
| Calendar and ladder queues | Yes | Ladder queue is O(1) amortised in theory. The 2018 Adaptive Ladder Queue paper says in practice it is "often similar or even worse" than a heap |
| SimGrid, ns-3, OMNeT++, CloudSim Plus | Yes | As described. SimGrid's main lesson: resource models are useless until calibrated |

The briefs' main thesis is sound, and it matches §3 and §6: several models with selectable
fidelity on one resource layer, analytic cross-checks, calibration, and stated uncertainty.

### 9.2 Techniques to take, in order of fit

The order reflects what suits Rectangles: browser-only, low-end hardware, deterministic, and every
number explainable.

| # | Technique | Source idea | What we build |
| --- | --- | --- | --- |
| T1 | **Analytic fast path** | Operational laws, Erlang C, MVA; modified offered load (MOL) for time-varying traffic, accurate when delay is rare | Instant estimate while the user edits, before pressing Run: capacity, utilisation, the bottleneck, and a rough "saturates at about N req/s". It is also the cross-check for every run (§4) |
| T2 | **Fluid + tagged requests** | Liu & Whitt fluid limits, hybrid packet/fluid | Tier 2 in §6.2. Fluid alone predicts *no* queueing below saturation, so add the MOL/Erlang-C wait for sub-saturated stations. Tagged requests then sample a realistic wait |
| T3 | **Steady-state fast-forward** | Wormhole, HyGra | When a component's rates and queue have settled, switch it to analytic or fluid until something changes. Rectangles has an edge here: the traffic pattern **announces its own change points**, and faults and config edits are scheduled. On switching back, draw the queue state from its stationary distribution (Erlang C gives it) instead of a learned restorer. That keeps it explainable |
| T4 | **Speed-up map** (counterfactual) | Slowpoke, after Coz causal profiling | For each component, the end-to-end throughput and p99 gain if it were 2× faster. Re-run with common random numbers. This shows where the bottleneck moves next. A simulator does exactly what Slowpoke has to approximate on real systems |
| T5 | **SLO robustness certificate** | PERCs | "p99 < 200 ms holds for arrivals +30%, DB service time +50%". Find the worst case over a perturbation box (CRN runs, or the analytic bound from T1), and always state the box it covers |
| T6 | **Recovery scenarios** | Pilot Execution | K4 faults plus the recovery behaviour that causes the trouble: cache refill (cold-cache stampede), pool reconnect storm, retry surge, replica catch-up, backlog drain. A first-class "recovery" experiment |
| T7 | **Phased workloads** | PaTGen | The client takes a list of phases (warm-up, steady, burst, overload, recovery), each with its own rate, mix and burstiness (MMPP for bursts). Every metric is reported per phase |
| T8 | **Realistic query streams** | Redbench | Request classes (§3.4) gain a repetition rate and template skew, so result caches, buffer caches and indexes show their real value |
| T9 | **Multi-fidelity search with early stopping** | Esc, UTune, ranking and selection | "Best of N configs": screen all with T1, simulate the promising and uncertain ones, add replications only until the leader is separated from the rest, then stop |
| T10 | **Bounded-memory percentiles** | DDSketch (formal relative error, mergeable), HdrHistogram | Replace keep-every-sample (W9). Because sketches merge, results from parallel workers and replications combine |
| T11 | **Replications across Web Workers** | The briefs' advice on PDES | Parallelise independent seeds and what-if variants, not one coupled run. It is trivially deterministic |

**Not now:** ML surrogates (SMART, m3: each is accurate only on the systems it was trained on,
and opaque), GPU or optimistic parallel DES (no browser support, and determinism is hard),
ladder or calendar queues (gains in practice are mixed; the same-instant FIFO lane from
`simulation-algorithm.md` §8 is the cheaper win). Reconsider surrogates only for T9 screening, and
only once runs from T1–T4 can serve as training data.

### 9.3 Metrics to add or improve

| Area | Today | Target |
| --- | --- | --- |
| Latency | Whole-run and per-window p50/p95/p99 | Plus p99.9, per phase, with a confidence band. **Latency breakdown** by resource (queue, CPU, disk, lock, network). SLO attainment % |
| Throughput | Offered, goodput, error rate | Plus **max sustainable rate** (knee, from T1 and a search), **retry amplification** (attempts ÷ unique requests) |
| Resources | Slot utilisation, queue depth, DB connections, cores, locks, cache hits | CPU, memory **by reservation**, disk IOPS and queue, network bytes/s, pool wait |
| Recovery | — | Time to recover, peak backlog, drain time, cold-cache miss surge |
| Bottleneck | Utilisation ≥ 95% rule | **Speed-up map** (T4), the point where the bottleneck shifts, plus the capacity arithmetic |
| Robustness | — | Certificate and its perturbation box (T5), sensitivity ranking |
| Trust | — | CI width, analytic-vs-DES-vs-fluid difference, count of assumed defaults, the fidelity used per component |
| Engine | Events processed | Events per request, events/s, simulated req/s, wall time per simulated second, per tier. Two separate benchmarks: **simulation throughput** and **workload throughput** |

### 9.4 Effect on the order of work

The analytic fast path (T1) moves to the front of §8, before the fluid spike, for three
reasons: it is cheap, users see its value immediately, and the spike needs it (T2 uses its
waits, and the spike's Go/No-go needs a third opinion). The rest of §8 stands. T4–T6 belong to
phase 7 (trust layer), T7–T8 to phase 4 (workload), T10 to phase 2 (metrics alongside
resources), and T3 follows the spike if the spike is a Go.

## Sources

- Kiddle, Simmonds, Williamson, Unger. [Hybrid packet/fluid flow network simulation](https://www.cs.mcgill.ca/~carl/hybrid.pdf). PADS 2003
- [Integrated fluid and packet network simulations](https://repository.gatech.edu/entities/publication/d4517121-3c03-4b9f-94b0-7e494bf5bb8d). Georgia Tech, 2002
- Liu, Whitt. [Many-server heavy-traffic limit for queues with time-varying parameters](https://arxiv.org/pdf/1401.3933). Annals of Applied Probability, 2014
- Liu, Whitt. [A network of time-varying many-server fluid queues with customer abandonment](https://www.columbia.edu/~ww2040/LiuWhittOR2011.pdf). Operations Research, 2011
- Zhao et al. [Scalable tail latency estimation for data center networks (Parsimon)](https://www.usenix.org/system/files/nsdi23-zhao-kevin.pdf). NSDI 2023
- Li et al. [m3: accurate flow-level performance estimation using machine learning](https://people.csail.mit.edu/arashne/papers/m3.pdf). SIGCOMM 2024
- [m4: a learned flow-level network simulator](https://arxiv.org/pdf/2503.01770). 2025
- [SimGrid models](https://simgrid.org/doc/latest/Models.html)
- [GPU-based parallel network simulation](https://www.eurecom.fr/publication/4011/download/mm-publi-4011.pdf). EURECOM
- Che et al. [Differentiable discrete event simulation for queuing network control](https://arxiv.org/pdf/2409.03740). 2024
- Zhang, Gan, Delimitrou. [µqSim: scalable and validated simulation of cloud microservices](https://arxiv.org/pdf/1911.02122). ISPASS 2019
- [PerfSim: a performance simulator for cloud native microservice chains](https://arxiv.org/abs/2103.08983v1). 2021
- Xie et al. [Slowpoke: end-to-end throughput optimization modeling for microservice applications](https://www.usenix.org/conference/nsdi26/presentation/xie). NSDI 2026
- Saxena et al. [Towards performance robustness for microservices](https://www.usenix.org/conference/nsdi26/presentation/saxena). NSDI 2026
- [Pilot Execution: simulating failure recovery in situ for production distributed systems](https://www.usenix.org/conference/nsdi26/technical-sessions). NSDI 2026
- Long et al. [Supercharging packet-level network simulation of large model training via memoization and fast-forwarding (Wormhole)](https://arxiv.org/abs/2602.10615). NSDI 2026
- [HyGra: accelerating network-state simulation for LLM training via adaptive packet-flow granularity](https://arxiv.org/abs/2603.12671). 2026
- Yin et al. [PaTGen: temporal similarity-driven proxy benchmark generation for cloud workloads](https://dl.acm.org/doi/10.1145/3816437). ACM TACO 2026
- [Redbench: workload synthesis from cloud traces](https://doi.org/10.14778/3819518.3819538). PVLDB 19(9), 2026
- Wang et al. [SMART: a surrogate model for predicting application runtime in Dragonfly systems](https://arxiv.org/abs/2511.11111). AAAI 2026
- [UTune: towards uncertainty-aware online index tuning](https://arxiv.org/abs/2601.18199). 2026
- [Esc: an early-stopping checker for budget-aware index tuning](https://dl.acm.org/doi/10.14778/3718057.3718059). PVLDB 2025
- [Attention-based model for reliable and active benefit estimation in index tuning](https://www.sciencedirect.com/science/article/abs/pii/S0020025525007200). 2025
- [Training neural networks for the GI/G/K queue](https://www.sciencedirect.com/science/article/abs/pii/S0166531626000155). 2026
- [Peak congestion in multi-server service systems with slowly varying arrival rates (MOL accuracy)](https://collaborate.princeton.edu/en/publications/peak-congestion-in-multi-server-service-systems-with-slowly-varyi/). Queueing Systems 1997
- Masson, Rim, Lee. [DDSketch: a fast and fully-mergeable quantile sketch with relative-error guarantees](https://www.vldb.org/pvldb/vol12/p2195-masson.pdf). PVLDB 2019
- Tang, Goh, Thng. [Ladder queue: an O(1) priority queue structure for large-scale discrete event simulation](https://doi.org/10.1145/1103323.1103324). ACM TOMACS 2005
- [Adaptive ladder queue: achieving O(1) amortized access time in practice](https://angelo.furfaro.dimes.unical.it/node/139). 2018
