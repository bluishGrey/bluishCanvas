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
const selectionRemoveFromGroupBtn = document.getElementById("selection-remove-from-group-btn");
const selectionDeleteBtn = document.getElementById("selection-delete-btn");
const quickMenuEl = document.getElementById("quick-menu");
const zoomLabel = document.getElementById("zoom-label");
const resetBtn = document.getElementById("reset-view");
const arrowsLayerEl = document.getElementById("arrows-layer");
const arrowDraftEl = document.getElementById("arrow-draft");
const sidebarEl = document.getElementById("sidebar");
const pageTreeEl = document.getElementById("page-tree");
const addPageBtn = document.getElementById("add-page-btn");
const addFolderBtn = document.getElementById("add-folder-btn");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const sidebarOpenBtn = document.getElementById("sidebar-open-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFileInput = document.getElementById("import-file-input");
const lastExportInfoEl = document.getElementById("last-export-info");
const lastImportInfoEl = document.getElementById("last-import-info");
const stylePanelEmptyEl = document.getElementById("style-panel-empty");
const stylePanelBodyEl = document.getElementById("style-panel-body");
const removeFromGroupBtn = document.getElementById("remove-from-group-btn");
const groupDropHintEl = document.getElementById("group-drop-hint");
const sidebarSearchInput = document.getElementById("sidebar-search-input");
const canvasSearchEl = document.getElementById("canvas-search");
const canvasSearchInput = document.getElementById("canvas-search-input");
const canvasSearchCountEl = document.getElementById("canvas-search-count");
const canvasSearchCloseBtn = document.getElementById("canvas-search-close");
const canvasSearchBtn = document.getElementById("canvas-search-btn");
const lassoBtn = document.getElementById("lasso-btn");
const lassoPathEl = document.getElementById("lasso-path");
const groupsLayerEl = document.getElementById("groups-layer");
const mermaidBtn = document.getElementById("mermaid-btn");
const mermaidPopup = document.getElementById("mermaid-popup");
const mermaidCloseBtn = document.getElementById("mermaid-close-btn");
const mermaidWarningsEl = document.getElementById("mermaid-warnings");
const mermaidBlocksEl = document.getElementById("mermaid-blocks");
const mermaidImportBtn = document.getElementById("mermaid-import-btn");
const mermaidImportPopup = document.getElementById("mermaid-import-popup");
const mermaidImportCloseBtn = document.getElementById("mermaid-import-close-btn");
const mermaidImportTextEl = document.getElementById("mermaid-import-text");
const mermaidImportWarningsEl = document.getElementById("mermaid-import-warnings");
const mermaidImportRunBtn = document.getElementById("mermaid-import-run-btn");
const rearrangeBtn = document.getElementById("rearrange-btn");
const groupContextMenuEl = document.getElementById("group-context-menu");
const noteContextMenuEl = document.getElementById("note-context-menu");
const quickMenuGroupHintEl = document.getElementById("quick-menu-group-hint");
const helpBtn = document.getElementById("help-btn");
const helpPopup = document.getElementById("help-popup");
const helpCloseBtn = document.getElementById("help-close-btn");
const SVG_NS = "http://www.w3.org/2000/svg";

const STORAGE_KEY = "bluishCanvas.v2";
const LEGACY_STORAGE_KEY = "bluishCanvas.v1"; // 페이지/폴더 기능 이전의 단일 캔버스 저장 형식
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const MAX_HISTORY = 50;
const DEFAULT_NOTE_W = 170;
const DEFAULT_NOTE_H = 70;
const MIN_NOTE_SIZE = 60; // 메모가 이보다 작게 줄어들지는 않는다
const MAX_AUTO_FIT_NOTE_H = 480; // 텍스트 넘침에 맞춰 자동으로 키울 때의 상한 — 무한정 커지지 않도록
const DEFAULT_SHAPE = "rect";
// 플로우차트 도형 6종 — 이름은 기하학적 모양이 아니라 흐름도에서의 "용도"를 그대로 쓴다
// (Mermaid 플로우차트 문법의 표준 도형 이름과도 맞춘 것 — 아래 flowchartNodeLine 참고).
// SHAPE_ORDER 는 단축키(1~6)·미니 팔레트·퀵메뉴가 전부 공유하는 표시 순서다.
const SHAPE_LABELS = {
  rect: "단계",
  diamond: "분기",
  stadium: "시작/끝",
  hexagon: "준비/설정",
  parallelogram: "입력",
  "parallelogram-rev": "출력",
};
const SHAPE_ORDER = ["rect", "diamond", "stadium", "hexagon", "parallelogram", "parallelogram-rev"];
const SHAPE_GLYPHS = {
  rect: "▭",
  diamond: "◇",
  stadium: "⬭",
  hexagon: "⬡",
  parallelogram: "/",
  "parallelogram-rev": "\\",
};

// 메모 꾸미기(사이드바 "꾸미기" 패널)의 기본값. 기존 메모(이 필드들이 아직 없는 데이터)를
// backfillNoteDefaults 로 채울 때도 이 값들을 쓰므로, 꾸미기 기능이 생기기 전 메모의
// 겉모습은 이 상수들이 지금 CSS 기본값과 똑같은 한 그대로 유지된다.
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_TEXT_ALIGN = "center";
const DEFAULT_BORDER_WIDTH = 1;

/* ===== 다이어그램 타입 (Mermaid 변환용) =====
 * 도형마다 "이건 플로우차트의 일부다 / 마인드맵의 일부다"를 지정한다. 페이지 단위가 아니라
 * 도형 단위라서, 한 페이지에 두 종류가 공존할 수 있다. null = 미지정(아직 안 정함)이며,
 * 이 기능이 생기기 전에 만든 메모는 전부 미지정으로 채워진다. */
const DIAGRAM_TYPE_LABELS = { flowchart: "플로우차트", mindmap: "마인드맵" };
const DEFAULT_DIAGRAM_TYPE = "flowchart";

// 한글 단어 뒤에 "로/으로" 조사를 받침 유무에 맞게 붙인다("마인드맵" → "마인드맵으로",
// "플로우차트" → "플로우차트로"). 완성형 한글 범위 밖의 글자로 끝나면 그냥 "로"를 붙인다.
function withRoParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}로`;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return hasBatchim ? `${word}으로` : `${word}로`;
}

const view = { x: 0, y: 0, scale: 1 };
let notes = [];
let nextId = 1;
let selectedIds = new Set(); // 현재 선택된 메모 id 들
let nextShape = DEFAULT_SHAPE; // 다음에 빈 곳을 더블클릭(또는 퀵메뉴로 생성)할 때 쓸 도형
let nextDiagramType = DEFAULT_DIAGRAM_TYPE; // 다음에 만들 메모에 붙일 다이어그램 타입

let arrows = []; // { id, fromId, toId, label? }
let nextArrowId = 1;
let selectedArrowIds = new Set();
let arrowDraft = null; // 화살표 연결 모드 중일 때만 { fromId }
let editingArrowLabelId = null; // 화살표 라벨을 입력 중인 화살표 id (한 번에 하나만)

/* ===== 그룹 =====
 * 올가미(라쏘)로 감싼 도형들의 묶음. Mermaid 로 내보낼 때 플로우차트의 subgraph 또는
 * 마인드맵 문서 하나가 된다. 그룹은 타입을 따로 저장하지 않고 멤버 도형의 diagramType 에서
 * 파생한다(한 군데만 진실을 두기 위해서 — 그룹 안 도형은 항상 같은 타입으로 유지된다).
 * 중첩은 없다: 도형 하나는 최대 한 그룹에만 속한다. */
let groups = []; // { id, name, noteIds: [...] }
let nextGroupId = 1;

// 실행취소/다시실행: notes 의 스냅샷 목록. history[historyIndex] 가 현재 상태.
// 팬/줌은 기록 대상이 아니다 (생성/이동/삭제/텍스트 수정만 기록).
let history = [];
let historyIndex = -1;
let isRestoringHistory = false;

/* ===== 페이지 / 폴더 (여러 개의 독립된 캔버스) =====
 *
 * 위의 view/notes/arrows/nextId/nextArrowId/selectedIds/history 등은 전부
 * "현재 열려 있는 페이지 하나"의 실시간 작업 상태다. 페이지를 여러 개 두기 위해
 * 그 상태 전체를 통째로 별도 페이지로 바꿔치기하는 방식을 쓴다(loadPageIntoGlobals) —
 * 기존의 메모/화살표/선택/히스토리 로직은 "지금 이 순간 열려 있는 페이지"만 신경 쓰면
 * 되고, 페이지 전환/저장 쪽만 그 상태를 통째로 읽고 쓰면 되게 만들기 위해서다.
 *
 * tree: 폴더/페이지 트리. 각 항목은
 *   폴더 { type:"folder", id, name, expanded, children:[...] }
 *   페이지 { type:"page", id, name }
 * pagesData: 페이지 id -> { view, notes, arrows, nextId, nextArrowId } (비활성 페이지들의 내용)
 * pageHistories: 페이지 id -> { history, historyIndex } (세션 동안만 메모리에 유지, 저장 안 함 —
 *   기존에도 실행취소 기록은 새로고침하면 초기화됐던 것과 같은 원칙)
 */
let tree = [];
let pagesData = {};
let pageHistories = {};
let activePageId = null;
let nextTreeId = 1;
let selectedTreeIds = new Set(); // 사이드바에서 다중 선택된 페이지/폴더 id 들 (Ctrl/Shift+클릭)
let treeSelectionAnchorId = null; // Shift+클릭 범위 선택의 기준점
let sidebarSearchQuery = ""; // 소문자로 다듬어진 사이드바 검색어. 비어있으면 필터링 안 함

// 마지막 내보내기/가져오기 "한 건"만 기억한다 (전체 기록 목록이 아니다).
// localStorage 에도 저장되고, 내보낸 JSON 파일 안에도 같이 담겨서 다른 컴퓨터로 옮겨가도
// 이어진다 — export 데이터 자체가 "이 데이터가 마지막으로 언제 내보내졌는지"를 알고 있는 셈.
let backupInfo = { lastExport: null, lastImport: null }; // { at: ISOString, filename } | null

function createEmptyPageData() {
  return { view: { x: 0, y: 0, scale: 1 }, notes: [], arrows: [], groups: [], nextId: 1, nextArrowId: 1, nextGroupId: 1 };
}

function backfillNoteDefaults(noteList) {
  noteList.forEach((n) => {
    if (typeof n.w !== "number") n.w = DEFAULT_NOTE_W;
    if (typeof n.h !== "number") n.h = DEFAULT_NOTE_H;
    if (!n.shape) n.shape = DEFAULT_SHAPE;
    // 도형을 6종으로 재구성하면서 원(ellipse)을 없애고 시작/끝(stadium)으로 대체했다 —
    // 기존에 저장돼 있던 원 도형은 자동으로 시작/끝으로 옮겨준다(요청 매핑 그대로).
    if (n.shape === "ellipse") n.shape = "stadium";
    if (n.bg === undefined) n.bg = null; // null = 커스텀 배경색 없음(기본 흰색)
    if (typeof n.fontSize !== "number") n.fontSize = DEFAULT_FONT_SIZE;
    if (!n.textAlign) n.textAlign = DEFAULT_TEXT_ALIGN;
    if (typeof n.borderWidth !== "number") n.borderWidth = DEFAULT_BORDER_WIDTH;
    if (n.diagramType === undefined) n.diagramType = null; // null = 다이어그램 타입 미지정
  });
}

// 페이지/폴더 기능이 생기기 전(v1)의 저장 데이터가 있으면, 페이지 하나로 옮겨온다.
function migrateLegacyData() {
  let raw;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const notesList = Array.isArray(data.notes) ? data.notes : [];
    backfillNoteDefaults(notesList);
    const pageData = {
      view: data.view || { x: 0, y: 0, scale: 1 },
      notes: notesList,
      arrows: Array.isArray(data.arrows) ? data.arrows : [],
      nextId: data.nextId || notesList.length + 1,
      nextArrowId: data.nextArrowId || 1,
    };
    const pageId = `p${nextTreeId++}`;
    return { pageId, pageData };
  } catch (e) {
    return null;
  }
}

function findNodeInfo(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { node: nodes[i], array: nodes, index: i };
    if (nodes[i].type === "folder") {
      const found = findNodeInfo(nodes[i].children || [], id);
      if (found) return found;
    }
  }
  return null;
}

function findFirstPageId(nodes) {
  for (const n of nodes) {
    if (n.type === "page") return n.id;
    if (n.type === "folder") {
      const found = findFirstPageId(n.children || []);
      if (found) return found;
    }
  }
  return null;
}

function collectPageIds(node) {
  if (node.type === "page") return [node.id];
  let ids = [];
  (node.children || []).forEach((child) => {
    ids = ids.concat(collectPageIds(child));
  });
  return ids;
}

/* ===== 저장 / 불러오기 (localStorage) ===== */

function serializeCurrentPage() {
  return { view: { ...view }, ...makeSnapshot() };
}

function save() {
  try {
    if (activePageId) pagesData[activePageId] = serializeCurrentPage();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tree, pages: pagesData, activePageId, nextTreeId, backupInfo })
    );
  } catch (e) {
    console.warn("저장 실패:", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      tree = Array.isArray(data.tree) ? data.tree : [];
      pagesData = data.pages && typeof data.pages === "object" ? data.pages : {};
      nextTreeId = data.nextTreeId || 1;
      activePageId = data.activePageId;
      if (!activePageId || !pagesData[activePageId]) {
        activePageId = findFirstPageId(tree);
      }
      if (data.backupInfo && typeof data.backupInfo === "object") {
        backupInfo = data.backupInfo;
      }
      Object.values(pagesData).forEach((p) => backfillNoteDefaults(p.notes || []));
      if (activePageId && pagesData[activePageId] && tree.length > 0) {
        return;
      }
    }
  } catch (e) {
    console.warn("불러오기 실패:", e);
  }

  // v2 데이터가 없다면: v1(페이지 기능 이전) 데이터를 페이지 하나로 옮겨오거나,
  // 그것도 없으면 완전히 새로 시작한다.
  const migrated = migrateLegacyData();
  if (migrated) {
    tree = [{ type: "page", id: migrated.pageId, name: "기본 페이지" }];
    pagesData = { [migrated.pageId]: migrated.pageData };
    activePageId = migrated.pageId;
  } else {
    const pageId = `p${nextTreeId++}`;
    tree = [{ type: "page", id: pageId, name: "페이지 1" }];
    pagesData = { [pageId]: createEmptyPageData() };
    activePageId = pageId;
  }
}

/* ===== 실행취소 / 다시실행 ===== */

function cloneNotes() {
  return notes.map((n) => ({ ...n }));
}

function cloneArrows() {
  return arrows.map((a) => ({ ...a }));
}

// noteIds 배열까지 새로 만들어야 한다 — 얕게만 복사하면 과거 스냅샷과 배열을 공유해서,
// 나중에 그룹 멤버가 바뀌면 되돌릴 수 없는 상태가 된다.
function cloneGroups() {
  return groups.map((g) => ({ ...g, noteIds: [...g.noteIds] }));
}

/* 페이지 하나의 "내용"(팬/줌 상태 제외)을 한 덩어리로 만들고 되돌리는 한 쌍.
 * 실행취소 스냅샷과 페이지 저장이 똑같은 모양을 쓰기 때문에, 앞으로 상태 필드가 늘어날 때
 * 여기 두 함수만 고치면 된다 (예전엔 같은 모양이 여섯 군데에 손으로 중복돼 있어서,
 * 한 곳만 빠뜨려도 "실행취소하면 새 필드가 사라지는" 버그가 나기 쉬웠다). */
function makeSnapshot() {
  return {
    notes: cloneNotes(),
    arrows: cloneArrows(),
    groups: cloneGroups(),
    nextId,
    nextArrowId,
    nextGroupId,
  };
}

// 스냅샷을 전역 상태로 되돌리고 메모/화살표를 다시 그린다. 선택 상태는 대상이 통째로
// 바뀌므로 비운다. 호출한 쪽에서 필요한 뒷정리(뷰 적용, 패널 갱신 등)를 이어서 한다.
function applySnapshot(snapshot) {
  world.querySelectorAll(".note").forEach((el) => el.remove());
  arrowsLayerEl.querySelectorAll(".arrow").forEach((el) => el.remove());

  notes = (snapshot.notes || []).map((n) => ({ ...n }));
  arrows = (snapshot.arrows || []).map((a) => ({ ...a }));
  groups = (snapshot.groups || []).map((g) => ({ ...g, noteIds: [...(g.noteIds || [])] }));
  nextId = snapshot.nextId || 1;
  nextArrowId = snapshot.nextArrowId || 1;
  nextGroupId = snapshot.nextGroupId || 1;
  selectedIds = new Set();
  selectedArrowIds = new Set();

  notes.forEach(renderNote);
  arrows.forEach(renderArrow);
  renderGroups();
}

// 지금까지의 변경을 히스토리 한 칸으로 확정한다. (생성/이동/삭제/텍스트 수정 완료 시점에 호출)
function pushHistory() {
  if (isRestoringHistory) return;
  history = history.slice(0, historyIndex + 1); // 이후의 "다시실행" 가능했던 기록은 버린다
  history.push(makeSnapshot());
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
  applySnapshot(snapshot);
  updateHandles();
  updateStylePanel();
  closeCanvasSearch(); // notes 를 통째로 다시 그렸으니, 남아있던 검색 하이라이트/결과는 무효
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

/* ===== 페이지 전환 =====
 * 지금 열려 있는 페이지의 모든 실시간 상태(view/notes/arrows/선택/화살표 초안/퀵메뉴 등)를
 * 통째로 다른 페이지 것으로 바꿔치기한다. undo/redo 의 restoreSnapshot 과 원리가 같다
 * (DOM 비우고 다시 그리기) — 다만 view 도 같이 바꾸고, 히스토리는 페이지별로 따로 보관한다. */

function loadPageIntoGlobals(pageData) {
  applySnapshot(pageData); // 메모/화살표/그룹 상태 교체 + 다시 그리기
  Object.assign(view, pageData.view || { x: 0, y: 0, scale: 1 });
  cancelArrowDraft();
  closeQuickMenu();
  closeCanvasSearch(); // 검색은 "현재 페이지 안"으로 범위가 한정되므로, 페이지가 바뀌면 닫는다

  applyTransform(); // 내부에서 updateHandles 도 같이 갱신된다
  updateStylePanel();
}

function switchToPage(pageId) {
  if (pageId === activePageId || !pagesData[pageId]) return;

  pagesData[activePageId] = serializeCurrentPage();
  pageHistories[activePageId] = { history, historyIndex };

  activePageId = pageId;
  loadPageIntoGlobals(pagesData[pageId]);

  const savedHist = pageHistories[pageId];
  if (savedHist) {
    history = savedHist.history;
    historyIndex = savedHist.historyIndex;
  } else {
    history = [makeSnapshot()];
    historyIndex = 0;
  }

  updateActivePageHighlight();
  save();
}

// "지금 열려 있는 페이지" 표시만 가볍게 갱신한다 (트리 구조는 안 바뀌므로 전체를
// 다시 그릴 필요가 없다 — 특히 renderSidebar() 로 통째로 다시 그리면 그 시점에
// 더블클릭 중이던 DOM 요소가 통째로 교체돼서 더블클릭 자체가 인식되지 않는 문제가 있었다).
function updateActivePageHighlight() {
  pageTreeEl.querySelectorAll(".tree-row.tree-page").forEach((row) => {
    row.classList.toggle("active", row.dataset.id === activePageId);
  });
}

/* ===== 사이드바: 페이지 / 폴더 트리 ===== */

function makeIconButton(label, title, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-icon-btn";
  btn.title = title;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function startRenaming(nameEl, node) {
  // 이름을 고치는 동안엔 드래그가 시작되지 않게 막는다 (renderSidebar 가 다시 그리면
  // 페이지 행은 자동으로 draggable=true 로 복구된다).
  const row = nameEl.closest(".tree-row");
  if (row) row.draggable = false;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "tree-rename-input";
  input.value = node.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    node.name = input.value.trim() || node.name;
    renderSidebar();
    save();
  };
  const cancel = () => {
    if (done) return;
    done = true;
    renderSidebar();
  };

  // 이름 입력칸 안에서의 클릭/드래그가 페이지 전환·트리 접기 등으로 번지지 않게 막는다.
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

function createPage(parentFolder) {
  const id = `p${nextTreeId++}`;
  pagesData[id] = createEmptyPageData();
  const node = { type: "page", id, name: "새 페이지" };
  const targetArray = parentFolder ? (parentFolder.children || (parentFolder.children = [])) : tree;
  targetArray.push(node);
  if (parentFolder) parentFolder.expanded = true;
  switchToPage(id); // 안에서 save() 까지 처리된다 (트리 구조는 안 바뀌는 일반 전환이라 렌더는 없음)
  renderSidebar(); // 방금 추가한 새 페이지 행 자체는 switchToPage 가 그려주지 않으므로 따로 호출
}

function createFolder(parentFolder) {
  const id = `f${nextTreeId++}`;
  const node = { type: "folder", id, name: "새 폴더", expanded: true, children: [] };
  const targetArray = parentFolder ? (parentFolder.children || (parentFolder.children = [])) : tree;
  targetArray.push(node);
  if (parentFolder) parentFolder.expanded = true;
  renderSidebar();
  save();
}

function deleteNodeAndPages(id, pageIds) {
  const info = findNodeInfo(tree, id);
  if (!info) return;
  info.array.splice(info.index, 1);

  pageIds.forEach((pid) => {
    delete pagesData[pid];
    delete pageHistories[pid];
  });

  // 지금 보고 있던 페이지가 지워졌다면, 남아있는 페이지 중 아무거나로 옮겨간다.
  // switchToPage 를 그대로 쓰지 않는 이유: 그 함수는 "현재 페이지를 저장"하는 것부터
  // 시작하는데, 지금은 현재 페이지 자체가 방금 삭제된 대상이라 되살리면 안 된다.
  if (pageIds.includes(activePageId)) {
    const replacementId = findFirstPageId(tree);
    activePageId = replacementId;
    loadPageIntoGlobals(pagesData[replacementId]);
    const savedHist = pageHistories[replacementId];
    if (savedHist) {
      history = savedHist.history;
      historyIndex = savedHist.historyIndex;
    } else {
      history = [makeSnapshot()];
      historyIndex = 0;
    }
  }

  renderSidebar();
  save();
}

function requestDeleteNode(node) {
  const pageIds = collectPageIds(node);
  const totalPages = collectPageIds({ type: "folder", children: tree }).length;
  if (pageIds.length >= totalPages) {
    alert("최소 한 개의 페이지는 있어야 합니다.");
    return;
  }

  const message =
    node.type === "folder"
      ? pageIds.length > 0
        ? `"${node.name}" 폴더와 그 안의 페이지 ${pageIds.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`
        : `"${node.name}" 폴더를 삭제할까요?`
      : `"${node.name}" 페이지를 삭제할까요? 되돌릴 수 없습니다.`;

  if (!confirm(message)) return;
  deleteNodeAndPages(node.id, pageIds);
}

/* ===== 사이드바 다중 선택 (Ctrl/Shift+클릭) ===== */

function setTreeSelection(idList) {
  selectedTreeIds = new Set(idList);
  updateTreeSelectionHighlight();
}

// 선택 강조(.tree-selected)만 갱신한다. renderSidebar() 처럼 DOM을 통째로 다시 만들지
// 않는 이유: 클릭 한 번마다 DOM 요소가 전부 새로 생기면, 더블클릭의 두 클릭 사이에
// 대상 요소가 바뀌어버려서 더블클릭(이름 변경) 자체가 인식되지 않게 된다.
function updateTreeSelectionHighlight() {
  pageTreeEl.querySelectorAll(".tree-row").forEach((row) => {
    row.classList.toggle("tree-selected", selectedTreeIds.has(row.dataset.id));
  });
}

function selectOnlyTree(id) {
  setTreeSelection(id == null ? [] : [id]);
}

function deselectAllTree() {
  setTreeSelection([]);
}

function toggleTreeSelection(id) {
  const next = new Set(selectedTreeIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  setTreeSelection(Array.from(next));
}

// 화면에 실제로 보이는(펼쳐진) 순서대로 id 를 나열한다 — Shift+클릭 범위 선택에 쓴다.
function flattenVisibleTreeIds(nodes = tree) {
  let ids = [];
  nodes.forEach((n) => {
    ids.push(n.id);
    if (n.type === "folder" && n.expanded) {
      ids = ids.concat(flattenVisibleTreeIds(n.children || []));
    }
  });
  return ids;
}

// 접혀 있는 폴더 안까지 포함해서 전부 순서대로 나열한다 — 다중 드래그 시 원래 순서를
// 그대로 유지하기 위한 정렬 기준으로 쓴다.
function flattenAllTreeIds(nodes = tree) {
  let ids = [];
  nodes.forEach((n) => {
    ids.push(n.id);
    if (n.type === "folder") {
      ids = ids.concat(flattenAllTreeIds(n.children || []));
    }
  });
  return ids;
}

function rangeSelectTree(targetId) {
  const flatIds = flattenVisibleTreeIds();
  const anchorIdx = flatIds.indexOf(treeSelectionAnchorId);
  const targetIdx = flatIds.indexOf(targetId);
  if (anchorIdx === -1 || targetIdx === -1) {
    selectOnlyTree(targetId);
    return;
  }
  const from = Math.min(anchorIdx, targetIdx);
  const to = Math.max(anchorIdx, targetIdx);
  setTreeSelection(flatIds.slice(from, to + 1));
}

/* ===== 사이드바 드래그 앤 드롭 (페이지/폴더 이동) ===== */

function isNodeOrDescendant(node, id) {
  if (node.id === id) return true;
  if (node.type !== "folder") return false;
  return (node.children || []).some((c) => isNodeOrDescendant(c, id));
}

// 각 id 가 조상 없이 "최상위로 드래그된" 항목인지 걸러낸다 — 폴더와 그 안의 항목이
// 동시에 선택돼 있으면, 안쪽 항목은 폴더를 옮길 때 자연히 같이 따라가므로 제외한다.
function filterTopLevelDraggedIds(ids) {
  const ancestorsOf = new Map();
  (function walk(nodes, ancestors) {
    nodes.forEach((n) => {
      ancestorsOf.set(n.id, ancestors);
      if (n.type === "folder") walk(n.children || [], ancestors.concat(n.id));
    });
  })(tree, []);

  const idSet = new Set(ids);
  return ids.filter((id) => {
    const ancestors = ancestorsOf.get(id) || [];
    return !ancestors.some((a) => idSet.has(a));
  });
}

let currentDropZone = null; // { targetId, zone } — zone: "into" | "before" | "after" | "root-end"

function clearDropIndicators() {
  pageTreeEl.querySelectorAll(".drop-target, .drop-before, .drop-after").forEach((el) => {
    el.classList.remove("drop-target", "drop-before", "drop-after");
  });
  pageTreeEl.classList.remove("drop-target-root");
}

// draggedIds(최상위 항목들)를 targetId 기준 zone 위치로 옮긴다.
// targetId 가 null 이면(zone="root-end") 맨 위 계층의 끝에 놓는다.
function moveTreeNodes(draggedIds, targetId, zone) {
  if (targetId) {
    // 대상이 드래그된 항목 자신이거나, 드래그된 폴더의 자손이면 무시한다
    // (자기 자신 위/안으로는 옮길 수 없다).
    const invalid = draggedIds.some((id) => {
      const info = findNodeInfo(tree, id);
      return info && isNodeOrDescendant(info.node, targetId);
    });
    if (invalid) return;
  }

  const topLevelIds = filterTopLevelDraggedIds(draggedIds);
  if (topLevelIds.length === 0) return;

  // 원래 트리 순서를 유지한 채로 옮긴다 (여러 개를 한번에 드래그했을 때 순서가 섞이지 않게).
  const orderedIds = flattenAllTreeIds().filter((id) => topLevelIds.includes(id));
  const nodesToMove = orderedIds
    .map((id) => findNodeInfo(tree, id))
    .filter(Boolean)
    .map((info) => info.node);
  if (nodesToMove.length === 0) return;

  // 하나씩 제자리에서 뽑아낸다 — 매번 새로 위치를 찾아야, 앞서 뽑아낸 것 때문에
  // 같은 배열 안의 인덱스가 밀린 것도 정확히 반영된다.
  nodesToMove.forEach((node) => {
    const info = findNodeInfo(tree, node.id);
    if (info) info.array.splice(info.index, 1);
  });

  let targetArray;
  let targetIndex;

  if (zone === "root-end" || targetId === null) {
    targetArray = tree;
    targetIndex = tree.length;
  } else if (zone === "into") {
    const folderInfo = findNodeInfo(tree, targetId);
    if (folderInfo && folderInfo.node.type === "folder") {
      if (!folderInfo.node.children) folderInfo.node.children = [];
      targetArray = folderInfo.node.children;
      targetIndex = targetArray.length;
      folderInfo.node.expanded = true;
    } else {
      targetArray = tree;
      targetIndex = tree.length;
    }
  } else {
    // before / after: 대상과 같은 배열의, 그 바로 앞/뒤 자리
    const targetInfo = findNodeInfo(tree, targetId);
    if (targetInfo) {
      targetArray = targetInfo.array;
      targetIndex = targetInfo.index + (zone === "after" ? 1 : 0);
    } else {
      targetArray = tree;
      targetIndex = tree.length;
    }
  }

  targetArray.splice(targetIndex, 0, ...nodesToMove);

  renderSidebar();
  save();
}

function handleTreeDrop(e, targetId, zone) {
  e.preventDefault();
  e.stopPropagation();
  clearDropIndicators();
  currentDropZone = null;

  const raw = e.dataTransfer.getData("text/plain");
  if (!raw) return;
  let draggedIds;
  try {
    draggedIds = JSON.parse(raw);
  } catch (err) {
    return;
  }
  if (!Array.isArray(draggedIds) || draggedIds.length === 0) return;

  moveTreeNodes(draggedIds, targetId, zone);
}

// 폴더/페이지 이름이 검색어를 포함하면 true. 폴더는 자신의 이름이 아니어도
// 자손 중 하나라도 일치하면 true (검색 중엔 "일치하는 게 들어있는 폴더"까지 보여야 하므로).
function nodeMatchesSearch(node, query) {
  if (node.name.toLowerCase().includes(query)) return true;
  if (node.type === "folder") {
    return (node.children || []).some((c) => nodeMatchesSearch(c, query));
  }
  return false;
}

function renderTreeNodes(nodes, container, depth) {
  const query = sidebarSearchQuery;
  const visibleNodes = query ? nodes.filter((n) => nodeMatchesSearch(n, query)) : nodes;
  visibleNodes.forEach((node) => {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.style.paddingLeft = `${depth * 16 + 6}px`;
    row.dataset.id = node.id;
    row.draggable = true;
    if (selectedTreeIds.has(node.id)) row.classList.add("tree-selected");

    if (node.type === "folder") {
      row.classList.add("tree-folder");
      const caret = document.createElement("span");
      caret.className = "tree-caret";
      // 검색 중에는(일치하는 자손을 보여줘야 하므로) 실제 expanded 값과 상관없이 펼친
      // 것처럼 보여준다 — 다만 node.expanded 자체는 건드리지 않아서, 검색어를 지우면
      // 검색 전 접힘/펼침 상태로 그대로 돌아온다.
      caret.textContent = node.expanded || query ? "▾" : "▸";
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        node.expanded = !node.expanded;
        renderSidebar();
        save();
      });
      row.appendChild(caret);
    } else {
      row.classList.add("tree-page");
      if (node.id === activePageId) row.classList.add("active");
      const icon = document.createElement("span");
      icon.className = "tree-page-icon";
      icon.textContent = "▭";
      row.appendChild(icon);
    }

    // --- 드래그 시작: 이 항목이 이미 선택돼 있었다면 선택된 것들을 다같이, 아니면 이것만 ---
    row.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      const draggedIds = selectedTreeIds.has(node.id) ? Array.from(selectedTreeIds) : [node.id];
      e.dataTransfer.setData("text/plain", JSON.stringify(draggedIds));
      e.dataTransfer.effectAllowed = "move";
      draggedIds.forEach((id) => {
        const el = pageTreeEl.querySelector(`.tree-row[data-id="${id}"]`);
        if (el) el.classList.add("dragging-row");
      });
      // 드래그 시작 시점에 다시 그리면 브라우저의 드래그 캡처가 깨질 수 있어서, 선택
      // 갱신은 한 틱 미룬다 (드래그 자체엔 영향 없음 — 이미 위에서 draggedIds 를 구해뒀다).
      if (!selectedTreeIds.has(node.id)) {
        setTimeout(() => {
          treeSelectionAnchorId = node.id;
          setTreeSelection([node.id]);
        }, 0);
      }
    });
    row.addEventListener("dragend", () => {
      pageTreeEl.querySelectorAll(".dragging-row").forEach((el) => el.classList.remove("dragging-row"));
      clearDropIndicators();
    });

    // --- 드래그 오버: 커서 높이에 따라 "폴더 안으로" / "위/아래 사이로" 를 구분한다 ---
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      const rect = row.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;

      let zone;
      if (node.type === "folder") {
        if (ratio < 0.25) zone = "before";
        else if (ratio > 0.75) zone = "after";
        else zone = "into";
      } else {
        zone = ratio < 0.5 ? "before" : "after";
      }

      clearDropIndicators();
      if (zone === "into") row.classList.add("drop-target");
      else if (zone === "before") row.classList.add("drop-before");
      else row.classList.add("drop-after");
      currentDropZone = { targetId: node.id, zone };
    });
    row.addEventListener("dragleave", (e) => {
      e.stopPropagation();
    });
    row.addEventListener("drop", (e) => {
      const zone = currentDropZone && currentDropZone.targetId === node.id ? currentDropZone.zone : "after";
      handleTreeDrop(e, node.id, zone);
    });

    const nameEl = document.createElement("span");
    nameEl.className = "tree-name";
    nameEl.textContent = node.name;
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRenaming(nameEl, node);
    });
    row.appendChild(nameEl);

    const actions = document.createElement("span");
    actions.className = "tree-actions";
    if (node.type === "folder") {
      actions.appendChild(
        makeIconButton("＋▭", "새 페이지", (e) => {
          e.stopPropagation();
          createPage(node);
        })
      );
      actions.appendChild(
        makeIconButton("＋▤", "새 폴더", (e) => {
          e.stopPropagation();
          createFolder(node);
        })
      );
    }
    actions.appendChild(
      makeIconButton("✎", "이름 변경", (e) => {
        e.stopPropagation();
        startRenaming(nameEl, node);
      })
    );
    actions.appendChild(
      makeIconButton("×", "삭제", (e) => {
        e.stopPropagation();
        requestDeleteNode(node);
      })
    );
    row.appendChild(actions);

    // --- 클릭: Shift=범위선택, Ctrl/Cmd=토글선택, 그냥 클릭=선택+원래 동작(전환/펼치기) ---
    row.addEventListener("click", (e) => {
      if (e.shiftKey) {
        rangeSelectTree(node.id);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        toggleTreeSelection(node.id);
        treeSelectionAnchorId = node.id;
        return;
      }

      treeSelectionAnchorId = node.id;
      setTreeSelection([node.id]); // 가벼운 클래스 갱신만 — 더블클릭 도중 DOM을 통째로 바꾸지 않는다

      if (node.type === "page") {
        switchToPage(node.id); // 실제로 페이지가 바뀔 때만 내부에서 renderSidebar() 까지 처리한다
      } else {
        node.expanded = !node.expanded;
        renderSidebar();
        save();
      }
    });

    container.appendChild(row);

    if (node.type === "folder" && (node.expanded || query)) {
      renderTreeNodes(node.children || [], container, depth + 1);
    }
  });
}

function renderSidebar() {
  pageTreeEl.innerHTML = "";
  renderTreeNodes(tree, pageTreeEl, 0);
}

// 트리 항목이 아닌, 사이드바의 빈 공간 위로 드래그하면 맨 위 계층의 끝으로 옮긴다
// (폴더 밖으로 빼내는 용도). 각 행의 dragover/drop 은 stopPropagation 하므로, 여기는
// 정말 빈 공간 위에 있을 때만 반응한다.
pageTreeEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  clearDropIndicators();
  pageTreeEl.classList.add("drop-target-root");
  currentDropZone = { targetId: null, zone: "root-end" };
});
pageTreeEl.addEventListener("dragleave", (e) => {
  if (e.target === pageTreeEl) pageTreeEl.classList.remove("drop-target-root");
});
pageTreeEl.addEventListener("drop", (e) => {
  handleTreeDrop(e, null, "root-end");
});

// 사이드바의 빈 공간을 클릭하면 다중 선택을 해제한다.
pageTreeEl.addEventListener("click", (e) => {
  if (e.target === pageTreeEl) deselectAllTree();
});

addPageBtn.addEventListener("click", () => createPage(null));
addFolderBtn.addEventListener("click", () => createFolder(null));

sidebarSearchInput.addEventListener("input", () => {
  sidebarSearchQuery = sidebarSearchInput.value.trim().toLowerCase();
  renderSidebar();
});

/* ===== 사이드바: 꾸미기 패널 ===== */

// 꾸미기 패널엔 이제 다이어그램 타입 하나만 남아 있다(배경색/텍스트크기/정렬/테두리굵기는
// Mermaid 변환에 전혀 반영되지 않아서 패널에서 제거했다 — note.bg 등 데이터 필드와
// applyNoteStyleToEl 렌더링 자체는 그대로 남아있으므로 예전에 꾸며둔 메모는 그대로 보인다).
document.querySelectorAll('#style-panel-body [data-style-field="diagramType"] button').forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = btn.dataset.value === "none" ? null : btn.dataset.value; // "미지정"은 null 로 저장한다
    applyStyleToSelection("diagramType", value);
  });
});

removeFromGroupBtn.addEventListener("click", removeSelectedNotesFromGroups);
selectionRemoveFromGroupBtn.addEventListener("mousedown", (e) => e.stopPropagation());
selectionRemoveFromGroupBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  removeSelectedNotesFromGroups();
});

selectionDeleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
selectionDeleteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  deleteSelectedObjects();
});

/* ===== 사이드바 접기 / 펼치기 ===== */

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
}

function toggleSidebar() {
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

sidebarToggleBtn.addEventListener("click", toggleSidebar);
sidebarOpenBtn.addEventListener("click", toggleSidebar);

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "b") return;

  // 텍스트 편집/입력 중이면 다른 단축키들과 마찬가지로 건드리지 않는다.
  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return;
  }

  e.preventDefault(); // 일부 브라우저의 기본 Ctrl+B(북마크바 토글 등) 동작 방지
  toggleSidebar();
});

/* ===== 전체 내보내기 / 가져오기 (JSON 백업) ===== */

function pad2(n) {
  return String(n).padStart(2, "0");
}

// "이름"이 siblings 안에서 이미 쓰이고 있으면 "이름 2", "이름 3", ... 처럼 안 겹치는 걸 찾는다.
function uniqueNameAmong(siblings, desiredName) {
  const existingNames = new Set(siblings.map((n) => n.name));
  if (!existingNames.has(desiredName)) return desiredName;
  let i = 2;
  while (existingNames.has(`${desiredName} ${i}`)) i++;
  return `${desiredName} ${i}`;
}

// ISO 문자열을 "2026-09-12 20:15" 형태로 짧게 표시한다.
function formatDateTimeShort(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 폴더 안까지 재귀적으로 세서 { pages, folders } 개수를 구한다.
function countTreeNodes(nodes) {
  let pages = 0;
  let folders = 0;
  nodes.forEach((n) => {
    if (n.type === "page") {
      pages++;
    } else {
      folders++;
      const sub = countTreeNodes(n.children || []);
      pages += sub.pages;
      folders += sub.folders;
    }
  });
  return { pages, folders };
}

// 사이드바 하단의 "마지막 내보내기/가져오기" 표시를 갱신한다.
function updateBackupInfoDisplay() {
  lastExportInfoEl.textContent = backupInfo.lastExport
    ? `마지막 내보내기: ${formatDateTimeShort(backupInfo.lastExport.at)}`
    : "마지막 내보내기: 없음";
  lastExportInfoEl.title = backupInfo.lastExport ? backupInfo.lastExport.filename : "";

  lastImportInfoEl.textContent = backupInfo.lastImport
    ? `마지막 가져오기: ${formatDateTimeShort(backupInfo.lastImport.at)}`
    : "마지막 가져오기: 없음";
  lastImportInfoEl.title = backupInfo.lastImport ? backupInfo.lastImport.filename : "";
}

function exportAllData() {
  // 지금 화면에 떠 있는 페이지의 실시간 상태부터 pagesData 에 반영해야, 그것도 같이 내보내진다.
  pagesData[activePageId] = serializeCurrentPage();

  const now = new Date();
  const stamp =
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
    `_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const filename = `bluishCanvas-backup-${stamp}.json`;

  // 이 내보내기 자체를 "마지막 내보내기 기록"으로 남긴다 — 그래서 파일 안에도
  // "이 데이터가 언제·어떤 이름으로 내보내졌는지"가 같이 담겨 다른 컴퓨터로 옮겨가도 이어진다.
  backupInfo.lastExport = { at: now.toISOString(), filename };

  const data = {
    app: "bluishCanvas",
    exportVersion: 1,
    exportedAt: now.toISOString(),
    tree,
    pages: pagesData,
    activePageId,
    backupInfo,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  updateBackupInfoDisplay();
  save();
  alert(`내보내기 완료: ${filename}`);
}

// 가져온 트리 안의 모든 폴더/페이지 id를 지금 세션 기준으로 새로 발급한다. 다른 브라우저/
// 시점에서 만든 백업이면 id가 지금 것과 우연히 겹칠 수 있어서, 이름 충돌 여부와 상관없이
// 항상 다시 발급하고 pagesData 도 새 id로 옮겨 담는다.
function remapImportedIds(importedTree, importedPages) {
  const idRemap = new Map();

  function remapNode(node) {
    const prefix = node.type === "folder" ? "f" : "p";
    const newId = `${prefix}${nextTreeId++}`;
    idRemap.set(node.id, newId);
    node.id = newId;
    if (node.type === "folder") {
      (node.children || []).forEach(remapNode);
    }
  }
  importedTree.forEach(remapNode);

  idRemap.forEach((newId, oldId) => {
    if (importedPages[oldId]) {
      pagesData[newId] = importedPages[oldId];
    }
  });
}

// 최상위(루트) 계층에서 이름이 겹치는 항목마다 확인창을 띄워 "덮어쓰기"/"새 이름으로 추가"를 정한다.
function mergeImportedTree(importedTree) {
  importedTree.forEach((importedNode) => {
    const existingIdx = tree.findIndex((n) => n.name === importedNode.name);
    if (existingIdx === -1) {
      tree.push(importedNode);
      return;
    }

    const existing = tree[existingIdx];
    const existingPageIds = collectPageIds(existing);
    const warnPart =
      existing.type === "folder" && existingPageIds.length > 0
        ? ` (안의 페이지 ${existingPageIds.length}개도 함께 삭제됩니다)`
        : "";
    const suggestedName = uniqueNameAmong(tree, importedNode.name);

    const overwrite = confirm(
      `"${importedNode.name}" 이름이 이미 있습니다${warnPart}.\n\n` +
        `확인 → 기존 항목을 덮어쓰기\n취소 → 새 이름으로 추가 (예: "${suggestedName}")`
    );

    if (overwrite) {
      existingPageIds.forEach((pid) => {
        delete pagesData[pid];
        delete pageHistories[pid];
      });
      tree.splice(existingIdx, 1, importedNode);
    } else {
      importedNode.name = suggestedName;
      tree.push(importedNode);
    }
  });
}

function importBackup(data, filename) {
  if (!data || !Array.isArray(data.tree) || !data.pages || typeof data.pages !== "object") {
    alert("올바른 백업 파일이 아닙니다.");
    return;
  }
  if (data.tree.length === 0) {
    alert("백업 파일에 페이지가 없습니다.");
    return;
  }

  // 몇 개를 가져왔는지 요약하려면 구조가 바뀌기(remap/merge) 전에 세어야 한다.
  const importedCount = countTreeNodes(data.tree);

  // 백업 파일 자체에 담겨 있던 "마지막 내보내기 기록"을 복원한다 — 다른 컴퓨터에서
  // 이 파일을 받아 가져오기해도, 원래 언제·어떤 이름으로 내보내졌는지가 이어지도록.
  if (data.backupInfo && data.backupInfo.lastExport) {
    backupInfo.lastExport = data.backupInfo.lastExport;
  }
  backupInfo.lastImport = { at: new Date().toISOString(), filename: filename || "" };

  remapImportedIds(data.tree, data.pages);
  // 예전 버전 백업(도형/크기 필드가 없던 시절)을 가져와도 문제없도록 기본값을 채워준다.
  Object.values(pagesData).forEach((p) => backfillNoteDefaults(p.notes || []));

  mergeImportedTree(data.tree);

  // 지금 보고 있던 페이지가 (덮어쓰기로) 사라졌다면 남아있는 페이지로 옮겨간다.
  if (!pagesData[activePageId]) {
    const replacementId = findFirstPageId(tree);
    if (replacementId) {
      activePageId = replacementId;
      loadPageIntoGlobals(pagesData[replacementId]);
      const savedHist = pageHistories[replacementId];
      if (savedHist) {
        history = savedHist.history;
        historyIndex = savedHist.historyIndex;
      } else {
        history = [makeSnapshot()];
        historyIndex = 0;
      }
    }
  }

  renderSidebar();
  updateBackupInfoDisplay();
  save();

  const parts = [];
  if (importedCount.pages > 0) parts.push(`페이지 ${importedCount.pages}개`);
  if (importedCount.folders > 0) parts.push(`폴더 ${importedCount.folders}개`);
  alert(`가져오기 완료: ${parts.join(", ")}`);
}

exportBtn.addEventListener("click", exportAllData);
importBtn.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const filename = file.name;
    importFileInput.value = ""; // 같은 파일을 다시 골라도 change 이벤트가 또 발생하도록
    try {
      const data = JSON.parse(reader.result);
      importBackup(data, filename);
    } catch (err) {
      alert("파일을 읽는 중 문제가 발생했습니다. 올바른 JSON 파일인지 확인해주세요.");
    }
  };
  reader.onerror = () => {
    importFileInput.value = "";
    alert("파일을 읽는 중 문제가 발생했습니다.");
  };
  reader.readAsText(file);
});

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

