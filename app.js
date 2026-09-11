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
const zoomLabel = document.getElementById("zoom-label");
const resetBtn = document.getElementById("reset-view");

const STORAGE_KEY = "bluishCanvas.v1";
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

const view = { x: 0, y: 0, scale: 1 };
let notes = [];
let nextId = 1;

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

/* ===== 메모 ===== */

function createNote(worldX, worldY, text = "") {
  const note = { id: nextId++, x: worldX, y: worldY, text };
  notes.push(note);
  const el = renderNote(note);
  save();
  return el;
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

  textEl.addEventListener("input", () => {
    note.text = textEl.textContent;
    save();
  });

  el.appendChild(textEl);
  world.appendChild(el);
  makeNoteInteractive(el, note, textEl);
  return el;
}

function makeNoteInteractive(el, note, textEl) {
  // --- 드래그로 이동 ---
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // 이 메모를 편집 중이면 드래그 대신 글자 선택을 허용한다.
    if (document.activeElement === textEl) return;

    e.stopPropagation(); // 캔버스 팬이 시작되지 않도록 막는다.

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = note.x;
    const origY = note.y;
    let moved = false;

    el.classList.add("dragging");

    const onMove = (ev) => {
      // 화면에서 움직인 픽셀을 scale 로 나눠 월드 좌표 변화량으로 바꾼다.
      const dx = (ev.clientX - startX) / view.scale;
      const dy = (ev.clientY - startY) / view.scale;
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) {
        moved = true;
      }
      note.x = origX + dx;
      note.y = origY + dy;
      el.style.left = `${note.x}px`;
      el.style.top = `${note.y}px`;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      el.classList.remove("dragging");
      if (moved) save();
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

/* ===== 캔버스: 팬 / 줌 / 생성 ===== */

// 빈 곳 드래그 → 화면 이동
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

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

/* ===== 시작 ===== */

load();
notes.forEach(renderNote);
applyTransform();
