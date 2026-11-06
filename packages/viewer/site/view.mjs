// The model page: decode the link, draw the model (dark faces, ink creases, turning slowly; drag to turn it yourself),
// with a parts panel to show, hide and restyle each part, tick the parts a download holds, make print files (STL,
// or a 3MF in Bambu Studio's layout) in the browser, and slice it layer by layer with its islands in red. Nothing is uploaded:
// the model lives in the link (or, for a short link, in the Gist it names).
import { parseHash, decode, encode, fromGist, fromTriangles, fromSTL, triangles, partsOf, posesOf, stl, threemf, filename, thingOf, jointValues, placeItems, mul, inv, DOFS } from './model-link.mjs';
import { check } from './printcheck.mjs';
import { WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, LineSegments,
  LineBasicMaterial, AmbientLight, DirectionalLight, Group, WireframeGeometry, Raycaster, Vector2, Vector3, Box3, Plane, Points, PointsMaterial } from './three.min.js';

const $ = (id) => document.getElementById(id);
const DRAWER = '(max-width: 760px), (pointer: coarse) and (max-width: 1100px)'; // the same query as the drawer's CSS
const status = (t) => { $('status').textContent = t; };

// A print file of the parts ticked (pick: { keep, name }), or of every printed part
async function download(model, kind, pick = {}) {
  if (pick.keep && !pick.keep.size) return status('Tick the parts to download in the parts panel');
  status(`Making ${kind.toUpperCase()}…`);
  const bytes = kind === '3mf' ? await threemf(model, pick.keep) : stl(model, pick.keep), name = filename(model, kind, pick.name);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: kind === '3mf' ? 'model/3mf' : 'model/stl' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  status(`Downloaded ${name}`);
}

// ---------- the project view ----------
// The lines where a part's faces meet at more than deg degrees, and its open edges. Unlike three's EdgesGeometry, an
// edge pairs up whichever way its triangles run, and a face folded flat back on itself is no crease: a link snaps its
// corners to a grid, which can turn a long thin triangle over (as on a board's face between its holes), and three would
// edge each one in white. A triangle with no area has no say.
function creases(g, deg) {
  const pos = g.getAttribute('position').array, key = (i) => `${Math.round(pos[i] * 1e4)},${Math.round(pos[i + 1] * 1e4)},${Math.round(pos[i + 2] * 1e4)}`;
  const edges = new Map(), cos = Math.cos(deg * Math.PI / 180), a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
    const n = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)), len = n.length(), normal = len > 1e-12 ? n.divideScalar(len) : null;
    for (let k = 0; k < 3; k++) {
      const u = i + k * 3, v = i + ((k + 1) % 3) * 3, ku = key(u), kv = key(v);
      if (ku === kv) continue;
      const id = ku < kv ? `${ku}|${kv}` : `${kv}|${ku}`, e = edges.get(id) || { u, v, uses: 0, normals: [] };
      e.uses++; if (normal) e.normals.push(normal); edges.set(id, e);
    }
  }
  const out = [];
  for (const e of edges.values()) {
    const [n0, ...rest] = e.normals, sharp = rest.some((n) => { const d = n.dot(n0); return d < cos && d > -0.9998; });
    if (e.uses === 1 || sharp) out.push(...pos.slice(e.u, e.u + 3), ...pos.slice(e.v, e.v + 3));
  }
  const lines = new BufferGeometry(); lines.setAttribute('position', new Float32BufferAttribute(out, 3)); return lines;
}

// Each part is drawn three ways (faces, crease lines, every triangle's edges); its style picks which show:
//   solid (faces + creases), wire (every edge), xray (see-through faces + creases), faint (creases in ink-3), hidden.
// A part's style is "auto" until set: supports and references are faint, real parts follow the view mode.
const INK = { 1: 0xffffff, 2: 0xb4b4b4, 3: 0x5c5c5c }, STYLES = ['auto', 'solid', 'wire', 'xray', 'faint'];

