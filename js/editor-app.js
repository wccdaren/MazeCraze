import { parseMap, coordinates, splitList } from "./spec.js";
import { playtestMessage, isPlaytestMessage } from "./playtest-protocol.js";
import { readEditorDirectory, readEditorWebsiteText } from "./editor-directory.js";
import {
  EDITOR_TYPES,
  EDITOR_SUBJECTS,
  EDITOR_COMPARISONS,
  EDITOR_LOCATIONS,
  cloneDocument,
  importMap,
  exportMap,
  createMap,
  nextBlock,
  saveBlock,
  duplicateBlock,
  deleteBlock,
  applyMapSettings,
  lineCells,
  fillCells,
  validateDocument,
  EditorHistory,
} from "./editor-model.js";

// This source is bundled into editor.html; the distributed editor needs no server.
// WEBSITE SETUP: Change this path if main-config.txt is not beside editor.html.
const EDITOR_MAIN_CONFIG_PATH = "./main-config.txt";
const studio = (id) => document.getElementById(id);
const formControl = (form, name) => form.elements.namedItem(name);
const singleLine = (value) =>
  String(value)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
const ORIGIN = 28;
let draft = createMap(),
  history = new EditorHistory(draft),
  selectedIndex = 3,
  activeTool = "paint";
let editingIndex = null,
  blockOriginal,
  originalText = "",
  cursor = { x: 1, y: 1 },
  stroke = null,
  drawQueued = false;
const localImages = new Map(),
  decodedImages = new Map();
let websiteDirectory = null, websiteDirectoryLoading = false, websiteMapLoading = false;

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function actionButton(text, action, className = "") {
  const button = node("button", text, className);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}