// sx,sy 는 뷰포트(e.clientX/Y) 기준 좌표. #canvas 가 사이드바만큼 왼쪽으로 밀려 있으므로,
// 그 오프셋을 먼저 빼야 #world 의 transform 과 같은 좌표계(캔버스 자신의 왼쪽 위 기준)가 된다.
function screenToWorld(sx, sy) {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: (sx - canvasRect.left - view.x) / view.scale,
    y: (sy - canvasRect.top - view.y) / view.scale,
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
  updateStylePanel();
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

/* ===== 화살표 연결 지점: 경계 상자가 아니라 실제 도형 윤곽 기준 =====
 * Mermaid 가 실제로 그리는 방식과 비슷하게, 두 도형의 중심을 잇는 직선이 각 도형의
 * "진짜 윤곽"(사각형 변, 마름모의 대각선 변, 육각형 변, 평행사변형의 빗변 등)과 만나는
 * 정확한 지점에서 화살표가 시작/끝나도록 한다 — 예전의 "상/하/좌/우 4개 고정 지점 중
 * 하나" 방식과 달리, 각도에 따라 그 변의 어느 지점이든 자연스럽게 연결점이 된다.
 *
 * 도형은 두 갈래로 나눠 계산한다: 다각형인 5종(단계/분기/준비·설정/입력/출력)은 전부
 * 같은 "다각형 변과 반직선의 교차" 알고리즘 하나를 쓰고(윤곽 정점만 도형마다 다름 —
 * 이 정점들은 styles.css 의 clip-path 폴리곤과 정확히 같은 좌표다), 시작/끝(스타디움)
 * 만 원호 두 개 + 직선 두 개로 된 별도 모양이라 따로 계산한다. */

// 도형별 윤곽 정점(0~1 비율, 가로/세로 각각). rect 는 그냥 경계 상자 네 모서리다 —
// 실제 border-radius(10px)는 무시한다(Mermaid 자체도 사각형 연결점 계산에서 모서리
// 둥글기까지는 안 따진다). --xxx-clip CSS 변수들과 정확히 같은 좌표를 쓴다.
const SHAPE_OUTLINE_POLYGONS = {
  rect: [[0, 0], [1, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  parallelogram: [[0.15, 0], [1, 0], [0.85, 1], [0, 1]],
  "parallelogram-rev": [[0, 0], [0.85, 0], [1, 1], [0.15, 1]],
};

function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

// 반직선 (ox,oy)+t*(dx,dy), t>0 이 선분 (ax,ay)-(bx,by) 와 만나는 지점. 안 만나면 null.
function raySegmentIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
  const segX = bx - ax;
  const segY = by - ay;
  const denom = cross2d(dx, dy, segX, segY);
  if (Math.abs(denom) < 1e-9) return null; // 평행(또는 반직선이 선분과 같은 방향)
  const diffX = ax - ox;
  const diffY = ay - oy;
  const t = cross2d(diffX, diffY, segX, segY) / denom;
  const u = cross2d(diffX, diffY, dx, dy) / denom;
  if (t <= 0 || u < 0 || u > 1) return null;
  return { t, x: ox + t * dx, y: oy + t * dy };
}

// w×h 박스 안의 다각형(0~1 비율 정점) 윤곽과, 박스 중심에서 (dx,dy) 방향 반직선의
// 교차점을 로컬 좌표(0~w, 0~h)로 돌려준다. 볼록 다각형이고 중심이 내부에 있으므로
// 정확히 한 변과 만나는 게 정상이지만, 혹시 여러 후보가 걸리면 가장 가까운(t 최소) 것을 쓴다.
function polygonRayIntersect(w, h, polygon, dx, dy) {
  const cx = w / 2;
  const cy = h / 2;
  let best = null;
  let bestT = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const hit = raySegmentIntersect(cx, cy, dx, dy, a[0] * w, a[1] * h, b[0] * w, b[1] * h);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      best = hit;
    }
  }
  return best ? { x: best.x, y: best.y } : { x: cx, y: cy };
}