function show(model) {
  document.title = `${model.title || 'Model'} ${model.version || ''}`.trim();
  $('title').textContent = model.title || 'Model';
  $('meta').textContent = [model.version, model.material, model.set && `set ${model.set}`, model.src].filter(Boolean).join(' · ');
  $('note').textContent = model.orientation || '';
  $('about').hidden = !$('meta').textContent && !$('note').textContent;
  rulesSheet(model.sheet);
  $('rules').replaceChildren(...(model.rules || []).map(([label, value, unit]) => {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = `${value}${unit && unit !== 'segments' ? ` ${unit}` : ''}`; li.append(`${label} `, b); return li;
  }));

  // Parts: JSCAD's Z-up becomes three's Y-up; everything centred on the turning axis
  const parts = partsOf(model).map((part, k) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(triangles(model, part).flat(2), 3));
    g.rotateX(-Math.PI / 2); g.computeVertexNormals(); g.computeBoundingBox();
    return { k, name: part[0], role: part[1], label: part[2], g, visible: true, style: 'auto', ticked: part[1] !== 'reference' }; // references only check a fit
  });
  const box = new Box3(); parts.forEach((p) => box.union(p.g.boundingBox));
  const mid = box.getCenter(new Vector3()), r = box.getSize(new Vector3()).length() / 2 || 1;
  const turn = new Group(), tilt = new Group();
  for (const p of parts) {
    p.g.translate(-mid.x, -mid.y, -mid.z); p.g.computeBoundingBox();
    p.faces = new MeshLambertMaterial({ color: 0x3a3a3a, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: true });
    p.creaseInk = new LineBasicMaterial({ color: INK[1] }); p.wireInk = new LineBasicMaterial({ color: INK[2] });
    p.mesh = new Mesh(p.g, p.faces); p.creases = new LineSegments(creases(p.g, 25), p.creaseInk);
    p.wire = null; // made the first time it's needed
    p.node = new Group(); p.node.add(p.mesh, p.creases); p.mesh.userData.part = p;
    p.moved = new Group(); p.moved.matrixAutoUpdate = false; p.moved.add(p.node); // where its joints move it (motion)
    turn.add(p.moved);
  }
  tilt.add(turn); tilt.rotation.x = 0.45;
  const scene = new Scene();
  scene.add(tilt, new AmbientLight(0xffffff, 0.6));
  const sun = new DirectionalLight(0xffffff, 2.2); sun.position.set(-1, 2, 1.5); scene.add(sun);

  // The shapes parts take only in some poses (a flexure bent), ready to swap in: made as the parts are
  const alts = new Map(posesOf(model).map(({ k, part }) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(triangles(model, part).flat(2), 3));
    g.rotateX(-Math.PI / 2); g.translate(-mid.x, -mid.y, -mid.z); g.computeVertexNormals(); g.computeBoundingBox();
    return [k, g];
  }));
  const motion = model.motion && moving(model.motion, parts, mid, alts);

  // ---------- state ----------
  const view = { mode: 'solid', supports: true, references: true, explode: 0, spin: true, selected: new Set() };
  const effective = (p) => {
    if (!p.visible || (p.role === 'support' && !view.supports) || (p.role === 'reference' && !view.references)) return 'hidden';
    return p.style !== 'auto' ? p.style : p.role !== 'part' ? 'faint' : view.mode;
  };
  const apply = () => {
    for (const p of parts) {
      const st = effective(p), sel = view.selected.has(p);
      p.mesh.visible = st === 'solid' || st === 'xray';
      p.faces.opacity = st === 'xray' ? (sel ? 0.6 : 0.18) : 1; p.faces.depthWrite = st !== 'xray'; // selected: lit up in any mode
      p.faces.color.setHex(sel ? 0x8a8a8a : 0x3a3a3a);
      p.creases.visible = st === 'solid' || st === 'xray' || st === 'faint';
      p.creaseInk.color.setHex(st === 'faint' && !sel ? INK[3] : INK[1]);
      if (st === 'wire' && !p.wire) { p.wire = new LineSegments(new WireframeGeometry(p.g), p.wireInk); p.node.add(p.wire); }
      if (p.wire) { p.wire.visible = st === 'wire'; p.wireInk.color.setHex(sel ? INK[1] : INK[2]); }
    }
    // Explode: each kind of part lifts above the one below it; supports drop away underneath
    const kinds = [...new Set(parts.filter((p) => p.role !== 'support').map((p) => p.label))]
      .map((label) => ({ label, y: Math.min(...parts.filter((p) => p.label === label).map((p) => p.g.boundingBox.min.y)) })).sort((a, b) => a.y - b.y);
    const gap = (box.max.y - box.min.y) * 0.9 * view.explode;
    for (const p of parts) p.node.position.y = p.role === 'support' ? -gap : kinds.findIndex((x) => x.label === p.label) * gap;
    renderTree();
  };

  // ---------- the parts list: kinds (keycap ×9), each opening to its copies (key-1-1), each copy all its parts ----------
  const instanceOf = (p) => { const bits = p.name.split('.'); return bits.length > 2 ? bits.slice(0, -1).join('.') : bits[0]; }; // key-1-1.switch.stem -> key-1-1.switch
  const groups = [];
  for (const p of parts) {
    let g = groups.find((x) => x.label === p.label);
    if (!g) groups.push(g = { label: p.label, role: p.role, copies: [], open: false });
    const id = instanceOf(p);
    let c = g.copies.find((x) => x.id === id);
    if (!c) g.copies.push(c = { id, parts: [] });
    c.parts.push(p);
  }
  const all = (g) => g.copies.flatMap((c) => c.parts);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const styleOf = (list) => { const s = new Set(list.map((p) => p.style)); return s.size === 1 ? [...s][0] : 'mixed'; };
  const button = (cls, text, title, fn) => { const b = el('button', cls, text); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  function controls(list) {
    const shown = list.some((p) => p.visible), ticked = list.filter((p) => p.ticked).length;
    const box = Object.assign(el('input', 'tick'), { type: 'checkbox', checked: ticked === list.length, indeterminate: ticked > 0 && ticked < list.length,
      title: 'In the download: click, or drag up or down over several' });
    box.flag = 'ticked'; box.parts = list; // painted by a drag (below), which handles mouse and touch alike
    box.onclick = (e) => { e.stopPropagation(); e.preventDefault(); if (!e.detail) setFlag('ticked', list, ticked < list.length); }; // detail 0: the keyboard
    const eye = button(`eye${shown ? '' : ' off'}`, shown ? '●' : '○', shown ? 'Shown: click to hide, or drag over several' : 'Hidden: click to show, or drag over several', () => {});
    eye.flag = 'visible'; eye.parts = list; eye.onclick = (e) => { e.stopPropagation(); e.preventDefault(); if (!e.detail) setFlag('visible', list, !shown); };

    return [box, eye,
      button('style', styleOf(list), 'Style: auto, solid, wire, x-ray or faint', () => {
        const next = STYLES[(STYLES.indexOf(styleOf(list)) + 1) % STYLES.length] || 'auto';
        list.forEach((p) => { p.style = next; }); apply();
      }),
    ];
  }
  const isSelected = (list) => list.length && list.every((p) => view.selected.has(p));
  function renderTree() {
    const n = parts.filter((p) => p.ticked).length, printed = parts.filter((p) => p.role !== 'reference').length;
    $('picked').textContent = $('picked-foot').textContent = !n ? 'Download: nothing ticked' : n === printed && parts.every((p) => p.ticked || p.role === 'reference') ? `Download: every printed part (${n})` : `Download: ${n} of ${parts.length} parts`;
    $('tree').replaceChildren(...groups.map((g) => {
      const li = el('li', 'group'), line = el('div', 'line'), single = g.copies.length === 1;
      const tail = el('span', 'tail');
      tail.append(el('span', 'role', `${g.role !== 'part' ? g.role : ''}${single ? '' : `${g.role !== 'part' ? ' ' : ''}×${g.copies.length}`}`), ...controls(all(g)));
      line.append(el('span', 'caret', single ? '' : g.open ? '▾' : '▸'), el('span', 'name', g.label), tail);
      if (single && isSelected(all(g))) line.classList.add('selected');
      line.onclick = () => { if (single) select(all(g)); else { g.open = !g.open; renderTree(); } };
      li.append(line);
      if (!single) {
        const ul = el('ul', 'copies'); ul.hidden = !g.open;
        for (const c of g.copies) {
          const row = el('li', `copy${isSelected(c.parts) ? ' selected' : ''}`), t = el('span', 'tail');
          t.append(...controls(c.parts));
          row.append(el('span', 'caret'), el('span', 'name', c.id.split('.')[0]), t);
          row.title = c.parts.map((p) => p.name).join(', ');
          row.onclick = () => select(c.parts);
          ul.append(row);
        }
        li.append(ul);
      }
      return li;
    }));
  }
  // Select a copy (all its parts): it lights up in the model and in the list, and its size shows below
  function select(list) {
    const same = isSelected(list) && list.length === view.selected.size;
    view.selected = new Set(same ? [] : list);
    if (view.selected.size) {
      const g = groups.find((x) => all(x).includes(list[0])); g.open = true;
      const b = new Box3(); list.forEach((p) => b.union(p.g.boundingBox)); const sz = b.getSize(new Vector3());
      status(`${instanceOf(list[0]).split('.')[0]}: ${list[0].label}${list[0].role !== 'part' ? ` (${list[0].role})` : ''}, ${sz.x.toFixed(1)} × ${sz.z.toFixed(1)} × ${sz.y.toFixed(1)} mm`);
    } else status('');
    // Tell the 2D views what's picked: a board offers its flat view
    dispatchEvent(new CustomEvent('cad:select', { detail: view.selected.size ? { name: list[0].name, label: list[0].label } : null }));
    apply();
  }

  // ---------- toggles you can paint ----------
  // Like Blender's toggles: press a download tick or a visibility eye and it flips; keep the button down and drag up or
  // down, and every toggle of the same kind passed over takes that state (ticked or not, shown or hidden), whatever it
  // was. Rows re-render as toggles change, so the drag finds the toggle under the pointer rather than holding one.
  function setFlag(flag, list, on) {
    if (!list.some((p) => p[flag] !== on)) return;
    list.forEach((p) => { p[flag] = on; });
    if (flag === 'visible') apply(); else renderTree(); // apply redraws the list too
  }
  const toggleAt = (x, y) => { const t = document.elementFromPoint(x, y)?.closest('.tick, .eye'); return t?.parts ? t : null; };
  let painting = null; // { flag, on } while a drag is on
  $('tree').addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tick, .eye');
    if (!t?.parts || e.button > 0) return;
    e.preventDefault();
    painting = { flag: t.flag, on: !t.parts.every((p) => p[t.flag]) };
    setFlag(painting.flag, t.parts, painting.on);
    addEventListener('click', swallow, true); // the click that ends a drag lands on whatever row is there now: not a select
  });
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  addEventListener('pointermove', (e) => {
    if (!painting) return;
    const t = toggleAt(e.clientX, e.clientY);
    if (t && t.flag === painting.flag) setFlag(painting.flag, t.parts, painting.on);
  });
  for (const end of ['pointerup', 'pointercancel']) addEventListener(end, () => { painting = null; setTimeout(() => removeEventListener('click', swallow, true)); });
  // The parts ticked, and a name for them: everything (no name), one copy (cap-2-4), one kind (keycap), or a count
  const picked = () => {
    const on = parts.filter((p) => p.ticked);
    if (on.length === parts.filter((p) => p.role !== 'reference').length && on.every((p) => p.role !== 'reference')) return {};
    const things = new Set(on.map((p) => thingOf(p.name))), kinds = new Set(on.map((p) => p.label));
    const one = things.size === 1 && [...things][0]; // a single object's parts are all one thing: name them
    const name = one ? one.split('.')[0] : things.has('') ? on.map((p) => p.label).join('-') : kinds.size === 1 ? [...kinds][0] : `${things.size}-things`;
    return { keep: new Set(on.map((p) => p.k)), name };
  };

  // ---------- controls ----------
  for (const b of $('mode').querySelectorAll('button')) b.onclick = () => { view.mode = b.dataset.mode; $('mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); apply(); };
  $('explode').oninput = (e) => { view.explode = Number(e.target.value); apply(); };
  $('spin').onchange = (e) => { view.spin = e.target.checked; };
  $('supports').onchange = (e) => { view.supports = e.target.checked; apply(); };
  $('references').onchange = (e) => { view.references = e.target.checked; apply(); };
  $('reset').onclick = () => {
    Object.assign(view, { mode: 'solid', supports: true, references: true, explode: 0, spin: true, selected: new Set() });
    parts.forEach((p) => { p.visible = true; p.style = 'auto'; });
    $('explode').value = 0; $('spin').checked = $('supports').checked = $('references').checked = true;
    $('mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.mode === 'solid'));
    turn.rotation.y = 0; tilt.rotation.x = 0.45; status(''); motion?.reset(); if ($('slice').checked) { $('slice').checked = false; $('slice').onchange(); } apply();
  };
  $('supports').closest('label').hidden = !parts.some((p) => p.role === 'support');
  $('references').closest('label').hidden = !parts.some((p) => p.role === 'reference');
  // The panel: a side panel on wide screens; on phones a drawer, closed at first and closed by tapping the model
  // The panel: a side panel on wide screens; on phones it takes the info pane's place under the model (split, below)
  const narrow = matchMedia(DRAWER), foot = document.querySelector('footer');
  const panel = (open) => {
    $('panel').hidden = !open; foot.hidden = narrow.matches && open;
    $('toggle').textContent = narrow.matches && open ? 'Info' : 'Parts';
    $('toggle').title = narrow.matches && open ? 'Show the title and downloads' : 'Show or hide the parts panel';
  };
  $('toggle').onclick = () => panel($('panel').hidden);
  $('close').onclick = () => panel(false);
  narrow.addEventListener('change', () => panel(!narrow.matches));
  panel(!narrow.matches);

  // ---------- drawing ----------
  const stage = $('stage'), renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setClearColor(0x000000);
  stage.append(renderer.domElement);
  const slicer = slicing(model, parts, turn, mid, renderer, () => { view.explode = 0; $('explode').value = 0; apply(); });
  const camera = new PerspectiveCamera(30, 1, r / 100, r * 30);
  const size = () => {
    const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.position.set(0, 0, (r * 1.15) / Math.tan((Math.PI / 180) * 15) / Math.min(1, camera.aspect)); camera.updateProjectionMatrix();
  };
  new ResizeObserver(size).observe(stage); size();

  // Drag turns and tilts; a click without a drag picks the part under the pointer
  let drag = null, last = performance.now();
  const ray = new Raycaster(), at = new Vector2();
  stage.addEventListener('pointerdown', (e) => { if (e.target !== renderer.domElement) return; drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    turn.rotation.y += (e.clientX - drag.x) * 0.01; tilt.rotation.x = Math.max(-1.4, Math.min(1.4, tilt.rotation.x + (e.clientY - drag.y) * 0.01));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) {
      const rect = renderer.domElement.getBoundingClientRect();
      at.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(at, camera);
      const hit = ray.intersectObjects(parts.filter((p) => effective(p) !== 'hidden').map((p) => p.mesh))[0];
      if (hit) { const p = hit.object.userData.part, id = instanceOf(p); select(parts.filter((q) => q.label === p.label && instanceOf(q) === id)); }
    }
    drag = null;
  });
  renderer.setAnimationLoop((now) => {
    if (stage.classList.contains('flat')) { last = now; return; } // a 2D view is up: nothing to draw
    if (!drag && view.spin) turn.rotation.y += ((now - last) / 60000) * 2 * Math.PI;
    last = now; scene.updateMatrixWorld(); slicer.frame(); renderer.render(scene, camera);
  });
  apply();
  return { picked };
}

// ---------- slicing ----------
// The model cut at a layer, as a printer builds it: the slider sets the layer, everything above it is clipped away, and
// the layer's outline is drawn in white. A worker cuts every layer (slice.mjs, with printcheck's islands) and the
// islands it finds, a layer's region with nothing under it that the printer would lay on air, are drawn in red: all of
// them while the whole part shows, those at or under the cut while slicing, the cut layer's own brightest. A button
// for each jumps to its layer. The printer's layer, overhang and line come from the link's rules when it has them.
const RED = 0xe8806a;
function slicing(model, parts, turn, mid, renderer, flatten) {
  const rule = (name, fallback) => { const r = (model.sheet || []).find((x) => x[1] === name && Number.isFinite(Number(x[2]))); return r ? Number(r[2]) : fallback; };
  const printer = { layer: rule('layer', 0.2), overhang: rule('overhang', 45), line: rule('line', 0.42) };
  // JSCAD's Z up, centred, as the page draws it: (x, y, z) -> (x, z - mid.y, -y - mid.z) with x less mid.x
  const toView = (x, y, z) => [x - mid.x, z - mid.y, -y - mid.z];
  const printed = parts.filter((p) => p.role !== 'reference'), raw = printed.flatMap((p) => triangles(model, partsOf(model)[p.k]).flat(2));
  const tris = Float32Array.from(raw);
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < tris.length; i += 3) { lo = Math.min(lo, tris[i]); hi = Math.max(hi, tris[i]); }
  const count = Number.isFinite(lo) ? Math.max(1, Math.round((hi - lo) / printer.layer)) : 0;
  const input = $('layer'), out = $('layerat'), note = $('islands'), list = $('islandlist'), on = $('slice');
  $('slicing').hidden = !count;
  if (!count) return { frame() {} };
  input.max = count; input.value = count;
  const local = new Plane(new Vector3(0, -1, 0), 0), world = new Plane(), clips = [];
  const materials = () => parts.flatMap((p) => [p.faces, p.creaseInk, p.wireInk]);
  // The cut layer's outline: every triangle crossing the layer's middle, cut there (in the page's own coordinates)
  const outline = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  outline.renderOrder = 2; outline.visible = false; turn.add(outline);
  const cutAt = (L) => {
    const z = lo + (L - 0.5) * printer.layer, segs = [];
    for (let t = 0; t < tris.length; t += 9) {
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = t + k * 3, b = t + ((k + 1) % 3) * 3;
        if ((tris[a + 2] < z) !== (tris[b + 2] < z)) { const u = (z - tris[a + 2]) / (tris[b + 2] - tris[a + 2]); pts.push(toView(tris[a] + u * (tris[b] - tris[a]), tris[a + 1] + u * (tris[b + 1] - tris[a + 1]), z)); }
      }
      if (pts.length === 2) segs.push(...pts[0], ...pts[1]);
    }
    outline.geometry.dispose(); outline.geometry = new BufferGeometry(); outline.geometry.setAttribute('position', new Float32BufferAttribute(segs, 3));
  };
  // Islands: red points over each one's area, seen through the model; the cut layer's own drawn larger and brighter
  const dots = (size, opacity) => { const d = new Points(new BufferGeometry(), new PointsMaterial({ color: RED, size, sizeAttenuation: false, depthTest: false, transparent: true, opacity })); d.renderOrder = 3; turn.add(d); return d; };
  const all = dots(3, 0.85), here = dots(6, 1);
  let found = [];
  const fill = (d, list) => { d.geometry.dispose(); d.geometry = new BufferGeometry(); d.geometry.setAttribute('position', new Float32BufferAttribute(list.flatMap((isl) => isl.cells.flatMap(([x, y]) => toView(x, y, isl.z))), 3)); };
  const layerOf = (isl) => Math.round((isl.z - lo) / printer.layer + 0.5);
  const show = () => {
    const L = Number(input.value), slicing = on.checked;
    out.textContent = `${L} of ${count} · ${(L * printer.layer).toFixed(1)} mm`; // the layer, and its top's height off the bed
    local.constant = lo + L * printer.layer - mid.y + 1e-4; // keep what's at or under the top of layer L
    for (const m of materials()) m.clippingPlanes = slicing ? clips : null;
    clips.length = 0; if (slicing) clips.push(world);
    outline.visible = slicing; if (slicing) cutAt(L);
    fill(all, slicing ? found.filter((isl) => layerOf(isl) < L) : found);
    fill(here, slicing ? found.filter((isl) => layerOf(isl) === L) : []);
  };
  renderer.localClippingEnabled = true;
  on.onchange = () => { if (on.checked) flatten(); input.disabled = !on.checked; show(); };
  input.oninput = () => { if (!on.checked) { on.checked = true; on.onchange(); } else show(); };
  input.disabled = true;
  // Cut every layer off the page's thread; the outline and the slider work meanwhile
  note.textContent = 'Slicing…'; note.classList.remove('hit');
  const worker = new Worker(new URL('./slice.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.progress != null) { note.textContent = `Slicing… ${Math.round(data.progress * 100)}%`; return; }
    worker.terminate();
    found = data.islands;
    note.classList.toggle('hit', found.length > 0);
    note.textContent = found.length ? `${found.length === 1 ? 'An island' : `${found.length} islands`} when sliced: a layer's region with nothing under it, which the printer lays on air` : `No islands in ${data.layers} layers of ${printer.layer} mm`;
    list.replaceChildren(...found.slice(0, 12).map((isl) => {
      const b = document.createElement('button'); b.textContent = `z ${isl.z.toFixed(1)}`; b.title = `${isl.area.toFixed(1)} mm² at layer ${layerOf(isl)}: show it`;
      b.onclick = () => { input.value = layerOf(isl); if (!on.checked) { on.checked = true; on.onchange(); } else show(); };
      return b;
    }));
    show();
  };
  worker.onerror = (e) => { note.textContent = `Couldn't slice it here (${e.message || 'the worker failed'})`; };
  const copy = tris.slice(); worker.postMessage({ tris: copy, printer }, [copy.buffer]); // the page keeps its own, for the outline
  show();
  return { frame() { if (on.checked) world.copy(local).applyMatrix4(turn.matrixWorld); } };
}

