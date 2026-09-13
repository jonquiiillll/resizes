/**
 * Panel wiring: reads the active document's layer tree, lets the user tag
 * each layer with a role (roles.js), pick target sizes (presets.js or
 * custom), pick an output folder, and kicks off engine.js.
 */

const { app } = require("photoshop");
const uxp = require("uxp");
const { ROLES, guessRole } = require("./roles");
const { PRESET_GROUPS } = require("./presets");
const { flattenLayers, pathKey } = require("./layerTree");
const { generateAll } = require("./engine");

const state = {
  flat: [], // [{layer, indexPath, depth}]
  roleAssignments: new Map(), // pathKey -> {role, corner}
  targets: [], // [{w,h,label}]
  outputFolder: null
};

const CORNER_OPTIONS = [
  ["top-left", "top-left"],
  ["top-right", "top-right"],
  ["bottom-left", "bottom-left"],
  ["bottom-right", "bottom-right"]
];

const ROLES_NEEDING_CORNER = new Set([
  "logo",
  "legal",
  "hero",
  "decor",
  "text_primary",
  "text_secondary"
]);

function log(msg) {
  const el = document.getElementById("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

// ---- persistence (best-effort; a fresh panel session still works fine) ----

function storageKeyFor(docName) {
  return `autoresize:${docName}`;
}

function saveAssignments(docName) {
  try {
    const obj = {};
    for (const [k, v] of state.roleAssignments.entries()) obj[k] = v;
    localStorage.setItem(storageKeyFor(docName), JSON.stringify(obj));
  } catch (e) {
    // localStorage can be unavailable in some UXP hosts - not fatal
  }
}

function loadAssignments(docName) {
  try {
    const raw = localStorage.getItem(storageKeyFor(docName));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const m = new Map();
    for (const k of Object.keys(obj)) m.set(k, obj[k]);
    return m;
  } catch (e) {
    return null;
  }
}

// ---- layer list UI ---------------------------------------------------

function refreshLayers() {
  const doc = app.activeDocument;
  const docNameEl = document.getElementById("docName");
  const listEl = document.getElementById("layerList");
  listEl.innerHTML = "";

  if (!doc) {
    docNameEl.textContent = "Нет активного документа";
    state.flat = [];
    return;
  }

  docNameEl.textContent = `${doc.name} — ${doc.width}×${doc.height}`;
  state.flat = flattenLayers(doc);

  const restored = loadAssignments(doc.name);
  if (restored) {
    state.roleAssignments = restored;
  }

  for (const entry of state.flat) {
    const { layer, indexPath, depth } = entry;
    const key = pathKey(indexPath);

    if (!state.roleAssignments.has(key)) {
      state.roleAssignments.set(key, { role: guessRole(layer.name), corner: null });
    }
    const cfg = state.roleAssignments.get(key);

    const row = document.createElement("div");
    row.className = "layer-row";
    row.style.paddingLeft = `${depth * 14}px`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = layer.name;
    nameSpan.title = layer.name;
    row.appendChild(nameSpan);

    const roleSelect = document.createElement("select");
    for (const r of ROLES) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.label;
      if (r.id === cfg.role) opt.selected = true;
      roleSelect.appendChild(opt);
    }
    roleSelect.addEventListener("change", () => {
      cfg.role = roleSelect.value;
      state.roleAssignments.set(key, cfg);
      cornerSelect.style.display = ROLES_NEEDING_CORNER.has(cfg.role) ? "" : "none";
      saveAssignments(doc.name);
    });
    row.appendChild(roleSelect);

    const cornerSelect = document.createElement("select");
    const autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "авто-угол";
    cornerSelect.appendChild(autoOpt);
    for (const [val, label] of CORNER_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (cfg.corner === val) opt.selected = true;
      cornerSelect.appendChild(opt);
    }
    cornerSelect.style.display = ROLES_NEEDING_CORNER.has(cfg.role) ? "" : "none";
    cornerSelect.addEventListener("change", () => {
      cfg.corner = cornerSelect.value || null;
      state.roleAssignments.set(key, cfg);
      saveAssignments(doc.name);
    });
    row.appendChild(cornerSelect);

    listEl.appendChild(row);
  }
}

// ---- target size UI ---------------------------------------------------

function sizeExists(w, h) {
  return state.targets.some((t) => t.w === w && t.h === h);
}

function addTarget(w, h) {
  if (!w || !h || sizeExists(w, h)) return;
  state.targets.push({ w, h, label: `${w}x${h}` });
  renderSelectedSizes();
}

function removeTarget(w, h) {
  state.targets = state.targets.filter((t) => !(t.w === w && t.h === h));
  renderSelectedSizes();
  // also uncheck matching preset checkbox, if any
  document
    .querySelectorAll(`input[data-w="${w}"][data-h="${h}"]`)
    .forEach((cb) => (cb.checked = false));
}

function renderSelectedSizes() {
  const el = document.getElementById("selectedSizes");
  el.innerHTML = "";
  for (const t of state.targets) {
    const tag = document.createElement("span");
    tag.className = "size-tag";
    const label = document.createElement("span");
    label.textContent = t.label;
    tag.appendChild(label);
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.addEventListener("click", () => removeTarget(t.w, t.h));
    tag.appendChild(btn);
    el.appendChild(tag);
  }
}

function renderPresetGroups() {
  const container = document.getElementById("presetGroups");
  container.innerHTML = "";
  for (const group of PRESET_GROUPS) {
    const groupEl = document.createElement("div");
    groupEl.className = "preset-group";
    const label = document.createElement("div");
    label.className = "group-label";
    label.textContent = group.label;
    groupEl.appendChild(label);

    for (const size of group.sizes) {
      const chip = document.createElement("label");
      chip.className = "preset-chip";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.w = size.w;
      cb.dataset.h = size.h;
      cb.addEventListener("change", () => {
        if (cb.checked) addTarget(size.w, size.h);
        else removeTarget(size.w, size.h);
      });
      chip.appendChild(cb);
      const txt = document.createElement("span");
      txt.textContent = `${size.w}×${size.h}`;
      chip.appendChild(txt);
      groupEl.appendChild(chip);
    }
    container.appendChild(groupEl);
  }
}

// ---- folder picker + generate -----------------------------------------

async function pickFolder() {
  const fs = uxp.storage.localFileSystem;
  const folder = await fs.getFolder();
  if (folder) {
    state.outputFolder = folder;
    document.getElementById("folderPath").textContent = folder.nativePath || folder.name;
  }
}

async function generate() {
  const doc = app.activeDocument;
  if (!doc) {
    log("Нет активного документа.");
    return;
  }
  if (!state.targets.length) {
    log("Не выбрано ни одного целевого размера.");
    return;
  }
  if (!state.outputFolder) {
    log("Сначала выбери папку для сохранения.");
    return;
  }

  const fmt = document.querySelector('input[name="fmt"]:checked').value;
  document.getElementById("log").textContent = "";
  log(`Старт: ${state.targets.length} размер(ов), формат ${fmt.toUpperCase()}`);

  try {
    await generateAll(doc, state.roleAssignments, state.targets, state.outputFolder, {
      onProgress: log,
      exportFormat: fmt
    });
  } catch (err) {
    log(`Ошибка: ${err.message}`);
  }
}

// ---- wire up --------------------------------------------------------

document.getElementById("btnRefresh").addEventListener("click", refreshLayers);
document.getElementById("btnPickFolder").addEventListener("click", pickFolder);
document.getElementById("btnGenerate").addEventListener("click", generate);
document.getElementById("btnAddSize").addEventListener("click", () => {
  const w = parseInt(document.getElementById("customW").value, 10);
  const h = parseInt(document.getElementById("customH").value, 10);
  addTarget(w, h);
});

renderPresetGroups();
refreshLayers();