function selectControl(options, value) {
  const select = document.createElement("select");
  for (const option of options) {
    const el = node(
      "option",
      typeof option === "string" ? option : option.label,
    );
    el.value = typeof option === "string" ? option : option.value;
    select.append(el);
  }
  select.value = value ?? options[0]?.value ?? options[0] ?? "";
  return select;
}
function field(label, value = "", options = {}) {
  const wrapper = node("label", label),
    input = options.options
      ? selectControl(options.options, value)
      : document.createElement(options.multiline ? "textarea" : "input");
  if (!options.options) input.value = value;
  if (options.multiline) input.rows = 2;
  if (options.list) input.setAttribute("list", options.list);
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required) input.required = true;
  if (options.pattern) input.pattern = options.pattern;
  input.classList.add("control");
  wrapper.append(input);
  return { wrapper, input };
}
function tell(message, error = false) {
  studio("status").textContent = message;
  studio("status").classList.toggle("error", error);
}
function report(error, element) {
  if (element) element.textContent = error.message;
  else tell(error.message, true);
}
function canReplace() {
  return (
    !history.dirty(draft) ||
    window.confirm(
      "You have changes that have not been exported. Replace this map?",
    )
  );
}
function parsedDraft(candidate) {
  return parseMap(exportMap(candidate), Number(candidate.map.ID));
}
function commit(candidate, label) {
  parsedDraft(candidate);
  history.push(draft, label);
  draft = candidate;
  renderStudio();
  tell(label);
}
function change(label, edit) {
  const candidate = cloneDocument(draft);
  const result = edit(candidate);
  commit(candidate, label);
  return result;
}
function replaceDocument(candidate, text = "") {
  draft = candidate;
  history.reset(draft);
  originalText = text;
  selectedIndex = draft.blocks[0].index;
  cursor = { x: 1, y: 1 };
  renderStudio();
  tell(
    `${draft.map.Name || draft.filename} opened. ${draft.importWarnings.length ? "Some original map rows were skipped; review Map checks below." : "Ready to draw."}`,
  );
}
function closeStudioDialog(id) {
  studio(id).close();
  studio("map-canvas").focus({ preventScroll: true });
}
function downloadText(text, filename) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[^A-Za-z0-9_.-]/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function basename(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .split(/[?#]/)[0];
}
function previewSource(value) {
  if (!value) return null;
  const name = basename(value);
  if (localImages.has(name)) return localImages.get(name);
  if (EDITOR_BUNDLED.images[name]) return EDITOR_BUNDLED.images[name];
  if (!studio("allow-image-urls").checked) return null;
  try {
    const base =
      studio("image-base").value.trim() ||
      new URL("./maps/", location.href).href;
    const url = new URL(value, base);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.origin === location.origin))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function previewImage(value) {
  const source = previewSource(value);
  if (!source) return null;
  if (!decodedImages.has(source)) {
    const image = new Image();
    decodedImages.set(source, image);
    image.referrerPolicy = "no-referrer";
    image.onload = scheduleDraw;
    image.onerror = scheduleDraw;
    image.src = source;
  }
  const image = decodedImages.get(source);
  return image.complete && image.naturalWidth > 0 ? image : null;
}
function thumbnail(value, description) {
  const source = previewSource(value);
  if (!source) return node("span", "◇", "block-thumbnail");
  const image = document.createElement("img");
  image.src = source;
  image.alt = description;
  image.referrerPolicy = "no-referrer";
  image.addEventListener(
    "error",
    () => {
      image.replaceWith(node("span", "◇", "block-thumbnail"));
    },
    { once: true },
  );
  return image;
}
function blockFor(index) {
  return index === 777
    ? {
        index: 777,
        fields: {
          Description: "Save the princess!",
          Type: "Interaction",
          NID: "Built-in 777",
          MapImage: "../assets/princess.png",
        },
        choices: [],
      }
    : draft.blocks.find((block) => block.index === index);
}
function selectBlock(index) {
  selectedIndex = index;
  // Keep palette elements in place: replacing a dragged element cancels a native drag.
  for (const button of studio("palette").querySelectorAll(".palette-block"))
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.index) === index),
    );
  renderSelected();
}
function renderSelected() {
  const block = blockFor(selectedIndex);
  studio("selected-name").textContent = block.fields.Description;
  studio("selected-details").textContent =
    `${block.index} · ${block.fields.Type} · ${block.fields.NID}`;
  studio("edit-block").disabled = selectedIndex === 777;
}
function renderPalette() {
  const palette = studio("palette");
  palette.replaceChildren();
  const query = studio("block-search").value.toLowerCase(),
    type = studio("type-filter").value;
  for (const block of [...draft.blocks, blockFor(777)]) {
    const fields = block.fields;
    if (
      (type && fields.Type !== type) ||
      !`${fields.Description} ${fields.NID} ${block.index}`
        .toLowerCase()
        .includes(query)
    )
      continue;
    const button = actionButton(
      "",
      () => selectBlock(block.index),
      "palette-block",
    );
    button.setAttribute("aria-pressed", String(block.index === selectedIndex));
    button.dataset.index = block.index;
    button.draggable = true;
    button.append(thumbnail(fields.MapImage, fields.Description));
    const info = node("span");
    info.append(
      node("strong", `${block.index} · ${fields.Description}`),
      node("small", `${fields.Type} · ${fields.NID}`),
    );
    button.append(info);
    button.addEventListener("dblclick", () => {
      if (block.index !== 777) openBlock(block.index);
    });
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData(
        "application/x-mazecraze-block",
        String(block.index),
      );
      event.dataTransfer.effectAllowed = "copy";
      selectBlock(block.index);
    });
    palette.append(button);
  }
  if (!palette.childNodes.length)
    palette.append(node("p", "No matching blocks.", "hint"));
}
function scheduleDraw() {
  if (!drawQueued) {
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      drawCanvas();
    });
  }
}
function drawCanvas() {
  const canvas = studio("map-canvas"),
    size = Number(studio("zoom").value),
    context = canvas.getContext("2d");
  const width = ORIGIN + draft.width * size,
    height = ORIGIN + draft.height * size;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#dedfc7";
  context.fillRect(0, 0, width, height);
  context.font = "10px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#4e5b44";
  context.fillText("Y/X", 14, 13);
  for (let x = 1; x <= draft.width; x++)
    context.fillText(String(x), ORIGIN + (x - 0.5) * size, 13);
  for (let y = draft.height; y >= 1; y--)
    context.fillText(String(y), 13, ORIGIN + (draft.height - y + 0.5) * size);
  const blocks = new Map(draft.blocks.map((block) => [block.index, block]));
  blocks.set(777, blockFor(777));
  for (let y = 1; y <= draft.height; y++)
    for (let x = 1; x <= draft.width; x++) {
      const block = blocks.get(draft.cells[y - 1][x - 1]),
        px = ORIGIN + (x - 1) * size,
        py = ORIGIN + (draft.height - y) * size;
      const image = block && previewImage(block.fields.MapImage);
      if (image) context.drawImage(image, px, py, size, size);
      else {
        context.fillStyle =
          {
            Move: "#85a363",
            Wall: "#62765b",
            Interaction: "#c7a264",
            Inventory: "#9cafa1",
          }[block?.fields.Type] || "#9b7370";
        context.fillRect(px, py, size, size);
        context.fillStyle = "#243b28";
        context.font = `${Math.max(9, size / 3)}px system-ui`;
        context.fillText(
          String(block?.index ?? "?"),
          px + size / 2,
          py + size / 2,
        );
      }
    }
  context.strokeStyle = "#173c2c35";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= draft.width; x++) {
    context.moveTo(ORIGIN + x * size + 0.5, ORIGIN);
    context.lineTo(ORIGIN + x * size + 0.5, height);
  }
  for (let y = 0; y <= draft.height; y++) {
    context.moveTo(ORIGIN, ORIGIN + y * size + 0.5);
    context.lineTo(width, ORIGIN + y * size + 0.5);
  }
  context.stroke();
  const start = coordinates(draft.map.StartingLocation);
  if (start) {
    const px = ORIGIN + (start.x - 0.5) * size,
      py = ORIGIN + (draft.height - start.y + 0.5) * size;
    context.fillStyle = "#102c21e0";
    context.beginPath();
    context.arc(px, py, Math.max(7, size * 0.34), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#edffb5";
    context.stroke();
    context.fillStyle = "#edffb5";
    context.font = `bold ${Math.max(10, size * 0.4)}px system-ui`;
    context.fillText("S", px, py);
  }
  if (stroke?.tool === "rectangle") {
    const minX = Math.min(stroke.from.x, stroke.to.x),
      maxX = Math.max(stroke.from.x, stroke.to.x);
    const minY = Math.min(stroke.from.y, stroke.to.y),
      maxY = Math.max(stroke.from.y, stroke.to.y);
    context.fillStyle = "#edffb560";
    context.fillRect(
      ORIGIN + (minX - 1) * size,
      ORIGIN + (draft.height - maxY) * size,
      (maxX - minX + 1) * size,
      (maxY - minY + 1) * size,
    );
  }
  context.strokeStyle = "#f8efb1";
  context.lineWidth = 2;
  context.strokeRect(
    ORIGIN + (cursor.x - 1) * size + 1,
    ORIGIN + (draft.height - cursor.y) * size + 1,
    size - 2,
    size - 2,
  );
  canvas.dataset.tool = activeTool;
  canvas.setAttribute(
    "aria-label",
    `${draft.map.Name}. ${draft.width} columns, ${draft.height} rows. Cursor X ${cursor.x}, Y ${cursor.y}.`,
  );
  const here = blockFor(draft.cells[cursor.y - 1]?.[cursor.x - 1]);
  studio("coordinate-readout").textContent =
    `X ${cursor.x} · Y ${cursor.y}${here ? ` · ${here.fields.Description}` : ""}`;
}
function renderValidation() {
  const result = validateDocument(draft),
    list = studio("validation-list");
  list.replaceChildren();
  const imported = draft.importWarnings.map(
    (message) => `Original import: ${message}`,
  );
  studio("validation-summary").textContent =
    `Map checks · ${result.errors.length} errors · ${result.warnings.length + imported.length} notes`;
  for (const message of result.errors)
    list.append(node("li", message, "validation-error"));
  for (const message of [...imported, ...result.warnings])
    list.append(node("li", message));
  if (!list.childNodes.length)
    list.append(
      node("li", "Ready to export. The map matches the game format."),
    );
  if (result.errors.length || imported.length)
    studio("validation-panel").open = true;
  studio("download-original").hidden = !originalText;
  return result;
}
function renderStudio() {
  if (!blockFor(selectedIndex)) selectedIndex = draft.blocks[0].index;
  cursor.x = Math.min(draft.width, Math.max(1, cursor.x));
  cursor.y = Math.min(draft.height, Math.max(1, cursor.y));
  studio("document-name").textContent = draft.map.Name || draft.filename;
  studio("canvas-heading").textContent = draft.map.Name || draft.filename;
  studio("document-state").textContent =
    `${draft.filename} · ${history.dirty(draft) ? "Unexported changes" : "No unexported changes"}`;
  studio("dimensions-badge").textContent = `${draft.width} × ${draft.height}`;
  studio("undo").disabled = !history.undoStack.length;
  studio("redo").disabled = !history.redoStack.length;
  studio("undo").setAttribute(
    "aria-label",
    `Undo ${history.undoStack.at(-1)?.label || ""}`,
  );
  studio("redo").setAttribute(
    "aria-label",
    `Redo ${history.redoStack.at(-1)?.label || ""}`,
  );
  studio("jump-x").max = draft.width;
  studio("jump-y").max = draft.height;
  const nids = studio("nid-suggestions");
  nids.replaceChildren();
  for (const block of draft.blocks) {
    const option = node("option");
    option.value = block.fields.NID;
    option.label = block.fields.Description;
    nids.append(option);
  }
  renderPalette();
  renderSelected();
  drawCanvas();
  renderValidation();
  refreshTestControls();
}
function setTool(tool) {
  activeTool = tool;
  document
    .querySelectorAll("button[data-tool]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool)),
    );
  scheduleDraw();
}
function eventCell(event) {
  const rect = studio("map-canvas").getBoundingClientRect(),
    size = Number(studio("zoom").value);
  const x = Math.floor((event.clientX - rect.left - ORIGIN) / size) + 1,
    y = draft.height - Math.floor((event.clientY - rect.top - ORIGIN) / size);
  return x >= 1 && x <= draft.width && y >= 1 && y <= draft.height
    ? { x, y }
    : null;
}
function currentPaintIndex() {
  return activeTool === "erase"
    ? draft.blocks.find((block) => block.fields.NID === draft.map.DefaultBlock)
        .index
    : selectedIndex;
}
function applyAt(cell) {
  if (activeTool === "pick") {
    selectBlock(draft.cells[cell.y - 1][cell.x - 1]);
    tell(`Picked ${blockFor(selectedIndex).fields.Description}.`);
    return;
  }
  if (activeTool === "pan") return;
  change(
    activeTool === "start"
      ? "Starting location updated"
      : activeTool === "fill"
        ? "Connected area filled"
        : "Cell painted",
    (next) => {
      if (activeTool === "start")
        next.map.StartingLocation = `(${cell.x},${cell.y})`;
      else if (activeTool === "fill")
        fillCells(next, cell.x, cell.y, selectedIndex);
      else next.cells[cell.y - 1][cell.x - 1] = currentPaintIndex();
    },
  );
}
function paintStroke(cell) {
  const index = stroke.index;
  for (const point of lineCells(stroke.to, cell))
    if (draft.cells[point.y - 1][point.x - 1] !== index) {
      draft.cells[point.y - 1][point.x - 1] = index;
      stroke.changed = true;
    }
  stroke.to = cell;
  scheduleDraw();
}
const canvas = studio("map-canvas");
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || stroke) return;
  canvas.focus({ preventScroll: true });
  if (activeTool === "pan") {
    stroke = {
      tool: "pan",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: studio("canvas-scroll").scrollLeft,
      top: studio("canvas-scroll").scrollTop,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const cell = eventCell(event);
  if (!cell) return;
  event.preventDefault();
  cursor = cell;
  if (["fill", "start", "pick"].includes(activeTool)) {
    try {
      applyAt(cell);
    } catch (error) {
      report(error);
    }
    return;
  }
  stroke = {
    tool: activeTool,
    pointerId: event.pointerId,
    before: cloneDocument(draft),
    from: cell,
    to: cell,
    index: currentPaintIndex(),
    changed: false,
  };
  canvas.setPointerCapture(event.pointerId);
  if (activeTool !== "rectangle") paintStroke(cell);
  else scheduleDraw();
});
canvas.addEventListener("pointermove", (event) => {
  if (stroke?.tool === "pan") {
    studio("canvas-scroll").scrollLeft = stroke.left + stroke.x - event.clientX;
    studio("canvas-scroll").scrollTop = stroke.top + stroke.y - event.clientY;
    return;
  }
  const cell = eventCell(event);
  if (!cell) return;
  cursor = cell;
  if (stroke && event.pointerId === stroke.pointerId) {
    if (stroke.tool === "rectangle") stroke.to = cell;
    else paintStroke(cell);
  }
  scheduleDraw();
});
function finishStroke(event, cancelled = false) {
  if (!stroke || event.pointerId !== stroke.pointerId) return;
  const ended = stroke;
  if (cancelled && ended.before) draft = ended.before;
  else if (ended.tool === "rectangle") {
    for (
      let y = Math.min(ended.from.y, ended.to.y);
      y <= Math.max(ended.from.y, ended.to.y);
      y++
    )
      for (
        let x = Math.min(ended.from.x, ended.to.x);
        x <= Math.max(ended.from.x, ended.to.x);
        x++
      ) {
        if (draft.cells[y - 1][x - 1] !== ended.index) {
          draft.cells[y - 1][x - 1] = ended.index;
          ended.changed = true;
        }
      }
  }
  stroke = null;
  if (!cancelled && ended.changed) {
    history.push(
      ended.before,
      ended.tool === "rectangle" ? "Draw rectangle" : "Paint stroke",
    );
    tell("Map updated. Undo is available.");
  }
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
  renderStudio();
}
canvas.addEventListener("pointerup", (event) => finishStroke(event));
canvas.addEventListener("pointercancel", (event) => finishStroke(event, true));
canvas.addEventListener("lostpointercapture", (event) => {
  if (stroke) finishStroke(event, true);
});
canvas.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer.types].includes("application/x-mazecraze-block")) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
});
canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  const cell = eventCell(event),
    index = Number(event.dataTransfer.getData("application/x-mazecraze-block"));
  if (!cell || !blockFor(index)) return;
  try {
    selectBlock(index);
    cursor = cell;
    change("Block dropped onto map", (next) => {
      next.cells[cell.y - 1][cell.x - 1] = index;
    });
  } catch (error) {
    report(error);
  }
});