// 시작/끝(스타디움) 전용: border-radius:999px 는 반지름을 min(w,h)/2 로 clamp 하므로,
// 그 반지름의 반원 두 개 + 그 사이를 잇는 직선 두 개로 이뤄진 모양이다 — 가로가 길면
// 좌우가 반원(수평 알약), 세로가 길면 위아래가 반원(수직 알약, 자동 높이조정으로 글이
// 많아져 세로가 더 길어지는 경우도 실제로 있어서 방향을 가정하지 않고 매번 계산한다).
function stadiumRayIntersect(w, h, dx, dy) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const horizontal = w >= h;
  let best = null;
  let bestT = Infinity;
  const consider = (t, x, y) => {
    if (t > 0 && t < bestT) {
      bestT = t;
      best = { x, y };
    }
  };
  const considerCircle = (ccx, ccy, farSide) => {
    const lx = cx - ccx;
    const ly = cy - ccy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return;
    const b = 2 * (lx * dx + ly * dy);
    const c = lx * lx + ly * ly - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return;
    const sqrtDisc = Math.sqrt(disc);
    [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)].forEach((t) => {
      if (t <= 0) return;
      const x = cx + t * dx;
      const y = cy + t * dy;
      const valid = horizontal ? (farSide ? x >= w - r : x <= r) : (farSide ? y >= h - r : y <= r);
      if (valid) consider(t, x, y);
    });
  };

  if (horizontal) {
    if (dy !== 0) {
      const t1 = (0 - cy) / dy;
      const x1 = cx + t1 * dx;
      if (t1 > 0 && x1 >= r && x1 <= w - r) consider(t1, x1, 0);
      const t2 = (h - cy) / dy;
      const x2 = cx + t2 * dx;
      if (t2 > 0 && x2 >= r && x2 <= w - r) consider(t2, x2, h);
    }
    considerCircle(w - r, cy, true); // 오른쪽 반원
    considerCircle(r, cy, false); // 왼쪽 반원
  } else {
    if (dx !== 0) {
      const t1 = (0 - cx) / dx;
      const y1 = cy + t1 * dy;
      if (t1 > 0 && y1 >= r && y1 <= h - r) consider(t1, 0, y1);
      const t2 = (w - cx) / dx;
      const y2 = cy + t2 * dy;
      if (t2 > 0 && y2 >= r && y2 <= h - r) consider(t2, w, y2);
    }
    considerCircle(cx, h - r, true); // 아래쪽 반원
    considerCircle(cx, r, false); // 위쪽 반원
  }
  return best || { x: cx, y: cy };
}

// note 중심에서 (targetX, targetY) 방향으로 그 도형의 실제 윤곽과 만나는 지점(월드 좌표).
// 두 도형을 화살표로 이을 때 양쪽 끝에 각각 이 함수를 쓴다(상대방의 중심을 목표로),
// 화살표 연결 중 커서를 따라가는 미리보기 선도 커서를 목표로 이 함수를 그대로 쓴다.
function shapeExitPoint(note, targetX, targetY) {
  const cx = note.x + note.w / 2;
  const cy = note.y + note.h / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const local =
    note.shape === "stadium"
      ? stadiumRayIntersect(note.w, note.h, dx, dy)
      : polygonRayIntersect(note.w, note.h, SHAPE_OUTLINE_POLYGONS[note.shape] || SHAPE_OUTLINE_POLYGONS.rect, dx, dy);

  return { x: note.x + local.x, y: note.y + local.y };
}

// 화살표 하나의 좌표를 현재 두 메모 위치를 기준으로 다시 계산해서 반영한다.
// (연결 지점은 저장하지 않고, 메모가 움직이거나 크기가 바뀔 때마다 항상 새로 계산한다)
function updateArrowGeometry(arrow) {
  const g = arrowEl(arrow.id);
  if (!g) return;
  const fromNote = getNote(arrow.fromId);
  const toNote = getNote(arrow.toId);
  if (!fromNote || !toNote) return;

  const fromCenter = { x: fromNote.x + fromNote.w / 2, y: fromNote.y + fromNote.h / 2 };
  const toCenter = { x: toNote.x + toNote.w / 2, y: toNote.y + toNote.h / 2 };
  const p1 = shapeExitPoint(fromNote, toCenter.x, toCenter.y);
  const p2 = shapeExitPoint(toNote, fromCenter.x, fromCenter.y);

  ["arrow-hit", "arrow-visible"].forEach((cls) => {
    const line = g.querySelector(`.${cls}`);
    if (!line) return;
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
  });

  updateArrowLabelPosition(arrow, g, p1, p2);
  updateArrowDeleteButtonPosition(g, p1, p2);
}

function updateAllArrowGeometry() {
  arrows.forEach(updateArrowGeometry);
}

// 삭제(×) 버튼을 화살표 중간 지점에서 선(수직) 방향으로 살짝 띄워서 놓는다 —
// 정확히 중간에 두면 라벨(있을 경우)과 겹치기 때문. 화살표가 움직이거나
// 크기가 바뀔 때마다(updateArrowGeometry) 매번 다시 계산된다.
// 라벨은 항상 선의 정확히 50% 지점에, 화살표 각도와 무관하게 가로로 넓게 펼쳐지는
// 모양(회전 안 된 텍스트 알약)으로 놓인다. 그래서 "수직으로 살짝 띄우기" 방식은
// 화살표가 세로에 가까울 때(라벨의 가로 폭이 그대로 버튼과 겹치는 방향) 겹침을
// 못 피한다 — 각도에 관계없이 항상 안 겹치게, 라벨과 다른 지점(25%)에 둔다.
function updateArrowDeleteButtonPosition(g, p1, p2) {
  const btn = g.querySelector(".arrow-delete-btn");
  if (!btn) return;
  const t = 0.25;
  const x = p1.x + (p2.x - p1.x) * t;
  const y = p1.y + (p2.y - p1.y) * t;
  btn.setAttribute("transform", `translate(${x}, ${y})`);
}

// 화살표 중간 지점에 라벨(배경+텍스트)을 그린다. 라벨이 없으면 감춘다.
// 화살표가 움직이거나 크기가 바뀔 때마다(updateArrowGeometry) 매번 다시 호출된다.
function updateArrowLabelPosition(arrow, g, p1, p2) {
  const text = g.querySelector(".arrow-label-text");
  const bg = g.querySelector(".arrow-label-bg");
  if (!text || !bg) return;

  const label = arrow.label || "";
  if (!label) {
    text.setAttribute("hidden", "");
    bg.setAttribute("hidden", "");
    text.textContent = "";
    return;
  }

  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  text.textContent = label;
  text.setAttribute("x", mid.x);
  text.setAttribute("y", mid.y);
  text.removeAttribute("hidden");
  bg.removeAttribute("hidden");

  // 배경은 실제 렌더된 글자 크기(getBBox)에 여백을 더해서 맞춘다.
  // rx 를 매번 높이의 절반으로 다시 계산해서, 글자 길이가 달라져도
  // 항상 양 끝이 완전한 반원인 알약(캡슐) 모양이 되게 한다.
  const box = text.getBBox();
  const padX = 7;
  const padY = 3;
  const bgWidth = box.width + padX * 2;
  const bgHeight = box.height + padY * 2;
  bg.setAttribute("x", box.x - padX);
  bg.setAttribute("y", box.y - padY);
  bg.setAttribute("width", bgWidth);
  bg.setAttribute("height", bgHeight);
  bg.setAttribute("rx", bgHeight / 2);
}