// ---------- motion ----------
// A link with joints (motion in model-link.mjs): a slider for each joint that doesn't follow another, and a button for
// each named pose. The parts come in placed at the link's pose; each moves with its item, by where its item is now
// against where it was. When a slider is let go, a quick look for parts pushed into each other: a corner of one inside
// the other. The real check is cad check --sweep; this one misses parts that cross without a corner going in.
function moving(mo, parts, mid, alts = new Map()) {
  const start = jointValues(mo, mo.pose), was = placeItems(mo, start).map(inv);
  // A pose's shapes (mo.swap): each listed part drawn as its pose shape, every other part as it came
  for (const p of parts) p.own = p.g;
  const edges = new Map(), shapeFor = (name) => new Map((mo.swap?.[name] || []).map(([k, alt]) => [k, alts.get(alt)]));
  const reshape = (name) => {
    const swap = shapeFor(name);
    for (const p of parts) {
      const g = swap.get(p.k) || p.own;
      if (p.g === g) continue;
      p.g = g; p.mesh.geometry = g;
      if (!edges.has(g)) edges.set(g, creases(g, 25));
      p.creases.geometry = edges.get(g);
      if (p.wire) { p.node.remove(p.wire); p.wire = null; } // drawn again from the new shape when it's next wanted
    }
  };
  // JSCAD's Z-up, centred, as the page draws it (three's Y-up): (x, y, z) -> (x, z, -y) - mid
  const C = [1, 0, 0, -mid.x, 0, 0, 1, -mid.y, 0, -1, 0, -mid.z], Ci = inv(C);
  let values = structuredClone(start), moved = [];
  const free = mo.joints.filter((j) => !j.follow && j.dofs.length);
  const place = () => {
    const now = placeItems(mo, jointValues(mo, values));
    moved = now.map((w, i) => mul(mul(C, mul(w, was[i])), Ci));
    for (const p of parts) {
      const i = mo.part[p.k], d = i >= 0 ? moved[i] : null;
      if (d) p.moved.matrix.set(...d, 0, 0, 0, 1); else p.moved.matrix.identity();
      p.moved.matrixWorldNeedsUpdate = true;
    }
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sliders = [];
  for (const j of free) j.dofs.forEach(([lo, hi], d) => {
    const angle = DOFS[j.type][d] === 'angle', unit = angle ? '°' : ' mm';
    const name = `${j.label || j.id}${j.dofs.length > 1 ? ` ${j.type === 'ball' ? 'xyz'[d] : DOFS[j.type][d]}` : ''}`;
    const row = el('label', 'joint'), out = el('b'), input = Object.assign(el('input'), { type: 'range', min: lo, max: hi, step: angle ? 1 : Math.max(0.01, (hi - lo) / 400) });
    const show = () => { input.value = values[j.id][d]; out.textContent = `${Number(values[j.id][d].toFixed(angle ? 0 : 2))}${unit}`; };
    input.oninput = () => { values[j.id][d] = Number(input.value); show(); place(); pick(null); $('clash').textContent = ''; };
    input.onchange = () => look();
    row.append(el('span', null, name), out, input); sliders.push(show); show();
    $('joints').append(row);
  });
  // Poses: buttons that set every joint
  const poses = Object.keys(mo.poses || {}), pick = (name) => $('poses').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === name));
  const go = (name) => { values = jointValues(mo, name); for (const j of mo.joints) values[j.id] = [...values[j.id]]; sliders.forEach((f) => f()); reshape(name); place(); pick(name); look(); };
  if (poses.length > 1) $('poses').replaceChildren(...poses.map((n) => { const b = el('button', null, n); b.onclick = () => go(n); return b; }));
  pick(mo.pose);
  // The quick look: pairs of parts whose items have moved against each other (or that are in a pose shape), boxes first, then corners inside
  const allow = new Set((mo.allow || []).map(([a, b]) => `${a},${b}`));
  const pos = (p, d) => { const a = p.g.getAttribute('position').array, o = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2]; o[i] = d[0] * x + d[1] * y + d[2] * z + d[3]; o[i + 1] = d[4] * x + d[5] * y + d[6] * z + d[7]; o[i + 2] = d[8] * x + d[9] * y + d[10] * z + d[11]; } return o; };
  const boxOf = (a) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < a.length; i++) { const k = i % 3; if (a[i] < lo[k]) lo[k] = a[i]; if (a[i] > hi[k]) hi[k] = a[i]; } return { lo, hi }; };
  const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
  // Inside: a ray along x crosses the part's faces an odd number of times (faces kept in a grid over y and z)
  const grid = (a, box) => {
    const n = 24, cells = Array.from({ length: n * n }, () => []), sy = (box.hi[1] - box.lo[1]) / n || 1, sz = (box.hi[2] - box.lo[2]) / n || 1;
    const cell = (y, z) => Math.min(n - 1, Math.max(0, Math.floor((y - box.lo[1]) / sy))) * n + Math.min(n - 1, Math.max(0, Math.floor((z - box.lo[2]) / sz)));
    for (let t = 0; t < a.length; t += 9) {
      const y0 = Math.min(a[t + 1], a[t + 4], a[t + 7]), y1 = Math.max(a[t + 1], a[t + 4], a[t + 7]), z0 = Math.min(a[t + 2], a[t + 5], a[t + 8]), z1 = Math.max(a[t + 2], a[t + 5], a[t + 8]);
      const c0 = cell(y0, z0), c1 = cell(y1, z1);
      for (let i = Math.floor(c0 / n); i <= Math.floor(c1 / n); i++) for (let k = c0 % n; k <= c1 % n; k++) cells[i * n + k].push(t);
    }
    return { a, box, inside: (x, y, z) => {
      if (x < box.lo[0] || x > box.hi[0] || y < box.lo[1] || y > box.hi[1] || z < box.lo[2] || z > box.hi[2]) return false;
      let hits = 0;
      for (const t of cells[cell(y, z)]) { // y-z barycentric test for a ray along +x, nudged off edges
        const py = y + 1.3e-5, pz = z + 1.7e-5, ay = a[t + 1], az = a[t + 2], by = a[t + 4], bz = a[t + 5], cy = a[t + 7], cz = a[t + 8];
        const det = (by - ay) * (cz - az) - (bz - az) * (cy - ay); if (Math.abs(det) < 1e-12) continue;
        const u = ((py - ay) * (cz - az) - (pz - az) * (cy - ay)) / det, v = ((by - ay) * (pz - az) - (bz - az) * (py - ay)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        if (a[t] + u * (a[t + 3] - a[t]) + v * (a[t + 6] - a[t]) > x) hits++;
      }
      return hits % 2 === 1;
    } };
  };
  // In by more than a touch: inside however the corner is nudged (a corner on the other part's face is touching it)
  const E = 0.05, deep = (g, x, y, z) => g.inside(x, y, z) && g.inside(x + E, y, z) && g.inside(x - E, y, z) && g.inside(x, y + E, z) && g.inside(x, y - E, z) && g.inside(x, y, z + E) && g.inside(x, y, z - E);
  const look = () => {
    const live = parts.filter((p) => p.mesh.visible || p.creases.visible), at = new Map(), hit = new Set(), pairs = [];
    const d = (p) => moved[mo.part[p.k]] || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const get = (p) => { if (!at.has(p)) { const a = pos(p, d(p)); at.set(p, { a, box: boxOf(a) }); } return at.get(p); };
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const p = live[i], q = live[j];
      const reshaped = p.g !== p.own || q.g !== q.own; // a part in its pose shape is looked at even where nothing moved
      if (mo.part[p.k] === mo.part[q.k] || (same(d(p), d(q)) && !reshaped) || allow.has(`${Math.min(p.k, q.k)},${Math.max(p.k, q.k)}`)) continue;
      const A = get(p), B = get(q), lo = [0, 1, 2].map((k) => Math.max(A.box.lo[k], B.box.lo[k])), hi = [0, 1, 2].map((k) => Math.min(A.box.hi[k], B.box.hi[k]));
      if ([0, 1, 2].some((k) => hi[k] - lo[k] < 0.05)) continue; // apart, or only touching
      const into = (X, Y) => { Y.g ||= grid(Y.a, Y.box); for (let v = 0; v < X.a.length; v += 3) { const x = X.a[v], y = X.a[v + 1], z = X.a[v + 2]; if (x >= lo[0] - 1e-6 && x <= hi[0] + 1e-6 && y >= lo[1] - 1e-6 && y <= hi[1] + 1e-6 && z >= lo[2] - 1e-6 && z <= hi[2] + 1e-6 && deep(Y.g, x, y, z)) return true; } return false; };
      if (into(A, B) || into(B, A)) { hit.add(p); hit.add(q); pairs.push(`${p.name.split('.')[0]} and ${q.name.split('.')[0]}`); }
    }
    for (const p of parts) p.faces.emissive?.setHex(hit.has(p) ? 0x7a2a18 : 0x000000);
    const c = $('clash'); c.classList.toggle('hit', pairs.length > 0);
    c.textContent = pairs.length ? `Collides: ${[...new Set(pairs)].slice(0, 3).join('; ')}${pairs.length > 3 ? ` and ${pairs.length - 3} more` : ''}` : 'Nothing collides here (a quick look)';
  };
  $('motion').hidden = !free.length && poses.length < 2;
  place();
  return { reset: () => go(mo.pose || null) };
}