function variableRow(container, name = "", value = "", scope) {
  const row = node("div", "", "variable-row");
  if (scope) {
    const fieldScope = field("Variable belongs to", scope, {
      options: ["Map", "Player"],
    });
    fieldScope.input.classList.add("variable-scope");
    row.append(fieldScope.wrapper);
  }
  const key = field("Name", name, {
      required: true,
      pattern: "[A-Za-z][A-Za-z0-9_]*",
    }),
    val = field("Value", value, { required: true });
  key.input.classList.add("variable-name");
  val.input.classList.add("variable-value");
  row.append(
    key.wrapper,
    val.wrapper,
    actionButton("Remove", () => row.remove()),
  );
  container.append(row);
  return row;
}
function openSettings() {
  const form = studio("settings-form"),
    start = coordinates(draft.map.StartingLocation);
  for (const [name, value] of Object.entries({
    ID: draft.map.ID,
    Name: draft.map.Name || "",
    width: draft.width,
    height: draft.height,
    startX: start.x,
    startY: start.y,
    ViewWindow: draft.map.ViewWindow,
    format: draft.format,
  }))
    formControl(form, name).value = value;
  for (const name of ["DefaultBlock", "BorderBlock"]) {
    const control = formControl(form, name);
    control.replaceChildren();
    for (const block of draft.blocks.filter(
      (block) => name !== "DefaultBlock" || block.fields.Type === "Move",
    )) {
      const option = node(
        "option",
        `${block.fields.Description} · ${block.fields.NID}`,
      );
      option.value = block.fields.NID;
      control.append(option);
    }
    control.value = draft.map[name];
  }
  studio("map-variables").replaceChildren();
  for (const [name, value] of Object.entries(draft.variables))
    variableRow(studio("map-variables"), name, value);
  studio("settings-error").textContent = "";
  studio("settings-dialog").showModal();
}
studio("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget,
      get = (name) => formControl(form, name).value.trim(),
      width = Number(get("width")),
      height = Number(get("height"));
    if (
      (width < draft.width || height < draft.height) &&
      !window.confirm(
        "Shrinking the map crops cells beyond its new edges. Continue? You can undo this change.",
      )
    )
      return;
    const fields = {
      ...draft.map,
      ID: get("ID"),
      Name: singleLine(get("Name")),
      Dimensions: `${get("width")}x${get("height")}`,
      StartingLocation: `(${get("startX")},${get("startY")})`,
      ViewWindow: get("ViewWindow"),
      DefaultBlock: get("DefaultBlock"),
      BorderBlock: get("BorderBlock"),
    };
    const variables = Object.create(null);
    for (const row of studio("map-variables").children) {
      const name = row.querySelector(".variable-name").value.trim(),
        value = singleLine(row.querySelector(".variable-value").value);
      if (Object.hasOwn(variables, name))
        throw new Error(`Duplicate variable ${name}.`);
      variables[name] = value;
    }
    change("Map settings applied", (next) =>
      applyMapSettings(next, fields, variables, get("format")),
    );
    closeStudioDialog("settings-dialog");
  } catch (error) {
    report(error, studio("settings-error"));
  }
});