// 화살표의 현재 중간 지점(월드 좌표)을 실제 렌더된 선 좌표에서 읽어온다.
function arrowMidpointWorld(arrow) {
  const g = arrowEl(arrow.id);
  if (!g) return null;
  const line = g.querySelector(".arrow-visible");
  if (!line) return null;
  const x1 = parseFloat(line.getAttribute("x1"));
  const y1 = parseFloat(line.getAttribute("y1"));
  const x2 = parseFloat(line.getAttribute("x2"));
  const y2 = parseFloat(line.getAttribute("y2"));
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
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

  // 라벨 배경 + 텍스트. 라벨이 없는 화살표는 hidden 상태로 그냥 존재만 한다
  // (updateArrowLabelPosition 이 label 유무에 따라 보이기/감추기를 매번 처리).
  const labelBg = document.createElementNS(SVG_NS, "rect");
  labelBg.setAttribute("class", "arrow-label-bg");
  labelBg.setAttribute("hidden", "");

  const labelText = document.createElementNS(SVG_NS, "text");
  labelText.setAttribute("class", "arrow-label-text");
  labelText.setAttribute("text-anchor", "middle");
  labelText.setAttribute("dominant-baseline", "middle");
  labelText.setAttribute("hidden", "");

  // 선택됐을 때만 보이는 삭제(×) 버튼. 메모의 호버형 삭제 버튼과 같은 생김새를
  // SVG 로 흉내낸다(원 + × 글자). 보이기/숨기기는 CSS 에서 .arrow.selected 를
  // 보고 처리하므로(hover 로 보이는 .note-delete-btn 과 같은 원리, 트리거만
  // hover 대신 선택 상태), 여기서는 위치만 매번 계산해서 옮겨준다.
  const deleteBtn = document.createElementNS(SVG_NS, "g");
  deleteBtn.setAttribute("class", "arrow-delete-btn");

  const deleteBtnCircle = document.createElementNS(SVG_NS, "circle");
  deleteBtnCircle.setAttribute("r", "9");

  const deleteBtnText = document.createElementNS(SVG_NS, "text");
  deleteBtnText.setAttribute("text-anchor", "middle");
  deleteBtnText.setAttribute("dominant-baseline", "central");
  deleteBtnText.textContent = "×";

  deleteBtn.appendChild(deleteBtnCircle);
  deleteBtn.appendChild(deleteBtnText);
  deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteArrow(arrow.id);
  });

  g.appendChild(hit);
  g.appendChild(visible);
  g.appendChild(labelBg);
  g.appendChild(labelText);
  g.appendChild(deleteBtn);
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

  // 더블클릭 → 라벨 입력 모드.
  hit.addEventListener("dblclick", (e) => {
    if (arrowDraft) return;
    e.preventDefault();
    e.stopPropagation();
    startArrowLabelEdit(arrow.id);
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
// rx1,ry1,rx2,ry2 는 뷰포트(e.clientX/Y) 기준 좌표라서, 화살표 중앙점(월드 좌표)도
// 뷰포트 기준으로 바꿔서(캔버스 오프셋을 더해서) 비교해야 한다.
function arrowsInScreenRect(rx1, ry1, rx2, ry2) {
  const left = Math.min(rx1, rx2);
  const right = Math.max(rx1, rx2);
  const top = Math.min(ry1, ry2);
  const bottom = Math.max(ry1, ry2);
  const canvasRect = canvas.getBoundingClientRect();
  const ids = [];
  arrows.forEach((arrow) => {
    const midWorld = arrowMidpointWorld(arrow);
    if (!midWorld) return;
    const midScreen = {
      x: midWorld.x * view.scale + view.x + canvasRect.left,
      y: midWorld.y * view.scale + view.y + canvasRect.top,
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

// 화살표의 × 버튼에서 호출 — 메모의 deleteNote() 와 같은 자리의, 화살표 버전.
function deleteArrow(id) {
  removeArrowFromState(id);
  commitChange();
}

/* ===== 화살표 라벨 편집 (더블클릭으로 시작) =====
 * SVG 안에 <foreignObject>로 진짜 <input>을 띄운다 — arrows-layer 가 #world 의 자식이라
 * 팬/줌 transform 을 그대로 물려받으므로, 입력칸이 화살표를 따라 저절로 움직이고
 * 확대/축소도 다른 화살표/메모와 똑같이 맞춰진다(화면 좌표를 따로 계산할 필요 없음). */

const ARROW_LABEL_EDIT_W = 120;
const ARROW_LABEL_EDIT_H = 26;

function startArrowLabelEdit(id) {
  if (editingArrowLabelId !== null) return; // 문서 캡처 리스너가 이전 입력을 먼저 커밋해서 닫아준다
  const arrow = arrows.find((a) => a.id === id);
  const g = arrowEl(id);
  const mid = arrowMidpointWorld(arrow);
  if (!arrow || !g || !mid) return;

  editingArrowLabelId = id;

  const fo = document.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("class", "arrow-label-edit");
  fo.setAttribute("x", mid.x - ARROW_LABEL_EDIT_W / 2);
  fo.setAttribute("y", mid.y - ARROW_LABEL_EDIT_H / 2);
  fo.setAttribute("width", ARROW_LABEL_EDIT_W);
  fo.setAttribute("height", ARROW_LABEL_EDIT_H);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "arrow-label-input";
  input.maxLength = 20;
  input.value = arrow.label || "";
  fo.appendChild(input);
  g.appendChild(fo);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    finishArrowLabelEdit(id, input.value.trim(), fo);
  };
  const cancel = () => {
    if (done) return;
    done = true;
    finishArrowLabelEdit(id, null, fo);
  };

  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

// newLabel === null 이면 취소(값 변경 없음), 문자열이면 그 값으로 확정.
function finishArrowLabelEdit(id, newLabel, fo) {
  editingArrowLabelId = null;
  fo.remove();
  if (newLabel === null) return;

  const arrow = arrows.find((a) => a.id === id);
  if (!arrow) return;
  const oldLabel = arrow.label || "";
  if (newLabel === oldLabel) return; // 변경 없으면 히스토리도 남기지 않는다

  if (newLabel === "") {
    delete arrow.label;
  } else {
    arrow.label = newLabel;
  }
  updateArrowGeometry(arrow);
  commitChange();
}

// 라벨 입력 중에 다른 곳을 클릭하면(다른 화살표, 메모, 빈 캔버스 등) 그 클릭이
// 각자의 mousedown 핸들러에서 stopPropagation/preventDefault 를 하더라도 항상 먼저
// 이 커밋을 실행하도록 캡처 단계에 건다.
document.addEventListener(
  "mousedown",
  (e) => {
    if (editingArrowLabelId === null) return;
    const input = arrowsLayerEl.querySelector(".arrow-label-input");
    if (input && e.target !== input) {
      input.blur();
    }
  },
  true
);

// 선택된 메모(들)와 화살표(들)를 한 번에, 히스토리 한 칸으로 지운다.
function deleteSelectedObjects() {
  if (selectedIds.size === 0 && selectedArrowIds.size === 0) return;
  Array.from(selectedIds).forEach(removeNoteFromState); // 메모에 딸린 화살표도 같이 지워진다
  Array.from(selectedArrowIds).forEach(removeArrowFromState);
  renderGroups(); // 지운 메모가 그룹에서 빠졌으니 박스를 다시 그린다
  updateHandles(); // 선택이 비었으니 경계 상자/핸들/버튼도 같이 감춘다
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
  // 커서 방향으로 도형 윤곽과 만나는 지점에서 선이 나오도록, 매번 다시 계산한다.
  const p1 = shapeExitPoint(fromNote, worldPt.x, worldPt.y);
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
    selectionRemoveFromGroupBtn.hidden = true;
    selectionDeleteBtn.hidden = true;
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
    selectionRemoveFromGroupBtn.hidden = true;
    selectionDeleteBtn.hidden = true;
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

  // 다중 선택(2개 이상)일 때만 뜬다 — 개별 메모 호버 버튼(−/×)을 다중 선택 상황에서도
  // 캔버스 위에서 바로 쓸 수 있게 하는 빠른 진입점일 뿐 새 판정/삭제 로직은 아니다.
  // ×(전체 삭제)는 항상, −(그룹에서 빼기)는 그중 (잠기지 않은) 그룹 소속이 하나라도
  // 있을 때만 — 꾸미기 패널 버튼과 같은 조건이다. 개별 메모의 .note-delete-btn(오른쪽)
  // /.note-ungroup-btn(그 왼쪽) 과 같은 순서로, 경계 상자 바깥 위쪽에 나란히 띄운다
  // (박스 위에 그대로 얹으면 NE 리사이즈 핸들과 겹쳐 클릭을 가로막기 때문 — 과거 메모
  // 삭제버튼이 겪었던 문제와 같은 종류).
  const BTN_SIZE = 18;
  const BTN_GAP = 4;
  const btnTop = t - BTN_SIZE - BTN_GAP;

  selectionDeleteBtn.style.left = `${r - BTN_SIZE}px`;
  selectionDeleteBtn.style.top = `${btnTop}px`;
  selectionDeleteBtn.hidden = selectedIds.size <= 1;

  const canRemoveFromGroup =
    selectedIds.size > 1 &&
    Array.from(selectedIds).some((id) => {
      const group = groupOfNote(id);
      return group && !group.locked;
    });
  if (canRemoveFromGroup) {
    selectionRemoveFromGroupBtn.style.left = `${r - BTN_SIZE * 2 - BTN_GAP}px`;
    selectionRemoveFromGroupBtn.style.top = `${btnTop}px`;
    selectionRemoveFromGroupBtn.hidden = false;
  } else {
    selectionRemoveFromGroupBtn.hidden = true;
  }
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
        updateGroupBoxGeometry();
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          // 모서리를 직접 잡고 끌어서 크기를 바꿨다 — 이제부터는 텍스트 양에 따른
          // 자동 크기 조정 대상에서 빠지고, 이 수동 크기가 계속 유지된다.
          startNotes.forEach((sn) => {
            const n = notes.find((nn) => nn.id === sn.id);
            if (n) n.autoSize = false;
          });
          commitChange();
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

/* ===== 메모 ===== */

/* ===== 텍스트 양에 비례하는 자동 높이 조정 =====
 * 화면에 붙이지 않는 오프스크린 프로브(.note/.note-text 와 완전히 같은 클래스를 입혀서
 * 만든 임시 요소)로 실제 렌더링을 그대로 재현해 측정한다 — 도형별 텍스트 인셋 비율
 * (원 15%, 마름모 25% 등, styles.css 참고)을 여기 따로 하드코딩하지 않기 위해서다.
 * scrollHeight(실제 필요한 내용 높이) 가 clientHeight(주어진 기준 높이가 허용하는
 * 표시 높이) 를 넘으면, 그 비율(clientHeight/기준높이)을 거꾸로 적용해서 필요한
 * 도형 높이를 역산한다 — 스타일시트의 인셋 값이 나중에 바뀌어도 이 계산은 그대로
 * 맞는다(실측 비율을 쓰기 때문). 너비는 건드리지 않는다 — 항상 세로로만 계산한다.
 * 도형 높이를 "넘칠 때만 키우는" 것(grow-only)이 아니라 "매번 텍스트 양에 맞춰
 * 다시 계산"(양방향)하는 것은 이 함수를 어떤 기준 높이로 부르느냐에 달렸다 —
 * syncNoteHeightToText 를 참고. */
function measureNoteFitHeight(text, shape, diagramType, fontSize, textAlign, w, h) {
  const probe = document.createElement("div");
  probe.className = "note";
  probe.dataset.shape = shape;
  probe.dataset.diagramType = diagramType || "none";
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.width = `${w}px`;
  probe.style.height = `${h}px`;
  probe.style.visibility = "hidden";

  const textEl = document.createElement("div");
  textEl.className = "note-text";
  textEl.style.fontSize = `${fontSize}px`;
  textEl.style.textAlign = textAlign;
  // 실제 .note-text 는 align-items:center 로 세로 가운데 정렬한다 — 그런데 내용이 넘칠 때
  // 가운데 정렬은 위/아래로 절반씩 넘치게 만들고, scrollTop 이 음수로 갈 수 없어서
  // scrollHeight 가 "박스 위로 넘친 절반"을 못 세고 실제보다 작게(대략 (박스높이+실제내용
  // 높이)/2 로) 보고한다 — 게다가 박스 높이를 바꿀 때마다 그 값 자체가 달라져서, 필요한
  // 높이를 한 번에 정확히 역산할 수가 없다(박스를 키워도 또 그만큼만 부족한 것처럼 보임).
  // 측정용 프로브에서만 위쪽 정렬로 바꾸면 넘친 내용이 전부 아래쪽으로만 쌓여 scrollHeight
  // 가 박스 높이와 무관한 "진짜" 내용 높이를 정확히 돌려준다(실제로 보이는 도형은 원래대로
  // 가운데 정렬 그대로다 — 여기서 바꾼 건 이 임시 프로브 하나뿐).
  textEl.style.alignItems = "flex-start";
  textEl.textContent = text || "";
  probe.appendChild(textEl);
  document.body.appendChild(probe);

  let neededH = h;
  if (textEl.clientHeight > 0 && textEl.scrollHeight > textEl.clientHeight) {
    neededH = Math.min(MAX_AUTO_FIT_NOTE_H, Math.ceil((textEl.scrollHeight / textEl.clientHeight) * h));
  }

  document.body.removeChild(probe);
  return Math.max(h, neededH);
}

// note.autoSize 가 false 가 아닌 동안엔(기본값 — 사용자가 모서리를 잡고 수동으로
// 리사이즈한 적이 없는 도형), 도형 높이를 "지금 텍스트 양에 정확히 비례하는 값"으로
// 매번 다시 계산한다 — 늘어나면 커지고, 줄어들면 다시 작아진다(예전엔 커지기만 하고
// 다시 안 줄어드는 문제가 있었는데, 이번에 "항상 다시 계산" 방식으로 바꿨다).
// 기준 높이로 항상 DEFAULT_NOTE_H 를 주는 게 핵심 — 지금 도형의 현재 높이를 기준으로
// 넘겼다면 "이미 커진 높이보다 작아지지 않기"가 되어버려 grow-only 로 되돌아간다.
// measureNoteFitHeight 자체는 순수 측정 함수라 그 기준 높이보다 작게는 절대 안 돌려주므로,
// 결과적으로 DEFAULT_NOTE_H(기존 기본 크기)가 자동 크기의 하한이 된다 — 문서/그룹 이름표처럼
// 다른 작은 요소들과 달리, 메모는 아무리 텍스트가 짧아도 기존에 익숙한 기본 크기 밑으로는
// 안 작아지는 편이 자연스럽다고 판단했다. 너비는 여기서 전혀 건드리지 않는다(세로만 자동).
function syncNoteHeightToText(note) {
  if (note.autoSize === false) return false;
  const neededH = measureNoteFitHeight(note.text, note.shape, note.diagramType, note.fontSize, note.textAlign, note.w, DEFAULT_NOTE_H);
  if (neededH === note.h) return false;
  note.h = neededH;
  const el = noteEl(note.id);
  if (el) el.style.height = `${neededH}px`;
  return true;
}

// groupId 를 주면, 만들어진 메모를 그 그룹에 바로 편입시킨다(그룹 영역 안에서 우클릭
// 퀵메뉴로 "이 그룹에 메모 추가"를 골랐을 때 — 방금 태어난 메모라 보호할 기존 타입
// 선택이 없으므로 force=true 로 그룹 타입을 그대로 물려받는다).
function createNote(worldX, worldY, text = "", shape = nextShape, groupId = null) {
  const note = {
    id: nextId++,
    x: worldX,
    y: worldY,
    w: DEFAULT_NOTE_W,
    h: DEFAULT_NOTE_H,
    text,
    shape,
    bg: null,
    fontSize: DEFAULT_FONT_SIZE,
    textAlign: DEFAULT_TEXT_ALIGN,
    borderWidth: DEFAULT_BORDER_WIDTH,
    diagramType: nextDiagramType,
    autoSize: true,
  };
  notes.push(note);
  const el = renderNote(note);
  if (syncNoteHeightToText(note)) updateAllArrowGeometry();
  if (groupId) {
    addNotesToGroup([note.id], groupId, true);
    renderGroups();
  }
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

  removeNoteFromItsGroup(id); // 속해 있던 그룹에서도 빼고, 비면 그룹 자체를 없앤다
}

function deleteNote(id) {
  removeNoteFromState(id);
  renderGroups(); // 지운 메모가 그룹에서 빠졌으니 박스를 다시 그린다
  commitChange();
}

/* ===== 그룹 (올가미로 묶은 도형 묶음) ===== */

function getGroup(id) {
  return groups.find((g) => g.id === id);
}

function groupOfNote(noteId) {
  return groups.find((g) => g.noteIds.includes(noteId));
}

// 그룹의 다이어그램 타입은 따로 저장하지 않고 멤버에서 읽는다 (멤버는 항상 같은 타입).
function groupDiagramType(group) {
  for (const noteId of group.noteIds) {
    const note = getNote(noteId);
    if (note && note.diagramType) return note.diagramType;
  }
  return null;
}

function removeNoteFromItsGroup(noteId) {
  const group = groupOfNote(noteId);
  if (!group) return;
  group.noteIds = group.noteIds.filter((id) => id !== noteId);
  if (group.noteIds.length === 0) {
    groups = groups.filter((g) => g.id !== group.id);
  }
}

/* 도형(들)을 지정한 그룹 하나에 명시적으로 편입시킨다 — 그룹 이름표에 드래그해 놓거나,
 * 그룹 영역 안에서 새 메모를 만들 때 쓴다(올가미처럼 "어느 그룹이 가장 클까" 같은 판단은
 * 필요 없다, 대상이 이미 정해져 있으므로). 잠긴 그룹은 대상이 될 수 없고, 이미 잠긴
 * 다른 그룹에 속한 도형은 거기서 빼올 수 없다.
 * force=true 면 낱개 도형에 이미 명시된 타입이 있어도 그룹 타입으로 덮어쓴다 — 방금
 * 그룹 영역 안에서 막 태어난 도형처럼, 보호할 "사용자의 기존 선택"이 애초에 없는
 * 경우에만 쓴다. 기본값(false)은 올가미와 같은 원칙으로, 드래그로 기존 도형을 옮길 때
 * 그 도형에 이미 다른 타입이 명시돼 있으면 건드리지 않고 남겨둔다. */
function addNotesToGroup(noteIds, targetGroupId, force = false) {
  const target = getGroup(targetGroupId);
  if (!target || target.locked) return;
  const hostType = groupDiagramType(target) || nextDiagramType;

  noteIds.forEach((id) => {
    if (target.noteIds.includes(id)) return;
    const note = getNote(id);
    if (!note) return;

    const currentGroup = groupOfNote(id);
    if (currentGroup) {
      if (currentGroup.locked) return; // 잠긴 그룹에서는 빼올 수 없다
      removeNoteFromItsGroup(id);
      note.diagramType = hostType;
      target.noteIds.push(id);
      return;
    }

    if (!force && note.diagramType && note.diagramType !== hostType) return;
    note.diagramType = hostType;
    target.noteIds.push(id);
  });
}

// 월드 좌표 한 점이 어느 그룹의 박스 영역 안에 있는지 (잠긴 그룹은 후보에서 제외 —
// 새 도형이든 드래그로 옮기는 도형이든 잠긴 그룹에는 넣을 수 없으므로).
function groupAtWorldPoint(point) {
  for (const group of groups) {
    if (group.locked) continue;
    const bounds = groupBounds(group);
    if (!bounds) continue;
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.w &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.h
    ) {
      return group;
    }
  }
  return null;
}

// 지금 드래그 중인 도형(들) 밑에 그룹 이름표가 있는지 찾는다. elementFromPoint 는
// 드래그 중인 노트 자신이 커서 밑을 가리고 있으면 그것부터 걸리므로, 잠깐
// pointer-events 를 꺼서 "그 아래" 요소를 찾을 수 있게 한다.
function groupLabelUnderPoint(clientX, clientY, excludeEls) {
  excludeEls.forEach((el) => el && (el.style.pointerEvents = "none"));
  const hit = document.elementFromPoint(clientX, clientY);
  excludeEls.forEach((el) => el && (el.style.pointerEvents = ""));
  return hit ? hit.closest(".group-label") : null;
}

function clearGroupDropHighlight() {
  groupsLayerEl.querySelectorAll(".group-label.drop-target").forEach((el) => el.classList.remove("drop-target"));
  hideGroupDropHint();
}

// 그룹 이름표 위로 드래그 중일 때 커서 옆에 "OO 그룹에 추가" 배지를 띄운다.
// 시선이 옮기는 도형에 가 있어도 놓치지 않도록 이름표 자체 강조와 같이 쓴다.
function showGroupDropHint(clientX, clientY, groupName) {
  groupDropHintEl.textContent = `"${groupName}" 그룹에 추가`;
  groupDropHintEl.style.left = `${clientX + 16}px`;
  groupDropHintEl.style.top = `${clientY + 16}px`;
  groupDropHintEl.hidden = false;
}

function hideGroupDropHint() {
  groupDropHintEl.hidden = true;
}

/* 아직 어떤 그룹에도 속하지 않은 도형들만으로 새 그룹(들)을 만든다.
 * 타입이 섞여 있으면 타입별로 나눠서 그룹을 여러 개 만든다 — 하나로 합치면 사용자가
 * 명시적으로 지정해둔 타입을 몰래 바꾸게 되기 때문. 다만 "미지정"은 명시적 선택이 아니라
 * 아직 안 정한 상태이므로, 멤버가 더 많은 쪽에 흡수시키면서 그 타입을 부여한다
 * (동수이거나 타입이 지정된 도형이 하나도 없으면 현재 선택된 nextDiagramType 을 쓴다). */
function createNewGroupsFromUngroupedNotes(noteIds) {
  const buckets = { flowchart: [], mindmap: [] };
  const unsetIds = [];

  noteIds.forEach((id) => {
    const note = getNote(id);
    if (!note) return;
    if (note.diagramType === "flowchart" || note.diagramType === "mindmap") {
      buckets[note.diagramType].push(id);
    } else {
      unsetIds.push(id);
    }
  });

  if (unsetIds.length > 0) {
    let host;
    if (buckets.flowchart.length > buckets.mindmap.length) host = "flowchart";
    else if (buckets.mindmap.length > buckets.flowchart.length) host = "mindmap";
    else host = nextDiagramType;

    unsetIds.forEach((id) => {
      const note = getNote(id);
      if (note) note.diagramType = host;
      buckets[host].push(id);
    });
  }

  const created = [];
  ["flowchart", "mindmap"].forEach((type) => {
    const ids = buckets[type];
    if (ids.length === 0) return;
    const gid = nextGroupId++;
    const group = { id: `g${gid}`, name: `그룹 ${gid}`, noteIds: ids, locked: false };
    groups.push(group);
    created.push(group);
  });
  return created;
}

/* 올가미로 잡은 도형들을 그룹으로 정리한다. 이미 그룹에 속한 도형이 섞여 있는지에
 * 따라 동작이 갈린다:
 *   - 전부 미배정(어떤 그룹에도 안 속함) → createNewGroupsFromUngroupedNotes 로 새로 만든다.
 *   - 기존 그룹이 하나만 걸림 → 새 그룹을 만들지 않고, 같이 잡힌 미배정 도형만 그 그룹에 편입.
 *   - 서로 다른 기존 그룹이 여러 개 걸림 → 멤버가 가장 많은 그룹으로 나머지를 전부 합친다
 *     (작은 쪽 그룹은 removeNoteFromItsGroup 이 멤버를 다 옮기고 나면 자동으로 사라진다).
 * 잠긴 그룹은 이번 동작에서 완전히 빠진다 — 그 멤버는 추가/제거/병합 대상이 되지 않는다. */
function createGroupsFromNoteIds(noteIds) {
  const touchedGroups = [];
  const lockedNoteIds = new Set();
  noteIds.forEach((id) => {
    const g = groupOfNote(id);
    if (!g) return;
    if (g.locked) {
      lockedNoteIds.add(id);
    } else if (!touchedGroups.includes(g)) {
      touchedGroups.push(g);
    }
  });
  const workingIds = noteIds.filter((id) => !lockedNoteIds.has(id));

  if (touchedGroups.length === 0) {
    return createNewGroupsFromUngroupedNotes(workingIds);
  }

  // 여러 그룹이 걸렸으면 멤버가 가장 많은 쪽(동수면 먼저 발견된 쪽)으로 합친다.
  let target = touchedGroups[0];
  touchedGroups.forEach((g) => {
    if (g.noteIds.length > target.noteIds.length) target = g;
  });

  const hostType = groupDiagramType(target) || nextDiagramType;

  workingIds.forEach((id) => {
    if (target.noteIds.includes(id)) return; // 이미 이 그룹 멤버
    const note = getNote(id);
    if (!note) return;

    if (groupOfNote(id)) {
      // 다른(타깃이 아닌) 기존 그룹의 멤버 — 그룹끼리의 병합이므로 무조건 옮긴다.
      // (그룹에 속한 도형의 타입은 항상 그 그룹을 따라가지, 개별적으로 "명시적 선택"을
      // 갖고 있다고 보지 않기 때문.)
      removeNoteFromItsGroup(id);
      note.diagramType = hostType;
      target.noteIds.push(id);
      return;
    }

    // 그룹에 속하지 않은 낱개 도형: 미지정이면 흡수하고, 이미 다른 타입이 명시돼
    // 있으면 그 선택을 몰래 바꾸지 않도록 이번엔 건드리지 않고 넘어간다.
    if (note.diagramType && note.diagramType !== hostType) return;
    note.diagramType = hostType;
    target.noteIds.push(id);
  });

  return [target];
}

// 다각형(월드 좌표) 안에 점이 들어있는지 — ray casting.
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// 올가미 경로(월드 좌표) 안에 "중심점"이 들어오는 메모들. 화살표 영역 선택이 이미
// 중앙점 기준이라 규칙을 똑같이 맞춘다.
function notesInsidePolygon(polygon) {
  return notes
    .filter((n) => isPointInPolygon({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, polygon))
    .map((n) => n.id);
}

/* ===== 그룹 시각화 (월드 좌표 박스) ===== */

const GROUP_BOX_PADDING = 18;

// 멤버 메모들을 감싸는 월드 좌표 경계 상자. 멤버가 하나도 남아있지 않으면 null.
function groupBounds(group) {
  const members = group.noteIds.map(getNote).filter(Boolean);
  if (members.length === 0) return null;
  const left = Math.min(...members.map((n) => n.x));
  const top = Math.min(...members.map((n) => n.y));
  const right = Math.max(...members.map((n) => n.x + n.w));
  const bottom = Math.max(...members.map((n) => n.y + n.h));
  return {
    x: left - GROUP_BOX_PADDING,
    y: top - GROUP_BOX_PADDING,
    w: right - left + GROUP_BOX_PADDING * 2,
    h: bottom - top + GROUP_BOX_PADDING * 2,
  };
}

function applyGroupBoxBounds(box, bounds) {
  box.style.left = `${bounds.x}px`;
  box.style.top = `${bounds.y}px`;
  box.style.width = `${bounds.w}px`;
  box.style.height = `${bounds.h}px`;
}

// 드래그/리사이즈 중에는 박스를 다시 만들지 않고 위치·크기만 고친다. 매 프레임 DOM 을
// 통째로 새로 만들면 낭비인데다, 이름을 고치는 중이던 입력칸까지 날아간다
// (사이드바에서 renderSidebar 대신 가벼운 갱신을 쓰는 것과 같은 이유).
function updateGroupBoxGeometry() {
  groupsLayerEl.querySelectorAll(".group-box").forEach((box) => {
    const group = getGroup(box.dataset.id);
    if (!group) return;
    const bounds = groupBounds(group);
    if (bounds) applyGroupBoxBounds(box, bounds);
  });
}

// 그룹 박스를 전부 다시 만든다. 그룹이 생기거나 없어지거나 이름/타입이 바뀔 때처럼
// 구조가 실제로 달라졌을 때만 쓴다.
function renderGroups() {
  groupsLayerEl.innerHTML = "";
  groups.forEach((group) => {
    const bounds = groupBounds(group);
    if (!bounds) return;

    const box = document.createElement("div");
    box.className = "group-box";
    box.classList.toggle("locked", !!group.locked);
    box.dataset.id = group.id;
    box.dataset.diagramType = groupDiagramType(group) || "none";
    applyGroupBoxBounds(box, bounds);

    box.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation(); // 캔버스의 빈 곳 우클릭 퀵메뉴가 대신 뜨지 않도록
      openGroupContextMenu(e.clientX, e.clientY, group.id);
    });

    const label = document.createElement("div");
    label.className = "group-label";
    label.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGroupContextMenu(e.clientX, e.clientY, group.id);
    });

    if (group.locked) {
      const lockIcon = document.createElement("span");
      lockIcon.className = "group-lock-icon";
      lockIcon.textContent = "🔒";
      lockIcon.title = "잠긴 그룹 — 도형 추가/제거/이동 불가";
      label.appendChild(lockIcon);
    }

    const groupType = groupDiagramType(group);
    if (groupType) {
      const typeIcon = document.createElement("span");
      typeIcon.className = "group-type-icon";
      typeIcon.textContent = groupType === "mindmap" ? "🧠" : "🔀";
      typeIcon.title = DIAGRAM_TYPE_LABELS[groupType];
      label.appendChild(typeIcon);
    }

    const nameEl = document.createElement("span");
    nameEl.className = "group-name";
    nameEl.textContent = group.name;
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startGroupRenaming(nameEl, group);
    });
    label.appendChild(nameEl);

    const ungroupBtn = document.createElement("button");
    ungroupBtn.type = "button";
    ungroupBtn.className = "group-ungroup-btn";
    ungroupBtn.title = "그룹 해제";
    ungroupBtn.textContent = "×";
    ungroupBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    ungroupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ungroup(group.id);
    });
    label.appendChild(ungroupBtn);

    box.appendChild(label);
    groupsLayerEl.appendChild(box);
  });

  updateNoteGroupUI();
}

// 각 메모의 "그룹에서 빼기"(−) 버튼을 지금 그룹 소속 상태에 맞게 보이기/숨기기/
// 잠금에 따라 비활성화한다. renderGroups() 가 그룹 구조가 바뀔 때마다 이미 호출되고
// 있으므로(올가미/드래그편입/우클릭생성/해제/잠금/복제 등), 여기 얹어두면 모든
// 경로에서 따로 챙기지 않아도 버튼 상태가 항상 맞아떨어진다.
// "그룹에서 빼기" 버튼 상태뿐 아니라, note.diagramType 이 여기서(올가미/드래그편입/
// 우클릭생성/타입전환 등) 직접 바뀌고 DOM 은 아직 안 따라온 경우를 위해 모서리 둥글기용
// data-diagram-type 속성도 같이 맞춘다 — renderGroups() 가 그룹 구조가 바뀌는 모든
// 경로에서 이미 호출되고 있어서, 여기 얹어두면 새 진입점마다 따로 챙기지 않아도 된다.
function updateNoteGroupUI() {
  notes.forEach((note) => {
    const el = noteEl(note.id);
    if (!el) return;
    el.dataset.diagramType = note.diagramType || "none";

    const group = groupOfNote(note.id);

    // 호버 시 소속 그룹을 알려주는 네이티브 툴팁. 그룹 없음이면 title 자체를 지워서
    // 안 뜨게 한다(억지로 "그룹 없음"을 매번 띄우면 대다수인 미소속 도형에서 소음이 됨).
    if (group) el.title = `그룹: ${group.name}`;
    else el.removeAttribute("title");

    // 그룹 소속 여부를 CSS 에서 바로 판정할 수 있게 속성으로 얹어둔다 — 그룹에
    // 안 속한 도형은 점선+경고색 테두리로 눈에 띄게 표시한다(styles.css 참고).
    el.dataset.grouped = group ? "true" : "false";

    const btn = el.querySelector(".note-ungroup-btn");
    if (!btn) return;
    btn.hidden = !group;
    if (group) {
      btn.disabled = !!group.locked;
      btn.title = group.locked ? "잠긴 그룹은 도형을 뺄 수 없습니다" : "그룹에서 빼기";
    }
  });
}

// 그룹만 없애고 도형은 그대로 둔다(도형의 다이어그램 타입도 유지).
function ungroup(groupId) {
  groups = groups.filter((g) => g.id !== groupId);
  renderGroups();
  commitChange();
}

// 그룹 이름 바꾸기 — 사이드바 이름 변경과 같은 방식(Enter 저장 / Esc 취소 / 포커스 잃으면 저장).
function startGroupRenaming(nameEl, group) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "group-name-input";
  input.value = group.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    group.name = input.value.trim() || group.name;
    renderGroups();
    commitChange();
  };
  const cancel = () => {
    if (done) return;
    done = true;
    renderGroups();
  };

  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

/* ----- 그룹 우클릭 메뉴에서 실행되는 동작들 ----- */

function selectGroupMembers(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  setSelection(group.noteIds.slice());
}

// 그룹의 도형+화살표(그룹 안에서 양 끝이 다 그 그룹 멤버인 것만)+상대 위치를 그대로
// 복사해서 원본 오른쪽에 새로 놓는다. 새 도형/화살표/그룹은 전부 새 id 를 받는 별개의
// 그룹이다.
function duplicateGroup(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  const bounds = groupBounds(group);
  const offsetX = bounds ? bounds.w + 40 : 220;

  const idMap = new Map();
  const newNoteIds = [];
  group.noteIds.forEach((oldId) => {
    const note = getNote(oldId);
    if (!note) return;
    const newNote = { ...note, id: nextId++, x: note.x + offsetX };
    notes.push(newNote);
    renderNote(newNote);
    idMap.set(oldId, newNote.id);
    newNoteIds.push(newNote.id);
  });

  const memberIdSet = new Set(group.noteIds);
  arrows
    .filter((a) => memberIdSet.has(a.fromId) && memberIdSet.has(a.toId))
    .forEach((a) => {
      const newArrow = { ...a, id: nextArrowId++, fromId: idMap.get(a.fromId), toId: idMap.get(a.toId) };
      arrows.push(newArrow);
      renderArrow(newArrow);
    });

  const gid = nextGroupId++;
  const newGroup = { id: `g${gid}`, name: `${group.name} 사본`, noteIds: newNoteIds, locked: false };
  groups.push(newGroup);

  renderGroups();
  setSelection(newNoteIds);
  commitChange();
}

