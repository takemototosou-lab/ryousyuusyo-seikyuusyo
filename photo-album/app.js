const STORAGE_KEY = "kouji-photo-album:auto";
const PHOTO_DB_NAME = "kouji-photo-album:photos";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = "photos";
const DEFAULT_ITEM_COUNT = 2;
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.78;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const HEIC_IMAGE_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_IMAGE_EXTENSIONS = [".heic", ".heif"];
const HEIC_CONVERTER_URLS = [
  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js",
  "https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js",
];

const state = { items: [] };
const el = {};
let heicConverterPromise = null;
let photoDbPromise = null;

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

function isQuotaExceeded(error) {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

function getQuotaExceededMessage() {
  return "ブラウザの写真保存容量がいっぱいです。写真はJPEG圧縮済みですが保存できませんでした。不要な写真枠を削除してから、もう一度選択してください。";
}

function createItem(item = {}) {
  const legacyPhoto = typeof item.photo === "string" && item.photo.startsWith("data:image/") ? item.photo : "";

  return {
    id: item.id || createId(),
    hasPhoto: Boolean(item.hasPhoto || legacyPhoto),
    photoUrl: "",
    legacyPhoto,
    photoError: item.photoError || "",
    photoStatus: item.photoStatus || "",
    fileName: item.fileName || "",
    work: item.work || "",
    material: item.material || "",
    place: item.place || "",
  };
}

function serializeItem(item) {
  return {
    id: item.id,
    hasPhoto: Boolean(item.hasPhoto),
    photoError: item.photoError || "",
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
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...collectMeta(),
      items: state.items.map(serializeItem),
    }));
    return true;
  } catch (error) {
    if (isQuotaExceeded(error)) {
      console.warn("文字情報を保存できませんでした。", error);
      return false;
    }
    throw error;
  }
}

function updateItem(id, patch) {
  state.items = state.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  return saveData();
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function revokePhotoUrl(item) {
  if (item?.photoUrl?.startsWith("blob:")) URL.revokeObjectURL(item.photoUrl);
}

function updatePhotoUrl(id, photoUrl) {
  const item = getItem(id);
  revokePhotoUrl(item);
  updateItem(id, { photoUrl, hasPhoto: Boolean(photoUrl), photoError: "", photoStatus: "" });
}

function addItem(item = {}) {
  state.items = [...state.items, createItem(item)];
  saveData();
  renderAlbum();
}

function removeItem(id) {
  const item = getItem(id);
  revokePhotoUrl(item);
  state.items = state.items.filter((photoItem) => photoItem.id !== id);
  if (state.items.length === 0) state.items = createBlankItems(1);
  saveData();
  deletePhotoBlob(id).catch((error) => console.warn("写真を削除できませんでした。", error));
  renderAlbum();
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function openPhotoDb() {
  if (!window.indexedDB) {
    return Promise.reject(new Error("このブラウザでは写真保存用のIndexedDBを利用できません。"));
  }

  if (!photoDbPromise) {
    photoDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          db.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }

  return photoDbPromise;
}

async function withPhotoStore(mode, callback) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE_NAME, mode);
    const store = transaction.objectStore(PHOTO_STORE_NAME);
    let callbackResult;

    transaction.addEventListener("complete", () => resolve(callbackResult), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });

    try {
      callbackResult = callback(store);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

async function savePhotoBlob(id, blob, metadata = {}) {
  await withPhotoStore("readwrite", (store) => {
    store.put({
      id,
      blob,
      type: blob.type || "image/jpeg",
      size: blob.size,
      savedAt: new Date().toISOString(),
      ...metadata,
    });
  });
}

async function getPhotoRecord(id) {
  return withPhotoStore("readonly", (store) => requestToPromise(store.get(id)));
}

async function deletePhotoBlob(id) {
  await withPhotoStore("readwrite", (store) => {
    store.delete(id);
  });
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
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("HEIC画像をJPEGに変換できませんでした。別の写真を選択してください。");
  }

  return new File([convertedBlob], getJpegFileName(file.name), { type: "image/jpeg" });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.addEventListener("load", () => resolve({ image, objectUrl }), { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を表示できませんでした。別の写真を選択してください。"));
    }, { once: true });
    image.src = objectUrl;
  });
}

function getScaledSize(width, height) {
  const longestSide = Math.max(width, height);
  if (longestSide <= MAX_IMAGE_SIDE) return { width, height };

  const scale = MAX_IMAGE_SIDE / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("画像をJPEGへ圧縮できませんでした。別の写真を選択してください。"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY);
  });
}

async function compressImageToJpegBlob(file) {
  const { image, objectUrl } = await loadImageFromFile(file);

  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("画像サイズを読み取れませんでした。別の写真を選択してください。");
    }

    const { width, height } = getScaledSize(sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("画像を圧縮できませんでした。別の写真を選択してください。");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToJpegBlob(canvas);
    const photoUrl = URL.createObjectURL(blob);
    try {
      await verifyImage(photoUrl);
    } finally {
      URL.revokeObjectURL(photoUrl);
    }

    return {
      blob,
      width,
      height,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function verifyImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("画像を表示できませんでした。別の写真を選択してください。")), { once: true });
    image.src = src;
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function getCompressedFileLabel(originalFile, displayFile, compressedImage) {
  const compressedLabel = `${compressedImage.width}x${compressedImage.height} JPEG`;
  if (originalFile.name !== displayFile.name) return `${originalFile.name} → ${displayFile.name} / ${compressedLabel}`;
  return `${originalFile.name} / ${compressedLabel}`;
}