function addRule(container, value = "SelectedItem.ID | Equal | ") {
  const [
    subject = "SelectedItem.ID",
    comparison = "Equal",
    expected = "",
    qualifier = "",
  ] = value.split("|").map((part) => part.trim());
  const base = subject.startsWith("Map.Variable.")
    ? "Map.Variable."
    : subject.startsWith("Player.Variable.")
      ? "Player.Variable."
      : subject;
  const row = node("div", "", "rule-row");
  const subjectField = field("Test subject", base, {
      options: EDITOR_SUBJECTS,
    }),
    comparisonField = field("Comparison", comparison, {
      options: EDITOR_COMPARISONS,
    });
  const variable = field(
    "Variable name",
    base.endsWith(".") ? subject.slice(base.length) : "",
    { required: true, pattern: "[A-Za-z][A-Za-z0-9_]*" },
  );
  const required = field("Required value", expected, {
    required: true,
    list: "nid-suggestions",
    placeholder: "1/4.1 or Target.RequiredPower",
  });
  const item = field("Count this item NID", qualifier, {
    required: true,
    list: "nid-suggestions",
  });
  subjectField.input.classList.add("rule-subject");
  comparisonField.input.classList.add("rule-comparison");
  variable.input.classList.add("rule-variable");
  required.input.classList.add("rule-value");
  item.input.classList.add("rule-qualifier");
  const toggle = () => {
    const name = subjectField.input.value;
    variable.wrapper.hidden = !name.endsWith(".");
    variable.input.disabled = variable.wrapper.hidden;
    item.wrapper.hidden = name !== "Inventory.Quantity";
    item.input.disabled = item.wrapper.hidden;
  };
  subjectField.input.addEventListener("change", () => {
    comparisonField.input.value = [
      "Equipment.Worn",
      "Equipment.Wielded",
      "Player.State",
    ].includes(subjectField.input.value)
      ? "Contains"
      : "Equal";
    toggle();
  });
  row.append(
    subjectField.wrapper,
    variable.wrapper,
    comparisonField.wrapper,
    required.wrapper,
    item.wrapper,
    actionButton("Remove rule", () => row.remove()),
  );
  container.append(row);
  toggle();
}
function addOutcome(parent, fields, prefix) {
  const box = node(
    "fieldset",
    "",
    `outcome ${prefix === "Fail" ? "fail" : ""}`,
  );
  box.dataset.prefix = prefix;
  box.append(node("legend", prefix === "Pass" ? "On PASS" : "On FAIL"));
  const definitions = [
    ["Message", "Outcome message", { multiline: true }],
    [
      "ReplaceBlock",
      "Replacement NID",
      {
        list: "nid-suggestions",
        placeholder:
          prefix === "Pass" ? "Blank = map default" : "Blank = leave unchanged",
      },
    ],
    [
      "GiveItems",
      "Give items · NIDs separated by |",
      { placeholder: "1/4.1 | 1/4.3" },
    ],
    [
      "TakeItems",
      "Take additional items · NIDs separated by |",
      { placeholder: prefix === "Pass"
        ? "Do not repeat the automatically used item"
        : "Blank = keep items; list explicit failure costs" },
    ],
    ["AddState", "Add player states", { placeholder: "Blessed | Muddy" }],
    ["RemoveState", "Remove player states", {}],
    [
      "Transport",
      "Transport destination",
      { placeholder: "(12,8) or (2)(3,3) or (2)" },
    ],
    [
      "EndGame",
      "End game",
      { options: [{ value: "", label: "Continue playing" }, "Yes", "No"] },
    ],
  ];
  for (const [key, label, options] of definitions) {
    const entry = field(label, fields[`${prefix}.${key}`] || "", options);
    entry.input.dataset.effect = key;
    box.append(entry.wrapper);
  }
  const updates = node("div", "", "outcome-variables");
  for (const [key, value] of Object.entries(fields)) {
    const match = new RegExp(
      `^${prefix}\\.Set(Player|Map)Variable\\.(.+)$`,
    ).exec(key);
    if (match) variableRow(updates, match[2], value, match[1]);
  }
  box.append(
    node("p", "Set declared variables (optional)", "hint"),
    updates,
    actionButton("＋ Set a variable", () =>
      variableRow(updates, "", "", "Map"),
    ),
  );
  parent.append(box);
}
function updateChoiceNumbers() {
  [...studio("choices-editor").children].forEach((card, index) => {
    card.querySelector(".choice-heading strong").textContent =
      `Choice ${index + 1}`;
  });
}
function addChoice(
  choice = { fields: { Text: "Try it", Action: "Attempt" } },
  scroll = false,
) {
  const fields = choice.fields,
    card = node("article", "", "choice-card");
  card._fields = { ...fields };
  const heading = node("div", "", "choice-heading");
  heading.append(node("strong", "Choice"));
  heading.append(
    actionButton("↑", () => {
      if (card.previousElementSibling)
        card.parentNode.insertBefore(card, card.previousElementSibling);
      updateChoiceNumbers();
    }),
    actionButton("↓", () => {
      if (card.nextElementSibling)
        card.parentNode.insertBefore(card.nextElementSibling, card);
      updateChoiceNumbers();
    }),
    actionButton("Remove choice", () => {
      card.remove();
      updateChoiceNumbers();
    }),
  );
  const grid = node("div", "", "form-grid");
  for (const [key, label, options] of [
    ["Text", "Choice text", { required: true }],
    ["Action", "Action", { options: ["Attempt", "UseInventory", "Attack"] }],
    ["SelectionPrompt", "Item selection prompt", {}],
    ["TestsMatch", "Rules must match", { options: ["All", "Any"] }],
  ]) {
    const entry = field(
      label,
      fields[key] || { Action: "Attempt", TestsMatch: "All" }[key] || "",
      options,
    );
    entry.input.dataset.choice = key;
    grid.append(entry.wrapper);
  }
  const rules = node("div", "", "rules-editor");
  for (const [key, value] of Object.entries(fields)
    .filter(([key]) => /^Test\.[1-9]\d*$/.test(key))
    .sort(([a], [b]) => Number(a.slice(5)) - Number(b.slice(5))))
    addRule(rules, value);
  const outcomes = node("div", "", "outcomes");
  addOutcome(outcomes, fields, "Pass");
  addOutcome(outcomes, fields, "Fail");
  card.append(
    heading,
    grid,
    node("h3", "Puzzle tests"),
    rules,
    actionButton("＋ Add a test", () => addRule(rules)),
    outcomes,
  );
  studio("choices-editor").append(card);
  updateChoiceNumbers();
  if (scroll) card.scrollIntoView({ block: "nearest" });
}
function toggleBlockFields() {
  const form = studio("block-form"),
    type = formControl(form, "Type").value,
    kind = formControl(form, "ItemKind").value;
  for (const element of document.querySelectorAll("[data-block-group]")) {
    const group = element.dataset.blockGroup;
    const show =
      group === "popup"
        ? ["Interaction", "Inventory"].includes(type)
        : group === "interaction"
          ? type === "Interaction"
          : group === "inventory"
            ? type === "Inventory"
            : group === "weapon"
              ? type === "Inventory" && kind === "Weapon"
              : type === "Inventory" && kind === "Wearable";
    element.hidden = !show;
    for (const input of element.querySelectorAll("input,select,textarea"))
      input.disabled = !show;
  }
  studio("choices-section").hidden = type !== "Interaction";
  for (const input of studio("choices-section").querySelectorAll(
    "input,select,textarea",
  ))
    input.disabled = type !== "Interaction" || input.closest("label")?.hidden;
  studio("inventory-note").hidden = type !== "Inventory";
}
function openBlock(index = null) {
  editingIndex = index;
  blockOriginal = cloneDocument(
    index === null ? nextBlock(draft) : blockFor(index),
  );
  const form = studio("block-form");
  form.reset();
  formControl(form, "index").value = blockOriginal.index;
  for (const name of [
    "NID",
    "Type",
    "Description",
    "MapImage",
    "InteractionImage",
    "Message",
    "CancelActionText",
    "RequiredPower",
    "ItemKind",
    "State",
    "Power",
    "Hands",
    "WearLocation",
  ]) {
    formControl(form, name).value =
      blockOriginal.fields[name] ??
      { ItemKind: "Item", Hands: "1", WearLocation: "Feet" }[name] ??
      "";
  }
  studio("choices-editor").replaceChildren();
  blockOriginal.choices.forEach((choice) => addChoice(choice));
  studio("block-title").textContent =
    index === null
      ? "Create a block"
      : `Edit ${blockOriginal.fields.Description}`;
  studio("delete-block").hidden = index === null;
  studio("duplicate-block").hidden = index === null;
  studio("block-error").textContent = "";
  toggleBlockFields();
  studio("block-dialog").showModal();
}
function readChoices() {
  return [...studio("choices-editor").children].map((card, index) => {
    const fields = { ...card._fields };
    for (const key of Object.keys(fields))
      if (
        /^Test\./.test(key) ||
        /^(Pass|Fail)\./.test(key) ||
        ["Text", "Action", "SelectionPrompt", "TestsMatch"].includes(key)
      )
        delete fields[key];
    for (const input of card.querySelectorAll("[data-choice]")) {
      const value = singleLine(input.value);
      if (value) fields[input.dataset.choice] = value;
    }
    [...card.querySelector(".rules-editor").children].forEach(
      (row, ruleIndex) => {
        let subject = row.querySelector(".rule-subject").value;
        if (subject.endsWith("."))
          subject += row.querySelector(".rule-variable").value.trim();
        const parts = [
          subject,
          row.querySelector(".rule-comparison").value,
          row.querySelector(".rule-value").value.trim(),
        ];
        if (subject === "Inventory.Quantity")
          parts.push(row.querySelector(".rule-qualifier").value.trim());
        fields[`Test.${ruleIndex + 1}`] = parts.join(" | ");
      },
    );
    for (const outcome of card.querySelectorAll(".outcome")) {
      const prefix = outcome.dataset.prefix;
      for (const input of outcome.querySelectorAll("[data-effect]")) {
        const value = singleLine(input.value);
        if (value) fields[`${prefix}.${input.dataset.effect}`] = value;
      }
      for (const row of outcome.querySelector(".outcome-variables").children) {
        const scope = row.querySelector(".variable-scope").value,
          name = row.querySelector(".variable-name").value.trim(),
          key = `${prefix}.Set${scope}Variable.${name}`;
        if (Object.hasOwn(fields, key))
          throw new Error(`Duplicate variable update ${key}.`);
        fields[key] = singleLine(row.querySelector(".variable-value").value);
      }
    }
    return { index: index + 1, fields };
  });
}
studio("block-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget,
      type = formControl(form, "Type").value;
    if (
      type !== "Interaction" &&
      blockOriginal.choices.length &&
      editingIndex !== null &&
      !window.confirm(
        "This type has no interaction choices. Remove this block’s existing choices?",
      )
    )
      return;
    const fields = { ...blockOriginal.fields };
    for (const key of [
      "NID",
      "Type",
      "Description",
      "MapImage",
      "InteractionImage",
      "Message",
      "CancelActionText",
      "RequiredPower",
      "ItemKind",
      "State",
      "Power",
      "Hands",
      "WearLocation",
    ]) {
      const input = formControl(form, key);
      delete fields[key];
      if (!input.disabled && singleLine(input.value))
        fields[key] = singleLine(input.value);
    }
    const replacement = {
      index: Number(formControl(form, "index").value),
      fields,
      choices: type === "Interaction" ? readChoices() : [],
    };
    change("Block saved", (next) => saveBlock(next, editingIndex, replacement));
    selectedIndex = replacement.index;
    renderStudio();
    closeStudioDialog("block-dialog");
  } catch (error) {
    report(error, studio("block-error"));
  }
});
formControl(studio("block-form"), "Type").addEventListener("change", () => {
  const form = studio("block-form"),
    type = formControl(form, "Type").value;
  const suggestion = nextBlock(draft, type);
  formControl(form, "NID").value = suggestion.fields.NID;
  if (type === "Interaction" && !studio("choices-editor").children.length)
    addChoice();
  toggleBlockFields();
});
formControl(studio("block-form"), "ItemKind").addEventListener(
  "change",
  toggleBlockFields,
);

