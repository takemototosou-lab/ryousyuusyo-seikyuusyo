const STORAGE_KEY = "kouji-photo-album:auto";
const DEFAULT_ITEM_COUNT = 2;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const HEIC_IMAGE_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_IMAGE_EXTENSIONS = [".heic", ".heif"];
const HEIC_CONVERTER_URLS = [
  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js",
  "https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js",
];

const state = {
  items: [],
};

const el = {};
let heicConverterPromise = null;

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
    photoError: item.photoError || "",
    photoStatus: item.photoStatus || "",
    fileName: item.fileName || "",
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

function updateItem(id, patch) {
  state.items = state.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
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

function hasExtension(file, extensions) {
  const lowerName = file.name.toLowerCase();
  return extensions.some((extension) => lowerName.endsWith(extension));
}

function isHeicImage(file) {
  return HEIC_IMAGE_TYPES.has(file.type) || hasExtension(file, HEIC_IMAGE_EXTENSIONS);
}

function isSupportedImage(file) {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || hasExtension(file, SUPPORTED_IMAGE_EXTENSIONS) || isHeicImage(file);
}

function getUnsupportedMessage() {
  return "この画像形式は表示できません。JPEG、PNG、WebP、GIF、HEICを選択してください。";
}

function getJpegFileName(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "photo"}.jpg`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`failed to load ${src}`)), { once: true });

    if (!existing) {
      script.src = src;
      document.head.append(script);
    }
  });
}

async function ensureHeicConverter() {
  if (typeof window.heic2any === "function") return window.heic2any;
  if (!heicConverterPromise) {
    heicConverterPromise = (async () => {
      for (const src of HEIC_CONVERTER_URLS) {
        try {
          await loadScript(src);
          if (typeof window.heic2any === "function") return window.heic2any;
        } catch {
          // Try the next CDN source.
        }
      }
      throw new Error("HEIC変換ライブラリを読み込めませんでした。通信環境を確認して、もう一度選択してください。");
    })();
  }
  return heicConverterPromise;
}

async function convertHeicToJpeg(file) {
  const heic2any = await ensureHeicConverter();
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("HEIC画像をJPEGに変換できませんでした。別の写真を選択してください。 笳・);
  }

  return new File([convertedBlob], getJpegFileName(file.name), { type: "image/jpeg" });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("画像ファイルを読み込めませんでした。")));
    reader.readAsDataURL(file);
  });
}

function verifyImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("画像を表示できませんでした。別の写真を選択してください。")), { once: true });
    image.src = dataUrl;
  });
}

async function handlePhoto(id, file) {
  if (!file) return;

  if (!isSupportedImage(file)) {
    updateItem(id, { photo: "", photoError: getUnsupportedMessage(), photoStatus: "", fileName: file.name });
    renderAlbum();
    return;
  }

  try {
    updateItem(id, {
      photo: "",
      photoError: "",
      photoStatus: isHeicImage(file) ? "HEIC画像をJPEGに変換しています..." : "画像を読み込んでいます...",
      fileName: file.name,
    });
    renderAlbum();

    const displayFile = isHeicImage(file) ? await convertHeicToJpeg(file) : file;
    const dataUrl = await readFileAsDataUrl(displayFile);
    await verifyImage(dataUrl);
    updateItem(id, {
      photo: dataUrl,
      photoError: "",
      photoStatus: "",
      fileName: isHeicImage(file) ? `${file.name} → ${displayFile.name}` : file.name,
    });
  } catch (error) {
    updateItem(id, { photo: "", photoError: error.message, photoStatus: "", fileName: file.name });
  }

  renderAlbum();
}

function createField(item, key, label) {
  return `
    <label class="photo-field">
      <span>${label}</span>
      <textarea data-field="${key}" data-id="${item.id}" placeholder="${label}を入力">${escapeHtml(item[key])}</textarea>
    </label>
  `;
}

function createPhotoPlaceholder(item) {
  const message = item.photoError || item.photoStatus || "写真を選択、またはドラッグ&ドロップ";
  const fileName = item.fileName ? `<small>${escapeHtml(item.fileName)}</small>` : "";
  return `
    <div class="photo-placeholder ${item.photoError ? "is-error" : ""} ${item.photoStatus ? "is-loading" : ""}">
      <span class="placeholder-icon" aria-hidden="true"></span>
      <span>${escapeHtml(message)}</span>
      ${fileName}
    </div>
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
          const photoContent = item.photo && !item.photoError
            ? `<img class="photo-image" data-id="${item.id}" src="${item.photo}" alt="工事写真 No.${number}" />`
            : createPhotoPlaceholder(item);

          return `
            <article class="photo-card">
              <label class="photo-drop" data-id="${item.id}">
                ${photoContent}
                <input class="photo-input" data-id="${item.id}" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif" />
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
    updateItem(target.dataset.id, { [target.dataset.field]: target.value });
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

  el.printArea.addEventListener("dragover", (event) => {
    const dropTarget = event.target.closest(".photo-drop");
    if (!dropTarget) return;
    event.preventDefault();
    dropTarget.classList.add("is-dragging");
  });

  el.printArea.addEventListener("dragleave", (event) => {
    const dropTarget = event.target.closest(".photo-drop");
    if (!dropTarget || dropTarget.contains(event.relatedTarget)) return;
    dropTarget.classList.remove("is-dragging");
  });

  el.printArea.addEventListener("drop", (event) => {
    const dropTarget = event.target.closest(".photo-drop");
    if (!dropTarget) return;
    event.preventDefault();
    dropTarget.classList.remove("is-dragging");
    handlePhoto(dropTarget.dataset.id, event.dataTransfer?.files?.[0]);
  });

  el.printArea.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!image.matches(".photo-image")) return;
      updateItem(image.dataset.id, {
        photo: "",
        photoError: "画像を表示できませんでした。別の写真を選択してください。",
        photoStatus: "",
      });
      renderAlbum();
    },
    true,
  );
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
  console.assert(isSupportedImage(new File([""], "sample.jpg", { type: "image/jpeg" })), "JPEG should be supported");
  console.assert(isSupportedImage(new File([""], "sample.HEIC", { type: "image/heic" })), "HEIC should be accepted for conversion");
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