async function createPhotoUrlFromBlob(blob) {
  const photoUrl = URL.createObjectURL(blob);
  try {
    await verifyImage(photoUrl);
    return photoUrl;
  } catch (error) {
    URL.revokeObjectURL(photoUrl);
    throw error;
  }
}

async function hydrateStoredPhotos() {
  let changed = false;

  await Promise.all(state.items.map(async (item) => {
    if (item.legacyPhoto) {
      try {
        const blob = dataUrlToBlob(item.legacyPhoto);
        await savePhotoBlob(item.id, blob, { migratedFromLocalStorage: true });
        item.photoUrl = await createPhotoUrlFromBlob(blob);
        item.hasPhoto = true;
        item.legacyPhoto = "";
        item.photoError = "";
        changed = true;
        return;
      } catch (error) {
        item.photoError = isQuotaExceeded(error) ? getQuotaExceededMessage() : "保存済み写真を移行できませんでした。写真を選択し直してください。";
        item.hasPhoto = false;
        item.legacyPhoto = "";
        changed = true;
        return;
      }
    }

    if (!item.hasPhoto) return;

    try {
      const record = await getPhotoRecord(item.id);
      if (!record?.blob) {
        item.hasPhoto = false;
        item.photoError = "保存済み写真が見つかりませんでした。写真を選択し直してください。";
        changed = true;
        return;
      }
      item.photoUrl = await createPhotoUrlFromBlob(record.blob);
      item.photoError = "";
    } catch (error) {
      item.hasPhoto = false;
      item.photoError = "保存済み写真を読み込めませんでした。写真を選択し直してください。";
      changed = true;
    }
  }));

  if (changed) saveData();
  renderAlbum();
}

async function handlePhoto(id, file) {
  if (!file) return;

  if (!isSupportedImage(file)) {
    updateItem(id, { hasPhoto: false, photoUrl: "", photoError: getUnsupportedMessage(), photoStatus: "", fileName: file.name });
    renderAlbum();
    return;
  }

  const sourceIsHeic = isHeicImage(file);
  const item = getItem(id);
  revokePhotoUrl(item);

  try {
    updateItem(id, {
      hasPhoto: false,
      photoUrl: "",
      photoError: "",
      photoStatus: sourceIsHeic ? "HEIC画像をJPEGに変換しています..." : "画像を読み込んでいます...",
      fileName: file.name,
    });
    renderAlbum();

    const displayFile = sourceIsHeic ? await convertHeicToJpeg(file) : file;
    updateItem(id, { photoStatus: "写真をJPEGに圧縮しています..." });
    renderAlbum();

    const compressedImage = await compressImageToJpegBlob(displayFile);
    await savePhotoBlob(id, compressedImage.blob, {
      fileName: getCompressedFileLabel(file, displayFile, compressedImage),
      width: compressedImage.width,
      height: compressedImage.height,
      originalWidth: compressedImage.originalWidth,
      originalHeight: compressedImage.originalHeight,
      quality: JPEG_QUALITY,
      maxSide: MAX_IMAGE_SIDE,
    });

    const photoUrl = await createPhotoUrlFromBlob(compressedImage.blob);
    updatePhotoUrl(id, photoUrl);
    updateItem(id, {
      fileName: getCompressedFileLabel(file, displayFile, compressedImage),
      photoError: "",
      photoStatus: "",
    });
  } catch (error) {
    updateItem(id, {
      hasPhoto: false,
      photoUrl: "",
      photoError: isQuotaExceeded(error) ? getQuotaExceededMessage() : error.message,
      photoStatus: "",
      fileName: file.name,
    });
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

  el.printArea.innerHTML = pages.map((pageItems, pageIndex) => {
    const rows = pageItems.map((item, itemIndex) => {
      const number = pageIndex * 2 + itemIndex + 1;
      const photoContent = item.photoUrl && item.hasPhoto && !item.photoError
        ? `<img class="photo-image" data-id="${item.id}" src="${item.photoUrl}" alt="工事写真 No.${number}" />`
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
    }).join("");

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
  }).join("");
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

  el.printArea.addEventListener("error", (event) => {
    const image = event.target;
    if (!image.matches(".photo-image")) return;
    updateItem(image.dataset.id, {
      hasPhoto: false,
      photoUrl: "",
      photoError: "画像を表示できませんでした。別の写真を選択してください。",
      photoStatus: "",
    });
    renderAlbum();
  }, true);
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
  console.assert(isSupportedImage(new File([""], "sample.png", { type: "image/png" })), "PNG should be supported");
  console.assert(isSupportedImage(new File([""], "sample.HEIC", { type: "image/heic" })), "HEIC should be accepted for conversion");
  console.assert(getScaledSize(3200, 2400).width === 1600, "wide images should shrink to 1600px on the long side");
  console.assert(getScaledSize(1200, 800).width === 1200, "small images should keep their natural size");
  console.assert(serializeItem({ id: "1", photoUrl: "blob:test", legacyPhoto: "data:image/jpeg;base64,a", hasPhoto: true }).photoUrl === undefined, "photo URLs should not be saved to localStorage");
}

function init() {
  ["addItemButton", "printButton", "albumTitle", "projectName", "albumDate", "contractorName", "printArea"].forEach((id) => {
    el[id] = document.getElementById(id);
  });

  loadData();
  bindEvents();
  renderAlbum();
  hydrateStoredPhotos();
  runSelfTests();
}

document.addEventListener("DOMContentLoaded", init);
