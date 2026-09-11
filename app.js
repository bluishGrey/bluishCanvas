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
const zoomLabel = document.getElementById("zoom-label");
const resetBtn = document.getElementById("reset-view");

const STORAGE_KEY = "bluishCanvas.v1";
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const MAX_HISTORY = 50;

const view = { x: 0, y: 0, scale: 1 };
let notes = [];
let nextId = 1;
let selectedIds = new Set(); // 현재 선택된 메모 id 들

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
      JSON.stringify({ view, notes, nextId })
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
    nextId = data.nextId || notes.length + 1;
  } catch (e) {
    console.warn("불러오기 실패:", e);
  }
}

/* ===== 실행취소 / 다시실행 ===== */

function cloneNotes() {
  return notes.map((n) => ({ ...n }));
}

// 지금까지의 변경을 히스토리 한 칸으로 확정한다. (생성/이동/삭제/텍스트 수정 완료 시점에 호출)
function pushHistory() {
  if (isRestoringHistory) return;
  history = history.slice(0, historyIndex + 1); // 이후의 "다시실행" 가능했던 기록은 버린다
  history.push({ notes: cloneNotes(), nextId });
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
  notes = snapshot.notes.map((n) => ({ ...n }));
  nextId = snapshot.nextId;
  selectedIds = new Set(); // 대상이 바뀌므로 선택은 비운다
  notes.forEach(renderNote);
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
}

function selectOnly(id) {
  setSelection(id === null ? [] : [id]);
}

function deselectAll() {
  setSelection([]);
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

/* ===== 메모 ===== */

function createNote(worldX, worldY, text = "") {
  const note = { id: nextId++, x: worldX, y: worldY, text };
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
}

function deleteNote(id) {
  removeNoteFromState(id);
  commitChange();
}

function deleteSelectedNotes() {
  if (selectedIds.size === 0) return;
  Array.from(selectedIds).forEach(removeNoteFromState);
  commitChange();
}

function renderNote(note) {
  const el = document.createElement("div");
  el.className = "note";
  el.dataset.id = String(note.id);
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;

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
  // --- 클릭으로 선택 + 드래그로 이동 (여러 개가 선택되어 있으면 다같이 이동) ---
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // 이 메모를 편집 중이면 드래그 대신 글자 선택을 허용한다.
    if (document.activeElement === textEl) return;

    e.stopPropagation(); // 캔버스 쪽 클릭(선택 해제)·드래그 선택 로직으로 번지지 않게 막는다.

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

/* ===== 캔버스: 팬 / 줌 / 생성 / 선택 ===== */

// 오른쪽 버튼 드래그 → 화면 이동.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 2) return;

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

// 왼쪽 버튼으로 빈 곳을 드래그 → 사각형 영역에 걸친 메모를 모두 선택.
// (움직이지 않고 떼면 그냥 클릭이므로, 아래 click 핸들러가 선택 해제를 처리한다)
let justBoxSelected = false;

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target !== canvas) return; // 메모 위에서 시작된 드래그는 각 메모의 핸들러가 처리

  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

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

    setSelection(notesInScreenRect(startX, startY, ev.clientX, ev.clientY));
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

// 빈 곳 클릭 → 선택 해제 (방금 영역 선택을 했다면 건너뛴다)
canvas.addEventListener("click", (e) => {
  if (justBoxSelected) {
    justBoxSelected = false;
    return;
  }
  if (e.target === canvas) deselectAll();
});

// 빈 곳 더블클릭 → 새 메모 (커서 위치에 대략 중앙 정렬)
canvas.addEventListener("dblclick", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  const el = createNote(p.x - 85, p.y - 23);
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

/* ===== 키보드: 선택된 메모 삭제 ===== */

document.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (selectedIds.size === 0) return;

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
  deleteSelectedNotes();
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

/* ===== 시작 ===== */

load();
notes.forEach(renderNote);
applyTransform();

// 히스토리 시작점: 지금 이 상태로 되돌아올 수 있게 첫 칸을 기록해둔다.
history = [{ notes: cloneNotes(), nextId }];
historyIndex = 0;
