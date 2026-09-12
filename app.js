/*
 * bluishCanvas — 1단계 프로토타입
 *
 * 핵심 아이디어: "월드 좌표"와 "화면 좌표"를 분리한다.
 *   - 메모는 월드 좌표(x, y)를 가진다. 이 평면은 무한하다.
 *   - #world 컨테이너에 CSS transform 을 걸어서 평면 전체를 이동/확대한다.
 *   - view = { x, y, scale } 하나가 현재 화면 상태를 나타낸다.
 *   화면좌표 = 월드좌표 * scale + view offset
 *   월드좌표 = (화면좌표 - view offset) / scale
 */

const canvas = document.getElementById("canvas");
const world = document.getElementById("world");
const selectionBoxEl = document.getElementById("selection-box");
const selectionOutlineEl = document.getElementById("selection-outline");
const resizeHandlesEl = document.getElementById("resize-handles");
const quickMenuEl = document.getElementById("quick-menu");
const nextShapeLabelEl = document.getElementById("next-shape-label");
const zoomLabel = document.getElementById("zoom-label");
const resetBtn = document.getElementById("reset-view");
const arrowsLayerEl = document.getElementById("arrows-layer");
const arrowDraftEl = document.getElementById("arrow-draft");
const SVG_NS = "http://www.w3.org/2000/svg";

const STORAGE_KEY = "bluishCanvas.v1";
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const MAX_HISTORY = 50;
const DEFAULT_NOTE_W = 170;
const DEFAULT_NOTE_H = 70;
const MIN_NOTE_SIZE = 60; // 메모가 이보다 작게 줄어들지는 않는다
const DEFAULT_SHAPE = "rect";
const SHAPE_LABELS = { rect: "사각형", ellipse: "원", diamond: "마름모" };

const view = { x: 0, y: 0, scale: 1 };
let notes = [];
let nextId = 1;
let selectedIds = new Set(); // 현재 선택된 메모 id 들
let nextShape = DEFAULT_SHAPE; // 다음에 빈 곳을 더블클릭(또는 퀵메뉴로 생성)할 때 쓸 도형

let arrows = []; // { id, fromId, toId }
let nextArrowId = 1;
let selectedArrowIds = new Set();
let arrowDraft = null; // 화살표 연결 모드 중일 때만 { fromId }

// 실행취소/다시실행: notes 의 스냅샷 목록. history[historyIndex] 가 현재 상태.
// 팬/줌은 기록 대상이 아니다 (생성/이동/삭제/텍스트 수정만 기록).
let history = [];
let historyIndex = -1;
let isRestoringHistory = false;

/* ===== 저장 / 불러오기 (localStorage) ===== */

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view, notes, nextId, arrows, nextArrowId })
    );
  } catch (e) {
    console.warn("저장 실패:", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.view) Object.assign(view, data.view);
    notes = Array.isArray(data.notes) ? data.notes : [];
    // 크기 조절/도형 기능이 생기기 전에 저장된 메모는 w/h/shape 가 없으므로 기본값을 채워준다.
    notes.forEach((n) => {
      if (typeof n.w !== "number") n.w = DEFAULT_NOTE_W;
      if (typeof n.h !== "number") n.h = DEFAULT_NOTE_H;
      if (!n.shape) n.shape = DEFAULT_SHAPE;
    });
    nextId = data.nextId || notes.length + 1;
    // 화살표 기능이 생기기 전에 저장된 파일에는 arrows 가 아예 없다.
    arrows = Array.isArray(data.arrows) ? data.arrows : [];
    nextArrowId = data.nextArrowId || arrows.length + 1;
  } catch (e) {
    console.warn("불러오기 실패:", e);
  }
}

/* ===== 실행취소 / 다시실행 ===== */

function cloneNotes() {
  return notes.map((n) => ({ ...n }));
}

function cloneArrows() {
  return arrows.map((a) => ({ ...a }));
}

// 지금까지의 변경을 히스토리 한 칸으로 확정한다. (생성/이동/삭제/텍스트 수정 완료 시점에 호출)
function pushHistory() {
  if (isRestoringHistory) return;
  history = history.slice(0, historyIndex + 1); // 이후의 "다시실행" 가능했던 기록은 버린다
  history.push({ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId });
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
  historyIndex = history.length - 1;
}

function commitChange() {
  pushHistory();
  save();
}

function restoreSnapshot(snapshot) {
  isRestoringHistory = true;
  world.querySelectorAll(".note").forEach((el) => el.remove());
  arrowsLayerEl.querySelectorAll(".arrow").forEach((el) => el.remove());
  notes = snapshot.notes.map((n) => ({ ...n }));
  arrows = (snapshot.arrows || []).map((a) => ({ ...a }));
  nextId = snapshot.nextId;
  nextArrowId = snapshot.nextArrowId || 1;
  selectedIds = new Set(); // 대상이 바뀌므로 선택은 비운다
  selectedArrowIds = new Set();
  notes.forEach(renderNote);
  arrows.forEach(renderArrow);
  updateHandles();
  save();
  isRestoringHistory = false;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreSnapshot(history[historyIndex]);
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreSnapshot(history[historyIndex]);
}

