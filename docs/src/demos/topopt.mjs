// @rulecad/topopt, live: the MBB beam optimised step by step in a worker. The canvas shows the whole beam (the half
// the optimiser works on, and its mirror image across the line of symmetry); the chart, the compliance falling.
const el = document.getElementById('demo'), canvas = el.querySelector('#beam'), chart = el.querySelector('#chart'), readout = el.querySelector('#readout')
const go = el.querySelector('#run'), stop = el.querySelector('#stop'), volumeIn = el.querySelector('#volume'), filterIn = el.querySelector('#filter')
const nx = 60, ny = 20, scale = 8
canvas.width = 2 * nx * scale; canvas.height = ny * scale
const ctx = canvas.getContext('2d'), image = new ImageData(2 * nx, ny), small = document.createElement('canvas')
small.width = 2 * nx; small.height = ny
let worker = null, history = []

// Densities as a picture: solid white, empty black; row 0 of the grid is the bottom of the beam
function draw (density) {
  for (let j = 0; j < ny; j++) for (let X = 0; X < 2 * nx; X++) {
    const i = X < nx ? nx - 1 - X : X - nx, v = Math.round(255 * density[j * nx + i]), p = 4 * ((ny - 1 - j) * 2 * nx + X)
    image.data[p] = image.data[p + 1] = image.data[p + 2] = v; image.data[p + 3] = 255
  }
  small.getContext('2d').putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height)
}

// The compliance so far, as a line: from the first step's down to the latest
function plot () {
  const W = 600, H = 160, pad = 6, hi = Math.max(...history), lo = Math.min(...history), n = Math.max(history.length - 1, 1)
  const pts = history.map((c, k) => `${(pad + (k / n) * (W - 2 * pad)).toFixed(1)},${(pad + (1 - (c - lo) / (hi - lo || 1)) * (H - 2 * pad)).toFixed(1)}`).join(' ')
  chart.setAttribute('viewBox', `0 0 ${W} ${H}`)
  chart.innerHTML = `<polyline points="${pts}" fill="none" stroke="#fff" stroke-width="2"/><text x="${W - pad}" y="${H - pad - 4}" fill="#b4b4b4" font-size="13" text-anchor="end">compliance ${hi.toFixed(0)} to ${lo.toFixed(1)}</text>`
}

function run () {
  worker?.terminate()
  history = []
  const volume = Number(volumeIn.value), filter = Number(filterIn.value)
  worker = new Worker(new URL('./topopt-worker.mjs', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.done) {
      readout.textContent = `${data.converged ? 'Settled' : 'Stopped'} after ${data.steps} steps in ${data.seconds.toFixed(1)} s: compliance ${data.compliance.toFixed(2)}, ${(data.volume * 100).toFixed(0)}% of the beam filled.${volume === 0.5 && filter === 1.5 ? ' The 88-line code gives 127 steps and 218.80 for this beam.' : ''}`
      stop.disabled = true; worker = null
      return
    }
    history.push(data.compliance); draw(data.density); plot()
    readout.textContent = `step ${data.step}: compliance ${data.compliance.toFixed(2)}, largest change ${data.change.toFixed(3)}`
  }
  worker.onerror = (e) => { readout.textContent = `the run stopped: ${e.message}`; stop.disabled = true }
  stop.disabled = false
  worker.postMessage({ nx, ny, volume, filter })
}
go.addEventListener('click', run)
stop.addEventListener('click', () => { worker?.terminate(); worker = null; stop.disabled = true; readout.textContent = `stopped at step ${history.length}: compliance ${history.at(-1)?.toFixed(2) ?? 'none yet'}` })
run()
