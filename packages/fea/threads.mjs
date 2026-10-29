// The threads backend: the stiffness product (what the iterative solvers spend their time on) shared out over worker
// threads, each sweeping a range of the nodes. Node only (worker_threads and shared memory); the rest is the plain
// JavaScript backend's. Each product costs a handoff to the workers and back (tens of microseconds), so it pays on grids
// of more than a few thousand cells, which is where the time goes anyway.
//   import { threadsBackend } from '@rulecad/fea/threads';
//   solve(g, { ..., method: 'mg', backend: threadsBackend });
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { jsBackend, pattern, assemble } from './fea.mjs';

const THREADS = Math.max(1, Math.min(8, Number(process.env.FEA_THREADS) || os.cpus().length - 1));

// The pool: made on first use, kept for the process (unref'd, so it doesn't keep the process alive). Each operator
// registers its arrays with every worker under an id; a product then signals the id and waits for every worker's done.
let pool = null;
function workers() {
  if (pool) return pool;
  // ctl: [0] the product generation, [1] the operator id, [2] workers done, [3] registrations acknowledged
  const ctl = new Int32Array(new SharedArrayBuffer(16)), list = [];
  for (let w = 0; w < THREADS; w++) { const worker = new Worker(new URL(import.meta.url), { workerData: { ctl, index: w, count: THREADS } }); worker.unref(); list.push(worker); }
  let nextId = 1;
  pool = {
    register(arrays) {
      const id = nextId++;
      Atomics.store(ctl, 3, 0);
      for (const w of list) w.postMessage({ id, ...arrays });
      // Wake the workers to take the message (a product with no operator), then wait for every one to hold the arrays
      pool.multiply(0);
      while (Atomics.load(ctl, 3) < THREADS) Atomics.wait(ctl, 3, Atomics.load(ctl, 3), 50);
      return id;
    },
    multiply(id) {
      Atomics.store(ctl, 2, 0); Atomics.store(ctl, 1, id);
      Atomics.add(ctl, 0, 1); Atomics.notify(ctl, 0);
      while (Atomics.load(ctl, 2) < THREADS) Atomics.wait(ctl, 2, Atomics.load(ctl, 2), 50);
    },
  };
  return pool;
}

export const threadsBackend = {
  name: `threads (${THREADS})`,
  precision: 64,
  operator(g, ke, cellMatrices) {
    const pat = pattern(g), { dim } = g, bb = dim * dim, n = g.nodes;
    const xs = new Float64Array(new SharedArrayBuffer(g.dofs * 8)), ys = new Float64Array(new SharedArrayBuffer(g.dofs * 8));
    let values = cellMatrices ? assemble(g, pat, cellMatrices, null, null) : new Float64Array(new SharedArrayBuffer(pat.cols.length * bb * 8));
    let assembledFor = cellMatrices ? undefined : {}, id = null;
    const ready = (scale) => {
      if (!cellMatrices && assembledFor !== scale) { assemble(g, pat, null, ke, scale, values); assembledFor = scale; }
      if (id === null) id = workers().register({ dim, nodes: n, rows: pat.rows, cols: pat.cols, values, xs, ys });
    };
    return {
      multiply(scale, x, y) { ready(scale); xs.set(x); workers().multiply(id); y.set(ys); },
      diagonal(scale, d) {
        ready(scale);
        const { rows, self } = pat;
        for (let i = 0; i < n; i++) { const o = (rows[i] + self[i]) * bb; for (let q = 0; q < dim; q++) d[dim * i + q] = values[o + q * dim + q]; }
      },
    };
  },
  dot: jsBackend.dot,
  axpy: jsBackend.axpy,
};

if (!isMainThread && workerData?.ctl) {
  const { ctl, index, count } = workerData, ops = new Map();
  parentPort.on('message', (m) => { ops.set(m.id, m); Atomics.add(ctl, 3, 1); Atomics.notify(ctl, 3); });
  // Products: wait for the generation to change, sweep this worker's share of the nodes, say so
  let seen = 0;
  const run = () => {
    for (;;) {
      const r = Atomics.wait(ctl, 0, seen, 1000); // (timed, so a message gets through now and then regardless)
      if (r === 'timed-out') return setImmediate(run);
      seen = Atomics.load(ctl, 0);
      const id = Atomics.load(ctl, 1), op = ops.get(id);
      if (!id) { Atomics.add(ctl, 2, 1); Atomics.notify(ctl, 2); return setImmediate(run); } // woken to take a message
      if (op) {
        const { dim, nodes, rows, cols, values: v, xs: x, ys: y } = op, from = Math.floor((nodes * index) / count), to = Math.floor((nodes * (index + 1)) / count);
        if (dim === 3) {
          for (let i = from; i < to; i++) {
            let y0 = 0, y1 = 0, y2 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) {
              const j = cols[t] * 3, o = t * 9, x0 = x[j], x1 = x[j + 1], x2 = x[j + 2];
              y0 += v[o] * x0 + v[o + 1] * x1 + v[o + 2] * x2; y1 += v[o + 3] * x0 + v[o + 4] * x1 + v[o + 5] * x2; y2 += v[o + 6] * x0 + v[o + 7] * x1 + v[o + 8] * x2;
            }
            y[3 * i] = y0; y[3 * i + 1] = y1; y[3 * i + 2] = y2;
          }
        } else {
          for (let i = from; i < to; i++) {
            let y0 = 0, y1 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) { const j = cols[t] * 2, o = t * 4, x0 = x[j], x1 = x[j + 1]; y0 += v[o] * x0 + v[o + 1] * x1; y1 += v[o + 2] * x0 + v[o + 3] * x1; }
            y[2 * i] = y0; y[2 * i + 1] = y1;
          }
        }
      }
      Atomics.add(ctl, 2, 1); Atomics.notify(ctl, 2);
    }
  };
  run();
}