// 그룹 전체의 다이어그램 타입을 바꾼다. 마인드맵으로 바꿀 때는 그룹 안(양 끝이 다
// 멤버인) 화살표가 트리(중심 하나, 순환 없음)인지 먼저 검사하고, 아니면 바꾸지 않고
// 이유를 알려준다 — buildMindmapTree 는 Mermaid 내보내기가 이미 쓰는 것과 같은 검사다.
function convertGroupType(groupId, type) {
  const group = getGroup(groupId);
  if (!group) return;
  if (groupDiagramType(group) === type) return; // 이미 그 타입이면 할 일 없음

  if (type === "mindmap") {
    const memberIdSet = new Set(group.noteIds);
    const groupArrows = arrows.filter((a) => memberIdSet.has(a.fromId) && memberIdSet.has(a.toId));
    const tree = buildMindmapTree(group, groupArrows);
    if (tree.error) {
      alert(`마인드맵으로 전환할 수 없습니다 — ${tree.error}`);
      return;
    }
  }

  group.noteIds.forEach((id) => {
    const note = getNote(id);
    if (!note) return;
    note.diagramType = type;
    updateNoteStyleDOM(note);
  });
  renderGroups();
  updateStylePanel();
  commitChange();
}

function toggleGroupLock(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  group.locked = !group.locked;
  renderGroups();
  commitChange();
}

/* ----- 그룹에서 도형 빼기 (도형 자체는 삭제되지 않는다) =====
 * 그룹 박스가 멤버 위치에 맞춰 자동으로 다시 계산되는 방식이라(groupBounds), 드래그로
 * 그룹 밖으로 빼내려 해도 박스가 같이 늘어나며 따라와서 "밖으로" 나갈 수가 없다.
 * 그래서 드래그가 아니라 명시적인 버튼(메모 자체의 −버튼 / 꾸미기 패널)으로만 뺀다. */

// 메모 하나에 달린 "그룹에서 빼기" 버튼 — 잠긴 그룹이면 버튼이 비활성 상태라
// 여기까지 클릭이 오지 않지만, 혹시 모를 경우를 대비해 한 번 더 확인한다.
function removeNoteFromGroupAction(noteId) {
  const group = groupOfNote(noteId);
  if (!group || group.locked) return;
  removeNoteFromItsGroup(noteId); // 멤버가 0개가 되면 여기서 그룹 자체도 같이 사라진다
  renderGroups();
  commitChange();
}

// 꾸미기 패널/다중 선택 경계 상자 버튼 공용 "그룹에서 빼기" — 지금 선택된 것들 중
// (잠기지 않은) 그룹에 속한 것만 전부 뺀다. 선택된 것 중 그룹에 안 속한 도형이나
// 잠긴 그룹 소속은 그냥 둔다.
function removeSelectedNotesFromGroups() {
  let removedAny = false;
  selectedIds.forEach((id) => {
    const group = groupOfNote(id);
    if (!group || group.locked) return;
    removeNoteFromItsGroup(id);
    removedAny = true;
  });
  if (!removedAny) return;
  renderGroups();
  updateStylePanel();
  updateHandles(); // 경계 상자 버튼도 다시 판정(더 뺄 게 없으면 숨김)
  commitChange();
}

/* ----- 그룹 우클릭 메뉴 (박스/이름표 우클릭으로 열림) ----- */

let groupContextMenuGroupId = null;

function openGroupContextMenu(clientX, clientY, groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  groupContextMenuGroupId = groupId;

  const targetType = groupDiagramType(group) === "mindmap" ? "flowchart" : "mindmap";
  const convertBtn = groupContextMenuEl.querySelector('[data-action="convert-type"]');
  convertBtn.textContent = `${withRoParticle(DIAGRAM_TYPE_LABELS[targetType])} 전환`;
  convertBtn.dataset.targetType = targetType;

  const lockBtn = groupContextMenuEl.querySelector('[data-action="toggle-lock"]');
  lockBtn.textContent = group.locked ? "잠금 해제" : "잠그기";

  groupContextMenuEl.hidden = false;
  // 화면 밖으로 나가지 않도록, 실제 크기를 잰 뒤 위치를 보정한다 (퀵메뉴와 같은 방식).
  const menuRect = groupContextMenuEl.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  groupContextMenuEl.style.left = `${Math.max(8, left)}px`;
  groupContextMenuEl.style.top = `${Math.max(8, top)}px`;
}

function closeGroupContextMenu() {
  groupContextMenuEl.hidden = true;
  groupContextMenuGroupId = null;
}

groupContextMenuEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".quick-menu-item");
  const groupId = groupContextMenuGroupId;
  if (!btn || !groupId) return;

  switch (btn.dataset.action) {
    case "select-all":
      selectGroupMembers(groupId);
      break;
    case "rename": {
      const nameEl = groupsLayerEl.querySelector(`.group-box[data-id="${groupId}"] .group-name`);
      const group = getGroup(groupId);
      if (nameEl && group) startGroupRenaming(nameEl, group);
      break;
    }
    case "convert-type":
      convertGroupType(groupId, btn.dataset.targetType);
      break;
    case "duplicate":
      duplicateGroup(groupId);
      break;
    case "toggle-lock":
      toggleGroupLock(groupId);
      break;
    case "ungroup":
      ungroup(groupId);
      break;
  }
  closeGroupContextMenu();
});

// 메뉴 바깥에서 새로 뭔가를 누르면(클릭/드래그 시작) 메뉴를 닫는다 (퀵메뉴와 같은 방식).
document.addEventListener("mousedown", (e) => {
  if (!groupContextMenuEl.hidden && !groupContextMenuEl.contains(e.target)) {
    closeGroupContextMenu();
  }
});

/* ===== 도형 Shift+우클릭 메뉴 (다이어그램 타입 빠른 선택) =====
 * 꾸미기 패널의 "다이어그램 타입" 버튼과 완전히 같은 동작(applyStyleToSelection)을
 * 그대로 재사용한다 — 다중 선택 시 전체 적용, 그룹 소속이면 그룹 전체로 확장되는 것도
 * 전부 공짜로 따라온다. 이 메뉴는 새 로직을 담지 않고 단지 그 동작으로 가는 지름길이다. */

function openNoteContextMenu(clientX, clientY) {
  const firstId = selectedIds.values().next().value;
  const first = getNote(firstId);
  noteContextMenuEl.querySelectorAll(".note-diagram-type-item").forEach((btn) => {
    btn.classList.toggle("active", !!first && (first.diagramType || "none") === btn.dataset.diagramType);
  });

  noteContextMenuEl.hidden = false;
  const menuRect = noteContextMenuEl.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  noteContextMenuEl.style.left = `${Math.max(8, left)}px`;
  noteContextMenuEl.style.top = `${Math.max(8, top)}px`;
}

function closeNoteContextMenu() {
  noteContextMenuEl.hidden = true;
}

noteContextMenuEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".note-diagram-type-item");
  if (btn) applyStyleToSelection("diagramType", btn.dataset.diagramType);
  closeNoteContextMenu();
});

document.addEventListener("mousedown", (e) => {
  if (!noteContextMenuEl.hidden && !noteContextMenuEl.contains(e.target)) {
    closeNoteContextMenu();
  }
});

/* ===== 메모 꾸미기 (사이드바 "꾸미기" 패널) =====
 * 배경색/글자크기/정렬/테두리굵기는 note 객체의 필드(bg/fontSize/textAlign/borderWidth)로
 * 저장되고, 다른 note 필드들과 똑같이 cloneNotes/save/export·import 를 통째로 타고 다니므로
 * 이 기능만을 위한 별도 직렬화 코드는 필요 없다 — 값을 채우고 화면에 반영하는 것만 신경 쓰면 된다. */

// 배경색/테두리굵기는 사각형·원·마름모(clip-path 로 잘라낸 도형이라 실제 배경/테두리가
// 가상 요소(::after)에 있음) 모두에서 똑같이 동작해야 해서, .note 엘리먼트에 CSS 변수로
// 얹어두고 styles.css 쪽에서 도형별 규칙이 각자 그 변수를 참조하게 했다 — 그러면 여기서
// 도형이 뭔지 따로 분기할 필요가 없다.
function applyNoteStyleToEl(el, textEl, note) {
  // 다이어그램 타입에 따라 모서리 둥글기가 달라지므로(styles.css 의
  // [data-diagram-type="mindmap"] 규칙들), CSS 가 반응할 수 있게 속성으로 얹어둔다.
  el.dataset.diagramType = note.diagramType || "none";

  if (note.bg) {
    el.style.setProperty("--note-custom-bg", note.bg);
  } else {
    el.style.removeProperty("--note-custom-bg");
  }
  el.style.setProperty("--note-border-width", `${note.borderWidth ?? DEFAULT_BORDER_WIDTH}px`);

  textEl.style.fontSize = `${note.fontSize ?? DEFAULT_FONT_SIZE}px`;
  const align = note.textAlign || DEFAULT_TEXT_ALIGN;
  textEl.style.textAlign = align;
  // text-align 은 줄바꿈된 텍스트 안에서만 효과가 있어서(짧은 한 줄짜리 글자는 어차피
  // 내용만큼만 차지하는 박스가 가운데 있으니 안 움직여 보인다), 그 박스 자체를
  // 왼쪽/가운데/오른쪽으로 옮기는 justify-content 도 같이 맞춰줘야 진짜 정렬처럼 보인다.
  textEl.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
}

// 이미 화면에 그려진 메모의 스타일만 다시 적용한다 (전체 재렌더 없이).
function updateNoteStyleDOM(note) {
  const el = noteEl(note.id);
  if (!el) return;
  const textEl = el.querySelector(".note-text");
  if (!textEl) return;
  applyNoteStyleToEl(el, textEl, note);
}

// 선택된 메모(들) 전부에 같은 스타일 값을 적용하고, 한 번에 히스토리로 기록한다.
function applyStyleToSelection(field, value) {
  if (selectedIds.size === 0) return;

  // 다이어그램 타입만 예외: 그룹에 속한 도형이면 그 그룹 전체에 적용한다.
  // 그룹은 "같은 타입 도형들의 묶음"이라, 한 도형만 타입이 달라지면 안 되기 때문.
  const targetIds = new Set(selectedIds);
  if (field === "diagramType") {
    selectedIds.forEach((id) => {
      const group = groupOfNote(id);
      if (group) group.noteIds.forEach((memberId) => targetIds.add(memberId));
    });
  }

  targetIds.forEach((id) => {
    const note = getNote(id);
    if (!note) return;
    note[field] = value;
    updateNoteStyleDOM(note);
  });
  if (field === "diagramType") renderGroups(); // 그룹 박스 색이 타입을 따라가므로 다시 그린다
  updateStylePanel();
  commitChange();
}

function setStyleButtonRowActive(field, value) {
  document.querySelectorAll(`#style-panel-body [data-style-field="${field}"] button`).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === String(value));
  });
}

// 사이드바 꾸미기 패널을 지금 선택 상태에 맞게 갱신한다. 메모 선택이 바뀔 때마다
// (setSelection, undo/redo 복원, 페이지 전환) 호출된다.
function updateStylePanel() {
  if (selectedIds.size === 0) {
    stylePanelEmptyEl.hidden = false;
    stylePanelBodyEl.hidden = true;
    return;
  }
  const firstId = selectedIds.values().next().value;
  const first = getNote(firstId);
  if (!first) return;

  stylePanelEmptyEl.hidden = true;
  stylePanelBodyEl.hidden = false;

  // 다중 선택 시에도 표시는 "맨 처음 선택된 메모" 기준 하나만 보여준다(실제 적용은
  // 항상 선택된 전체에 동일하게 이루어진다 — 이 강조 표시는 참고용일 뿐).
  // 미지정(null)은 버튼의 data-value="none" 과 짝지어 표시한다.
  setStyleButtonRowActive("diagramType", first.diagramType || "none");

  // 선택된 것 중 (잠기지 않은) 그룹에 속한 도형이 하나라도 있을 때만 눌리게 한다.
  const canRemoveFromGroup = Array.from(selectedIds).some((id) => {
    const group = groupOfNote(id);
    return group && !group.locked;
  });
  removeFromGroupBtn.disabled = !canRemoveFromGroup;
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

  applyNoteStyleToEl(el, textEl, note); // 배경색/글자크기/정렬/테두리굵기(꾸미기 패널) 반영

  let textBeforeEdit = note.text;
  textEl.addEventListener("focus", () => {
    textBeforeEdit = note.text;
  });
  textEl.addEventListener("input", () => {
    note.text = textEl.textContent;
    if (syncNoteHeightToText(note)) {
      updateHandles();
      updateAllArrowGeometry();
      updateGroupBoxGeometry();
    }
    save();
  });
  textEl.addEventListener("blur", () => {
    // 편집 중 글자 하나하나가 아니라, 편집을 마친 시점에 한 칸으로 기록한다.
    if (note.text !== textBeforeEdit) {
      commitChange();
    }
  });

  // 삭제(×) 버튼 왼쪽에 자리하는 "그룹에서 빼기" 버튼. 이 메모가 그룹에 속해 있을
  // 때만 보인다(updateNoteGroupButtons 가 hidden/disabled 를 관리) — 처음 그릴 땐
  // 아직 어느 그룹에도 없는 채로 시작하므로 기본은 숨김이다.
  const ungroupBtn = document.createElement("button");
  ungroupBtn.type = "button";
  ungroupBtn.className = "note-ungroup-btn";
  ungroupBtn.setAttribute("aria-label", "그룹에서 빼기");
  ungroupBtn.title = "그룹에서 빼기";
  ungroupBtn.textContent = "−";
  ungroupBtn.hidden = true;
  ungroupBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  ungroupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeNoteFromGroupAction(note.id);
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
  el.appendChild(ungroupBtn);
  el.appendChild(deleteBtn);
  world.appendChild(el);
  makeNoteInteractive(el, note, textEl);
  return el;
}

function makeNoteInteractive(el, note, textEl) {
  // --- 우클릭: 화살표 연결 모드 시작. Shift+우클릭: 대신 다이어그램 타입 메뉴 ---
  // (기존의 "우클릭 한 번으로 바로 연결 시작"하는 빠른 동작은 그대로 두고,
  // Shift 를 눌렀을 때만 메뉴로 갈라지게 해서 기존 습관을 깨지 않는다.)
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation(); // 캔버스의 빈 곳 우클릭 퀵메뉴가 대신 뜨지 않도록 막는다.
    if (e.shiftKey) {
      if (!selectedIds.has(note.id)) selectOnly(note.id);
      openNoteContextMenu(e.clientX, e.clientY);
      return;
    }
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

    // 잠긴 그룹에 속한 메모는 다중선택에 같이 걸려도 옮기지 않는다(선택은 그대로 둔다).
    // 지금 누른 메모 자체가 잠긴 그룹 소속이면 draggedIds 가 비어서, 아래에서
    // 드래그 추적 자체를 시작하지 않는다.
    const draggedIds = Array.from(selectedIds).filter((id) => {
      const g = groupOfNote(id);
      return !(g && g.locked);
    });
    if (draggedIds.length === 0) return;

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
      updateGroupBoxGeometry();

      // 드래그 중인 도형(들) 아래로 다른 그룹의 이름표가 지나가면, 여기 놓으면
      // 그 그룹에 들어간다는 걸 이름표 강조 + 커서 옆 배지로 보여준다.
      const draggedEls = startPositions.map((p) => p.el);
      const hoverLabel = groupLabelUnderPoint(ev.clientX, ev.clientY, draggedEls);
      clearGroupDropHighlight();
      if (hoverLabel) {
        hoverLabel.classList.add("drop-target");
        const hoverGroup = getGroup(hoverLabel.closest(".group-box").dataset.id);
        if (hoverGroup) showGroupDropHint(ev.clientX, ev.clientY, hoverGroup.name);
      }
    };

    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      startPositions.forEach((p) => p.el && p.el.classList.remove("dragging"));
      clearGroupDropHighlight();

      if (moved) {
        // 그룹 이름표 위에 놓았으면(=드롭), 옮긴 도형(들)을 그 그룹에 편입시킨다.
        const draggedEls = startPositions.map((p) => p.el);
        const dropLabel = groupLabelUnderPoint(ev.clientX, ev.clientY, draggedEls);
        const dropGroupBox = dropLabel && dropLabel.closest(".group-box");
        if (dropGroupBox) {
          addNotesToGroup(draggedIds, dropGroupBox.dataset.id);
          renderGroups();
        }
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
  if (!SHAPE_LABELS[shape]) return; // 알려진 도형인지 확인하는 용도로만 SHAPE_LABELS 를 쓴다
  nextShape = shape;
  updateShapeUIHighlight();
}

// 도형 선택 상태를 보여주는 두 곳(퀵메뉴, 툴바의 미니 팔레트)을 한꺼번에 갱신한다.
function updateShapeUIHighlight() {
  quickMenuEl.querySelectorAll(".shape-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shape === nextShape);
  });
  document.querySelectorAll(".shape-palette-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shape === nextShape);
  });
}

document.querySelectorAll(".shape-palette-btn").forEach((btn) => {
  btn.addEventListener("click", () => setNextShape(btn.dataset.shape));
});

/* ===== 다음 생성 다이어그램 타입 (툴바 토글 / Tab) ===== */

function setNextDiagramType(type) {
  if (!DIAGRAM_TYPE_LABELS[type]) return;
  nextDiagramType = type;
  updateDiagramTypeHighlight();
}

function updateDiagramTypeHighlight() {
  document.querySelectorAll(".diagram-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.diagramType === nextDiagramType);
  });
}

document.querySelectorAll(".diagram-type-btn").forEach((btn) => {
  btn.addEventListener("click", () => setNextDiagramType(btn.dataset.diagramType));
});

// Tab 으로 플로우차트 <-> 마인드맵 전환. preventDefault 를 안 하면 브라우저가 포커스를
// 다음 요소로 옮겨버리므로 반드시 막아야 한다.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;

  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return; // 글자 입력 중일 땐 평소의 Tab 동작을 그대로 둔다
  }

  e.preventDefault();
  setNextDiagramType(nextDiagramType === "flowchart" ? "mindmap" : "flowchart");
});

let quickMenuWorldPos = null; // 퀵메뉴를 열었을 때의 월드 좌표 (거기에 메모를 추가하려고 기억해둠)
let quickMenuGroupId = null; // 그룹 영역 안에서 열렸다면 그 그룹 id (여기서 만드는 메모는 바로 그 그룹에 편입된다)

function openQuickMenu(clientX, clientY, worldPos, groupId = null) {
  quickMenuWorldPos = worldPos;
  quickMenuGroupId = groupId;
  updateShapeUIHighlight();

  if (quickMenuGroupId) {
    const group = getGroup(quickMenuGroupId);
    quickMenuGroupHintEl.hidden = false;
    quickMenuGroupHintEl.textContent = group ? `"${group.name}" 그룹에 추가됨` : "";
  } else {
    quickMenuGroupHintEl.hidden = true;
  }

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
  quickMenuGroupId = null;
}

quickMenuEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".quick-menu-item");
  if (!btn) return;

  if (btn.dataset.action === "create" && quickMenuWorldPos) {
    const p = quickMenuWorldPos;
    const el = createNote(p.x - DEFAULT_NOTE_W / 2, p.y - DEFAULT_NOTE_H / 2, "", nextShape, quickMenuGroupId);
    el.querySelector(".note-text").focus();
  } else if (btn.dataset.action === "lasso") {
    setLassoMode(true);
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
  if (e.target !== canvas) return; // #world 는 0x0 크기라, 그룹 박스(pointer-events:none) 위여도 e.target 은 그대로 canvas
  const worldPos = screenToWorld(e.clientX, e.clientY);
  const group = groupAtWorldPoint(worldPos); // 그 자리가 어느 그룹의 영역 안이면, 새 메모를 거기 바로 편입시킨다
  openQuickMenu(e.clientX, e.clientY, worldPos, group ? group.id : null);
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

/* ===== 올가미(라쏘): 자유곡선으로 감싼 도형들을 그룹으로 묶기 =====
 * 올가미 모드일 때만 빈 곳 드래그가 "사각형 영역 선택" 대신 자유곡선 그리기가 된다.
 * 평소 모드의 영역 선택 동작은 전혀 건드리지 않는다(아래 핸들러 맨 앞의 early return). */

let lassoMode = false;

function setLassoMode(on) {
  lassoMode = on;
  canvas.classList.toggle("lasso", on);
  lassoBtn.classList.toggle("active", on);
  if (!on) lassoPathEl.setAttribute("points", "");
}

lassoBtn.addEventListener("click", () => setLassoMode(!lassoMode));

canvas.addEventListener("mousedown", (e) => {
  if (!lassoMode) return;
  if (arrowDraft) return;
  if (e.button !== 0 || e.ctrlKey) return;
  if (e.target !== canvas) return; // 메모 위에서 시작한 드래그는 메모 쪽 핸들러가 처리

  e.preventDefault();
  const canvasRect = canvas.getBoundingClientRect();
  const points = [{ x: e.clientX, y: e.clientY }]; // 뷰포트 기준으로 모으고, 그릴 때만 보정한다

  const draw = () => {
    // #lasso-layer 는 #canvas 안에 있으므로 캔버스 자신의 오프셋을 빼야 한다
    // (사이드바 때문에 #canvas 가 화면 왼쪽 끝이 아니다 — selection-box 와 같은 이유).
    lassoPathEl.setAttribute(
      "points",
      points.map((p) => `${p.x - canvasRect.left},${p.y - canvasRect.top}`).join(" ")
    );
  };

  const onMove = (ev) => {
    points.push({ x: ev.clientX, y: ev.clientY });
    draw();
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    lassoPathEl.setAttribute("points", "");

    if (points.length < 3) return; // 사실상 클릭이면 아무것도 하지 않는다

    const polygon = points.map((p) => screenToWorld(p.x, p.y));
    const enclosedIds = notesInsidePolygon(polygon);
    if (enclosedIds.length === 0) return;

    createGroupsFromNoteIds(enclosedIds);
    renderGroups();
    setSelection(enclosedIds); // 방금 묶은 것들을 선택해둔다 (바로 타입을 바꾸기 편하게)
    justBoxSelected = true; // 뒤따라오는 click 이 이 선택을 지우지 않도록
    commitChange();
    setLassoMode(false); // 한 번 묶었으면 일반 선택 모드로 자동 복귀 (계속 올가미로 남아있지 않게)
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// 왼쪽 버튼(Ctrl 없이)으로 빈 곳을 드래그 → 사각형 영역에 걸친 메모를 모두 선택.
// (움직이지 않고 떼면 그냥 클릭이므로, 아래 click 핸들러가 선택 해제를 처리한다)
let justBoxSelected = false;

canvas.addEventListener("mousedown", (e) => {
  if (lassoMode) return; // 올가미 모드일 땐 위 핸들러가 대신 처리한다
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

    // selectionBoxEl 은 #canvas 기준으로 위치가 잡히므로(뷰포트 기준이 아니라),
    // 캔버스 자신의 오프셋을 빼줘야 한다 (사이드바 때문에 #canvas 가 왼쪽으로 밀려 있음).
    const canvasRect = canvas.getBoundingClientRect();
    const left = Math.min(startX, ev.clientX) - canvasRect.left;
    const top = Math.min(startY, ev.clientY) - canvasRect.top;
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
    // (뷰포트 좌표를 그대로 쓰면 안 되고, 캔버스 자신의 왼쪽 위 기준으로 바꿔야 한다 —
    //  사이드바 때문에 #canvas 가 화면 왼쪽에서 떨어져 있다)
    const canvasRect = canvas.getBoundingClientRect();
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;
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

/* ===== 키보드: 도형 단축키(1/2/3), 올가미(L) & 퀵메뉴 닫기(Esc) ===== */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (arrowDraft) {
      cancelArrowDraft();
      return;
    }
    if (!quickMenuEl.hidden) {
      closeQuickMenu();
      return;
    }
    if (!groupContextMenuEl.hidden) {
      closeGroupContextMenu();
      return;
    }
    if (!noteContextMenuEl.hidden) {
      closeNoteContextMenu();
      return;
    }
    if (lassoMode) setLassoMode(false); // 올가미 모드에서 빠져나오기
    return;
  }

  const key = e.key.toLowerCase();
  if (!"123456".includes(key) && key !== "l") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+L(주소창) 같은 조합은 건드리지 않는다

  // 텍스트 편집/입력 중이면 평범한 글자 입력으로 취급한다.
  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA")
  ) {
    return;
  }

  if (key === "l") {
    setLassoMode(!lassoMode);
    return;
  }

  setNextShape(SHAPE_ORDER[Number(key) - 1]);
});

/* ===== Mermaid 내보내기 =====
 * 현재 페이지의 도형/화살표/그룹을 Mermaid 텍스트로 바꾼다. 클로드와 주고받는 "번역 언어"라서,
 * 좌표·크기·꾸미기 같은 그리기 정보는 일부러 버리고 구조(무엇이 무엇과 이어지는지)만 남긴다.
 *
 * Mermaid 는 문서 하나에 다이어그램 타입을 하나만 선언할 수 있으므로(flowchart 또는 mindmap),
 * 한 페이지에 두 타입이 섞여 있으면 여러 블록으로 나눠서 내보낸다:
 *   - 플로우차트 도형 전체 → 블록 1개 (그룹은 subgraph 가 된다)
 *   - 마인드맵 그룹 → 그룹마다 블록 1개 (마인드맵은 중심 하나에서 뻗는 트리여야 하므로)
 *
 * DOM 을 건드리지 않는 순수 함수라, 테스트에서 결과 문자열만 바로 검사할 수 있다. */

const MERMAID_INDENT = "  ";

function isExportableType(type) {
  return type === "flowchart" || type === "mindmap";
}

// 노드 라벨 안에서 문법을 깨뜨리는 글자를 안전하게 바꾼다.
function escapeMermaidLabel(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return "(빈 메모)";
  return trimmed.replace(/"/g, "#quot;").replace(/\s*\n\s*/g, "<br/>");
}

// 마인드맵은 라벨을 따옴표로 감싸지 않고 괄호류로 모양을 정하는 문법이라,
// 괄호가 텍스트에 들어있으면 파싱이 깨진다. 그래서 여기서만 따로 정리한다.
// 줄바꿈은 flowchart(escapeMermaidLabel)와 똑같이 <br/> 로 내보낸다 — Mermaid
// mindmap 라벨도 일반 텍스트라 <br/> 를 그대로 쓸 수 있고, Import 쪽에서 다시
// 실제 줄바꿈으로 되돌린다(대칭).
function sanitizeMindmapLabel(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return "(빈 메모)";
  return trimmed.replace(/[[\](){}"]/g, "").replace(/\s*\n\s*/g, "<br/>");
}

function mermaidNodeId(noteId) {
  return `N${noteId}`;
}

// 도형 모양 → 플로우차트 노드 문법. 전부 Mermaid 표준 도형 문법 그대로다(단계=[], 분기={},
// 시작/끝=([]) 스타디움, 준비/설정={{}} 육각형, 입력=[/ /], 출력=[\ \] 평행사변형).
function flowchartNodeLine(note) {
  const label = escapeMermaidLabel(note.text);
  const id = mermaidNodeId(note.id);
  switch (note.shape) {
    case "diamond":
      return `${id}{"${label}"}`;
    case "stadium":
      return `${id}(["${label}"])`;
    case "hexagon":
      return `${id}{{"${label}"}}`;
    case "parallelogram":
      return `${id}[/"${label}"/]`;
    case "parallelogram-rev":
      return `${id}[\\"${label}"\\]`;
    default:
      return `${id}["${label}"]`; // 단계(사각형)
  }
}

// 마인드맵 문법은 4가지 도형 토큰을 구분한다: 사각형([])·육각형({{}})·둥근사각형(())·
// 원((())). 분기는 둥근사각형, 시작/끝은 원으로 대응시켜서(mindmapNodeLine 참고)
// parseMindmapNodeToken 이 다시 정확히 그 도형으로 되돌리므로, 이 넷은 마인드맵을
// 왕복해도 도형 정보가 안 사라진다(문법만 flowchart 때와 다를 뿐). 입력/출력만은
// 구분되는 마인드맵 토큰이 아예 없어서 — 대응시킬 게 없어 둘 다 그냥 사각형([])으로
// 나가고, 그러면 원래의 단계(rect)와도 구분이 안 돼 도형 정보가 실제로 사라진다.
// 그래서 "마인드맵에 없는 도형"은 이 둘뿐이고, 이 집합은 두 군데서 같이 쓴다:
// generateMermaid() 의 경고 문구(도형 하나하나가 아니라 한 번에 모아서 알려줌)와
// rearrangeNotes() 가 재배치 후 실제 도형을 무엇으로 바꿀지 판단할 때.
const MINDMAP_UNSUPPORTED_SHAPES = new Set(["parallelogram", "parallelogram-rev"]);
const MINDMAP_FALLBACK_DESC = {
  parallelogram: "사각형",
  "parallelogram-rev": "사각형",
};

function mindmapNodeLine(note) {
  const label = sanitizeMindmapLabel(note.text);
  const id = mermaidNodeId(note.id);
  switch (note.shape) {
    case "hexagon":
      return `${id}{{${label}}}`;
    case "diamond":
      return `${id}(${label})`;
    case "stadium":
      return `${id}((${label}))`;
    case "parallelogram":
    case "parallelogram-rev":
      return `${id}[${label}]`;
    default:
      return `${id}[${label}]`; // 단계(사각형)
  }
}

// 마인드맵 그룹의 화살표들로 트리를 만든다. 트리가 아니면 why 에 이유를 담아 돌려준다.
function buildMindmapTree(group, groupArrows) {
  const memberIds = group.noteIds.filter((id) => getNote(id));
  const parentOf = new Map();
  const childrenOf = new Map();
  memberIds.forEach((id) => childrenOf.set(id, []));

  for (const arrow of groupArrows) {
    if (parentOf.has(arrow.toId)) {
      const note = getNote(arrow.toId);
      return { error: `"${(note && note.text) || arrow.toId}" 도형으로 화살표가 두 개 이상 들어옵니다. 마인드맵은 부모가 하나뿐인 트리여야 합니다.` };
    }
    parentOf.set(arrow.toId, arrow.fromId);
    childrenOf.get(arrow.fromId).push(arrow.toId);
  }

  const roots = memberIds.filter((id) => !parentOf.has(id));
  if (roots.length === 0) {
    return { error: "화살표가 순환하고 있어 시작점(중심)을 찾을 수 없습니다." };
  }
  if (roots.length > 1) {
    const names = roots.map((id) => `"${(getNote(id).text || "").trim() || id}"`).join(", ");
    return { error: `중심이 될 수 있는 도형이 여러 개입니다(${names}). 마인드맵은 하나의 중심에서 뻗어나가야 합니다 — 화살표로 이어주세요.` };
  }

  return { root: roots[0], childrenOf };
}

function generateMermaid() {
  const blocks = [];
  const warnings = [];
  const typeOfNote = (id) => {
    const note = getNote(id);
    return note ? note.diagramType : null;
  };

  // --- 변환에서 빠지는 것들을 먼저 알려준다 ---
  const unsetNotes = notes.filter((n) => !isExportableType(n.diagramType));
  if (unsetNotes.length > 0) {
    warnings.push(
      `타입이 미지정인 도형 ${unsetNotes.length}개를 제외했습니다. 올가미로 묶거나 꾸미기 패널에서 타입을 지정하면 포함됩니다.`
    );
  }

  const droppedByUnset = arrows.filter(
    (a) => !isExportableType(typeOfNote(a.fromId)) || !isExportableType(typeOfNote(a.toId))
  );
  if (droppedByUnset.length > 0) {
    warnings.push(`미지정 도형에 연결된 화살표 ${droppedByUnset.length}개도 함께 제외했습니다.`);
  }

  const crossTypeArrows = arrows.filter((a) => {
    const from = typeOfNote(a.fromId);
    const to = typeOfNote(a.toId);
    return isExportableType(from) && isExportableType(to) && from !== to;
  });
  if (crossTypeArrows.length > 0) {
    warnings.push(
      `타입이 서로 다른 도형을 잇는 화살표 ${crossTypeArrows.length}개를 제외했습니다. Mermaid 는 문서 하나에 한 종류의 다이어그램만 담을 수 있습니다.`
    );
  }

  // --- 플로우차트 블록 (그룹은 subgraph, 그룹 밖 도형은 그대로) ---
  const flowNotes = notes.filter((n) => n.diagramType === "flowchart");
  if (flowNotes.length > 0) {
    const lines = ["flowchart TD"];
    const emitted = new Set();

    groups.forEach((group) => {
      const members = group.noteIds.map(getNote).filter((n) => n && n.diagramType === "flowchart");
      if (members.length === 0) return;
      lines.push(`${MERMAID_INDENT}subgraph ${group.id}["${escapeMermaidLabel(group.name)}"]`);
      members.forEach((note) => {
        lines.push(`${MERMAID_INDENT}${MERMAID_INDENT}${flowchartNodeLine(note)}`);
        emitted.add(note.id);
      });
      lines.push(`${MERMAID_INDENT}end`);
    });

    flowNotes.forEach((note) => {
      if (emitted.has(note.id)) return;
      lines.push(`${MERMAID_INDENT}${flowchartNodeLine(note)}`);
    });

    // 화살표는 subgraph 블록이 모두 끝난 뒤에 선언한다 — 그래야 그룹을 가로지르는
    // 연결도 문제없이 표현된다.
    arrows.forEach((arrow) => {
      if (typeOfNote(arrow.fromId) !== "flowchart" || typeOfNote(arrow.toId) !== "flowchart") return;
      const from = mermaidNodeId(arrow.fromId);
      const to = mermaidNodeId(arrow.toId);
      const label = (arrow.label || "").trim();
      lines.push(
        label
          ? `${MERMAID_INDENT}${from} -->|"${escapeMermaidLabel(label)}"| ${to}`
          : `${MERMAID_INDENT}${from} --> ${to}`
      );
    });

    blocks.push({ title: "플로우차트", text: lines.join("\n") });
  }

  // --- 마인드맵 블록 (그룹 하나 = 문서 하나) ---
  const mindmapGroups = groups.filter((g) =>
    g.noteIds.some((id) => {
      const note = getNote(id);
      return note && note.diagramType === "mindmap";
    })
  );

  const groupedMindmapIds = new Set();
  mindmapGroups.forEach((g) => g.noteIds.forEach((id) => groupedMindmapIds.add(id)));
  const looseMindmapNotes = notes.filter(
    (n) => n.diagramType === "mindmap" && !groupedMindmapIds.has(n.id)
  );
  if (looseMindmapNotes.length > 0) {
    warnings.push(
      `그룹에 속하지 않은 마인드맵 도형 ${looseMindmapNotes.length}개를 제외했습니다. 마인드맵은 올가미로 묶은 그룹 단위로 내보냅니다.`
    );
  }

  let labelsIgnored = 0;
  const usedMindmapFallbackShapes = new Set();
  mindmapGroups.forEach((group) => {
    const memberIdSet = new Set(group.noteIds);
    const groupArrows = arrows.filter(
      (a) => memberIdSet.has(a.fromId) && memberIdSet.has(a.toId)
    );
    labelsIgnored += groupArrows.filter((a) => (a.label || "").trim()).length;

    const tree = buildMindmapTree(group, groupArrows);
    if (tree.error) {
      warnings.push(`마인드맵 그룹 "${group.name}"을(를) 변환하지 못했습니다 — ${tree.error}`);
      return;
    }

    const lines = ["mindmap"];
    const walk = (noteId, depth) => {
      const note = getNote(noteId);
      if (!note) return;
      if (MINDMAP_UNSUPPORTED_SHAPES.has(note.shape)) usedMindmapFallbackShapes.add(note.shape);
      lines.push(`${MERMAID_INDENT.repeat(depth + 1)}${mindmapNodeLine(note)}`);
      tree.childrenOf.get(noteId).forEach((childId) => walk(childId, depth + 1));
    };
    walk(tree.root, 0);

    blocks.push({ title: `마인드맵 — ${group.name}`, text: lines.join("\n") });
  });

  if (labelsIgnored > 0) {
    warnings.push(`마인드맵 안 화살표 라벨 ${labelsIgnored}개는 무시했습니다. Mermaid 마인드맵 문법에는 화살표 라벨이 없습니다.`);
  }

  if (usedMindmapFallbackShapes.size > 0) {
    const desc = [...usedMindmapFallbackShapes]
      .map((shape) => `${SHAPE_LABELS[shape]}→${MINDMAP_FALLBACK_DESC[shape]}`)
      .join(", ");
    warnings.push(`마인드맵 문법에 없는 도형 모양은 비슷한 모양으로 대체되었습니다: ${desc}`);
  }

  return { blocks, warnings };
}

/* ----- Mermaid 결과 팝업 ----- */

function copyTextToClipboard(text, btn) {
  const done = () => {
    const original = btn.textContent;
    btn.textContent = "복사됨";
    setTimeout(() => {
      btn.textContent = original;
    }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

// clipboard API 가 막혀 있는 환경(권한 거부 등)을 위한 예비 수단.
function fallbackCopy(text, done) {
  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  try {
    document.execCommand("copy");
    done();
  } catch (e) {
    // 복사가 안 되면 사용자가 직접 선택해서 복사하면 된다 (텍스트는 이미 화면에 있다).
  }
  temp.remove();
}

function openMermaidPopup() {
  const { blocks, warnings } = generateMermaid();

  if (warnings.length > 0) {
    mermaidWarningsEl.hidden = false;
    mermaidWarningsEl.innerHTML = "";
    const list = document.createElement("ul");
    warnings.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    });
    mermaidWarningsEl.appendChild(list);
  } else {
    mermaidWarningsEl.hidden = true;
    mermaidWarningsEl.innerHTML = "";
  }

  mermaidBlocksEl.innerHTML = "";
  if (blocks.length === 0) {
    const empty = document.createElement("div");
    empty.id = "mermaid-empty";
    empty.textContent =
      "내보낼 내용이 없습니다. 도형을 만들고 올가미(L)로 묶거나 꾸미기 패널에서 다이어그램 타입을 지정해주세요.";
    mermaidBlocksEl.appendChild(empty);
  }

  blocks.forEach((block) => {
    const wrap = document.createElement("div");
    wrap.className = "mermaid-block";

    const head = document.createElement("div");
    head.className = "mermaid-block-head";

    const title = document.createElement("span");
    title.className = "mermaid-block-title";
    title.textContent = block.title;
    head.appendChild(title);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mermaid-copy-btn";
    copyBtn.textContent = "복사";
    copyBtn.addEventListener("click", () => copyTextToClipboard(block.text, copyBtn));
    head.appendChild(copyBtn);

    const textarea = document.createElement("textarea");
    textarea.className = "mermaid-text";
    textarea.readOnly = true;
    textarea.value = block.text;

    wrap.appendChild(head);
    wrap.appendChild(textarea);
    mermaidBlocksEl.appendChild(wrap);
  });

  mermaidPopup.hidden = false;
}

function closeMermaidPopup() {
  mermaidPopup.hidden = true;
}

mermaidBtn.addEventListener("click", openMermaidPopup);
mermaidCloseBtn.addEventListener("click", closeMermaidPopup);
// 도움말 팝업과 같은 방식: 바깥을 클릭하면 닫는다(여는 버튼 클릭은 제외).
document.addEventListener("click", (e) => {
  if (mermaidPopup.hidden) return;
  if (mermaidPopup.contains(e.target) || e.target === mermaidBtn || mermaidBtn.contains(e.target)) return;
  closeMermaidPopup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !mermaidPopup.hidden) closeMermaidPopup();
});

/* ===== Mermaid 가져오기 (텍스트 → 도형/화살표/그룹) =====
 * Export 의 반대 방향. Mermaid 텍스트에는 좌표가 없으므로, 파싱해서 구조(무엇이 무엇의
 * 자식/이웃인지)만 알아낸 다음 dagre(검증된 그래프 레이아웃 라이브러리, index.html 에서
 * CDN 으로 불러온다)로 좌표를 계산한다. 레이아웃 알고리즘 자체를 새로 만들지 않는다.
 *
 * 전체 흐름: splitMermaidBlocks(원문 분리) → 블록별 parseFlowchartBlock/parseMindmapBlock
 * (구조 파악) → layoutBlockWithDagre(블록별 좌표 계산) → placeBlocksOnCanvas(블록끼리 안
 * 겹치게 배치 + 현재 화면 근처로 이동) → importMermaidText(실제 notes/arrows/groups 로 반영).
 *
 * 실패 안전: 파싱/배치 도중 예외가 나거나 블록 일부가 이상해도 기존 캔버스 상태가 절대
 * 깨지지 않도록, 전부 로컬 임시 배열/카운터에 쌓았다가 마지막에 성공했을 때만 한 번에
 * notes/arrows/groups 와 nextId/nextArrowId/nextGroupId 에 반영한다(all-or-nothing). */

// ```mermaid 코드펜스, %% 지시문/주석 줄을 치우고, flowchart/graph/mindmap 헤더 줄이 나올
// 때마다 새 블록을 시작한다. 헤더 이전에 나오는 줄(설명 텍스트 등)은 무시한다.
function splitMermaidBlocks(rawText) {
  const lines = rawText.split(/\r?\n/).filter((l) => !/^\s*```/.test(l));
  const blocks = [];
  let current = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("%%")) return; // mermaid 지시문/주석

    if (/^(flowchart|graph)\b/i.test(trimmed)) {
      current = { type: "flowchart", headerLine: trimmed, rawLines: [] };
      blocks.push(current);
      return;
    }
    if (/^mindmap\b/i.test(trimmed)) {
      current = { type: "mindmap", headerLine: trimmed, rawLines: [] };
      blocks.push(current);
      return;
    }
    if (current) current.rawLines.push(line);
  });

  return blocks;
}

// 라벨을 감싼 따옴표(있으면)만 벗겨낸다.
function stripMermaidQuotes(s) {
  const t = (s || "").trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return t.slice(1, -1);
  return t;
}

// Export 때 escapeMermaidLabel/sanitizeMindmapLabel 이 실제 줄바꿈을 <br/> 로 바꿔
// 한 줄짜리 Mermaid 문법 안에 담았던 것의 반대 방향 — <br/> 나 <br>(대소문자·공백·
// 슬래시 유무 무관)을 다시 실제 줄바꿈으로 되돌린다. 이걸 안 하면 도형 안에 "<br/>"
// 라는 글자가 그대로 노출된다.
function unescapeMermaidBr(text) {
  return (text || "").replace(/<br\s*\/?>/gi, "\n");
}

/* 플로우차트 한 줄을 앞에서부터 훑으면서 "노드(도형+라벨) → 화살표(+라벨)? → 노드 → ..."
 * 사슬을 뽑아낸다. `A["시작"] --> B{"확인?"}`, `A --> B --> C`, `A -->|"예"| B`, 따옴표 없는
 * `A[Start]`, 화살표 없이 노드 선언만 있는 줄(`A["혼자"]`) 을 전부 이 한 함수로 처리한다.
 * 정규식 하나로 억지로 다 잡으려 하면 캡처 그룹이 감당 안 되게 늘어나서, 대신 위치(i)를
 * 옮겨가며 조각조각 읽는 손수 스캐너로 짰다. */
function tokenizeFlowchartLine(line) {
  let i = 0;
  const len = line.length;
  const skipWs = () => {
    while (i < len && /\s/.test(line[i])) i++;
  };
  // id 는 영문/숫자로만 제한하지 않는다 — Claude 나 사용자가 한글로 의미 있는 id를
  // 그대로 쓰는 경우가 흔해서(이 앱의 목적 자체가 클로드와의 한글 소통), 공백과 도형
  // 괄호([{()}]|)·화살표에 쓰이는 특수문자(-=<>.)만 빼고는 전부 id 문자로 허용한다.
  const readId = () => {
    const m = /^[^\s[\]{}()|\-=<>.]+/.exec(line.slice(i));
    if (!m) return null;
    i += m[0].length;
    return m[0];
  };
  // 노드 뒤에 바로 붙는 도형 문법(있으면)을 읽는다. ((원)) 을 [사각형]/{마름모} 보다
  // 먼저 검사해야 한다 — 안 그러면 "((" 의 첫 "(" 를 다른 문법으로 오인할 일은 없지만
  // 순서를 명확히 해 둔다.
  const readShape = () => {
    // 스타디움(시작/끝): ([...]) — "((" (예전 원 문법)과 헷갈리지 않도록 "([" 두 글자를 본다.
    if (line.slice(i, i + 2) === "([") {
      const close = line.indexOf("])", i + 2);
      if (close === -1) return null;
      const shape = { shape: "stadium", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 2, close))) };
      i = close + 2;
      return shape;
    }
    // 육각형(준비/설정): {{...}} — 단일 "{"(마름모)보다 먼저 봐야 한다.
    if (line.slice(i, i + 2) === "{{") {
      const close = line.indexOf("}}", i + 2);
      if (close === -1) return null;
      const shape = { shape: "hexagon", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 2, close))) };
      i = close + 2;
      return shape;
    }
    // 평행사변형(입력): [/텍스트/] — 단일 "["(사각형)보다 먼저 봐야 한다.
    if (line.slice(i, i + 2) === "[/") {
      const close = line.indexOf("/]", i + 2);
      if (close === -1) return null;
      const shape = { shape: "parallelogram", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 2, close))) };
      i = close + 2;
      return shape;
    }
    // 역평행사변형(출력): [\...\]
    if (line.slice(i, i + 2) === "[\\") {
      const close = line.indexOf("\\]", i + 2);
      if (close === -1) return null;
      const shape = { shape: "parallelogram-rev", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 2, close))) };
      i = close + 2;
      return shape;
    }
    if (line[i] === "[") {
      const close = line.indexOf("]", i + 1);
      if (close === -1) return null;
      const shape = { shape: "rect", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 1, close))) };
      i = close + 1;
      return shape;
    }
    if (line[i] === "{") {
      const close = line.indexOf("}", i + 1);
      if (close === -1) return null;
      const shape = { shape: "diamond", label: unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 1, close))) };
      i = close + 1;
      return shape;
    }
    return null;
  };
  const readArrow = () => {
    const m = /^(-\.->|==>|-->|-\.-|---)/.exec(line.slice(i));
    if (!m) return null;
    i += m[0].length;
    return m[0];
  };
  const readEdgeLabel = () => {
    skipWs();
    if (line[i] !== "|") return null;
    const close = line.indexOf("|", i + 1);
    if (close === -1) return null;
    const label = unescapeMermaidBr(stripMermaidQuotes(line.slice(i + 1, close)));
    i = close + 1;
    return label;
  };

  const nodeDefs = []; // { id, shape } — shape 는 없으면 null(다른 곳에서 이미 정의됐거나, 라벨 없이 id 그대로 씀)
  const edges = []; // { from, to, label }

  skipWs();
  let currentId = readId();
  if (currentId === null) return { nodeDefs: [], edges: [], ok: false };
  nodeDefs.push({ id: currentId, shape: readShape() });

  skipWs();
  for (;;) {
    const arrow = readArrow();
    if (!arrow) break;
    const label = readEdgeLabel();
    skipWs();
    const nextId = readId();
    if (nextId === null) break; // 문법이 깨졌으면 여기까지만 인정하고 멈춘다
    nodeDefs.push({ id: nextId, shape: readShape() });
    edges.push({ from: currentId, to: nextId, label });
    currentId = nextId;
    skipWs();
  }

  return { nodeDefs, edges, ok: true };
}

// 플로우차트 블록 본문(헤더 다음 줄부터)을 구조로 바꾼다. subgraph/end 로 그룹 소속을 추적한다.
// 그룹 중첩은 앱이 지원하지 않으므로, 중첩됐을 땐 안쪽(가장 가까운) subgraph 가 소속으로 이긴다.
function parseFlowchartBlock(block) {
  const dirMatch = /\b(TD|TB|LR|RL|BT)\b/i.exec(block.headerLine);
  const direction = dirMatch ? dirMatch[1].toUpperCase() : "TD";

  const nodes = new Map(); // mermaidId -> { shape, label }
  const edges = []; // { from, to, label }
  const finishedSubgraphs = []; // { name, nodeIds: [] }
  const stack = []; // 지금 열려 있는 subgraph 들 { name, nodeIds }
  const skippedLines = [];

  const upsertNode = (id, shape) => {
    if (!nodes.has(id)) nodes.set(id, { shape: null, label: id });
    if (shape) {
      const n = nodes.get(id);
      n.shape = shape.shape;
      n.label = shape.label || id;
    }
    const owner = stack[stack.length - 1];
    if (owner && !owner.nodeIds.includes(id)) owner.nodeIds.push(id);
  };

  block.rawLines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    if (/^end$/i.test(trimmed)) {
      const closed = stack.pop();
      if (closed && closed.nodeIds.length > 0) finishedSubgraphs.push(closed);
      return;
    }

    // id 부분(대괄호 앞)도 영문/숫자로 제한하지 않는다 — 위 readId/parseMindmapNodeToken 과
    // 같은 이유로, "subgraph 준비["준비 단계"]" 처럼 한글 id 를 쓴 경우도 대괄호 안의
    // "준비 단계"만 이름으로 정확히 뽑아내야 한다(공백/대괄호/따옴표만 피하면 id로 허용).
    const sgMatch = trimmed.match(/^subgraph\s+(?:[^\s[\]"]+\s*\[\s*"?([^"\]]*)"?\s*\]|"([^"]+)"|(.+))$/i);
    if (sgMatch) {
      const name = (sgMatch[1] || sgMatch[2] || sgMatch[3] || "").trim() || "그룹";
      stack.push({ name, nodeIds: [] });
      return;
    }

    const { nodeDefs, edges: lineEdges, ok } = tokenizeFlowchartLine(trimmed);
    if (!ok || nodeDefs.length === 0) {
      skippedLines.push(rawLine);
      return;
    }
    nodeDefs.forEach((def) => upsertNode(def.id, def.shape));
    lineEdges.forEach((e) => edges.push(e));
  });

  // 끝까지 안 닫힌 subgraph 는 닫힌 것으로 간주하고 거둬들인다(문법 오류에도 최대한 살린다).
  while (stack.length > 0) {
    const closed = stack.pop();
    if (closed.nodeIds.length > 0) finishedSubgraphs.push(closed);
  }

  return { type: "flowchart", direction, nodes, edges, subgraphs: finishedSubgraphs, skippedLines };
}

// 마인드맵 노드 한 줄(들여쓰기 제거된 상태)을 도형+라벨로 바꾼다. 마인드맵 문법엔 마름모가
// 없어서 육각형({{}})을 마름모로 되돌리고(내보내기와 대칭), 원({{}}과 구분되는 (()))은
// 원으로, 사각형([])과 괄호만 있는 둥근 모양(())은 둘 다 사각형으로 단순화한다(이 앱은
// 도형이 3종류뿐이라 둥근 사각형에 대응하는 게 없다). id 는 있어도 되고 없어도 된다.
// mindmapNodeLine 의 대체 매핑과 정확히 대칭이 되도록 되돌린다 — 원({{}}) → 육각형(그대로),
// 원((())) → 시작/끝(stadium 을 원으로 내보냈던 것), 둥근사각형(()) → 분기(마름모를 둥근
// 사각형으로 내보냈던 것), 사각형([]) → 단계. 입력/출력은 둘 다 사각형([])으로 뭉개져서
// 나가므로(마인드맵에 대응 모양이 없어서) 다시 구분해 낼 방법이 없다 — 사각형으로 들어온다.
// id(있으면)도 같이 돌려준다 — mindmapNodeLine 은 항상 N<note.id> 형식의 id 를 붙여서
// 내보내므로, 재배치(rearrangeNotes)가 다시 파싱된 노드를 "어느 도형이었는지"로 정확히
// 되짚어가려면 이 id 가 살아있어야 한다(괄호 안 라벨만 보고는 알 수 없다). id 가 없는
// 줄(사람이 손으로 쓴, 아이디 없이 텍스트만 있는 마인드맵)은 null 을 돌려주고, 호출자
// (parseMindmapBlock)가 그때만 합성 id를 만든다.
function parseMindmapNodeToken(trimmed) {
  // id 부분도 영문/숫자로 제한하지 않는다(위 tokenizeFlowchartLine 의 readId 와 같은 이유) —
  // 공백과 도형 괄호만 피하면 한글 id 도 그대로 허용해서, "가지2{{육각형 잎}}" 같은 줄에서
  // id="가지2"/라벨="육각형 잎" 로 정확히 갈라지게 한다.
  const m = /^([^\s(){}[\]]+)?\s*(?:\(\(([^)]*)\)\)|\{\{([^}]*)\}\}|\[([^\]]*)\]|\(([^)]*)\))?$/.exec(trimmed);
  if (!m) return { shape: "rect", label: unescapeMermaidBr(trimmed), id: null };
  const [, id, circle, hexagon, square, round] = m;
  if (circle !== undefined) return { shape: "stadium", label: unescapeMermaidBr(circle.trim() || id || trimmed), id: id || null };
  if (hexagon !== undefined) return { shape: "hexagon", label: unescapeMermaidBr(hexagon.trim() || id || trimmed), id: id || null };
  if (square !== undefined) return { shape: "rect", label: unescapeMermaidBr(square.trim() || id || trimmed), id: id || null };
  if (round !== undefined) return { shape: "diamond", label: unescapeMermaidBr(round.trim() || id || trimmed), id: id || null };
  // 괄호 없이 텍스트/id 하나뿐인 줄 — 그 자체가 라벨과 같은 값이라 별도 id 로는 안 쓴다.
  return { shape: "rect", label: unescapeMermaidBr((id || trimmed).trim()), id: null };
}

// 마인드맵 블록 본문을 들여쓰기 기준 트리로 바꾼다. 들여쓰기 스택(indent, id)을 유지하면서,
// 현재 줄보다 들여쓰기가 얕거나 같은 항목을 스택에서 걷어내면 남는 맨 위가 부모다.
function parseMindmapBlock(block) {
  const nodes = new Map(); // 합성 id(m0, m1, ...) -> { shape, label }
  const edges = []; // { from, to }
  const stack = []; // { indent, id }
  const warnings = [];
  let root = null;
  let autoId = 0;

  block.rawLines.forEach((rawLine) => {
    if (!rawLine.trim()) return;
    const indent = rawLine.length - rawLine.trimStart().length;
    const info = parseMindmapNodeToken(rawLine.trim());
    // 실제 id(N<note.id> 등)가 있으면 그대로 쓴다 — rearrangeNotes 가 재파싱된 노드를
    // 원래 도형에 되짚어 연결하는 유일한 방법이다. 없을 때만(사람이 손으로 쓴 마인드맵)
    // 합성 id 를 새로 만든다.
    const id = info.id || `m${autoId++}`;
    nodes.set(id, info);

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();

    if (stack.length === 0) {
      if (root === null) {
        root = id;
      } else {
        // 마인드맵은 중심이 하나여야 하는데 최상위 줄이 또 나왔다 — 텍스트 형태는 최대한
        // 살리기 위해 원래 루트의 자식으로 편입한다(완전히 버리지 않는다).
        edges.push({ from: root, to: id });
        warnings.push(`최상위 항목이 여러 개 있어 "${info.label}"을(를) 루트 하위로 편입했습니다.`);
      }
    } else {
      edges.push({ from: stack[stack.length - 1].id, to: id });
    }
    stack.push({ indent, id });
  });

  return { type: "mindmap", nodes, edges, root, warnings };
}

// 원문 전체를 블록으로 나누고 각각 구조를 파싱한다. 블록이 하나도 안 나오면(= flowchart나
// mindmap 헤더를 하나도 못 찾음) errors 에 담아 호출자가 바로 알 수 있게 한다.
function parseMermaidImportText(text) {
  const rawBlocks = splitMermaidBlocks(text);
  const errors = [];
  if (rawBlocks.length === 0) {
    errors.push('flowchart, graph, mindmap 로 시작하는 블록을 찾지 못했습니다. Mermaid 코드를 그대로 붙여넣어 주세요.');
    return { blocks: [], errors };
  }

  const blocks = rawBlocks
    .map((b) => (b.type === "flowchart" ? parseFlowchartBlock(b) : parseMindmapBlock(b)))
    .filter((b) => {
      if (b.nodes.size === 0) {
        errors.push(`${b.type === "flowchart" ? "flowchart" : "mindmap"} 블록에 도형이 하나도 없어 건너뛰었습니다.`);
        return false;
      }
      return true;
    });

  return { blocks, errors };
}

/* ----- dagre 로 블록별 좌표 계산 ----- */

const MERMAID_IMPORT_NODESEP = 40;
const MERMAID_IMPORT_RANKSEP = 70;

// dagre 방향 문자열로 맞춘다 — Mermaid 의 TD(top-down)는 dagre 에는 없고 TB 와 같다.
function toDagreRankDir(direction) {
  if (direction === "TD") return "TB";
  if (["TB", "LR", "RL", "BT"].includes(direction)) return direction;
  return "TB";
}

// 블록 안의 노드마다, 라벨이 기본 크기(DEFAULT_NOTE_W x DEFAULT_NOTE_H)에 넘치지 않고
// 들어갈 크기를 미리 재둔다 — dagre/방사형 레이아웃이 서로 겹치지 않게 간격을 잡을 때부터
// 이 실제 크기를 알아야(레이아웃 이후에 키우면 다른 도형과 겹칠 수 있다) 하므로 레이아웃보다
// 먼저 계산한다. 너비는 기본적으로 항상 기본값 그대로 유지한다(다이어그램 전체가 들쭉날쭉한
// 너비로 나열되면 어색해서, 일반 도형 목록처럼 통일된 너비 안에서 세로만 늘린다).
//
// sizeOverrideFor(선택, mermaidId -> {w,h} | null): 재배치(rearrange) 전용 — 수동으로
// 리사이즈한(autoSize=false) 도형은 이 "텍스트 기준 이상적 크기" 계산을 건너뛰고 실제
// 크기를 그대로 써야 한다. 안 그러면 레이아웃(spacing)도, 최종 배치(중심점 기준 절반폭
// 이동)도 전부 실제보다 훨씬 작은 크기를 가정하게 되어, 그 도형이 이웃 도형·그룹 영역을
// 침범해 겹치고(재배치 때마다 그 침범분이 다음 재배치의 "이 범위의 중심"에도 그대로
// 반영되어 매번 같은 방향으로 더 밀리는 누적 드리프트까지 생긴다).
function computeBlockNodeSizes(block, sizeOverrideFor) {
  const sizes = new Map();
  block.nodes.forEach((info, id) => {
    const override = sizeOverrideFor && sizeOverrideFor(id);
    if (override) {
      sizes.set(id, override);
      return;
    }
    const h = measureNoteFitHeight(
      info.label,
      info.shape || "rect",
      block.type,
      DEFAULT_FONT_SIZE,
      DEFAULT_TEXT_ALIGN,
      DEFAULT_NOTE_W,
      DEFAULT_NOTE_H
    );
    sizes.set(id, { w: DEFAULT_NOTE_W, h });
  });
  return sizes;
}

// flowchart 전용(계층형). subgraph 를 dagre 의 "compound"(묶음) 노드로 등록해서, 묶인
// 도형들이 레이아웃에서도 서로 가까이 모이게 한다. 결과는 (mermaidId -> {x, y}, dagre
// 기준 노드 "중심" 좌표)로 돌려준다 — mindmap 은 더 이상 이 함수를 쓰지 않는다
// (layoutMindmapRadial 참고, 아래 layoutBlock 이 타입에 따라 갈라 부른다).
function layoutBlockWithDagre(block, sizes) {
  const g = new dagre.graphlib.Graph({ compound: true });
  const rankdir = toDagreRankDir(block.direction);
  g.setGraph({ rankdir, nodesep: MERMAID_IMPORT_NODESEP, ranksep: MERMAID_IMPORT_RANKSEP, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  block.nodes.forEach((info, id) => {
    const size = sizes.get(id);
    g.setNode(id, { width: size.w, height: size.h });
  });
  block.edges.forEach((e) => {
    if (!block.nodes.has(e.from) || !block.nodes.has(e.to) || e.from === e.to) return;
    g.setEdge(e.from, e.to);
  });

  block.subgraphs.forEach((sg, idx) => {
    const clusterId = `__cluster${idx}`;
    g.setNode(clusterId, {});
    sg.nodeIds.forEach((id) => {
      if (block.nodes.has(id)) g.setParent(id, clusterId);
    });
  });

  dagre.layout(g);

  const positions = new Map();
  block.nodes.forEach((info, id) => {
    const n = g.node(id);
    positions.set(id, { x: n.x, y: n.y });
  });
  return positions;
}

/* ===== mindmap 전용: 방사형(radial) 레이아웃 =====
 * 실제 Mermaid 공식 렌더러는 mindmap 에 dagre(계층형)를 안 쓰고 별도의 방사형 엔진을
 * 쓴다 — 루트를 중심에 놓고, 자식들을 중심 둘레에 균등한 각도로, 손자는 그 자식을
 * 중심으로 한 바깥 원에 놓는 식. d3-hierarchy(CDN, window.d3) 의 d3.tree() 를 각도·
 * 반지름 좌표계로 쓰면 이 방사형 배치를 그대로 얻는다 — 각 형제 사이의 각도 간격을
 * 안 겹치게 계산해주는 부분까지 라이브러리가 대신해준다(직접 각도 나누기 계산을
 * 새로 짜지 않는다). */

const MINDMAP_RADIAL_RING_MARGIN = 60; // 반지름 방향으로 링(깊이) 사이에 추가로 두는 여백

// { id, children } 형태의 중첩 객체로 바꾼다 — d3.hierarchy() 가 기대하는 입력 모양.
function buildMindmapTreeNode(id, childrenOf) {
  return { id, children: (childrenOf.get(id) || []).map((childId) => buildMindmapTreeNode(childId, childrenOf)) };
}

function layoutMindmapRadial(block, sizes) {
  const childrenOf = new Map();
  block.nodes.forEach((info, id) => childrenOf.set(id, []));
  block.edges.forEach((e) => {
    if (childrenOf.has(e.from) && block.nodes.has(e.to)) childrenOf.get(e.from).push(e.to);
  });

  const root = d3.hierarchy(buildMindmapTreeNode(block.root, childrenOf));

  // 링(깊이) 사이 간격 — 그 블록에서 가장 큰 도형(자동 높이조정으로 세로가 길어진
  // 경우 포함)을 기준으로 잡아서, 어떤 깊이에서도 안쪽/바깥쪽 링 도형끼리 안 겹치게 한다.
  let maxBoxDim = Math.max(DEFAULT_NOTE_W, DEFAULT_NOTE_H);
  sizes.forEach((s) => { maxBoxDim = Math.max(maxBoxDim, s.w, s.h); });
  const ringGap = maxBoxDim + MINDMAP_RADIAL_RING_MARGIN;
  const maxRadius = Math.max(1, root.height) * ringGap;

  const treeLayout = d3
    .tree()
    .size([2 * Math.PI, maxRadius])
    // d3 공식 방사형 트리 예제의 관용적인 분리 함수 — 깊이로 나눠주는 것이 바깥 링일수록
    // 둘레가 길어지는 만큼 상대 간격을 좁혀도(반지름×각도=호 길이는 유지되게) 되는 것과
    // 맞아떨어진다. 형제끼리는 1, 사촌끼리는 그보다 넓게(2) 띄운다.
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(a.depth, 1));
  treeLayout(root);

  const positions = new Map();
  root.each((node) => {
    const angle = node.x - Math.PI / 2; // 0라디안이 12시 방향이 되도록(보기 좋은 기준)
    const r = node.y;
    positions.set(node.data.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
  });
  return positions;
}

// flowchart 는 dagre(계층형), mindmap 은 방사형 — 블록 타입에 따라 알맞은 레이아웃
// 엔진으로 갈라 부른다. 가져오기/재배치 둘 다 이 함수 하나를 거친다.
function layoutBlock(block, sizes) {
  return block.type === "mindmap" ? layoutMindmapRadial(block, sizes) : layoutBlockWithDagre(block, sizes);
}

// 블록 하나의 노드 좌표들로부터 그 블록이 차지하는 월드 경계 상자를 구한다. 노드마다
// 크기가 다를 수 있어(텍스트 자동 맞춤) sizes 에서 각자의 실제 크기를 찾아 반영한다.
function boundsOfPositions(positions, sizes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach(({ x, y }, id) => {
    const size = sizes.get(id);
    minX = Math.min(minX, x - size.w / 2);
    maxX = Math.max(maxX, x + size.w / 2);
    minY = Math.min(minY, y - size.h / 2);
    maxY = Math.max(maxY, y + size.h / 2);
  });
  return { minX, minY, maxX, maxY };
}

const MERMAID_IMPORT_BLOCK_GAP = 100;
const MERMAID_IMPORT_ROW_MAX_WIDTH = 1600;
const MERMAID_IMPORT_EXISTING_GAP = 140; // 기존 캔버스 내용과 새로 가져온 내용 사이 간격

// 현재 페이지에 이미 있는 모든 도형을 감싸는 경계 상자. 하나도 없으면 null —
// 가져오기 배치가 "기존 내용이 아예 없을 때"와 "있을 때"를 구분하는 기준이 된다.
function existingNotesBounds() {
  if (notes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  notes.forEach((n) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  });
  return { minX, minY, maxX, maxY };
}

// 블록마다 이미 계산된(dagre) 상대 좌표들을, 서로 겹치지 않도록 줄줄이 늘어놓는다(왼쪽→
// 오른쪽, 폭이 넘치면 다음 줄로) — "최종적으로 어디에 놓을지"는 이 함수의 책임이 아니다.
// 호출자가 blockOffsets(블록별 상대 오프셋)와 overallBounds(전체 묶음의 (0,0) 기준
// 경계 상자)를 받아서 마지막 한 번의 평행이동만 더 하면 된다 — placeBlocksOnCanvas
// (기존 도형과 안 겹치는 자리)와 placeBlocksAtCenter(재배치: 특정 중심점에 맞추기)가
// 이 패킹 로직 하나를 공유한다.
function packBlocksLocally(blocks, blockPositions, blockSizes) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const blockOffsets = [];

  blocks.forEach((block, idx) => {
    const bounds = boundsOfPositions(blockPositions[idx], blockSizes[idx]);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    if (cursorX > 0 && cursorX + width > MERMAID_IMPORT_ROW_MAX_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + MERMAID_IMPORT_BLOCK_GAP;
      rowHeight = 0;
    }

    // dagre 좌표의 bounds.min* 을 이 줄의 cursorX/Y 에 맞춰 평행이동하는 오프셋.
    blockOffsets.push({ x: cursorX - bounds.minX, y: cursorY - bounds.minY });

    cursorX += width + MERMAID_IMPORT_BLOCK_GAP;
    rowHeight = Math.max(rowHeight, height);
  });

  let overallMinX = Infinity, overallMinY = Infinity, overallMaxX = -Infinity, overallMaxY = -Infinity;
  blocks.forEach((block, idx) => {
    const bounds = boundsOfPositions(blockPositions[idx], blockSizes[idx]);
    const off = blockOffsets[idx];
    overallMinX = Math.min(overallMinX, bounds.minX + off.x);
    overallMinY = Math.min(overallMinY, bounds.minY + off.y);
    overallMaxX = Math.max(overallMaxX, bounds.maxX + off.x);
    overallMaxY = Math.max(overallMaxY, bounds.maxY + off.y);
  });

  return { blockOffsets, overallBounds: { minX: overallMinX, minY: overallMinY, maxX: overallMaxX, maxY: overallMaxY } };
}

// (Mermaid 붙여넣기 가져오기용) 패킹한 전체 묶음을, 기존 캔버스 내용과 겹치지 않는
// 자리로 한 번에 옮긴다. 화면에 실제로 보이게 하는 건(뷰를 그 자리로 옮기는 것) 이
// 함수의 책임이 아니다 — importMermaidText 가 다 만든 뒤에 화면을 옮긴다(panToNewNotes).
function placeBlocksOnCanvas(blocks, blockPositions, blockSizes) {
  const { blockOffsets, overallBounds } = packBlocksLocally(blocks, blockPositions, blockSizes);

  // 기존 내용이 하나도 없으면 원점 근처(0,0)에 그대로 둔다 — importMermaidText 가
  // 만든 뒤에 화면을 그 자리로 옮겨서 보여주므로 "화면 밖 멀리"가 되진 않는다.
  const existing = existingNotesBounds();
  let finalOffsetX = 0;
  let finalOffsetY = 0;
  if (existing) {
    const existingW = existing.maxX - existing.minX;
    const existingH = existing.maxY - existing.minY;
    if (existingW >= existingH) {
      // 가로로 넓게 퍼진 캔버스면 아래쪽 빈 곳에 붙인다.
      finalOffsetX = existing.minX - overallBounds.minX;
      finalOffsetY = existing.maxY + MERMAID_IMPORT_EXISTING_GAP - overallBounds.minY;
    } else {
      // 세로로 긴 캔버스면 오른쪽 빈 곳에 붙인다.
      finalOffsetX = existing.maxX + MERMAID_IMPORT_EXISTING_GAP - overallBounds.minX;
      finalOffsetY = existing.minY - overallBounds.minY;
    }
  }

  return blockOffsets.map((off) => ({ x: off.x + finalOffsetX, y: off.y + finalOffsetY }));
}

// (재배치용) 패킹한 전체 묶음의 중심이 주어진 월드 좌표(centerX, centerY)에 오도록
// 옮긴다 — "정리는 되지만 캔버스 안에서 갑자기 멀리 옮겨가진 않도록", 재배치 전 그
// 범위가 있던 자리의 중심을 그대로 다시 중심으로 쓴다(rearrangeNotes 참고).
function placeBlocksAtCenter(blocks, blockPositions, blockSizes, centerX, centerY) {
  const { blockOffsets, overallBounds } = packBlocksLocally(blocks, blockPositions, blockSizes);
  const contentCenterX = (overallBounds.minX + overallBounds.maxX) / 2;
  const contentCenterY = (overallBounds.minY + overallBounds.maxY) / 2;
  const dx = centerX - contentCenterX;
  const dy = centerY - contentCenterY;
  return blockOffsets.map((off) => ({ x: off.x + dx, y: off.y + dy }));
}

/* ----- 파싱+배치 결과를 실제 캔버스 상태로 반영 ----- */

// 파싱된 블록들로부터 실제 notes/arrows/groups 를 만든다. 실패해도 기존 상태가 절대
// 오염되지 않도록, notes/arrows/groups·id 카운터를 전부 로컬 변수에 먼저 쌓았다가
// 끝에서 한 번에(all-or-nothing) 실제 전역 상태에 반영하고 commitChange() 한 번으로
// 실행취소 한 단계에 묶는다.
function importMermaidText(text) {
  const { blocks, errors } = parseMermaidImportText(text);
  if (blocks.length === 0) {
    return { ok: false, errors, warnings: [] };
  }

  const warnings = [...errors];
  blocks.forEach((b) => {
    if (b.type === "flowchart" && b.skippedLines && b.skippedLines.length > 0) {
      warnings.push(`flowchart 블록에서 알아볼 수 없는 줄 ${b.skippedLines.length}개를 건너뛰었습니다.`);
    }
    if (b.type === "mindmap" && b.warnings.length > 0) {
      warnings.push(...b.warnings);
    }
  });

  const blockSizes = blocks.map(computeBlockNodeSizes);
  const blockPositions = blocks.map((block, idx) => layoutBlock(block, blockSizes[idx]));
  const blockOffsets = placeBlocksOnCanvas(blocks, blockPositions, blockSizes);

  let localNextId = nextId;
  let localNextArrowId = nextArrowId;
  let localNextGroupId = nextGroupId;
  const newNotes = [];
  const newArrows = [];
  const newGroups = [];
  const idMap = new Map(); // `${blockIdx}:${mermaidId}` -> 새 note id

  blocks.forEach((block, idx) => {
    const positions = blockPositions[idx];
    const offset = blockOffsets[idx];
    const sizes = blockSizes[idx];
    block.nodes.forEach((info, mermaidId) => {
      const center = positions.get(mermaidId);
      const size = sizes.get(mermaidId);
      const note = {
        id: localNextId++,
        x: center.x + offset.x - size.w / 2,
        y: center.y + offset.y - size.h / 2,
        w: size.w,
        h: size.h,
        text: info.label || "",
        shape: info.shape || "rect",
        bg: null,
        fontSize: DEFAULT_FONT_SIZE,
        textAlign: DEFAULT_TEXT_ALIGN,
        borderWidth: DEFAULT_BORDER_WIDTH,
        diagramType: block.type,
        autoSize: true,
      };
      newNotes.push(note);
      idMap.set(`${idx}:${mermaidId}`, note.id);
    });
  });

  blocks.forEach((block, idx) => {
    block.edges.forEach((e) => {
      const fromId = idMap.get(`${idx}:${e.from}`);
      const toId = idMap.get(`${idx}:${e.to}`);
      if (fromId == null || toId == null || fromId === toId) return;
      const arrow = { id: localNextArrowId++, fromId, toId };
      if (e.label) arrow.label = e.label;
      newArrows.push(arrow);
    });
  });

  blocks.forEach((block, idx) => {
    if (block.type === "flowchart") {
      // 가져온 도형은 기존 캔버스 내용과 뒤섞이지 않도록 반드시 어떤 그룹엔가 속해야
      // 한다 — subgraph 는 원래대로 각자 그룹이 되고, subgraph 밖의 낱개 도형들은
      // (그룹 중첩을 지원하지 않는 이 앱의 구조상 subgraph 그룹 안으로 합칠 수 없으므로)
      // 이 블록 하나를 대표하는 새 그룹으로 따로 묶는다 — 블록 안에 뭐가 있든 결과적으로
      // 전부 어떤 그룹의 멤버가 된다.
      const groupedIds = new Set();
      block.subgraphs.forEach((sg) => {
        const noteIds = sg.nodeIds.map((mid) => idMap.get(`${idx}:${mid}`)).filter((id) => id != null);
        if (noteIds.length === 0) return;
        const gid = localNextGroupId++;
        newGroups.push({ id: `g${gid}`, name: sg.name || `그룹 ${gid}`, noteIds, locked: false });
        noteIds.forEach((id) => groupedIds.add(id));
      });

      const looseIds = [...block.nodes.keys()]
        .map((mid) => idMap.get(`${idx}:${mid}`))
        .filter((id) => id != null && !groupedIds.has(id));
      if (looseIds.length > 0) {
        const gid = localNextGroupId++;
        newGroups.push({ id: `g${gid}`, name: `가져온 도형 ${gid}`, noteIds: looseIds, locked: false });
      }
    } else {
      const noteIds = [...block.nodes.keys()].map((mid) => idMap.get(`${idx}:${mid}`)).filter((id) => id != null);
      if (noteIds.length === 0) return;
      const gid = localNextGroupId++;
      const rootNoteId = idMap.get(`${idx}:${block.root}`);
      const rootNote = newNotes.find((n) => n.id === rootNoteId);
      // 그룹 이름표는 한 줄짜리 배지라, 루트 텍스트에 (<br/> 를 되돌린) 줄바꿈이
      // 들어있으면 공백으로 합쳐서 쓴다 — 도형 본문과 달리 이름표는 여러 줄을 감당 못 한다.
      const rootLabel = rootNote ? rootNote.text.trim().replace(/\s*\n\s*/g, " ") : "";
      const name = rootLabel || `마인드맵 ${gid}`;
      newGroups.push({ id: `g${gid}`, name, noteIds, locked: false });
    }
  });

  // ---- 여기까지 전부 로컬이었다. 이제 진짜 상태에 한 번에 반영한다. ----
  nextId = localNextId;
  nextArrowId = localNextArrowId;
  nextGroupId = localNextGroupId;
  newNotes.forEach((note) => {
    notes.push(note);
    renderNote(note);
  });
  newArrows.forEach((arrow) => {
    arrows.push(arrow);
    renderArrow(arrow);
  });
  newGroups.forEach((group) => groups.push(group));

  renderGroups();
  updateAllArrowGeometry();
  commitChange();
  panToNewNotes(newNotes); // 기존 내용 옆/아래에 배치했을 수 있으니, 화면을 그 자리로 옮겨서 바로 보여준다

  return {
    ok: true,
    errors: [],
    warnings,
    counts: { notes: newNotes.length, arrows: newArrows.length, groups: newGroups.length },
  };
}

// 방금 가져온 도형들의 경계 상자 중심이 화면 한가운데 오도록 뷰를 옮긴다(줌은 그대로,
// panToNote 와 같은 방식) — 기존 캔버스 내용과 안 겹치는 자리에 배치하다 보니 지금
// 보이는 화면 밖일 수 있어서, 만든 직후 그 쪽으로 화면을 옮겨줘야 사용자가 바로 본다.
function panToNewNotes(newNotes) {
  if (newNotes.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  newNotes.forEach((n) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  });
  const canvasRect = canvas.getBoundingClientRect();
  const centerWorld = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  view.x = canvasRect.width / 2 - centerWorld.x * view.scale;
  view.y = canvasRect.height / 2 - centerWorld.y * view.scale;
  applyTransform();
  save();
}

/* ===== 재배치: 캔버스/선택 범위를 Mermaid 배치 규칙대로 다시 정렬 =====
 * "내보냈다가 곧바로 다시 가져오기"와 원리가 같지만, 도형을 지우고 새로 만드는 대신
 * (그러면 배경색/자동크기 상태 같은 Mermaid 에 안 담기는 정보를 잃는다) 다시 계산된
 * 좌표를 원래 그 도형의 x,y 에만 덮어쓴다 — 그래서 재배치는 순수하게 위치만 바꾼다.
 * generateMermaid() 는 전역 notes/arrows/groups 를 읽는 순수 함수라, 범위만 담은
 * Export 결과를 얻으려고 계산하는 동안만 전역을 그 범위로 잠깐 바꿔치기한다(동기
 * 함수라 그 사이에 다른 코드가 끼어들 일이 없어 안전하다). */

// 재배치 대상 id 목록 — 선택이 없으면 페이지 전체, 있으면 딱 선택된 것만이다.
// (예전엔 선택된 도형이 속한 그룹 전체로 자동 확장했는데, 큰 그룹의 일부만 골라
// 선택해도 그룹 전체가 끌려나와 "선택 범위 밖 도형까지 다 뽑힌다"는 문제가 있어서
// 뺐다 — generateMermaid() 는 스코프에 없는 멤버를 subgraph 에서 알아서 빼고
// 돌려주므로, 그룹을 억지로 통째로 넣지 않아도 남은 부분은 별 문제 없이 처리된다.)
function rearrangeTargetNoteIds() {
  if (selectedIds.size === 0) return notes.map((n) => n.id);
  return [...selectedIds];
}

function rearrangeNotes(targetNoteIds) {
  const targetSet = new Set(targetNoteIds);
  const scopedNotes = notes.filter((n) => targetSet.has(n.id));
  if (scopedNotes.length === 0) {
    return { ok: false, warnings: ["재배치할 도형이 없습니다."] };
  }
  const scopedArrows = arrows.filter((a) => targetSet.has(a.fromId) && targetSet.has(a.toId));
  const scopedGroups = groups.filter((g) => g.noteIds.some((id) => targetSet.has(id)));

  const realNotes = notes;
  const realArrows = arrows;
  const realGroups = groups;
  let mermaid;
  try {
    notes = scopedNotes;
    arrows = scopedArrows;
    groups = scopedGroups;
    mermaid = generateMermaid();
  } finally {
    notes = realNotes;
    arrows = realArrows;
    groups = realGroups;
  }

  const combinedText = mermaid.blocks.map((b) => b.text).join("\n\n");
  const { blocks, errors } = parseMermaidImportText(combinedText);
  const warnings = [...mermaid.warnings, ...errors];
  if (blocks.length === 0) {
    return { ok: false, warnings };
  }

  // 재배치 전 이 범위가 있던 자리의 중심(월드 좌표) — 정리는 하되 캔버스 안에서
  // 갑자기 멀리 옮겨가진 않도록, 새 레이아웃도 그 언저리를 중심으로 잡는다.
  let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
  scopedNotes.forEach((n) => {
    ax0 = Math.min(ax0, n.x);
    ay0 = Math.min(ay0, n.y);
    ax1 = Math.max(ax1, n.x + n.w);
    ay1 = Math.max(ay1, n.y + n.h);
  });
  const anchorCenter = { x: (ax0 + ax1) / 2, y: (ay0 + ay1) / 2 };

  // 수동으로 리사이즈한 도형(autoSize=false)은 실제 현재 크기를 그대로 레이아웃에
  // 반영한다 — 텍스트 기준 "이상적인" 작은 크기로 간격을 잡으면 실제로는 그보다 훨씬
  // 크게 그려지는 도형이 이웃 도형·그룹과 겹치게 된다.
  const sizeOverrideFor = (mermaidId) => {
    const m = /^N(\d+)$/.exec(mermaidId);
    if (!m) return null;
    const note = getNote(Number(m[1]));
    if (!note || note.autoSize !== false) return null;
    return { w: note.w, h: note.h };
  };

  const blockSizes = blocks.map((block) => computeBlockNodeSizes(block, sizeOverrideFor));
  const blockPositions = blocks.map((block, idx) => layoutBlock(block, blockSizes[idx]));
  const blockOffsets = placeBlocksAtCenter(blocks, blockPositions, blockSizes, anchorCenter.x, anchorCenter.y);

  // Export 과정에서 빠진 도형(타입 미지정, 그룹 없는 마인드맵 도형 등)은 재배치
  // 텍스트에도 없으므로 아래 루프에서 아예 안 건드려진다 — 원래 자리에 그대로 남는다.
  let movedCount = 0;
  const movedNotes = [];
  blocks.forEach((block, idx) => {
    const positions = blockPositions[idx];
    const offset = blockOffsets[idx];
    const sizes = blockSizes[idx];
    block.nodes.forEach((info, mermaidId) => {
      const m = /^N(\d+)$/.exec(mermaidId);
      if (!m) return;
      const note = getNote(Number(m[1]));
      if (!note) return;
      const center = positions.get(mermaidId);
      const size = sizes.get(mermaidId);
      note.x = center.x + offset.x - size.w / 2;
      note.y = center.y + offset.y - size.h / 2;
      // w/h 는 절대 안 건드린다 — autoSize 도형은 이미 텍스트에 맞는 크기이고,
      // 수동 리사이즈한 도형의 크기는 그대로 존중돼야 하기 때문이다.
      const el = noteEl(note.id);
      // 도형은 다시 파싱된 값으로 맞춰준다 — flowchart 는 6종 전부 문법이 1:1 왕복이라
      // 이 대입이 항상 no-op(같은 값)이지만, 마인드맵은 대응 토큰이 없는 도형(입력/출력)
      // 이 사각형으로 대체된 채 나갔다가 다시 그 모습으로 들어오므로, 여기서 실제
      // note.shape 에도 반영해야 "내보내기 경고에서만 대체되고 화면은 그대로"인
      // 상태가 안 생긴다(요청: 실제로 표시되는 도형에도 대체가 적용되게).
      if (info.shape && info.shape !== note.shape) {
        note.shape = info.shape;
        if (el) el.dataset.shape = note.shape;
        if (note.autoSize !== false) syncNoteHeightToText(note); // 도형이 바뀌면 인셋 비율도 달라지니 다시 맞춘다
      }
      if (el) {
        el.style.left = `${note.x}px`;
        el.style.top = `${note.y}px`;
      }
      movedNotes.push(note);
      movedCount++;
    });
  });

  renderGroups();
  updateAllArrowGeometry();
  updateHandles();
  commitChange();
  panToNewNotes(movedNotes);

  return { ok: true, warnings, movedCount };
}

rearrangeBtn.addEventListener("click", () => {
  const targetIds = rearrangeTargetNoteIds();
  if (targetIds.length === 0) {
    alert("재배치할 도형이 없습니다.");
    return;
  }
  const scopeLabel = selectedIds.size > 0 ? `선택된 ${targetIds.length}개` : `캔버스 전체 ${targetIds.length}개`;
  if (!confirm(`${scopeLabel} 도형을 자동 배치하시겠습니까?`)) return;

  const result = rearrangeNotes(targetIds);
  if (!result.ok) {
    alert(result.warnings.join("\n") || "재배치할 수 있는 도형이 없습니다.");
    return;
  }
  if (result.warnings.length > 0) {
    alert(`일부 도형은 제외되고 나머지만 재배치했습니다.\n\n${result.warnings.join("\n")}`);
  }
});

/* ----- Mermaid 가져오기 팝업 UI ----- */

function openMermaidImportPopup() {
  mermaidImportWarningsEl.hidden = true;
  mermaidImportWarningsEl.innerHTML = "";
  mermaidImportPopup.hidden = false;
  mermaidImportTextEl.focus();
}

function closeMermaidImportPopup() {
  mermaidImportPopup.hidden = true;
}

function showMermaidImportMessages(messages) {
  if (messages.length === 0) {
    mermaidImportWarningsEl.hidden = true;
    mermaidImportWarningsEl.innerHTML = "";
    return;
  }
  mermaidImportWarningsEl.hidden = false;
  mermaidImportWarningsEl.innerHTML = "";
  const list = document.createElement("ul");
  messages.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  });
  mermaidImportWarningsEl.appendChild(list);
}

mermaidImportRunBtn.addEventListener("click", () => {
  const text = mermaidImportTextEl.value;
  if (!text.trim()) {
    showMermaidImportMessages(["붙여넣은 텍스트가 없습니다."]);
    return;
  }

  let result;
  try {
    result = importMermaidText(text);
  } catch (err) {
    showMermaidImportMessages([`가져오는 중 문제가 발생했습니다: ${err.message || err}`]);
    return;
  }

  if (!result.ok) {
    showMermaidImportMessages(result.errors);
    return;
  }

  showMermaidImportMessages(result.warnings);
  const { notes: n, arrows: a, groups: g } = result.counts;
  alert(`가져오기 완료: 도형 ${n}개, 화살표 ${a}개, 그룹 ${g}개`);
  mermaidImportTextEl.value = "";
  // 건너뛴 게 있으면(경고 있음) 팝업을 바로 닫지 않고 남겨서 무엇이 빠졌는지 읽을 시간을 준다.
  if (result.warnings.length === 0) closeMermaidImportPopup();
});

mermaidImportBtn.addEventListener("click", openMermaidImportPopup);
mermaidImportCloseBtn.addEventListener("click", closeMermaidImportPopup);
document.addEventListener("click", (e) => {
  if (mermaidImportPopup.hidden) return;
  if (
    mermaidImportPopup.contains(e.target) ||
    e.target === mermaidImportBtn ||
    mermaidImportBtn.contains(e.target)
  ) {
    return;
  }
  closeMermaidImportPopup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !mermaidImportPopup.hidden) closeMermaidImportPopup();
});

/* ===== 캔버스(현재 페이지) 메모 검색 (Ctrl+F) ===== */

let canvasSearchMatches = []; // 현재 검색어와 일치하는 메모 id 목록 (notes 순서 그대로)
let canvasSearchIndex = -1; // canvasSearchMatches 안에서 지금 보고 있는 위치

// 메모의 중심이 캔버스 뷰포트 한가운데 오도록 화면을 이동한다 (줌 배율은 그대로 둔다).
function panToNote(note) {
  const canvasRect = canvas.getBoundingClientRect();
  const centerWorld = { x: note.x + note.w / 2, y: note.y + note.h / 2 };
  view.x = canvasRect.width / 2 - centerWorld.x * view.scale;
  view.y = canvasRect.height / 2 - centerWorld.y * view.scale;
  applyTransform();
  save();
}

function clearCanvasSearchHighlights() {
  world.querySelectorAll(".note.search-match, .note.search-current").forEach((el) => {
    el.classList.remove("search-match", "search-current");
  });
}

function updateCanvasSearchCount() {
  if (canvasSearchMatches.length === 0) {
    canvasSearchCountEl.textContent = canvasSearchInput.value ? "0/0" : "";
  } else {
    canvasSearchCountEl.textContent = `${canvasSearchIndex + 1}/${canvasSearchMatches.length}`;
  }
}

// 검색어와 일치하는 메모를 다시 찾아 전부 하이라이트하고, 그 중 첫 번째로 이동한다.
function performCanvasSearch(query) {
  clearCanvasSearchHighlights();
  const q = query.trim().toLowerCase();
  canvasSearchMatches = q ? notes.filter((n) => (n.text || "").toLowerCase().includes(q)).map((n) => n.id) : [];
  canvasSearchIndex = -1;

  canvasSearchMatches.forEach((id) => {
    const el = noteEl(id);
    if (el) el.classList.add("search-match");
  });

  if (canvasSearchMatches.length > 0) {
    goToSearchMatch(0);
  } else {
    updateCanvasSearchCount();
  }
}

// index 번째 일치 결과를 "현재 결과"로 표시하고 그 메모로 화면을 이동한다.
// index 는 범위를 벗어나도(음수 포함) 순환하도록 나머지 연산으로 보정한다.
function goToSearchMatch(index) {
  if (canvasSearchMatches.length === 0) return;
  if (canvasSearchIndex >= 0) {
    const prevEl = noteEl(canvasSearchMatches[canvasSearchIndex]);
    if (prevEl) prevEl.classList.remove("search-current");
  }
  canvasSearchIndex = ((index % canvasSearchMatches.length) + canvasSearchMatches.length) % canvasSearchMatches.length;

  const id = canvasSearchMatches[canvasSearchIndex];
  const el = noteEl(id);
  if (el) el.classList.add("search-current");
  const note = getNote(id);
  if (note) panToNote(note);
  updateCanvasSearchCount();
}

function nextSearchMatch() {
  goToSearchMatch(canvasSearchIndex + 1);
}

function prevSearchMatch() {
  goToSearchMatch(canvasSearchIndex - 1);
}

function openCanvasSearch() {
  canvasSearchEl.hidden = false;
  canvasSearchInput.focus();
  canvasSearchInput.select();
  if (canvasSearchInput.value) performCanvasSearch(canvasSearchInput.value);
}

function closeCanvasSearch() {
  canvasSearchEl.hidden = true;
  clearCanvasSearchHighlights();
  canvasSearchMatches = [];
  canvasSearchIndex = -1;
  canvasSearchInput.value = "";
  canvasSearchCountEl.textContent = "";
}

// 브라우저 기본 Ctrl+F(페이지 내 찾기)를 막고 대신 이 캔버스 검색창을 연다.
// isContentEditable/INPUT 여부와 상관없이 항상 가로챈다 — 그래야 메모 편집 중이거나
// 사이드바 입력칸에 포커스가 있어도 브라우저 기본 찾기가 뜨지 않는다.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openCanvasSearch();
  }
});

canvasSearchInput.addEventListener("input", () => performCanvasSearch(canvasSearchInput.value));
canvasSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) prevSearchMatch();
    else nextSearchMatch();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeCanvasSearch();
  }
  e.stopPropagation(); // Delete/1·2·3/Ctrl+Z 등 다른 전역 단축키로 새지 않게
});
canvasSearchCloseBtn.addEventListener("click", closeCanvasSearch);
canvasSearchBtn.addEventListener("click", openCanvasSearch);

/* ===== 조작법 안내 팝업 ("?" 버튼) =====
 * 화면 전체를 덮는 오버레이가 없으므로(요청에 따라 제거), "바깥 클릭으로 닫기"는
 * document 전체의 클릭을 감시해서 그 클릭이 팝업 안도, 여는 버튼도 아닐 때만 닫는
 * 방식으로 직접 구현한다. */

function openHelp() {
  helpPopup.hidden = false;
}

function closeHelp() {
  helpPopup.hidden = true;
}

helpBtn.addEventListener("click", openHelp);
helpCloseBtn.addEventListener("click", closeHelp);
document.addEventListener("click", (e) => {
  if (helpPopup.hidden) return;
  // 여는 버튼 자신의 클릭까지 이 리스너가 즉시 "바깥 클릭"으로 오인해 닫아버리지
  // 않도록 helpBtn 클릭은 무시한다(버튼 click 핸들러가 먼저 열고, 같은 클릭이
  // document 까지 버블링되어 이 리스너에도 도달하기 때문).
  if (helpPopup.contains(e.target) || e.target === helpBtn || helpBtn.contains(e.target)) return;
  closeHelp();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !helpPopup.hidden) closeHelp();
});

/* ===== 시작 ===== */

initResizeHandles();
setNextShape(nextShape); // 라벨/퀵메뉴 표시를 초기 상태와 맞춘다
setNextDiagramType(nextDiagramType); // 툴바의 다이어그램 타입 표시도 초기 상태와 맞춘다

load(); // tree / pagesData / activePageId 를 채운다 (필요하면 v1 데이터 마이그레이션도 함께)
loadPageIntoGlobals(pagesData[activePageId] || createEmptyPageData());

// 히스토리 시작점: 지금 이 상태로 되돌아올 수 있게 첫 칸을 기록해둔다.
history = [makeSnapshot()];
historyIndex = 0;

renderSidebar();
updateBackupInfoDisplay();
updateStylePanel();
save();