studio("new-map").addEventListener("click", () => {
  if (canReplace()) {
    replaceDocument(createMap());
    tell("New map ready. Use Map settings to choose dimensions.");
  }
});
studio("open-map").addEventListener("click", () => {
  studio("map-file").value = "";
  studio("map-file").click();
});
studio("map-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || !canReplace()) return;
  try {
    if (file.size > 2_000_000)
      throw new Error("Map files must be no larger than 2 MB.");
    const text = await file.text();
    replaceDocument(importMap(text, file.name), text);
  } catch (error) {
    report(error);
  }
});
function directoryNotice(message, error = false) {
  studio("map-directory-status").textContent = message;
  studio("map-directory-status").classList.toggle("error", error);
}
function directoryControls() {
  studio("example-select").disabled = websiteMapLoading;
  studio("refresh-map-list").disabled = websiteDirectoryLoading || websiteMapLoading;
}
async function refreshWebsiteDirectory() {
  if (websiteDirectoryLoading || websiteMapLoading) return;
  websiteDirectoryLoading = true; directoryControls();
  directoryNotice("Reading website maps from main-config.txt…");
  try {
    const directory = await readEditorDirectory(EDITOR_MAIN_CONFIG_PATH, location.href);
    const group = document.createElement("optgroup");
    group.id = "website-map-options"; group.label = "Website maps · current server files";
    for (const [id, url] of directory.files) {
      const option = node("option", `Map ${id} · ${basename(new URL(url).pathname)}`);
      option.value = `website:${id}`; group.append(option);
    }
    studio("website-map-options")?.remove();
    studio("example-select").insertBefore(group, studio("bundled-map-options"));
    websiteDirectory = directory;
    directoryNotice(`${directory.files.size} website maps available. Refresh map list after adding maps to main-config.txt.`);
  } catch (error) {
    directoryNotice(`Could not refresh website maps: ${error.message} ${websiteDirectory ? "The previous list is still available." : "Bundled examples and local files are still available."}`, true);
  } finally { websiteDirectoryLoading = false; directoryControls(); }
}
studio("refresh-map-list").addEventListener("click", refreshWebsiteDirectory);
studio("example-select").addEventListener("change", async (event) => {
  const value = event.target.value;
  event.target.value = "";
  if (!value || websiteMapLoading || !canReplace()) return;
  if (value.startsWith("website:")) {
    const id = Number(value.slice(8)), url = websiteDirectory?.files.get(id);
    if (!url) { tell("Refresh the map list, then choose a website map.", true); return; }
    const previousDocument = draft, previousText = JSON.stringify(draft);
    websiteMapLoading = true; directoryControls();
    directoryNotice(`Loading Map ${id} from the website…`);
    try {
      const text = await readEditorWebsiteText(url, websiteDirectory.timeout);
      const imported = importMap(text, basename(new URL(url).pathname));
      if (Number(imported.map.ID) !== id) throw new Error(`The directory lists Map ${id}, but that file defines Map ${imported.map.ID}.`);
      // A slow response must never overwrite work performed while it was loading.
      if (draft !== previousDocument || JSON.stringify(draft) !== previousText || stroke
          || document.querySelector("dialog[open]") || studio("editor-pane").hidden) {
        directoryNotice("The editor changed while the map was loading. Your work was kept. Choose the website map again when ready.");
        return;
      }
      replaceDocument(imported, text);
      const option = [...studio("example-select").options].find(option => option.value === value);
      if (option) option.textContent = `Map ${id} · ${imported.map.Name || basename(new URL(url).pathname)}`;
      directoryNotice(`Opened the current website copy of Map ${id}. Export downloads your edits; upload the file by SFTP to publish them.`);
    } catch (error) {
      directoryNotice(`Map ${id} could not open: ${error.message} Your current document was kept.`, true);
    } finally { websiteMapLoading = false; directoryControls(); }
    return;
  }
  try {
    const text = EDITOR_BUNDLED.samples[value];
    replaceDocument(importMap(text, `map-${value}.txt`), text);
  } catch (error) {
    report(error);
  }
});
studio("export-map").addEventListener("click", () => {
  try {
    const result = renderValidation();
    if (result.errors.length)
      throw new Error(
        `Fix the ${result.errors.length} error(s) in Map checks before exporting.`,
      );
    downloadText(exportMap(draft), `map-${draft.map.ID}.txt`);
    history.markSaved(draft);
    renderStudio();
    tell(
      `Downloaded map-${draft.map.ID}.txt. Your original file was not overwritten.`,
    );
  } catch (error) {
    report(error);
  }
});
studio("download-original").addEventListener("click", () =>
  downloadText(originalText, `original-${draft.filename}`),
);
studio("source-open").addEventListener("click", () => {
  try {
    studio("source-text").value = exportMap(draft);
    studio("source-error").textContent = "";
    studio("source-dialog").showModal();
  } catch (error) {
    report(error);
  }
});
studio("source-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    commit(
      importMap(studio("source-text").value, draft.filename),
      "Text changes applied",
    );
    closeStudioDialog("source-dialog");
  } catch (error) {
    report(error, studio("source-error"));
  }
});
studio("settings-open").addEventListener("click", openSettings);
studio("add-map-variable").addEventListener("click", () =>
  variableRow(studio("map-variables")),
);
studio("add-block").addEventListener("click", () => openBlock());
studio("edit-block").addEventListener("click", () => openBlock(selectedIndex));
studio("add-choice").addEventListener("click", () =>
  addChoice(undefined, true),
);
studio("duplicate-block").addEventListener("click", () => {
  try {
    const index = change("Block duplicated", (next) =>
      duplicateBlock(next, editingIndex),
    );
    closeStudioDialog("block-dialog");
    selectBlock(index);
    openBlock(index);
  } catch (error) {
    report(error, studio("block-error"));
  }
});
studio("delete-block").addEventListener("click", () => {
  if (
    !window.confirm(
      "Delete this block and replace its map placements with the default? You can undo this.",
    )
  )
    return;
  try {
    change("Block deleted", (next) => deleteBlock(next, editingIndex));
    closeStudioDialog("block-dialog");
  } catch (error) {
    report(error, studio("block-error"));
  }
});
studio("block-search").addEventListener("input", renderPalette);
studio("type-filter").addEventListener("change", renderPalette);
document
  .querySelectorAll("button[data-tool]")
  .forEach((button) =>
    button.addEventListener("click", () => setTool(button.dataset.tool)),
  );
