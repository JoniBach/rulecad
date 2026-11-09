// The model page: decode the link, draw the model (dark faces, ink creases, turning slowly; drag to turn it yourself),
// with a parts panel to show, hide and restyle each part, tick the parts a download holds, make print files (STL,
// or a 3MF in Bambu Studio's layout) in the browser, and slice it layer by layer with its islands in red. Nothing is uploaded:
// the model lives in the link (or, for a short link, in the Gist it names).
import { parseHash, decode, encode, fromGist, fromTriangles, fromSTL, triangles, partsOf, posesOf, stl, threemf, filename, thingOf, jointValues, placeItems, mul, inv, DOFS, compactSteps } from './model-link.mjs';
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
  if (model.wires?.length) wireLines(model.wires, turn, mid, motion); // faint, never parts: no check sees them

  // ---------- state ----------
  const view = { mode: 'solid', supports: true, references: true, explode: 0, spin: true, selected: new Set(), step: null };
  const itemOf = (p) => p.name.split('.')[0]; // the assembly item a part belongs to
  const effective = (p) => {
    if (!p.visible || (p.role === 'support' && !view.supports) || (p.role === 'reference' && !view.references)) return 'hidden';
    if (view.step && !view.step.shown.has(itemOf(p))) return 'hidden'; // an assembly step: only what's on by then
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
    // A step shown: the new part held off along the way it goes on (JSCAD's z up is the page's y), and lit
    if (view.step) for (const p of parts) if (view.step.now.has(itemOf(p))) { const [x, y, z] = view.step.dir, far = r * 0.45; p.node.position.set(x * far, z * far, -y * far); p.faces.color.setHex(0x8a8a8a); }
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
    view.step = null; document.querySelectorAll('ol.steps button.on').forEach((x) => x.classList.remove('on'));
    turn.rotation.y = 0; tilt.rotation.x = 0.45; status(''); motion?.reset(); if ($('slice').checked) { $('slice').checked = false; $('slice').onchange(); } apply();
  };
  $('supports').closest('label').hidden = !parts.some((p) => p.role === 'support');
  $('references').closest('label').hidden = !parts.some((p) => p.role === 'reference');
  // The panel: a side panel on wide screens; on phones a drawer, closed at first and closed by tapping the model
  // The panel: a side panel on wide screens; on phones it takes the info pane's place under the model (split, below)
  const narrow = matchMedia(DRAWER), foot = document.querySelector('footer');
  const panel = (open) => {
    $('panel').hidden = !open; foot.hidden = narrow.matches && open;
    if (open && narrow.matches) $('build').hidden = true; // one pane under the model at a time on a phone
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
  if (model.build) buildPage(model, { apply, view, foot, narrow, panel, spin: (on) => { view.spin = on; $('spin').checked = on; } });
  // A machine: the tool mode and the playback need @rulecad/robots, loaded only for a link that has one
  let machine = null;
  if (model.task && motion) drawing(model, motion, { turn, tilt, camera, renderer, stage, mid, spin: (on) => { view.spin = on; $('spin').checked = on; } }).then((m) => { machine = m; }, (e) => { $('toolsay').textContent = `Couldn't start the pen (${e.message})`; $('tool').hidden = false; });

  // Drag turns and tilts; a click without a drag picks the part under the pointer
  let drag = null, last = performance.now();
  const ray = new Raycaster(), at = new Vector2();
  stage.addEventListener('pointerdown', (e) => { if (e.target !== renderer.domElement) return; if (machine?.press(e)) { stage.setPointerCapture(e.pointerId); drag = null; return; } drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (machine?.drag(e)) return;
    if (!drag) return;
    turn.rotation.y += (e.clientX - drag.x) * 0.01; tilt.rotation.x = Math.max(-1.4, Math.min(1.4, tilt.rotation.x + (e.clientY - drag.y) * 0.01));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (machine?.release(e)) return;
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
    machine?.frame(now);
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
  const listeners = [];
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
    for (const f of listeners) f(now, values);
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sliders = [];
  for (const j of free) j.dofs.forEach(([lo, hi], d) => {
    const angle = DOFS[j.type][d] === 'angle', unit = angle ? '°' : ' mm';
    const name = `${j.label || j.id}${j.dofs.length > 1 ? ` ${j.type === 'ball' ? 'xyz'[d] : DOFS[j.type][d]}` : ''}`;
    const row = el('label', 'joint'), out = el('b'), input = Object.assign(el('input'), { type: 'range', min: lo, max: hi, step: j.step ?? (angle ? 1 : Math.max(0.01, (hi - lo) / 400)) }); // a stepper's slider moves in its steps
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
  // For the pen and the playback: set some joints (the chain's), and hear of every move
  const set = (names, q) => { names.forEach((n, i) => { values[n] = [q[i]]; }); sliders.forEach((f) => f()); place(); pick(null); $('clash').textContent = ''; };
  return { reset: () => go(mo.pose || null), set, listen: (f) => { listeners.push(f); place(); }, values: () => values };
}

// ---------- wires ----------
// A machine's wires, drawn faint along their routes and moving with the items they run between. Never parts: nothing
// in the page checks them, downloads them or lists them.
function wireLines(list, turn, mid, motion) {
  const pts = list.flatMap(([, route]) => route.slice(1).flatMap((p, i) => [route[i], p])), count = pts.length, pos = new Float32Array(count * 3);
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const lines = new LineSegments(g, new LineBasicMaterial({ color: 0x4f7281, transparent: true, opacity: 0.8 })); turn.add(lines);
  const draw = (worlds) => {
    const a = g.getAttribute('position').array;
    pts.forEach(([item, x, y, z], i) => {
      const W = worlds?.[item], wx = W ? W[0] * x + W[1] * y + W[2] * z + W[3] : x, wy = W ? W[4] * x + W[5] * y + W[6] * z + W[7] : y, wz = W ? W[8] * x + W[9] * y + W[10] * z + W[11] : z;
      a[i * 3] = wx - mid.x; a[i * 3 + 1] = wz - mid.y; a[i * 3 + 2] = -wy - mid.z;
    });
    g.getAttribute('position').needsUpdate = true; g.computeBoundingSphere();
  };
  if (motion) motion.listen(draw); else draw(null);
}

// ---------- drawing with the machine ----------
// A link with a task (a pen and a sheet): the sheet and the region the arm reaches drawn on the model, the pen dragged
// by hand and the joints following through inverse kinematics in the page, a step file played with its drawn line in
// its predicted-error colour, and a strip of the margins (torque, reach, accuracy, heat) at the pose on show.
const COLOUR = { ok: [0.45, 0.82, 0.58], warn: [0.91, 0.77, 0.42], fail: [0.91, 0.5, 0.41] };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
function errorColour(e, limit) { const t = limit > 0 ? e / limit : 0; return t < 0.5 ? mix(COLOUR.ok, COLOUR.warn, t * 2) : t < 1 ? mix(COLOUR.warn, COLOUR.fail, (t - 0.5) * 2) : COLOUR.fail; }

async function drawing(model, motion, { turn, tilt, camera, renderer, stage, mid, spin }) {
  const T = model.task, { chainFromMotion, ik, fk, jacobian } = await import('./robots/robots.mjs'), { marginAt } = await import('./robots/kinematics.mjs');
  const chain = chainFromMotion(model.motion, { tip: T.item, tool: T.point }), P = T.plane, names = chain.names, mo = model.motion, cos = Math.abs(P.n[2]);
  const toView = ([x, y, z]) => [x - mid.x, z - mid.y, -y - mid.z], fromView = ([x, y, z]) => [x + mid.x, -(z + mid.z), y + mid.y], lift = 0.4;
  const onPlane = (x, y, up = lift) => [0, 1, 2].map((k) => P.at[k] + P.u[k] * x + P.v[k] * y + P.n[k] * up), W2 = P.width / 2, H2 = P.height / 2;
  const planeXY = (p) => { const d = [0, 1, 2].map((k) => p[k] - P.at[k]); return [d[0] * P.u[0] + d[1] * P.u[1] + d[2] * P.u[2], d[0] * P.v[0] + d[1] * P.v[1] + d[2] * P.v[2]]; };
  const geo = (list) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(list.flatMap(toView), 3)); return g; };
  const layer = new Group(); turn.add(layer);
  const outline = new LineSegments(geo([[-W2, -H2], [W2, -H2], [W2, -H2], [W2, H2], [W2, H2], [-W2, H2], [-W2, H2], [-W2, -H2]].map(([x, y]) => onPlane(x, y))), new LineBasicMaterial({ color: 0xffffff }));
  const pen = new Points(geo([onPlane(0, 0)]), new PointsMaterial({ color: 0xffffff, size: 11, sizeAttenuation: false, depthTest: false, transparent: true }));
  pen.renderOrder = 4; layer.add(outline, pen);
  const trail = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0xffffff })), trailAt = [];
  trail.visible = false; layer.add(trail);
  const say = (id, t, bad) => { $(id).textContent = t; $(id).classList.toggle('hit', !!bad); };
  // What the arm reaches on this plane, off the page's thread: the sheet, and a margin round it
  const flat = (cells, colour, opacity) => { const pos = cells.flatMap(([x, y, z], i, a) => { const c = a.step, [u, v] = planeXY([x, y, z]), s = onPlane; return [s(u - c, v - c, lift / 2), s(u + c, v - c, lift / 2), s(u + c, v + c, lift / 2), s(u - c, v - c, lift / 2), s(u + c, v + c, lift / 2), s(u - c, v + c, lift / 2)]; }); const g = geo(pos); const m = new Mesh(g, new MeshLambertMaterial({ color: 0x000000, emissive: colour, transparent: true, opacity, side: 2, depthWrite: false })); m.renderOrder = 1; return m; };
  const area = { width: P.width * 1.5, height: P.height * 1.5 }, step = Math.max(1, Math.min(P.width, P.height) / 36), worker = new Worker(new URL('./reach.mjs', import.meta.url), { type: 'module' });
  let reachNote = '';
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error) { say('toolsay', `The reach couldn't be worked out here: ${data.error}`, true); return; }
    const halve = step / 2, cells = data.cells.map((c) => [...c, ...planeXY(c)]), on = cells.filter((c) => Math.abs(c[4]) <= W2 + halve && Math.abs(c[5]) <= H2 + halve);
    const reachable = cells.filter((c) => c[3]), missing = on.filter((c) => !c[3]);
    reachable.step = halve; missing.step = halve;
    layer.add(flat(reachable, 0x2f7f9f, 0.3)); if (missing.length) layer.add(flat(missing, 0xc0442c, 0.55));
    reachNote = `${on.filter((c) => c[3]).length} of ${on.length} points on the sheet in reach`;
    $('tool').dataset.reach = String(reachable.length);
    if (!mode.checked && !busy) say('toolsay', reachNote);
  };
  worker.onerror = (e) => say('toolsay', `The reach couldn't be worked out here (${e.message || 'the worker failed'})`, true);
  worker.postMessage({ motion: { items: mo.items, joints: mo.joints }, tip: T.item, tool: T.point, sheet: { ...area, at: P.at, normal: P.n, u: P.u }, step, elbow: T.elbow });

  // ---------- the strip: margins at this pose ----------
  const G = 9.80665, DEG_T = T.torque || [], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const strip = $('strip'), chips = {}, chip = (key, label, title) => { const c = document.createElement('span'), b = document.createElement('b'); c.className = 'chip'; c.title = title; c.append(`${label} `, b); strip.append(c); chips[key] = { c, b }; };
  chip('torque', 'Torque', 'What the motors give against what this pose needs of them (the check takes the worst pose)');
  chip('reach', 'Reach', 'How far the pen can still go before an arm joint or the arm\'s stretch stops it');
  chip('accuracy', 'Accuracy', 'What the error budget predicts at this pose, against the task\'s accuracy');
  chip('heat', 'Heat', 'The motor case at rated current against the plastic it\'s bolted to: the same in every pose');
  strip.hidden = false;
  const setChip = (key, text, level) => { const { c, b } = chips[key]; b.textContent = text; c.className = `chip${level ? ` ${level}` : ''}`; };
  // A mass carried beyond a joint, at these joint values, as motors.mjs's loadAt
  const byChild = new Map(mo.joints.map((x) => [x.child, x]));
  const loadAt = (j, worlds) => {
    const Par = j.parent < 0 ? j.a : mul(worlds[j.parent], j.a), O = [Par[3], Par[7], Par[11]], Z = [Par[2], Par[6], Par[10]];
    const beyond = (k) => { for (let i = k, n = 0; i >= 0 && n < 99; n++) { const x = byChild.get(i); if (!x) return false; if (x === j) return true; i = x.parent; } return false; };
    let total = 0;
    for (const l of T.loads || []) {
      if (l.joint === j.id) total += l.value;
      else if (l.mass != null && beyond(l.item)) { const W = worlds[l.item], X = [W[0] * l.at[0] + W[1] * l.at[1] + W[2] * l.at[2] + W[3], W[4] * l.at[0] + W[5] * l.at[1] + W[6] * l.at[2] + W[7], W[8] * l.at[0] + W[9] * l.at[1] + W[10] * l.at[2] + W[11]], g = T.gravity || [0, 0, -1], len = Math.hypot(...g), F = g.map((c) => (c * l.mass * G) / len); total += j.type === 'prismatic' ? dot(Z, F) : dot(Z, cross(O.map((c, k) => X[k] - c), F)) / 1000; }
    }
    return Math.abs(total);
  };
  const updateStrip = (worlds, q, tip) => {
    let worst = Infinity;
    for (const t of DEG_T) { const j = mo.joints.find((x) => x.id === t.joint), load = j ? loadAt(j, worlds) : 0; worst = Math.min(worst, load > 1e-9 ? t.available / load : Infinity); }
    if (!DEG_T.length) setChip('torque', 'no load given', '');
    else if (!Number.isFinite(worst)) setChip('torque', 'no load here', 'ok');
    else setChip('torque', `${worst.toFixed(1)}×`, worst < 1 ? 'fail' : worst < 2 ? 'warn' : 'ok');
    const room = marginAt(chain, q, tip);
    setChip('reach', `${room.toFixed(0)} mm`, room <= 0 ? 'fail' : room < 10 ? 'warn' : 'ok');
    if (T.accuracy == null) setChip('accuracy', 'not asked', '');
    else { const J = jacobian(chain, q), lever = names.map((_, i) => Math.hypot(J[0][i], J[1][i], J[2][i])), e = (T.terms || []).reduce((t, [i, , deg]) => t + deg * lever[i], T.deflection || 0), m = e / T.accuracy; setChip('accuracy', `${e.toFixed(2)} of ${T.accuracy} mm`, m > 1 ? 'fail' : m > 0.8 ? 'warn' : 'ok'); }
    if (!T.heat) setChip('heat', 'no figures', '');
    else { const k = T.heat.case / T.heat.softening; setChip('heat', `${T.heat.case.toFixed(0)} of ${T.heat.softening} °C`, k > 1 ? 'fail' : k > 0.9 ? 'warn' : 'ok'); }
  };
  let current = names.map((n) => motion.values()[n][0]), tipAt = fk(chain, current).position;
  const moved = (worlds, values) => {
    current = names.map((n) => values[n][0]); tipAt = fk(chain, current).position;
    const at = toView(onPlane(...planeXY(tipAt))), a = pen.geometry.getAttribute('position'); a.setXYZ(0, ...at); a.needsUpdate = true; pen.geometry.computeBoundingSphere();
    updateStrip(worlds, current, tipAt);
  };
  motion.listen(moved);

  // ---------- the pen, dragged ----------
  const mode = $('toolmode'); $('tool').hidden = false;
  let busy = false, lastGood = null, down = false;
  const ray = new Raycaster(), at = new Vector2(), world = new Plane(), hit = new Vector3();
  const viewOn = new Vector3(), viewN = new Vector3(), onView = toView(onPlane(0, 0, 0)), nView = [P.n[0], P.n[2], -P.n[1]]; // (a direction, so no centring)
  viewOn.fromArray(onView); viewN.fromArray(nView);
  const pointOf = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    at.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    turn.updateWorldMatrix(true, false); ray.setFromCamera(at, camera);
    world.setFromNormalAndCoplanarPoint(viewN.clone().normalize(), viewOn).applyMatrix4(turn.matrixWorld);
    if (!ray.ray.intersectPlane(world, hit)) return null;
    return planeXY(fromView(turn.worldToLocal(hit.clone()).toArray()));
  };
  const follow = ([x, y]) => {
    const target = onPlane(x, y, 0);
    let r; try { r = ik(chain, target, { ...(T.elbow ? { elbow: T.elbow } : {}), start: lastGood ?? current }); } catch (e) { say('toolsay', e.message, true); return; }
    const onSheet = Math.abs(x) <= W2 && Math.abs(y) <= H2;
    if (!r.ok) { pen.material.color.setHex(0xe8806a); say('toolsay', `Out of reach: ${r.reason}`, true); return; }
    pen.material.color.setHex(0xffffff); lastGood = r.q; motion.set(names, r.q);
    say('toolsay', `${names.map((n, i) => `${mo.joints.find((j) => j.id === n)?.label || n} ${r.q[i].toFixed(1)}°`).join(', ')}. Pen at ${x.toFixed(1)}, ${y.toFixed(1)} mm${onSheet ? '' : ', off the sheet'}`);
    if (onSheet) { const v = toView(onPlane(x, y)); if (trailAt.length >= 6) trailAt.push(...trailAt.slice(-3), ...v); else trailAt.push(...v); trail.geometry.dispose(); trail.geometry = new BufferGeometry(); trail.geometry.setAttribute('position', new Float32BufferAttribute(trailAt, 3)); trail.visible = true; }
  };
  mode.onchange = () => {
    spin(false); busy = true;
    if (mode.checked) { if (cos > 0.7) tilt.rotation.x = 1.15; lastGood = current; say('toolsay', 'Drag the pen across the sheet: the joints follow'); }
    else { say('toolsay', reachNote); busy = false; }
  };
  const press = (e) => { if (!mode.checked || e.button > 0) return false; const p = pointOf(e); if (!p || Math.abs(p[0]) > area.width / 2 || Math.abs(p[1]) > area.height / 2) return false; player.stop(); down = true; follow(p); return true; };
  const drag = (e) => { if (!down) return false; const p = pointOf(e); if (p) follow(p); return true; };
  const release = () => { if (!down) return false; down = false; return true; };

  // ---------- playback ----------
  const lineGeo = new BufferGeometry(), line = new LineSegments(lineGeo, new LineBasicMaterial({ vertexColors: true })); line.visible = false; layer.add(line);
  const player = (() => {
    let plan = null, t = 0, playing = false;
    const fail = (text) => { say('playsay', text, true); $('player').hidden = false; };
    const seek = (to) => {
      if (!plan) return;
      t = Math.min(plan.T, Math.max(0, to));
      let lo = 0, hi = plan.frames.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (plan.frames[mid].t < t) lo = mid + 1; else hi = mid; }
      const b = plan.frames[lo], a = plan.frames[Math.max(0, lo - 1)], k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      motion.set(names, a.q.map((v, i) => v + (b.q[i] - v) * Math.max(0, Math.min(1, k))));
      let n = 0, end = plan.ends.length; while (n < end) { const m = (n + end) >> 1; if (plan.ends[m] <= t + 1e-9) n = m + 1; else end = m; }
      lineGeo.setDrawRange(0, n * 2); lineGeo.computeBoundingSphere(); line.visible = n > 0;
      $('scrub').value = plan.T ? t / plan.T : 0; $('playat').textContent = `${t.toFixed(1)} of ${plan.T.toFixed(1)} s`; plan.drawn = n;
      window.rulecadTool && (window.rulecadTool.drawn = n);
    };
    const go = (on) => { playing = on && !!plan; $('play').textContent = playing ? 'Pause' : 'Play'; };
    function load(raw) {
      let c;
      try { c = raw && Array.isArray(raw.b) ? raw : compactSteps(raw); } catch (e) { return fail(e.message); }
      const idx = names.map((n) => c.names.indexOf(n));
      if (idx.includes(-1)) return fail(`This step file drives ${c.names.join(', ')}, and this machine's joints are ${names.join(', ')}`);
      const per = idx.map((i) => c.spu[i]), frames = [], state = [...c.start];
      const qOf = () => idx.map((i, k) => state[i] / per[k]);
      let time = 0, pen = false; frames.push({ t: 0, q: qOf(), stroke: -1 });
      for (const r of c.b) {
        if (r[0] >= 2) { pen = r[0] === 3; time += r[1] / 1000; frames.push({ t: time, q: qOf(), stroke: -1, pen }); continue; }
        r.slice(3).forEach((s, k) => { state[k] += s; });
        time += r[1] / 1000; frames.push({ t: time, q: qOf(), stroke: r[0] === 1 ? r[2] : -1, pen });
      }
      // The pen's path on each stroke, with the times it's there: each drawn point's moment, by how far along it is
      const byStroke = new Map();
      frames.forEach((f, i) => { if (f.stroke < 0) return; if (!byStroke.has(f.stroke)) byStroke.set(f.stroke, []); byStroke.get(f.stroke).push(i); });
      const tipOf = (i) => fk(chain, frames[i].q).position, segs = [];
      for (const [stroke, pts, err] of c.drawn) {
        const ids = byStroke.get(stroke); if (!ids || pts.length < 6) continue;
        const P3 = []; for (let i = 0; i < pts.length; i += 3) P3.push([pts[i] / 100, pts[i + 1] / 100, pts[i + 2] / 100]);
        const along = [Math.max(0, ids[0] - 1), ...ids], A = along.map(tipOf), ts = along.map((i) => frames[i].t), lens = [0]; let L = 0;
        for (let i = 1; i < A.length; i++) { L += Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1], A[i][2] - A[i - 1][2]); lens.push(L); }
        let run = 0, S = 0; const arc = P3.map((p, i) => (i ? (S += Math.hypot(p[0] - P3[i - 1][0], p[1] - P3[i - 1][1], p[2] - P3[i - 1][2])) : 0)), total = arc.at(-1) || 1, time_ = (s) => { const want = (s / total) * L; while (run < lens.length - 2 && lens[run + 1] < want) run++; const span = lens[run + 1] - lens[run] || 1; return ts[run] + ((want - lens[run]) / span) * (ts[run + 1] - ts[run]); };
        const limit = T.accuracy ?? Math.max(1e-6, ...(err || [1]).map((x) => x / 1000));
        for (let i = 1; i < P3.length; i++) segs.push({ end: Math.min(time, time_(arc[i])), a: P3[i - 1], b: P3[i], c: errorColour(err ? (err[i - 1] + err[i]) / 2000 : 0, limit) });
      }
      segs.sort((a, b) => a.end - b.end);
      lineGeo.setAttribute('position', new Float32BufferAttribute(segs.flatMap((s) => [...toView(onPlane(...planeXY(s.a))), ...toView(onPlane(...planeXY(s.b)))]), 3));
      lineGeo.setAttribute('color', new Float32BufferAttribute(segs.flatMap((s) => [...s.c, ...s.c]), 3));
      plan = { frames, T: time || 1e-3, ends: segs.map((s) => s.end), drawn: 0 };
      $('player').hidden = false; say('playsay', `${c.name || 'A drawing'}: ${c.drawn.length} line${c.drawn.length === 1 ? '' : 's'}, in its predicted-error colour`);
      seek(0); go(false);
      if (!window.rulecadTool) window.rulecadTool = {}; // for the page's tests, and anyone curious
      window.rulecadTool.segments = segs.length; window.rulecadTool.time = plan.T;
      spin(false);
    }
    return { load, stop: () => go(false), toggle: () => { if (plan && t >= plan.T - 1e-9) seek(0); go(!playing); }, seek, frame: (dt, speed) => { if (!playing) return; seek(t + dt * speed); if (t >= plan.T - 1e-9) { go(false); say('playsay', 'Finished'); } }, ended: () => !!plan && t >= plan.T - 1e-9 };
  })();
  $('play').onclick = () => player.toggle();
  $('scrub').oninput = (e) => { player.stop(); if (window.rulecadTool?.time) player.seek(Number(e.target.value) * window.rulecadTool.time); };
  const speed = $('speed'); let last = 0;
  // A step file chosen, or dropped anywhere on the page
  const openFile = async (file) => { if (!file) return; try { player.load(JSON.parse(await file.text())); } catch (e) { say('playsay', `${file.name} isn't a step file: ${e.message}`, true); $('player').hidden = false; } };
  $('stepload').onclick = () => $('stepfile').click();
  $('stepfile').onchange = (e) => openFile(e.target.files[0]);
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => { e.preventDefault(); openFile(e.dataTransfer?.files?.[0]); });
  if (model.steps) player.load(model.steps);
  window.rulecadTool = Object.assign(window.rulecadTool || {}, { project: (x, y) => { const p = new Vector3(...toView(onPlane(x, y))); turn.localToWorld(p); p.project(camera); const rect = renderer.domElement.getBoundingClientRect(); return [(p.x + 1) / 2 * rect.width + rect.left, (1 - p.y) / 2 * rect.height + rect.top]; }, pen: () => planeXY(tipAt), ended: () => player.ended() });
  return { press, drag, release, frame: (now) => { if (last) player.frame(Math.min(0.1, (now - last) / 1000), Number(speed.value) || 1); last = now; } };
}