/* ===== 좌표 변환 & 화면 갱신 ===== */

function applyTransform() {
  world.style.transform =
    `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;

  // 점 격자 배경도 팬/줌에 맞춰 같이 움직이게 한다.
  canvas.style.backgroundSize = `${24 * view.scale}px ${24 * view.scale}px`;
  canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;

  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;

  updateHandles(); // 팬/줌으로 화면이 움직이면 크기조절 핸들 위치도 같이 갱신
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - view.x) / view.scale,
    y: (sy - view.y) / view.scale,
  };
}

/* ===== 선택 (단일 / 다중) ===== */

function noteEl(id) {
  return world.querySelector(`.note[data-id="${id}"]`);
}

// 현재 선택 집합을 정확히 idList 로 바꾸고, 시각 표시(.selected)를 갱신한다.
function setSelection(idList) {
  const next = new Set(idList);
  selectedIds.forEach((id) => {
    if (!next.has(id)) {
      const el = noteEl(id);
      if (el) el.classList.remove("selected");
    }
  });
  next.forEach((id) => {
    if (!selectedIds.has(id)) {
      const el = noteEl(id);
      if (el) el.classList.add("selected");
    }
  });
  selectedIds = next;
  updateHandles();
}

function selectOnly(id) {
  setSelection(id === null ? [] : [id]);
}

function deselectAll() {
  setSelection([]);
}

// 이미 선택되어 있으면 선택에서 빼고, 아니면 기존 선택은 그대로 둔 채 더한다. (Shift+클릭)
function toggleSelection(id) {
  const next = new Set(selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  setSelection(Array.from(next));
}

// 화면 좌표 기준 사각형(rx1,ry1)-(rx2,ry2) 과 겹치는 메모들의 id 목록.
function notesInScreenRect(rx1, ry1, rx2, ry2) {
  const left = Math.min(rx1, rx2);
  const right = Math.max(rx1, rx2);
  const top = Math.min(ry1, ry2);
  const bottom = Math.max(ry1, ry2);
  const ids = [];
  notes.forEach((note) => {
    const el = noteEl(note.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const overlaps = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
    if (overlaps) ids.push(note.id);
  });
  return ids;
}

/* ===== 화살표 ===== */

function getNote(id) {
  return notes.find((n) => n.id === id);
}

function arrowEl(id) {
  return arrowsLayerEl.querySelector(`.arrow[data-id="${id}"]`);
}

// 메모의 상/하/좌/우 중앙 4개 연결 지점 중 하나의 월드 좌표.
function sideMidpoint(note, side) {
  const cx = note.x + note.w / 2;
  const cy = note.y + note.h / 2;
  switch (side) {
    case "top":
      return { x: cx, y: note.y };
    case "bottom":
      return { x: cx, y: note.y + note.h };
    case "left":
      return { x: note.x, y: cy };
    default:
      return { x: note.x + note.w, y: cy };
  }
}

// from 이 to 를 향해 연결될 때 가장 자연스러운 변(상/하/좌/우)을 고른다.
// 두 중심점의 상대 위치에서, 더 크게 벌어진 축(가로 vs 세로) 쪽 변을 쓴다.
function chooseSide(from, to) {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "bottom" : "top";
}

// 화살표 하나의 좌표를 현재 두 메모 위치를 기준으로 다시 계산해서 반영한다.
// (연결 지점은 저장하지 않고, 메모가 움직이거나 크기가 바뀔 때마다 항상 새로 계산한다)
function updateArrowGeometry(arrow) {
  const g = arrowEl(arrow.id);
  if (!g) return;
  const fromNote = getNote(arrow.fromId);
  const toNote = getNote(arrow.toId);
  if (!fromNote || !toNote) return;

  const p1 = sideMidpoint(fromNote, chooseSide(fromNote, toNote));
  const p2 = sideMidpoint(toNote, chooseSide(toNote, fromNote));

  ["arrow-hit", "arrow-visible"].forEach((cls) => {
    const line = g.querySelector(`.${cls}`);
    if (!line) return;
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
  });
}

function updateAllArrowGeometry() {
  arrows.forEach(updateArrowGeometry);
}

function renderArrow(arrow) {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "arrow");
  g.dataset.id = String(arrow.id);

  const hit = document.createElementNS(SVG_NS, "line");
  hit.setAttribute("class", "arrow-hit");

  const visible = document.createElementNS(SVG_NS, "line");
  visible.setAttribute("class", "arrow-visible");
  visible.setAttribute("marker-end", "url(#arrowhead)");

  g.appendChild(hit);
  g.appendChild(visible);
  arrowsLayerEl.appendChild(g);

  // 화살표 선(정확히는 두꺼운 클릭 판정용 선) 클릭 → 선택. 메모 클릭과 같은 원칙:
  // Shift 없이 클릭하면 메모 선택은 비우고 이 화살표만 선택, Shift+클릭이면 토글.
  hit.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (arrowDraft) return; // 화살표 연결 모드 중엔 다른 화살표를 고르는 게 아니라 무시
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      toggleArrowSelection(arrow.id);
    } else {
      deselectAll();
      selectOnlyArrow(arrow.id);
    }
  });

  updateArrowGeometry(arrow);
  return g;
}

function setArrowMarker(g, selected) {
  const visible = g.querySelector(".arrow-visible");
  if (visible) {
    visible.setAttribute("marker-end", selected ? "url(#arrowhead-selected)" : "url(#arrowhead)");
  }
}

function setArrowSelection(idList) {
  const next = new Set(idList);
  selectedArrowIds.forEach((id) => {
    if (!next.has(id)) {
      const el = arrowEl(id);
      if (el) {
        el.classList.remove("selected");
        setArrowMarker(el, false);
      }
    }
  });
  next.forEach((id) => {
    if (!selectedArrowIds.has(id)) {
      const el = arrowEl(id);
      if (el) {
        el.classList.add("selected");
        setArrowMarker(el, true);
      }
    }
  });
  selectedArrowIds = next;
}

function selectOnlyArrow(id) {
  setArrowSelection(id === null ? [] : [id]);
}

function deselectAllArrows() {
  setArrowSelection([]);
}

function toggleArrowSelection(id) {
  const next = new Set(selectedArrowIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  setArrowSelection(Array.from(next));
}

// 화면 좌표 기준 사각형과 "중앙점"이 겹치는 화살표들의 id 목록 (요구사항: 화살표 전체가
// 아니라 중앙점 기준으로 영역 선택 판정).
function arrowsInScreenRect(rx1, ry1, rx2, ry2) {
  const left = Math.min(rx1, rx2);
  const right = Math.max(rx1, rx2);
  const top = Math.min(ry1, ry2);
  const bottom = Math.max(ry1, ry2);
  const ids = [];
  arrows.forEach((arrow) => {
    const g = arrowEl(arrow.id);
    if (!g) return;
    const line = g.querySelector(".arrow-visible");
    if (!line) return;
    const x1 = parseFloat(line.getAttribute("x1"));
    const y1 = parseFloat(line.getAttribute("y1"));
    const x2 = parseFloat(line.getAttribute("x2"));
    const y2 = parseFloat(line.getAttribute("y2"));
    const midWorld = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    const midScreen = {
      x: midWorld.x * view.scale + view.x,
      y: midWorld.y * view.scale + view.y,
    };
    if (midScreen.x >= left && midScreen.x <= right && midScreen.y >= top && midScreen.y <= bottom) {
      ids.push(arrow.id);
    }
  });
  return ids;
}

function createArrow(fromId, toId) {
  if (fromId === toId) return null;
  const arrow = { id: nextArrowId++, fromId, toId };
  arrows.push(arrow);
  renderArrow(arrow);
  commitChange();
  return arrow;
}

function removeArrowFromState(id) {
  const idx = arrows.findIndex((a) => a.id === id);
  if (idx === -1) return;
  arrows.splice(idx, 1);
  const el = arrowEl(id);
  if (el) el.remove();
  selectedArrowIds.delete(id);
}

// 선택된 메모(들)와 화살표(들)를 한 번에, 히스토리 한 칸으로 지운다.
function deleteSelectedObjects() {
  if (selectedIds.size === 0 && selectedArrowIds.size === 0) return;
  Array.from(selectedIds).forEach(removeNoteFromState); // 메모에 딸린 화살표도 같이 지워진다
  Array.from(selectedArrowIds).forEach(removeArrowFromState);
  commitChange();
}

/* ===== 화살표 연결 모드 (메모 우클릭으로 시작) ===== */

function startArrowDraft(fromId) {
  arrowDraft = { fromId };
  canvas.classList.add("linking");
  const fromNote = getNote(fromId);
  if (fromNote) {
    const c = { x: fromNote.x + fromNote.w / 2, y: fromNote.y + fromNote.h / 2 };
    arrowDraftEl.setAttribute("x1", c.x);
    arrowDraftEl.setAttribute("y1", c.y);
    arrowDraftEl.setAttribute("x2", c.x);
    arrowDraftEl.setAttribute("y2", c.y);
  }
  // arrow-draft 는 SVG 요소라서 HTMLElement 전용인 .hidden IDL 프로퍼티가 먹히지 않는다
  // (내용 속성으로 직접 지우고 넣어야 CSS [hidden] 선택자가 실제로 반응한다).
  arrowDraftEl.removeAttribute("hidden");
}

function updateArrowDraft(worldPt) {
  if (!arrowDraft) return;
  const fromNote = getNote(arrowDraft.fromId);
  if (!fromNote) {
    cancelArrowDraft();
    return;
  }
  // 커서가 있는 쪽 변에서 선이 나오도록, 커서를 크기 0짜리 "메모"로 취급해 매번 다시 고른다.
  const side = chooseSide(fromNote, { x: worldPt.x, y: worldPt.y, w: 0, h: 0 });
  const p1 = sideMidpoint(fromNote, side);
  arrowDraftEl.setAttribute("x1", p1.x);
  arrowDraftEl.setAttribute("y1", p1.y);
  arrowDraftEl.setAttribute("x2", worldPt.x);
  arrowDraftEl.setAttribute("y2", worldPt.y);
}

function cancelArrowDraft() {
  arrowDraft = null;
  canvas.classList.remove("linking");
  arrowDraftEl.setAttribute("hidden", "");
}

function completeArrowDraft(toId) {
  if (!arrowDraft) return;
  const fromId = arrowDraft.fromId;
  cancelArrowDraft();
  if (fromId === toId) return; // 자기 자신에게는 연결하지 않는다
  createArrow(fromId, toId);
}

document.addEventListener("mousemove", (e) => {
  if (!arrowDraft) return;
  updateArrowDraft(screenToWorld(e.clientX, e.clientY));
});

/* ===== 크기조절 핸들 ===== */

// 선택된 메모(들)를 감싸는 사각형(실제 경계 상자)의 네 모서리에 핸들을 배치하고,
// 그 사각형 자체도 점선으로 그려서 보여준다. (화면 좌표 기준)
//
// 원/마름모는 도형 모양 때문에 이 사각형의 모서리 쪽이 시각적으로 "비어" 보이는데,
// 핸들과 삭제 버튼은 (도형의 겉모습이 아니라) 이 사각형 기준으로 정확히 위치한다 —
// 점선 테두리를 같이 그려주는 이유가 바로 그걸 눈으로 확인할 수 있게 하기 위해서다.
function updateHandles() {
  if (selectedIds.size === 0) {
    resizeHandlesEl.hidden = true;
    selectionOutlineEl.hidden = true;
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  selectedIds.forEach((id) => {
    const el = noteEl(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  });

  if (!isFinite(left)) {
    resizeHandlesEl.hidden = true;
    selectionOutlineEl.hidden = true;
    return;
  }

  const l = left - canvasRect.left;
  const t = top - canvasRect.top;
  const r = right - canvasRect.left;
  const b = bottom - canvasRect.top;

  selectionOutlineEl.style.left = `${l}px`;
  selectionOutlineEl.style.top = `${t}px`;
  selectionOutlineEl.style.width = `${r - l}px`;
  selectionOutlineEl.style.height = `${b - t}px`;
  selectionOutlineEl.hidden = false;

  const corners = {
    nw: { x: l, y: t },
    ne: { x: r, y: t },
    sw: { x: l, y: b },
    se: { x: r, y: b },
  };

  Object.entries(corners).forEach(([corner, pos]) => {
    const handle = resizeHandlesEl.querySelector(`.resize-handle[data-corner="${corner}"]`);
    if (handle) {
      handle.style.left = `${pos.x}px`;
      handle.style.top = `${pos.y}px`;
    }
  });

  resizeHandlesEl.hidden = false;
}

// corner 를 쥐고 끌 때, 이 메모에서 "움직이지 않고 고정되는" 반대쪽 모서리의 월드 좌표.
function fixedCornerOf(corner, n) {
  switch (corner) {
    case "se":
      return { x: n.x, y: n.y };
    case "nw":
      return { x: n.x + n.w, y: n.y + n.h };
    case "ne":
      return { x: n.x, y: n.y + n.h };
    case "sw":
      return { x: n.x + n.w, y: n.y };
    default:
      return { x: n.x, y: n.y };
  }
}

function initResizeHandles() {
  resizeHandlesEl.querySelectorAll(".resize-handle").forEach((handleEl) => {
    const corner = handleEl.dataset.corner;

    handleEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (arrowDraft) return; // 화살표 연결 모드 중엔 크기 조절을 시작하지 않는다.
      e.stopPropagation(); // 캔버스의 팬/영역선택 로직으로 번지지 않게 막는다.
      e.preventDefault();

      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      const startNotes = ids.map((id) => {
        const n = notes.find((nn) => nn.id === id);
        return { id, el: noteEl(id), x: n.x, y: n.y, w: n.w, h: n.h };
      });

      // 선택된 메모 전체를 감싸는 사각형(월드 좌표) — 이 사각형을 "이미지 확대하듯"
      // 통째로 늘리고, 그 비율을 각 메모의 위치/크기에 그대로 적용한다.
      let bx0 = Infinity;
      let by0 = Infinity;
      let bx1 = -Infinity;
      let by1 = -Infinity;
      startNotes.forEach((n) => {
        bx0 = Math.min(bx0, n.x);
        by0 = Math.min(by0, n.y);
        bx1 = Math.max(bx1, n.x + n.w);
        by1 = Math.max(by1, n.y + n.h);
      });
      const box = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
      const anchor = fixedCornerOf(corner, box); // 반대쪽 모서리 — 드래그해도 움직이지 않는 기준점
      const startCorner = {
        x: corner.includes("w") ? bx0 : bx1,
        y: corner[0] === "n" ? by0 : by1,
      };
      const startDist =
        Math.hypot(startCorner.x - anchor.x, startCorner.y - anchor.y) || 1;

      // 어떤 메모든 MIN_NOTE_SIZE 밑으로 줄어들지 않도록, 축별로 허용되는 최소 배율을 미리 구해둔다.
      const minOriginalW = Math.min(...startNotes.map((n) => n.w));
      const minOriginalH = Math.min(...startNotes.map((n) => n.h));
      const minScaleX = MIN_NOTE_SIZE / minOriginalW;
      const minScaleY = MIN_NOTE_SIZE / minOriginalH;
      const minUniformScale = Math.max(minScaleX, minScaleY);

      let moved = false;

      const onMove = (ev) => {
        if (
          !moved &&
          Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 2
        ) {
          moved = true;
        }

        const worldPt = screenToWorld(ev.clientX, ev.clientY);

        let scaleX;
        let scaleY;
        if (ev.shiftKey) {
          // Shift: 원래 가로세로 비율을 유지한 채(대각선 거리 기준) 한 배율로만 조절.
          const dist = Math.hypot(worldPt.x - anchor.x, worldPt.y - anchor.y);
          const uniform = Math.max(dist / startDist, minUniformScale, 0.05);
          scaleX = uniform;
          scaleY = uniform;
        } else {
          // 기본: 가로/세로를 각각 독립적으로 자유롭게 조절.
          const rawW = corner.includes("w") ? anchor.x - worldPt.x : worldPt.x - anchor.x;
          const rawH = corner[0] === "n" ? anchor.y - worldPt.y : worldPt.y - anchor.y;
          scaleX = Math.max(rawW / box.w, minScaleX, 0.05);
          scaleY = Math.max(rawH / box.h, minScaleY, 0.05);
        }

        // 그룹의 anchor(고정 모서리)를 기준으로, 각 메모의 위치와 크기를 같은 비율로 함께 늘린다.
        // (메모가 하나만 선택된 경우 box 가 곧 그 메모라서, 자기 자신의 반대쪽 모서리만 고정된 채
        //  크기만 바뀌는 기존 단일 리사이즈와 결과가 같아진다.)
        startNotes.forEach((sn) => {
          const newW = Math.max(MIN_NOTE_SIZE, sn.w * scaleX);
          const newH = Math.max(MIN_NOTE_SIZE, sn.h * scaleY);
          const newX = anchor.x + (sn.x - anchor.x) * scaleX;
          const newY = anchor.y + (sn.y - anchor.y) * scaleY;

          const n = notes.find((nn) => nn.id === sn.id);
          if (!n) return;
          n.x = newX;
          n.y = newY;
          n.w = newW;
          n.h = newH;
          if (sn.el) {
            sn.el.style.left = `${newX}px`;
            sn.el.style.top = `${newY}px`;
            sn.el.style.width = `${newW}px`;
            sn.el.style.height = `${newH}px`;
          }
        });

        updateHandles();
        updateAllArrowGeometry();
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) commitChange();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

/* ===== 메모 ===== */

function createNote(worldX, worldY, text = "", shape = nextShape) {
  const note = {
    id: nextId++,
    x: worldX,
    y: worldY,
    w: DEFAULT_NOTE_W,
    h: DEFAULT_NOTE_H,
    text,
    shape,
  };
  notes.push(note);
  const el = renderNote(note);
  commitChange();
  return el;
}

function removeNoteFromState(id) {
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  notes.splice(idx, 1);
  const el = noteEl(id);
  if (el) el.remove();
  selectedIds.delete(id);

  // 이 메모에 연결돼 있던 화살표도 함께 지운다.
  const connectedArrowIds = arrows
    .filter((a) => a.fromId === id || a.toId === id)
    .map((a) => a.id);
  connectedArrowIds.forEach(removeArrowFromState);
}

function deleteNote(id) {
  removeNoteFromState(id);
  commitChange();
}

function renderNote(note) {
  const el = document.createElement("div");
  el.className = "note";
  el.dataset.id = String(note.id);
  el.dataset.shape = note.shape || DEFAULT_SHAPE;
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;
  el.style.width = `${note.w}px`;
  el.style.height = `${note.h}px`;

  // 선택 시 강조 "링" 전용 레이어 (.note-shape 보다 먼저 그려져 뒤에 깔린다).
  // 마름모는 clip-path 때문에 box-shadow 링을 못 써서 이 레이어로 대신 흉내낸다.
  const ringEl = document.createElement("div");
  ringEl.className = "note-ring";
  el.appendChild(ringEl);

  // 배경/테두리/그림자 전용 레이어. 텍스트/삭제버튼은 여기 안 들어있어서
  // 마름모의 clip-path 에 같이 잘려나가지 않는다.
  const shapeEl = document.createElement("div");
  shapeEl.className = "note-shape";
  el.appendChild(shapeEl);

  const textEl = document.createElement("div");
  textEl.className = "note-text";
  textEl.contentEditable = "true";
  textEl.spellcheck = false;
  textEl.dataset.placeholder = "내용 입력...";
  textEl.textContent = note.text;

  let textBeforeEdit = note.text;
  textEl.addEventListener("focus", () => {
    textBeforeEdit = note.text;
  });
  textEl.addEventListener("input", () => {
    note.text = textEl.textContent;
    save();
  });
  textEl.addEventListener("blur", () => {
    // 편집 중 글자 하나하나가 아니라, 편집을 마친 시점에 한 칸으로 기록한다.
    if (note.text !== textBeforeEdit) {
      commitChange();
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "note-delete-btn";
  deleteBtn.setAttribute("aria-label", "메모 삭제");
  deleteBtn.textContent = "×";
  // 삭제 버튼 위에서의 mousedown 이 메모 선택/드래그로 이어지지 않도록 막는다.
  deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteNote(note.id);
  });

  el.appendChild(textEl);
  el.appendChild(deleteBtn);
  world.appendChild(el);
  makeNoteInteractive(el, note, textEl);
  return el;
}

function makeNoteInteractive(el, note, textEl) {
  // --- 우클릭: 화살표 연결 모드 시작 ---
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation(); // 캔버스의 빈 곳 우클릭 퀵메뉴가 대신 뜨지 않도록 막는다.
    startArrowDraft(note.id);
  });

  // --- 클릭으로 선택 + 드래그로 이동 (여러 개가 선택되어 있으면 다같이 이동) ---
  el.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      // 우클릭도 좌클릭과 같은 이유로 preventDefault 가 필요하다: 안 막으면
      // note-text(contentEditable) 에 브라우저가 자동으로 포커스를 넣어버려서,
      // 화살표 연결 모드로 우클릭한 것뿐인데 그 메모가 "편집 중"으로 오인되어
      // 나중에 드래그 이동이 먹통이 된다.
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    // 화살표 연결 모드 중이라면, 이 메모는 "이동/선택 대상"이 아니라 "연결 끝점"이다.
    if (arrowDraft) {
      e.preventDefault();
      e.stopPropagation();
      completeArrowDraft(note.id);
      return;
    }

    if (e.ctrlKey) return; // Ctrl+드래그는 메모 위에서 시작해도 화면 이동으로 취급한다.
    // 이 메모를 편집 중이면 드래그 대신 글자 선택을 허용한다.
    if (document.activeElement === textEl) return;

    // 브라우저 기본 동작을 막는다: 안 막으면 note-text(contentEditable) 위를 클릭할 때마다
    // 자동으로 그 안에 포커스가 들어가서, 그냥 "선택"만 한 것도 "편집 중"으로 오인되어
    // Delete/Ctrl+Z 단축키가 먹통이 된다. 드래그 중 텍스트가 파랗게 선택되는 것도 막아준다.
    e.preventDefault();
    e.stopPropagation(); // 캔버스 쪽 클릭(선택 해제)·드래그 선택 로직으로 번지지 않게 막는다.

    // Shift+클릭: 이 메모만 선택/해제를 토글한다 (기존 선택은 그대로 두고). 이동은 시작하지 않는다.
    if (e.shiftKey) {
      toggleSelection(note.id);
      return;
    }

    deselectAllArrows(); // 메모를 (일반) 선택하면 화살표 선택은 비운다.

    // 이미 여러 개가 선택된 상태에서 그 중 하나를 누른 거라면, 선택을 유지한 채
    // 그룹으로 드래그할 수 있게 한다. (그냥 클릭만 하고 끝나면 mouseup 에서 단일 선택으로 좁힌다)
    const partOfMultiSelection = selectedIds.size > 1 && selectedIds.has(note.id);
    if (!partOfMultiSelection) {
      selectOnly(note.id);
    }

    const draggedIds = Array.from(selectedIds);
    const startPositions = draggedIds.map((id) => {
      const n = notes.find((nn) => nn.id === id);
      return { id, el: noteEl(id), x: n.x, y: n.y };
    });

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    startPositions.forEach((p) => p.el && p.el.classList.add("dragging"));

    const onMove = (ev) => {
      // 화면에서 움직인 픽셀을 scale 로 나눠 월드 좌표 변화량으로 바꾼다.
      const dx = (ev.clientX - startX) / view.scale;
      const dy = (ev.clientY - startY) / view.scale;
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) {
        moved = true;
      }
      startPositions.forEach((p) => {
        const n = notes.find((nn) => nn.id === p.id);
        if (!n) return;
        n.x = p.x + dx;
        n.y = p.y + dy;
        if (p.el) {
          p.el.style.left = `${n.x}px`;
          p.el.style.top = `${n.y}px`;
        }
      });
      updateHandles();
      updateAllArrowGeometry();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      startPositions.forEach((p) => p.el && p.el.classList.remove("dragging"));
      if (moved) {
        commitChange();
      } else if (partOfMultiSelection) {
        // 그룹 안의 메모 하나를 그냥 클릭만 한 경우 → 그 메모 하나만 선택으로 좁힌다.
        selectOnly(note.id);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // --- 더블클릭으로 편집 시작 ---
  el.addEventListener("dblclick", (e) => {
    e.stopPropagation(); // 캔버스의 "새 메모 생성"이 실행되지 않도록 막는다.
    textEl.focus();
    // 커서를 글자 맨 끝으로 보낸다.
    const range = document.createRange();
    range.selectNodeContents(textEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

/* ===== 도형 선택(다음 생성 도형) & 빈 곳 우클릭 퀵메뉴 ===== */

function setNextShape(shape) {
  if (!SHAPE_LABELS[shape]) return;
  nextShape = shape;
  nextShapeLabelEl.textContent = SHAPE_LABELS[shape];
  updateQuickMenuShapeHighlight();
}

function updateQuickMenuShapeHighlight() {
  quickMenuEl.querySelectorAll(".shape-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shape === nextShape);
  });
}

let quickMenuWorldPos = null; // 퀵메뉴를 열었을 때의 월드 좌표 (거기에 메모를 추가하려고 기억해둠)

function openQuickMenu(clientX, clientY, worldPos) {
  quickMenuWorldPos = worldPos;
  updateQuickMenuShapeHighlight();
  quickMenuEl.hidden = false;

  // 화면 밖으로 나가지 않도록, 실제 크기를 잰 뒤 위치를 보정한다.
  const menuRect = quickMenuEl.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  quickMenuEl.style.left = `${Math.max(8, left)}px`;
  quickMenuEl.style.top = `${Math.max(8, top)}px`;
}

function closeQuickMenu() {
  quickMenuEl.hidden = true;
  quickMenuWorldPos = null;
}

quickMenuEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".quick-menu-item");
  if (!btn) return;

  if (btn.dataset.action === "create" && quickMenuWorldPos) {
    const p = quickMenuWorldPos;
    const el = createNote(p.x - DEFAULT_NOTE_W / 2, p.y - DEFAULT_NOTE_H / 2, "", nextShape);
    el.querySelector(".note-text").focus();
  } else if (btn.dataset.shape) {
    setNextShape(btn.dataset.shape);
  }

  closeQuickMenu();
});

// 메뉴 바깥에서 새로 뭔가를 누르면(클릭/드래그 시작) 메뉴를 닫는다.
document.addEventListener("mousedown", (e) => {
  if (!quickMenuEl.hidden && !quickMenuEl.contains(e.target)) {
    closeQuickMenu();
  }
});

/* ===== 캔버스: 팬 / 줌 / 생성 / 선택 ===== */

// 빈 곳 우클릭 → 퀵메뉴(메모 추가 / 도형 전환). 메모 위 우클릭은 각 메모의
// contextmenu 핸들러가 화살표 연결 모드로 처리하고 stopPropagation 하므로 여기까진 안 온다.
// 브라우저 기본 메뉴는 항상 막는다.
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (e.target !== canvas) return;
  const worldPos = screenToWorld(e.clientX, e.clientY);
  openQuickMenu(e.clientX, e.clientY, worldPos);
});

// 화면 이동(팬): 휠(가운데) 버튼 드래그, 또는 Ctrl + 왼쪽 버튼 드래그.
canvas.addEventListener("mousedown", (e) => {
  if (arrowDraft) return; // 화살표 연결 모드 중엔 팬을 시작하지 않는다.
  const isPanGesture = e.button === 1 || (e.button === 0 && e.ctrlKey);
  if (!isPanGesture) return;
  if (e.button === 1) e.preventDefault(); // 휠 버튼의 브라우저 기본 자동 스크롤 방지

  const startX = e.clientX;
  const startY = e.clientY;
  const origX = view.x;
  const origY = view.y;

  canvas.classList.add("panning");

  const onMove = (ev) => {
    view.x = origX + (ev.clientX - startX);
    view.y = origY + (ev.clientY - startY);
    applyTransform();
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    canvas.classList.remove("panning");
    save();
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// 왼쪽 버튼(Ctrl 없이)으로 빈 곳을 드래그 → 사각형 영역에 걸친 메모를 모두 선택.
// (움직이지 않고 떼면 그냥 클릭이므로, 아래 click 핸들러가 선택 해제를 처리한다)
let justBoxSelected = false;

canvas.addEventListener("mousedown", (e) => {
  if (arrowDraft) return; // 화살표 연결 모드 중엔 영역 선택을 시작하지 않는다.
  if (e.button !== 0 || e.ctrlKey) return;
  if (e.target !== canvas) return; // 메모 위에서 시작된 드래그는 각 메모의 핸들러가 처리

  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

  // Shift를 누른 채 시작했다면, 드래그 전 선택 상태를 기준으로 영역에 걸리는 것들만
  // 토글한다: 원래 선택돼 있었으면 해제, 아니었으면 추가. 영역 밖의 기존 선택은 그대로 둔다.
  // (Shift+클릭과 같은 원칙 — "합치기"가 아니라 "뒤집기")
  const isAdditive = e.shiftKey;
  const baseSelectionSet = new Set(selectedIds);
  const baseArrowSelectionSet = new Set(selectedArrowIds);

  const onMove = (ev) => {
    if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) {
      moved = true;
      selectionBoxEl.hidden = false;
    }
    if (!moved) return;

    const left = Math.min(startX, ev.clientX);
    const top = Math.min(startY, ev.clientY);
    selectionBoxEl.style.left = `${left}px`;
    selectionBoxEl.style.top = `${top}px`;
    selectionBoxEl.style.width = `${Math.abs(ev.clientX - startX)}px`;
    selectionBoxEl.style.height = `${Math.abs(ev.clientY - startY)}px`;

    const rectIds = notesInScreenRect(startX, startY, ev.clientX, ev.clientY);
    const rectArrowIds = arrowsInScreenRect(startX, startY, ev.clientX, ev.clientY);
    if (isAdditive) {
      const rectSet = new Set(rectIds);
      const result = [];
      baseSelectionSet.forEach((id) => {
        if (!rectSet.has(id)) result.push(id); // 영역 밖의 기존 선택은 그대로 유지
      });
      rectIds.forEach((id) => {
        if (!baseSelectionSet.has(id)) result.push(id); // 원래 미선택 + 영역 안 → 추가
      });
      setSelection(result);

      const rectArrowSet = new Set(rectArrowIds);
      const arrowResult = [];
      baseArrowSelectionSet.forEach((id) => {
        if (!rectArrowSet.has(id)) arrowResult.push(id);
      });
      rectArrowIds.forEach((id) => {
        if (!baseArrowSelectionSet.has(id)) arrowResult.push(id);
      });
      setArrowSelection(arrowResult);
    } else {
      setSelection(rectIds);
      setArrowSelection(rectArrowIds);
    }
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    selectionBoxEl.hidden = true;
    if (moved) justBoxSelected = true; // 뒤이어 발생할 click 에서 선택 해제되지 않도록
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// 빈 곳 클릭 → 선택 해제 (방금 영역 선택을 했다면 건너뛴다. Shift를 누른 채라면 선택을 지우지 않는다)
// 화살표 연결 모드 중이라면, 선택 해제 대신 연결을 취소한다.
canvas.addEventListener("click", (e) => {
  if (arrowDraft) {
    cancelArrowDraft();
    return;
  }
  if (justBoxSelected) {
    justBoxSelected = false;
    return;
  }
  if (e.shiftKey) return;
  if (e.target === canvas) {
    deselectAll();
    deselectAllArrows();
  }
});

// 빈 곳 더블클릭 → 새 메모 (커서 위치에 대략 중앙 정렬)
canvas.addEventListener("dblclick", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  const el = createNote(p.x - DEFAULT_NOTE_W / 2, p.y - DEFAULT_NOTE_H / 2);
  el.querySelector(".note-text").focus();
});

// 스크롤 → 커서 위치를 기준으로 확대 / 축소
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, view.scale * factor)
    );

    // 커서 아래의 월드 지점이 그대로 유지되도록 offset 을 재계산한다.
    const mx = e.clientX;
    const my = e.clientY;
    const wx = (mx - view.x) / view.scale;
    const wy = (my - view.y) / view.scale;

    view.scale = newScale;
    view.x = mx - wx * newScale;
    view.y = my - wy * newScale;

    applyTransform();
    save();
  },
  { passive: false }
);

resetBtn.addEventListener("click", () => {
  view.x = 0;
  view.y = 0;
  view.scale = 1;
  applyTransform();
  save();
});

/* ===== 키보드: 선택된 메모/화살표 삭제 ===== */

document.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (selectedIds.size === 0 && selectedArrowIds.size === 0) return;

  // 텍스트를 입력하는 중이면(메모 편집, 다른 입력 필드 등) 글자 삭제로 취급한다.
  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return;
  }

  e.preventDefault(); // Backspace 의 브라우저 "뒤로 가기" 동작 방지
  deleteSelectedObjects();
});

/* ===== 키보드: 실행취소 / 다시실행 ===== */

document.addEventListener("keydown", (e) => {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return;

  const key = e.key.toLowerCase();
  if (key !== "z" && key !== "y") return;

  // 텍스트 편집 중에는 건드리지 않는다 — contentEditable 의 문자 단위
  // 기본 되돌리기(브라우저 내장)를 그대로 쓰게 둔다.
  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return;
  }

  e.preventDefault();
  if (key === "y" || (key === "z" && e.shiftKey)) {
    redo();
  } else {
    undo();
  }
});

/* ===== 키보드: 도형 단축키(1/2/3) & 퀵메뉴 닫기(Esc) ===== */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (arrowDraft) {
      cancelArrowDraft();
      return;
    }
    if (!quickMenuEl.hidden) closeQuickMenu();
    return;
  }

  if (e.key !== "1" && e.key !== "2" && e.key !== "3") return;

  // 텍스트 편집/입력 중이면 숫자는 평범한 글자 입력으로 취급한다.
  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return;
  }

  const shapeByKey = { 1: "rect", 2: "ellipse", 3: "diamond" };
  setNextShape(shapeByKey[e.key]);
});

/* ===== 시작 ===== */

initResizeHandles();
setNextShape(nextShape); // 라벨/퀵메뉴 표시를 초기 상태와 맞춘다
load();
notes.forEach(renderNote);
arrows.forEach(renderArrow);
applyTransform();

// 히스토리 시작점: 지금 이 상태로 되돌아올 수 있게 첫 칸을 기록해둔다.
history = [{ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId }];
historyIndex = 0;