// ---------- the split ----------
// Phones: the model and the info pane share the screen (--split is the model's share). Drag the grip to change it, and
// double tap it for half and half; the share is remembered. The rules sheet opens in the pane, not over the model.
function split() {
  const grip = $('grip'), narrow = matchMedia(DRAWER), wide = matchMedia('(orientation: landscape)'), KEY = 'rulecad.split';
  const set = (pct) => { document.body.style.setProperty('--split', `${pct}%`); try { localStorage.setItem(KEY, String(pct)); } catch {} };
  const saved = Number((() => { try { return localStorage.getItem(KEY); } catch { return null; } })());
  if (saved >= 15 && saved <= 85) set(saved);
  let drag = false;
  grip.addEventListener('pointerdown', (e) => { drag = true; grip.classList.add('dragging'); grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pct = wide.matches ? (e.clientX / innerWidth) * 100 : (e.clientY / innerHeight) * 100;
    set(Math.round(Math.min(85, Math.max(15, pct)) * 10) / 10);
  });
  for (const end of ['pointerup', 'pointercancel']) grip.addEventListener(end, () => { drag = false; grip.classList.remove('dragging'); });
  let tap = 0, from = 0; // a double tap or click without a drag: half and half (touch screens rarely send dblclick)
  grip.addEventListener('pointerdown', (e) => { from = wide.matches ? e.clientX : e.clientY; });
  grip.addEventListener('pointerup', (e) => {
    if (Math.abs((wide.matches ? e.clientX : e.clientY) - from) > 6) { tap = 0; return; }
    if (performance.now() - tap < 350) { set(50); tap = 0; } else tap = performance.now();
  });
  const sheet = $('sheet'), home = sheet.parentElement;
  const place = () => { if (narrow.matches) document.body.append(sheet); else home.append(sheet); };
  narrow.addEventListener('change', place); place();
}