// ---------- the build page ----------
// A link as the whole project, beside the model: what to buy, the plates, the wiring sheet, the assembly steps (each
// showing the model at that step, the new part held off along its way on) and the machine's settings. All of it the
// link's data, written as text.
function buildPage(model, { apply, view, foot, narrow, panel, spin }) {
  const box = $('build'), b = model.build, btn = $('buildbtn');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const section = (title, ...kids) => { const s = el('section'); s.append(el('h2', null, title), ...kids); return s; };
  const table = (heads, rows) => { const w = el('div', 'wrap'), t = el('table'), head = el('tr'); head.append(...heads.map((h) => el('th', null, h))); t.append(head); for (const r of rows) { const tr = el('tr'); tr.append(...r.map((c) => { const td = el('td', typeof c === 'number' ? 'num' : null, c == null ? '' : String(c)); return td; })); t.append(tr); } w.append(t); return w; };
  const trouble = (x) => el('p', 'problem-line', `Couldn't make this part of the page: ${x.error}`);
  const head = el('div', 'buildhead'), close = el('button', null, 'Close'); head.append(el('h2', null, 'Build'), close);
  const parts = [head];
  // What to buy
  const L = b.list;
  if (L?.error) parts.push(section('What to buy', trouble(L)));
  else if (L) {
    const kids = [];
    if (L.bought?.length) kids.push(el('h3', null, 'Bought'), table(['Qty', 'Part', 'What', 'Items'], L.bought.map((x) => [x.qty, `${x.set}${x.variant ? ` (${x.variant})` : ''}`, x.part, x.items.join(', ')])));
    if (L.fasteners?.length) kids.push(el('h3', null, 'Fasteners'), table(['Qty', 'Fastener', 'Where'], L.fasteners.map((x) => [x.qty, x.fastener, x.from.join('; ')])));
    if (L.wires?.length) kids.push(el('h3', null, 'Wire'), table(['mm', 'Gauge', 'Runs'], L.wires.map((x) => [x.length, x.gauge ?? 'not given', x.runs.join(', ')])));
    if (L.printed?.length) kids.push(el('h3', null, `Printed (${L.totals.material})`), table(['Grams', 'Minutes', 'Part'], L.printed.map((x) => [x.grams, x.minutes, x.id])));
    kids.push(el('p', null, `${L.totals.printedGrams} g printed, about ${L.totals.minutes} min of printing, ${L.totals.machineGrams} g as a machine${L.totals.noMassFor ? ` (no mass for ${L.totals.noMassFor.join(', ')})` : ''}.`));
    parts.push(section('What to buy', ...kids));
  }
  // Plates
  const PL = b.plates;
  if (PL?.error) parts.push(section('Plates', trouble(PL)));
  else if (PL) parts.push(section('Plates', ...PL.plates.flatMap((p) => {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), tag = (n, a) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
    svg.setAttribute('viewBox', `0 0 ${PL.bed} ${PL.bed}`); svg.setAttribute('class', 'bed');
    for (const q of p.parts) { const r = tag('rect', { x: q.x, y: PL.bed - q.y - q.d, width: q.w, height: q.d, fill: 'rgba(255,255,255,0.12)', stroke: '#b4b4b4', 'stroke-width': 0.6 }), t = tag('title', {}); t.textContent = `${q.id}: ${q.w} × ${q.d} mm`; r.append(t); const lab = tag('text', { x: q.x + q.w / 2, y: PL.bed - q.y - q.d / 2, 'font-size': Math.min(8, q.d * 0.5), 'text-anchor': 'middle', 'dominant-baseline': 'middle' }); lab.textContent = q.id; svg.append(r, lab); }
    return [el('h3', null, `${p.name} (${p.filament})`), el('p', null, `${p.parts.length} part${p.parts.length === 1 ? '' : 's'}, ${p.grams} g, about ${p.minutes} min`), svg];
  }), el('p', null, `Parts ${PL.gap} mm apart. Print each with cad export <project>/<plate>.`)));
  // Wiring
  if (b.wires?.error) parts.push(section('Wiring', trouble(b.wires)));
  else if (b.wires?.length) parts.push(section('Wiring', table(['Wire', 'From', 'To', 'mm', 'Gauge', 'Cores', 'Colour', 'Connectors', 'Board pins', 'Carries'], b.wires.map((w) => [w.id, w.from, w.to, w.length, w.gauge ?? '', w.conductors, w.colour ?? '', Array.isArray(w.connectors) ? w.connectors.join(' to ') : w.connectors ?? '', w.pins ?? '', `${Number(w.current.toFixed(2))} A, ${w.why}`]))));
  // Steps
  const O = b.order;
  if (O) {
    if (O.error) parts.push(section('Assembly', trouble(O)));
    else if (O.stuck) parts.push(section('Assembly', el('p', 'problem-line', O.stuck.text)));
    else {
      const ol = el('ol', 'steps');
      O.steps.forEach((st, i) => {
        const li = el('li'), but = el('button'); but.append(`${st.n}. ${st.items.join(', ')}${st.object && !st.items.includes(st.object) ? ` (${st.object})` : ''}`); if (st.fasteners.length) but.append(el('span', 'fix', st.fasteners.map((f) => `${f.fit}${f.fastener ? ` (${f.count != null ? `${f.count} × ` : ''}${f.fastener})` : ''}`).join('; ')));
        const shown = new Set(O.steps.slice(0, i + 1).flatMap((x) => x.items));
        but.onclick = () => { const on = view.step?.n === st.n; view.step = on ? null : { n: st.n, shown, now: new Set(st.items), dir: st.dir }; if (!on) spin(false); box.querySelectorAll('ol.steps button').forEach((x) => x.classList.toggle('on', !on && x === but)); apply(); };
        li.append(but); ol.append(li);
      });
      parts.push(section('Assembly', ol));
    }
  }
  // Settings
  const M = b.machine;
  if (M?.error) parts.push(section('Machine settings', trouble(M)));
  else if (M) parts.push(section('Machine settings', el('p', null, `${M.kinematics} machine, tool ${M.tool}, speed ${M.task.speed ?? '?'} mm/s, accuracy ${M.task.accuracy ?? '?'} mm, acceleration ${M.task.accel} mm/s²`), table(['Axis', 'Motor', 'Steps per', 'Range', 'Max steps/s', 'Micro', 'Ratio', 'Homing'], M.axes.map((a) => [a.name, a.model, `${a.stepsPerUnit} per ${a.unit}`, `${a.limits[0]} to ${a.limits[1]} ${a.unit}`, a.maxRate, `1/${a.microsteps}`, a.ratio, a.homing ? `${a.homing.endstop}, ${a.homing.direction > 0 ? '+' : '-'}` : 'none']))));
  box.replaceChildren(...parts);
  let panelWas = false; // the parts panel makes way (on a phone, the footer too), and comes back with it
  const set = (on) => {
    if (on) panelWas = !$('panel').hidden;
    box.hidden = !on; if (on) panel(false);
    if (narrow.matches) foot.hidden = on;
    if (!on) { if (panelWas) panel(true); view.step = null; box.querySelectorAll('ol.steps button.on').forEach((x) => x.classList.remove('on')); apply(); }
  };
  btn.hidden = false; btn.onclick = () => set(box.hidden); close.onclick = () => set(false);
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

