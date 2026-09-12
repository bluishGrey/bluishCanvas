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
const SVG_NS = "http://www.w3.org/2000/svg";

const STORAGE_KEY = "bluishCanvas.v2";
const LEGACY_STORAGE_KEY = "bluishCanvas.v1"; // 페이지/폴더 기능 이전의 단일 캔버스 저장 형식
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

let arrows = []; // { id, fromId, toId, label? }
let nextArrowId = 1;
let selectedArrowIds = new Set();
let arrowDraft = null; // 화살표 연결 모드 중일 때만 { fromId }
let editingArrowLabelId = null; // 화살표 라벨을 입력 중인 화살표 id (한 번에 하나만)

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

// 마지막 내보내기/가져오기 "한 건"만 기억한다 (전체 기록 목록이 아니다).
// localStorage 에도 저장되고, 내보낸 JSON 파일 안에도 같이 담겨서 다른 컴퓨터로 옮겨가도
// 이어진다 — export 데이터 자체가 "이 데이터가 마지막으로 언제 내보내졌는지"를 알고 있는 셈.
let backupInfo = { lastExport: null, lastImport: null }; // { at: ISOString, filename } | null

function createEmptyPageData() {
  return { view: { x: 0, y: 0, scale: 1 }, notes: [], arrows: [], nextId: 1, nextArrowId: 1 };
}

function backfillNoteDefaults(noteList) {
  noteList.forEach((n) => {
    if (typeof n.w !== "number") n.w = DEFAULT_NOTE_W;
    if (typeof n.h !== "number") n.h = DEFAULT_NOTE_H;
    if (!n.shape) n.shape = DEFAULT_SHAPE;
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
  return {
    view: { ...view },
    notes: cloneNotes(),
    arrows: cloneArrows(),
    nextId,
    nextArrowId,
  };
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

/* ===== 페이지 전환 =====
 * 지금 열려 있는 페이지의 모든 실시간 상태(view/notes/arrows/선택/화살표 초안/퀵메뉴 등)를
 * 통째로 다른 페이지 것으로 바꿔치기한다. undo/redo 의 restoreSnapshot 과 원리가 같다
 * (DOM 비우고 다시 그리기) — 다만 view 도 같이 바꾸고, 히스토리는 페이지별로 따로 보관한다. */

function loadPageIntoGlobals(pageData) {
  world.querySelectorAll(".note").forEach((el) => el.remove());
  arrowsLayerEl.querySelectorAll(".arrow").forEach((el) => el.remove());

  notes = (pageData.notes || []).map((n) => ({ ...n }));
  arrows = (pageData.arrows || []).map((a) => ({ ...a }));
  Object.assign(view, pageData.view || { x: 0, y: 0, scale: 1 });
  nextId = pageData.nextId || 1;
  nextArrowId = pageData.nextArrowId || 1;
  selectedIds = new Set();
  selectedArrowIds = new Set();
  cancelArrowDraft();
  closeQuickMenu();

  notes.forEach(renderNote);
  arrows.forEach(renderArrow);
  applyTransform(); // 내부에서 updateHandles 도 같이 갱신된다
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
    history = [{ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId }];
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
  switchToPage(id); // 안에서 renderSidebar()/save() 까지 처리된다
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
      history = [{ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId }];
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

function renderTreeNodes(nodes, container, depth) {
  nodes.forEach((node) => {
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
      caret.textContent = node.expanded ? "▾" : "▸";
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

    if (node.type === "folder" && node.expanded) {
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
        history = [{ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId }];
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

  updateArrowLabelPosition(arrow, g, p1, p2);
}

function updateAllArrowGeometry() {
  arrows.forEach(updateArrowGeometry);
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

  // 배경 사각형은 실제 렌더된 글자 크기(getBBox)에 여백을 더해서 맞춘다.
  const box = text.getBBox();
  const padX = 4;
  const padY = 2;
  bg.setAttribute("x", box.x - padX);
  bg.setAttribute("y", box.y - padY);
  bg.setAttribute("width", box.width + padX * 2);
  bg.setAttribute("height", box.height + padY * 2);
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
  labelBg.setAttribute("rx", "3");
  labelBg.setAttribute("hidden", "");

  const labelText = document.createElementNS(SVG_NS, "text");
  labelText.setAttribute("class", "arrow-label-text");
  labelText.setAttribute("text-anchor", "middle");
  labelText.setAttribute("dominant-baseline", "middle");
  labelText.setAttribute("hidden", "");

  g.appendChild(hit);
  g.appendChild(visible);
  g.appendChild(labelBg);
  g.appendChild(labelText);
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

load(); // tree / pagesData / activePageId 를 채운다 (필요하면 v1 데이터 마이그레이션도 함께)
loadPageIntoGlobals(pagesData[activePageId] || createEmptyPageData());

// 히스토리 시작점: 지금 이 상태로 되돌아올 수 있게 첫 칸을 기록해둔다.
history = [{ notes: cloneNotes(), arrows: cloneArrows(), nextId, nextArrowId }];
historyIndex = 0;

renderSidebar();
updateBackupInfoDisplay();
save();