// ---------- the rules sheet ----------
// Rows [group, name, value, unit, rule, expr, kind, source, checked]: the model's own values, grouped by object, then
// the rules they use, grouped by rule set. All of it is the link's data: written as text, and a source is a link only
// when it's a web address.
function rulesSheet(rows) {
  const btn = $('rulesbtn'), sheet = $('sheet'), body = $('sheetbody'), find = $('sheetfind');
  if (!Array.isArray(rows) || !rows.length) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r[0])) groups.set(r[0], []); groups.get(r[0]).push(r); }
  const blocks = [...groups].map(([group, list]) => {
    const dl = el('dl'), items = list.map(([, name, value, unit = '', rule = '', expr = '', kind = '', source = '', checked = '']) => {
      const row = el('div', 'rule');
      row.append(el('dt', null, name), el('div', 'val', `${value}${unit && unit !== 'segments' ? ` ${unit}` : ''}`));
      if (rule) row.append(el('dd', null, rule));
      const from = el('dd', 'from');
      if (kind) from.append(el('span', `kind ${kind === 'estimate' ? 'estimate' : ''}`, kind));
      if (expr) from.append(`= ${expr}`);
      if (source) {
        if (expr) from.append(' · ');
        if (/^https?:\/\//.test(source)) { const a = el('a', null, source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')); a.href = source; a.target = '_blank'; a.rel = 'noopener noreferrer'; from.append(a); }
        else from.append(source);
      }
      if (checked) from.append(` · checked ${checked}`);
      if (from.childNodes.length) row.append(from);
      row.dataset.text = [group, name, value, unit, rule, expr, kind, source].join(' ').toLowerCase();
      return row;
    });
    dl.append(...items);
    const block = el('div'); block.append(el('h3', null, group), dl); return block;
  });
  body.replaceChildren(...blocks);
  const open = (on) => { sheet.hidden = !on; }; // no focus on the find box: on a phone it would raise the keyboard
  btn.hidden = false; btn.onclick = () => open(sheet.hidden); $('sheetclose').onclick = () => open(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) open(false); });
  find.oninput = () => {
    const q = find.value.trim().toLowerCase();
    for (const b of blocks) { let any = false; for (const r of b.querySelectorAll('.rule')) { const hit = !q || r.dataset.text.includes(q); r.hidden = !hit; any ||= hit; } b.hidden = !any; }
  };
}

