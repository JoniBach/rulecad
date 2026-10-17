// A small 3D stage for the demos: shows parts (triangles, mm, Z up) in the viewer's style, drag to turn, wheel to
// zoom. Uses the viewer's own three.js build, from the site's root.
import { WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, LineSegments,
  EdgesGeometry, LineBasicMaterial, AmbientLight, DirectionalLight, Group, Box3, Vector3 } from '../../three.min.js'

export function stage (el) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  el.prepend(renderer.domElement)
  const scene = new Scene(), camera = new PerspectiveCamera(30, 1, 0.1, 5000), group = new Group()
  scene.add(group, new AmbientLight(0xffffff, 0.55))
  const sun = new DirectionalLight(0xffffff, 0.9); sun.position.set(1, -1.5, 2); scene.add(sun)
  let turn = -0.6, tilt = 1.05, distance = 100, centre = new Vector3()
  const place = () => {
    camera.position.set(centre.x + distance * Math.sin(tilt) * Math.sin(turn), centre.y - distance * Math.sin(tilt) * Math.cos(turn), centre.z + distance * Math.cos(tilt))
    camera.up.set(0, 0, 1); camera.lookAt(centre); draw()
  }
  const draw = () => {
    const { clientWidth: w, clientHeight: h } = el
    if (!w || !h) return
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.render(scene, camera)
  }
  new ResizeObserver(draw).observe(el)
  let drag = null
  el.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId) })
  el.addEventListener('pointermove', (e) => {
    if (!drag) return
    turn -= (e.clientX - drag[0]) * 0.01; tilt = Math.min(Math.max(tilt - (e.clientY - drag[1]) * 0.01, 0.05), 3.09); drag = [e.clientX, e.clientY]; place()
  })
  el.addEventListener('pointerup', () => { drag = null })
  el.addEventListener('wheel', (e) => { e.preventDefault(); distance *= Math.exp(e.deltaY * 0.001); place() }, { passive: false })
  let framed = false
  return {
    // parts: [{ triangles: [[[x,y,z] ×3], …], ink?: 0..1 (grey), faint?: bool }]
    show (parts, { refit = false } = {}) {
      for (const c of [...group.children]) { group.remove(c); c.geometry?.dispose() }
      for (const p of parts) {
        const pos = new Float32Array(p.triangles.length * 9)
        p.triangles.forEach((t, i) => t.forEach((v, j) => pos.set(v, i * 9 + j * 3)))
        const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals()
        const ink = p.ink ?? 0.85, color = (ink * 255) << 16 | (ink * 255) << 8 | ink * 255
        group.add(new Mesh(g, new MeshLambertMaterial({ color, transparent: !!p.faint, opacity: p.faint ? 0.25 : 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
        group.add(new LineSegments(new EdgesGeometry(g, 30), new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: p.faint ? 0.25 : 0.9 })))
      }
      if (!framed || refit) {
        const box = new Box3().setFromObject(group), size = box.getSize(new Vector3())
        centre = box.getCenter(new Vector3()); distance = Math.max(size.x, size.y, size.z, 1) * 3.2; framed = true
      }
      place()
    }
  }
}

// JSCAD geometry (geom3, or a list) as triangles: each polygon fanned from its first corner
export function triangles (jscad, geoms) {
  const out = []
  for (const g of [].concat(geoms)) for (const p of jscad.geometries.geom3.toPolygons(g)) {
    const v = p.vertices
    for (let i = 1; i + 1 < v.length; i++) out.push([[...v[0]], [...v[i]], [...v[i + 1]]])
  }
  return out
}

// A slider row: label, range input and its value; calls back on input
export function slider (parent, { label, min, max, step, value, unit = 'mm' }, onInput) {
  const row = document.createElement('label'), input = document.createElement('input'), out = document.createElement('output')
  Object.assign(input, { type: 'range', min, max, step, value })
  const show = () => { out.textContent = `${input.value}${unit ? ` ${unit}` : ''}` }
  row.append(label, input, out); parent.append(row); show()
  input.addEventListener('input', () => { show(); onInput(Number(input.value)) })
  return input
}

export const findingsList = (el, found) => {
  el.replaceChildren(...found.map((f) => {
    const li = document.createElement('li'), lv = document.createElement('span'), t = document.createElement('span')
    lv.className = `lv ${f.level}`; lv.textContent = f.level; t.textContent = f.text; li.append(lv, t); return li
  }))
}