studio("undo").addEventListener("click", () => {
  draft = history.undo(draft);
  renderStudio();
  tell("Change undone.");
});
studio("redo").addEventListener("click", () => {
  draft = history.redo(draft);
  renderStudio();
  tell("Change restored.");
});
studio("zoom").addEventListener("change", drawCanvas);
studio("jump-cell").addEventListener("click", () => {
  const x = Number(studio("jump-x").value),
    y = Number(studio("jump-y").value);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 1 ||
    y < 1 ||
    x > draft.width ||
    y > draft.height
  ) {
    tell("Choose coordinates inside this map.", true);
    return;
  }
  cursor = { x, y };
  drawCanvas();
  const size = Number(studio("zoom").value);
  studio("canvas-scroll").scrollTo({
    left: Math.max(0, ORIGIN + (x - 1) * size - 100),
    top: Math.max(0, ORIGIN + (draft.height - y) * size - 100),
  });
  canvas.focus({ preventScroll: true });
});
studio("apply-cell").addEventListener("click", () => {
  try {
    applyAt(cursor);
  } catch (error) {
    report(error);
  }
});
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      closeStudioDialog(button.dataset.close),
    ),
  );
studio("help-open").addEventListener("click", () =>
  studio("help-dialog").showModal(),
);
document.addEventListener("keydown", (event) => {
  if (
    studio("editor-pane").hidden ||
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    studio(event.shiftKey ? "redo" : "undo").click();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    studio("redo").click();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const shortcuts = {
    b: "paint",
    e: "erase",
    r: "rectangle",
    f: "fill",
    s: "start",
    i: "pick",
    h: "pan",
  };
  if (shortcuts[event.key.toLowerCase()]) {
    event.preventDefault();
    setTool(shortcuts[event.key.toLowerCase()]);
    return;
  }
  if (document.activeElement !== canvas) return;
  const directions = {
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  if (directions[event.key]) {
    event.preventDefault();
    const [dx, dy] = directions[event.key];
    cursor = {
      x: Math.max(1, Math.min(draft.width, cursor.x + dx)),
      y: Math.max(1, Math.min(draft.height, cursor.y + dy)),
    };
    scheduleDraw();
  }
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    try {
      applyAt(cursor);
    } catch (error) {
      report(error);
    }
  }
});
window.addEventListener("beforeunload", (event) => {
  if (history.dirty(draft)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
studio("load-images").addEventListener("click", () => {
  studio("image-files").value = "";
  studio("image-files").click();
});
studio("image-files").addEventListener("change", async (event) => {
  try {
    const files = [...event.target.files];
    if (
      files.length > 64 ||
      files.reduce((sum, file) => sum + file.size, 0) > 15_000_000
    )
      throw new Error(
        "Load up to 64 pictures totaling at most 15 MB at a time.",
      );
    const nextImages = new Map(localImages);
    for (const file of files) {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        ) ||
        file.size > 2_000_000
      )
        throw new Error(
          `${file.name}: use a PNG, JPEG, WebP, or GIF up to 2 MB.`,
        );
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () =>
          reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096)
        throw new Error(
          `${file.name}: image dimensions must not exceed 4096 pixels.`,
        );
      if (image.naturalWidth > 128 || image.naturalHeight > 128) {
        const preview = document.createElement("canvas"),
          ratio = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight);
        preview.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        preview.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        preview
          .getContext("2d")
          .drawImage(image, 0, 0, preview.width, preview.height);
        nextImages.set(file.name, preview.toDataURL("image/png"));
      } else nextImages.set(file.name, data);
    }
    if (
      nextImages.size > 64 ||
      [...nextImages.values()].reduce((sum, data) => sum + data.length, 0) >
        20_000_000
    )
      throw new Error(
        "The local preview library is full (64 pictures or 20 MB). Reload the editor after exporting your map to clear it.",
      );
    localImages.clear();
    for (const [name, data] of nextImages) localImages.set(name, data);
    decodedImages.clear();
    renderStudio();
    tell(
      "Local image previews loaded. Upload pictures separately when publishing your map.",
    );
  } catch (error) {
    report(error);
  }
});
for (const id of ["allow-image-urls", "image-base"])
  studio(id).addEventListener("change", () => {
    decodedImages.clear();
    renderStudio();
  });
