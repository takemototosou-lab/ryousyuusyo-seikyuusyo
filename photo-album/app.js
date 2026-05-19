const STORAGE_KEY = "kouji-photo-album:auto";
const DEFAULT_ITEM_COUNT = 2;

const state = {
  items: [],
};

const el = {};

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createItem(item = {}) {
  return {
    id: item.id || createId(),
    photo: item.photo || "",
    work: item.work || "",
    material: item.material || "",
    place: item.place || "",
  };
}

function createBlankItems(count = DEFAULT_ITEM_COUNT) {
  return Array.from({ length: count }, () => createItem());
}

function chunkItems(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function collectMeta() {
  return {
    albumTitle: el.albumTitle.value.trim() || "工事写真帳",
    projectName: el.projectName.value.trim(),
    albumDate: el.albumDate.value,
    contractorName: el.contractorName.value.trim(),
  };
}

function saveData() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...collectMeta(),
      items: state.items,
    }),
  );
}

function updateItem(id, key, value) {
  state.items = state.items.map((item) => (item.id === id ? { ...item, [key]: value } : item));
  saveData();
}

function addItem(item = {}) {
  state.items = [...state.items, createItem(item)];
  saveData();
  renderAlbum();
}

function removeItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  if (state.items.length === 0) {
    state.items = createBlankItems(1);
  }
  saveData();
  renderAlbum();
}

function handlePhoto(id, file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    updateItem(id, "photo", reader.result);
    renderAlbum();
  });
  reader.readAsDataURL(file);
}

function createField(item, key, label) {
  return `
    <label class="photo-field">
      <span>${label}</span>
      <textarea data-field="${key}" data-id="${item.id}" placeholder="${label}を入力">${escapeHtml(item[key])}</textarea>
    </label>
  `;
}

function renderAlbum() {
  const meta = collectMeta();
  const pages = chunkItems(state.items, 2);

  el.printArea.innerHTML = pages
    .map((pageItems, pageIndex) => {
      const rows = pageItems
        .map((item, itemIndex) => {
          const number = pageIndex * 2 + itemIndex + 1;
          const photoContent = item.photo
            ? `<img src="${item.photo}" alt="工事写真 No.${number}" />`
            : `<div class="photo-placeholder"><span class="placeholder-icon" aria-hidden="true"></span><span>写真を選択</span></div>`;

          return `
            <article class="photo-card">
              <label class="photo-drop">
                ${photoContent}
                <input class="photo-input" data-id="${item.id}" type="file" accept="image/*" />
              </label>
              <div class="detail-panel">
                <div class="detail-head">
                  <strong>No.${number}</strong>
                  <button class="remove-button no-print" data-remove-id="${item.id}" type="button" title="削除" aria-label="No.${number}を削除">×</button>
                </div>
                ${createField(item, "work", "工事内容")}
                ${createField(item, "material", "使用材料")}
                ${createField(item, "place", "場所")}
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <section class="page">
          <header class="page-header">
            <h2>${escapeHtml(meta.albumTitle)}</h2>
            <dl>
              ${meta.projectName ? `<div><dt>工事名</dt><dd>${escapeHtml(meta.projectName)}</dd></div>` : ""}
              ${meta.albumDate ? `<div><dt>日付</dt><dd>${escapeHtml(meta.albumDate)}</dd></div>` : ""}
              ${meta.contractorName ? `<div><dt>施工者</dt><dd>${escapeHtml(meta.contractorName)}</dd></div>` : ""}
            </dl>
          </header>
          <div class="photo-list">${rows}</div>
        </section>
      `;
    })
    .join("");
}

function bindAlbumEvents() {
  el.printArea.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.matches("[data-field]")) return;
    updateItem(target.dataset.id, target.dataset.field, target.value);
  });

  el.printArea.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.matches(".photo-input")) return;
    handlePhoto(target.dataset.id, target.files?.[0]);
  });

  el.printArea.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-id]");
    if (!button) return;
    removeItem(button.dataset.removeId);
  });
}

function loadData() {
  const data = safeJsonParse(localStorage.getItem(STORAGE_KEY), {});

  el.albumTitle.value = data.albumTitle || "工事写真帳";
  el.projectName.value = data.projectName || "";
  el.albumDate.value = data.albumDate || todayString();
  el.contractorName.value = data.contractorName || "";
  state.items = data.items?.length ? data.items.map(createItem) : createBlankItems();
}

function bindEvents() {
  el.addItemButton.addEventListener("click", () => addItem());
  el.printButton.addEventListener("click", () => window.print());

  [el.albumTitle, el.projectName, el.albumDate, el.contractorName].forEach((input) => {
    input.addEventListener("input", () => {
      saveData();
      renderAlbum();
    });
  });

  bindAlbumEvents();
}

function runSelfTests() {
  console.assert(chunkItems([1, 2, 3], 2).length === 2, "chunkItems should split into pages");
  console.assert(createBlankItems(3).length === 3, "createBlankItems should create requested rows");
}

function init() {
  ["addItemButton", "printButton", "albumTitle", "projectName", "albumDate", "contractorName", "printArea"].forEach((id) => {
    el[id] = document.getElementById(id);
  });

  loadData();
  bindEvents();
  renderAlbum();
  runSelfTests();
}

document.addEventListener("DOMContentLoaded", init);