// ---------- 2D views ----------
// A board's copper and its schematic come in the link as SVG drawings ([[name, svg]]). They're shown as images (an
// <img> never runs anything inside an SVG), in tabs over the 3D view, with choices inside the Board tab. A link carries
// "Board: both sides" with each element's copper layer marked (data-pcb-layer): a view of each layer is made here (front,
// inner 1, inner 2 ..., back, as many as the board has), by a style inside the drawing hiding the others.
// Drag to pan, wheel or pinch to zoom, double-click to fit.
function flatViews(model) {
  const list = (model.views || []).filter((v) => Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string');
  if (!list.length) return;
  const stage = $('stage'), tabs = $('tabs'), subs = $('subtabs'), flat = $('flat'), img = flat.querySelector('img');
  const groups = [];
  for (const [name, svg] of list) {
    const [g, sub] = name.split(': ');
    let x = groups.find((y) => y.name === g);
    if (!x) groups.push(x = { name: g, items: [] });
    x.items.push({ label: sub || g, svg, url: null });
  }
  // One view per copper layer the drawing has: front, the inner layers (a 4-layer board's planes) in order, back. Holes,
  // the outline and anything not on one layer show in every view
  for (const g of groups) {
    const svg = g.items[0].svg;
    if (g.items.length !== 1) continue;
    const found = new Set([...svg.matchAll(/data-pcb-layer="(top|bottom|inner\d+)"/g)].map((m) => m[1]));
    if (!found.has('top') || !found.has('bottom')) continue;
    const inner = [...found].filter((l) => l.startsWith('inner')).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
    const copper = ['top', ...inner, 'bottom'];
    const only = (keep) => svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>${copper.filter((l) => l !== keep).map((l) => `[data-pcb-layer="${l}"]`).join(',')}{display:none}</style>`);
    g.items[0].label = copper.length > 2 ? `all ${copper.length} layers` : 'both sides';
    g.items.push(...copper.map((l) => ({ label: l === 'top' ? 'front' : l === 'bottom' ? 'back' : `inner ${l.slice(5)}`, svg: only(l), url: null })));
  }
  const at = { s: 1, x: 0, y: 0 }, place = () => { img.style.transform = `translate(${at.x}px, ${at.y}px) scale(${at.s})`; };
  const fit = () => {
    const w = img.naturalWidth || 800, h = img.naturalHeight || 600, W = flat.clientWidth, H = flat.clientHeight;
    at.s = Math.min(W / w, H / h) * 0.94; at.x = (W - w * at.s) / 2; at.y = (H - h * at.s) / 2; place();
  };
  img.onload = fit;
  const button = (text, on, fn) => { const b = document.createElement('button'); b.textContent = text; b.classList.toggle('on', on); b.onclick = fn; return b; };
  let current = null;
  const open = (g, item) => {
    current = { g, item };
    stage.classList.toggle('flat', !!g);
    tabs.replaceChildren(button('3D', !g, () => open(null)), ...groups.map((x) => button(x.name, x === g, () => open(x, x.items[0]))));
    views.classList.remove('open'); pick.setAttribute('aria-expanded', 'false'); pick.textContent = `${g ? g.name : '3D'} ▾`;
    subs.replaceChildren(...(g && g.items.length > 1 ? g.items.map((i) => button(i.label, i === item, () => open(g, i))) : []));
    subs.hidden = !(g && g.items.length > 1);
    flat.hidden = !g;
    $('jump').hidden = true;
    if (g) { item.url ||= URL.createObjectURL(new Blob([item.svg], { type: 'image/svg+xml' })); if (img.src !== item.url) img.src = item.url; else fit(); }
  };
  // Pan and zoom: one pointer pans, two pinch; the wheel zooms about the pointer
  const pts = new Map();
  let pinch = null;
  const zoom = (k, cx, cy) => { const r = flat.getBoundingClientRect(), px = cx - r.left, py = cy - r.top; at.x = px - (px - at.x) * k; at.y = py - (py - at.y) * k; at.s *= k; place(); };
  flat.addEventListener('pointerdown', (e) => { flat.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = null; });
  flat.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { at.x += e.clientX - p.x; at.y += e.clientY - p.y; place(); }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()], other = a === p ? b : a, d = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (pinch) zoom(d / pinch, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
      pinch = d;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  for (const end of ['pointerup', 'pointercancel']) flat.addEventListener(end, (e) => { pts.delete(e.pointerId); pinch = null; });
  flat.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  flat.addEventListener('dblclick', fit);
  new ResizeObserver(() => { if (current?.g) fit(); }).observe(flat);
  // From the 3D model: pick the board (or its copper) and a button opens its flat view
  const board = groups.find((g) => /board/i.test(g.name)), jump = $('jump');
  if (board) {
    jump.onclick = () => open(board, board.items[0]);
    addEventListener('cad:select', (e) => { jump.hidden = !(e.detail && /pcb|copper/i.test(`${e.detail.name} ${e.detail.label}`)) || !!current?.g; });
  }
  // A phone, or more views than sit in a row: the picker button stands for the tabs
  const views = tabs.parentElement, pick = $('pick'), narrow = matchMedia(DRAWER);
  pick.onclick = () => pick.setAttribute('aria-expanded', String(views.classList.toggle('open')));
  const compact = () => { const on = narrow.matches || groups.length > 3; views.classList.toggle('compact', on); pick.hidden = !on; };
  const shut = () => { views.classList.remove('open'); pick.setAttribute('aria-expanded', 'false'); };
  addEventListener('pointerdown', (e) => { if (!views.contains(e.target)) shut(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
  narrow.addEventListener('change', compact); compact();
  tabs.hidden = false;
  open(null);
}

async function main() {
  const { token: long, gist, get } = parseHash(location.hash);
  let model, token = long;
  try {
    if (!token && gist) token = await fromGist(gist); // a short link: the data is in a Gist
    if (!token) return welcome();
    model = await decode(token);
  } catch (e) {
    return problem(e.message);
  }
  open(model, gist ? `#s=${gist}` : `#m=${token}`);
  if (get === 'stl' || get === '3mf') download(model, get); // older links: every printed part
}

function problem(message) {
  document.body.innerHTML = `<div class="problem"></div>`;
  document.querySelector('.problem').textContent = message;
}

function open(model, hash, findings) {
  split();
  const project = show(model);
  flatViews(model);
  if (findings) $('rules').replaceChildren(...findings.map((f) => { // a dropped file: what the print check found
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = { pass: '✓', warn: '!', fail: '✗' }[f.level]; li.append(b, ` ${f.text}`); return li;
  }));
  for (const b of document.querySelectorAll('[data-get]')) b.addEventListener('click', () => download(model, b.dataset.get, project.picked()));
  $('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}${hash}`); status('Link copied'); // short stays short
  });
}

// No link: drop an STL (or choose one) to see it, check it for printing and make a link. Nothing leaves the browser.
const PRINTER = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42 }; // a common FDM printer
function welcome() {
  const box = document.createElement('label');
  box.className = 'problem drop';
  box.innerHTML = '<span>Drop an STL file here, or choose one, to see it, check it for printing and make a link to share.<br>'
    + '<small>Nothing is uploaded: the model stays in your browser, and in the link.</small></span><input type="file" accept=".stl" hidden>';
  document.body.replaceChildren(box);
  const take = async (file) => {
    if (!file) return;
    try {
      const tris = fromSTL(await file.arrayBuffer()), name = file.name.replace(/\.stl$/i, '');
      const model = { title: name, src: file.name, ...fromTriangles(tris) };
      const hash = `#m=${await encode(model)}`;
      history.replaceState(null, '', hash); // the link, without reloading
      document.body.replaceChildren(...page.cloneNode(true).childNodes);
      open(model, hash, [...check(tris, PRINTER), { level: 'pass', text: `checked for a ${PRINTER.bed} mm bed, ${PRINTER.overhang}° overhangs, ${PRINTER.bridge} mm bridges, Z up` }]);
    } catch (e) { problem(e.message); }
  };
  box.querySelector('input').addEventListener('change', (e) => take(e.target.files[0]));
  addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
  addEventListener('dragleave', () => box.classList.remove('over'));
  addEventListener('drop', (e) => { e.preventDefault(); take(e.dataTransfer.files[0]); });
}
const page = document.body.cloneNode(true); // the page as it loads, to restore after the drop screen

window.addEventListener('hashchange', () => location.reload());
main();