for (const location of EDITOR_LOCATIONS) {
  const option = node("option", location);
  option.value = location;
  formControl(studio("block-form"), "WearLocation").append(option);
}
for (const name of Object.keys(EDITOR_BUNDLED.images)) {
  const option = node("option");
  option.value = `../assets/${name}`;
  studio("image-suggestions").append(option);
}
// A paused iframe retains its own Game instance. No runtime state is copied
// back into the editable document, and no map data is uploaded to the server.
let testFrame = null, testSession = '', testPhase = 'idle', testBusy = false;
let testSnapshot = '', testTimer, testNotice = '';
function refreshTestControls() {
  studio('test-start').disabled = ['starting', 'pausing', 'resuming'].includes(testPhase) || testBusy;
  studio('test-edit').hidden = !['starting', 'running', 'pausing', 'resuming'].includes(testPhase);
  studio('test-edit').disabled = testPhase !== 'running' || testBusy;
  studio('test-resume').hidden = testPhase !== 'paused';
  const changed = testPhase === 'paused' && exportMap(draft) !== testSnapshot;
  studio('test-status').textContent = changed
    ? 'Your map has changed. Resume continues the previous test. Test from Start uses your changes.'
    : testNotice || 'Test a fresh copy of your map without exporting. Your design stays on this desk.';
}
function showTestEditor() {
  studio('editor-pane').hidden = false;
  studio('test-panel').hidden = true;
  studio('new-map').disabled = false;
  studio('open-map').disabled = false;
  studio('export-map').disabled = false;
}
function showTestGame() {
  studio('editor-pane').hidden = true;
  studio('test-panel').hidden = false;
  studio('new-map').disabled = true;
  studio('open-map').disabled = true;
  studio('export-map').disabled = true;
}
function sendTestCommand(type, details = {}) {
  testFrame?.contentWindow.postMessage(playtestMessage(testSession, type, details), location.origin);
}
function failTest(message) {
  clearTimeout(testTimer);
  testFrame?.remove(); testFrame = null; testPhase = 'idle'; testBusy = false;
  testNotice = message; showTestEditor(); refreshTestControls();
  studio('test-status').classList.add('error');
}
function startTest() {
  if (!['http:', 'https:'].includes(location.protocol)) {
    failTest('Editing and export work offline. To playtest, open editor.html on the same HTTP(S) website as the game, with all game files installed.');
    return;
  }
  const validation = renderValidation();
  if (validation.errors.length) {
    testNotice = 'Fix the errors in Map checks before testing.';
    tell(testNotice, true); refreshTestControls(); return;
  }
  let text;
  try { text = exportMap(draft); } catch (error) { report(error); return; }
  clearTimeout(testTimer); testFrame?.remove();
  testSession = [...crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16).padStart(8, '0')).join('');
  testSnapshot = text; testPhase = 'starting'; testBusy = false;
  testNotice = 'Opening a fresh test…';
  studio('test-status').classList.remove('error');
  testFrame = document.createElement('iframe');
  testFrame.title = 'Maze Craze map playtest';
  testFrame.setAttribute('referrerpolicy', 'no-referrer');
  const url = new URL('index.html', location.href);
  url.searchParams.set('editorTest', testSession);
  testFrame.src = url.href;
  studio('test-frame-host').replaceChildren(testFrame);
  showTestGame(); refreshTestControls();
  testTimer = setTimeout(() => failTest('The game did not become ready. Check that index.html, main-config.txt, js/, styles.css, maps/, and assets/ are deployed together with this editor. Reload after updating the files.'), 45000);
}
studio('test-start').addEventListener('click', startTest);
studio('test-edit').addEventListener('click', () => {
  if (testPhase !== 'running' || testBusy) return;
  testPhase = 'pausing'; refreshTestControls(); sendTestCommand('pause');
});
studio('test-resume').addEventListener('click', () => {
  if (testPhase !== 'paused') return;
  testPhase = 'resuming'; showTestGame(); refreshTestControls(); sendTestCommand('resume');
});
window.addEventListener('message', event => {
  if (!testFrame || event.origin !== location.origin || event.source !== testFrame.contentWindow
      || !isPlaytestMessage(event.data, testSession)) return;
  const data = event.data;
  if (data.type === 'ready' && testPhase === 'starting') {
    sendTestCommand('start', { mapId: Number(draft.map.ID), text: testSnapshot });
  } else if (data.type === 'running' && ['starting', 'resuming'].includes(testPhase)) {
    clearTimeout(testTimer); testPhase = 'running'; testBusy = false;
    testNotice = 'Test copy running. Back to Edit pauses it. Test from Start resets all test progress.';
    testFrame.focus();
  } else if (data.type === 'busy' && typeof data.busy === 'boolean' && testPhase === 'running') {
    testBusy = data.busy;
    testNotice = data.busy ? 'Finishing an interaction or loading a map…'
      : 'Test copy running. Back to Edit pauses it. Test from Start resets all test progress.';
  } else if (data.type === 'paused' && testPhase === 'pausing') {
    testPhase = 'paused'; testNotice = 'Test paused. Resume keeps its progress. Test from Start uses your current design and resets everything.';
    showTestEditor(); studio('map-canvas').focus({ preventScroll: true });
  } else if (data.type === 'pause-busy' && testPhase === 'pausing') {
    testPhase = 'running'; testBusy = true; testNotice = 'Wait for the current interaction to finish, then choose Back to Edit.';
  } else if (data.type === 'error' && typeof data.message === 'string') {
    failTest(`Test could not start: ${data.message.slice(0, 1000)}`); return;
  }
  refreshTestControls();
});
renderStudio();
if (["http:", "https:"].includes(location.protocol)) refreshWebsiteDirectory();
else {
  studio("refresh-map-list").hidden = true;
  directoryNotice("Offline editing: bundled examples and local files are available. Open this editor on your game website to list its published maps.");
}