// A dropped file's print check, in the rules panel
function showFindings(findings) {
  $('rules').replaceChildren(...findings.map((f) => {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = { pass: '✓', warn: '!', fail: '✗', info: '·' }[f.level]; li.append(b, ` ${f.text}`); return li;
  }));
}

function open(model, hash, findings) {
  split();
  const project = show(model);
  flatViews(model);
  if (findings) showFindings(findings);
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
      // The quick checks at once (no slicing), the page up and turning; then the whole check, sliced, off the page's
      // thread, its findings in place of these when it's done
      const said = { level: 'pass', text: `checked for a ${PRINTER.bed} mm bed, ${PRINTER.overhang}° overhangs, ${PRINTER.bridge} mm bridges, Z up` };
      open(model, hash, [...check(tris, PRINTER, { slice: false }).filter((f) => f.code !== 'print.unsliced'), { level: 'info', text: 'slicing it, layer by layer…' }, said]);
      const worker = new Worker(new URL('./check.mjs', import.meta.url), { type: 'module' }), flat = Float32Array.from(tris.flat(2));
      worker.onmessage = ({ data }) => { worker.terminate(); showFindings(data.findings ? [...data.findings, said] : [{ level: 'warn', text: `the sliced check stopped: ${data.error}` }, said]); };
      worker.postMessage({ tris: flat, printer: PRINTER }, [flat.buffer]);
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
