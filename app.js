const STORAGE_KEY = "takemototosou-invoice-receipt:auto";
const BACKUP_KEY = "takemototosou-invoice-receipt:backups";
const CUSTOMER_KEY = "takemototosou-invoice-receipt:customers";
const ITEM_COUNT = 5;

const state = {
  documentMode: "invoice",
  saveTimer: 0,
};

const ids = [
  "documentForm",
  "saveStatus",
  "paymentConfirmed",
  "receiptLockNotice",
  "customerName",
  "subject",
  "issueDate",
  "dueDate",
  "invoiceNumber",
  "receiptNumber",
  "companyName",
  "companyPerson",
  "companyAddress",
  "companyTel",
  "invoiceRegistration",
  "bankInfo",
  "taxExempt",
  "itemsList",
  "notes",
  "pdfButton",
  "lineButton",
  "backupButton",
  "clearBackupsButton",
  "backupList",
  "documentPreview",
  "previewLabel",
  "previewTotal",
  "addItemButton",
  "saveCustomerButton",
  "openCustomerButton",
  "customerDialog",
  "closeCustomerButton",
  "customerList",
];

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function yen(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ja-JP")}円`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createBlankItems(count = ITEM_COUNT) {
  return Array.from({ length: count }, () => ({ name: "", quantity: "", unitPrice: "" }));
}

function getText(id) {
  return el[id]?.value.trim() || "";
}

function getItems() {
  return [...el.itemsList.querySelectorAll(".item-row")]
    .map((row) => ({
      name: row.querySelector(".item-name-input").value.trim(),
      quantity: Number(row.querySelector(".item-quantity-input").value) || 0,
      unitPrice: Number(row.querySelector(".item-price-input").value) || 0,
    }))
    .filter((item) => item.name || item.quantity || item.unitPrice);
}

function calculateTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = el.taxExempt.checked ? 0 : Math.round(subtotal * 0.1);
  return { subtotal, tax, total: subtotal + tax };
}

function collectData() {
  return {
    documentMode: state.documentMode,
    paymentConfirmed: el.paymentConfirmed.checked,
    customerName: getText("customerName"),
    subject: getText("subject"),
    issueDate: el.issueDate.value || todayString(),
    dueDate: el.dueDate.value,
    invoiceNumber: getText("invoiceNumber"),
    receiptNumber: getText("receiptNumber"),
    companyName: getText("companyName"),
    companyPerson: getText("companyPerson"),
    companyAddress: getText("companyAddress"),
    companyTel: getText("companyTel"),
    invoiceRegistration: getText("invoiceRegistration"),
    bankInfo: getText("bankInfo"),
    taxExempt: el.taxExempt.checked,
    notes: el.notes.value,
    items: getItems(),
  };
}

function addItem(item = {}) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <label class="item-name">
      <span>内容</span>
      <input class="item-name-input" placeholder="材料費 / 作業費" value="${escapeHtml(item.name)}" />
    </label>
    <label>
      <span>数量</span>
      <input class="item-quantity-input" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(item.quantity)}" />
    </label>
    <label>
      <span>単価</span>
      <input class="item-price-input" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(item.unitPrice)}" />
    </label>
    <button class="remove-item" type="button" aria-label="明細を削除">×</button>
  `;
  row.querySelector(".remove-item").addEventListener("click", () => {
    row.remove();
    ensureMinimumRows();
    handleChange();
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", handleChange));
  el.itemsList.append(row);
}

function ensureMinimumRows() {
  while (el.itemsList.children.length < ITEM_COUNT) {
    addItem();
  }
}

function renderItems(items = createBlankItems()) {
  el.itemsList.innerHTML = "";
  const rows = items.length ? items : createBlankItems();
  rows.forEach(addItem);
  ensureMinimumRows();
}

function setMode(mode) {
  state.documentMode = mode === "receipt" ? "receipt" : "invoice";
  document.querySelectorAll("[data-mode-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeButton === state.documentMode);
  });
  enforceReceiptLock();
  handleChange();
}

function enforceReceiptLock() {
  const locked = state.documentMode === "receipt" && !el.paymentConfirmed.checked;
  el.receiptLockNotice.classList.toggle("hidden", !locked);
  el.pdfButton.disabled = locked;
  el.lineButton.disabled = locked;
  return locked;
}

function renderPreview() {
  const data = collectData();
  const items = data.items.length ? data.items : createBlankItems(1);
  const totals = calculateTotals(items);
  const isReceipt = data.documentMode === "receipt";
  const title = isReceipt ? "領収書" : "請求書";
  const number = isReceipt ? data.receiptNumber : data.invoiceNumber;
  const taxNotice = data.taxExempt ? "免税事業者として消費税は請求していません。" : `消費税(10%): ${yen(totals.tax)}`;
  const dueLine = !isReceipt && data.dueDate ? `<div>お支払期限: ${escapeHtml(data.dueDate)}</div>` : "";
  const receiptLine = isReceipt ? "<p>上記金額を正に領収いたしました。</p>" : "";

  el.previewLabel.textContent = `${title}プレビュー`;
  el.previewTotal.textContent = yen(totals.total);
  el.documentPreview.innerHTML = `
    <div class="doc">
      <h2 class="doc-title">${title}</h2>
      <div class="doc-meta">
        <div>発行日: ${escapeHtml(data.issueDate)}</div>
        <div>No: ${escapeHtml(number || "-")}</div>
        ${dueLine}
      </div>
      <div class="doc-parties">
        <div>
          <div class="doc-customer">${escapeHtml(data.customerName || "宛名未入力")} 御中</div>
          <p class="doc-subject">件名: ${escapeHtml(data.subject || "-")}</p>
          ${receiptLine}
        </div>
        <div class="doc-company">
          <strong>${escapeHtml(data.companyName || "takemototosou")}</strong><br />
          ${escapeHtml(data.companyPerson)}<br />
          ${escapeHtml(data.companyAddress)}<br />
          ${data.companyTel ? `TEL: ${escapeHtml(data.companyTel)}<br />` : ""}
          ${!data.taxExempt && data.invoiceRegistration ? `登録番号: ${escapeHtml(data.invoiceRegistration)}` : ""}
        </div>
      </div>
      <div class="doc-total">合計 ${yen(totals.total)}</div>
      <table class="doc-table">
        <thead>
          <tr>
            <th>内容</th>
            <th>数量</th>
            <th>単価</th>
            <th>金額</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(item.name || "")}</td>
                  <td>${item.quantity || ""}</td>
                  <td>${item.unitPrice ? yen(item.unitPrice) : ""}</td>
                  <td>${item.quantity && item.unitPrice ? yen(item.quantity * item.unitPrice) : ""}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <table class="summary-table">
        <tr><th>小計</th><td>${yen(totals.subtotal)}</td></tr>
        <tr><th>${data.taxExempt ? "消費税" : "消費税 10%"}</th><td>${data.taxExempt ? "免税" : yen(totals.tax)}</td></tr>
        <tr><th>合計</th><td>${yen(totals.total)}</td></tr>
      </table>
      <div class="doc-notes">
        <strong>備考</strong><br />
        ${escapeHtml(data.notes || taxNotice)}
        ${!isReceipt && data.bankInfo ? `<br />振込先: ${escapeHtml(data.bankInfo)}` : ""}
      </div>
    </div>
  `;
}

function autosave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
  el.saveStatus.textContent = "保存済み";
}

function handleChange() {
  enforceReceiptLock();
  renderPreview();
  el.saveStatus.textContent = "保存中";
  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(autosave, 300);
}

function applyData(data = {}) {
  state.documentMode = data.documentMode || "invoice";
  el.paymentConfirmed.checked = Boolean(data.paymentConfirmed);
  [
    "customerName",
    "subject",
    "issueDate",
    "dueDate",
    "invoiceNumber",
    "receiptNumber",
    "companyName",
    "companyPerson",
    "companyAddress",
    "companyTel",
    "invoiceRegistration",
    "bankInfo",
    "notes",
  ].forEach((id) => {
    el[id].value = data[id] || "";
  });
  el.taxExempt.checked = Boolean(data.taxExempt);
  renderItems(data.items?.length ? data.items : createBlankItems());
  setMode(state.documentMode);
}

function loadAutosave() {
  const data = safeJsonParse(localStorage.getItem(STORAGE_KEY), {});
  if (!data.issueDate) {
    data.issueDate = todayString();
  }
  applyData(data);
}

function getBackups() {
  return safeJsonParse(localStorage.getItem(BACKUP_KEY), []);
}

function setBackups(backups) {
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 30)));
  renderBackups();
}

function saveBackup() {
  const data = collectData();
  const backups = getBackups();
  backups.unshift({
    id: crypto.randomUUID?.() || String(Date.now()),
    savedAt: new Date().toISOString(),
    title: `${data.customerName || "宛名未入力"} / ${data.subject || "件名なし"}`,
    data,
  });
  setBackups(backups);
}

function renderBackups() {
  const backups = getBackups();
  el.backupList.innerHTML = backups.length
    ? backups
        .map(
          (backup) => `
            <div class="backup-item">
              <strong>${escapeHtml(backup.title)}</strong>
              <span>${new Date(backup.savedAt).toLocaleString("ja-JP")}</span>
              <div class="item-actions">
                <button class="secondary" type="button" data-restore-backup="${escapeHtml(backup.id)}">復元</button>
                <button class="secondary danger" type="button" data-delete-backup="${escapeHtml(backup.id)}">削除</button>
              </div>
            </div>
          `,
        )
        .join("")
    : '<div class="notice">まだバックアップはありません。</div>';
}

function getCustomers() {
  return safeJsonParse(localStorage.getItem(CUSTOMER_KEY), []);
}

function setCustomers(customers) {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
}

function saveCustomer() {
  const name = getText("customerName");
  if (!name) return;
  const customers = getCustomers().filter((customer) => customer.name !== name);
  customers.unshift({ name, subject: getText("subject"), updatedAt: new Date().toISOString() });
  setCustomers(customers.slice(0, 50));
  renderCustomers();
}

function renderCustomers() {
  const customers = getCustomers();
  el.customerList.innerHTML = customers.length
    ? customers
        .map(
          (customer) => `
            <div class="customer-item">
              <strong>${escapeHtml(customer.name)}</strong>
              <span>${escapeHtml(customer.subject || "")}</span>
              <button class="secondary" type="button" data-use-customer="${escapeHtml(customer.name)}">使う</button>
            </div>
          `,
        )
        .join("")
    : '<div class="notice">記憶した宛名はありません。</div>';
}

function getPdfName() {
  const data = collectData();
  const type = data.documentMode === "receipt" ? "領収書" : "請求書";
  const customer = data.customerName || "宛名未入力";
  return `${type}_${customer}_${data.issueDate || todayString()}.pdf`;
}

async function generatePdfBlob() {
  if (enforceReceiptLock()) return null;
  if (!window.html2pdf) {
    window.print();
    return null;
  }
  const opt = {
    margin: [8, 8, 8, 8],
    filename: getPdfName(),
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };
  return window.html2pdf().set(opt).from(el.documentPreview).outputPdf("blob");
}

async function printPdf() {
  if (enforceReceiptLock()) return;
  if (!window.html2pdf) {
    window.print();
    return;
  }
  await window.html2pdf().set({ filename: getPdfName(), jsPDF: { unit: "mm", format: "a4" } }).from(el.documentPreview).save();
}

async function sendToLine() {
  if (enforceReceiptLock()) return;
  const data = collectData();
  const title = data.documentMode === "receipt" ? "領収書" : "請求書";
  const text = `${title}を作成しました。\n宛名: ${data.customerName || "-"}\n合計: ${el.previewTotal.textContent}`;

  if (navigator.canShare && navigator.share) {
    const blob = await generatePdfBlob();
    if (blob) {
      const file = new File([blob], getPdfName(), { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return;
      }
    }
    await navigator.share({ title, text });
    return;
  }

  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  window.open(lineUrl, "_blank", "noopener,noreferrer");
}

function bindEvents() {
  document.querySelectorAll("[data-mode-button]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.modeButton));
  });
  el.documentForm.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("input", handleChange);
    input.addEventListener("change", handleChange);
  });
  el.addItemButton.addEventListener("click", () => {
    addItem();
    handleChange();
  });
  el.pdfButton.addEventListener("click", printPdf);
  el.lineButton.addEventListener("click", sendToLine);
  el.backupButton.addEventListener("click", saveBackup);
  el.clearBackupsButton.addEventListener("click", () => setBackups([]));
  el.saveCustomerButton.addEventListener("click", saveCustomer);
  el.openCustomerButton.addEventListener("click", () => {
    renderCustomers();
    el.customerDialog.showModal();
  });
  el.closeCustomerButton.addEventListener("click", () => el.customerDialog.close());
  el.backupList.addEventListener("click", (event) => {
    const restoreId = event.target.dataset.restoreBackup;
    const deleteId = event.target.dataset.deleteBackup;
    if (restoreId) {
      const backup = getBackups().find((item) => item.id === restoreId);
      if (backup) applyData(backup.data);
    }
    if (deleteId) {
      setBackups(getBackups().filter((item) => item.id !== deleteId));
    }
  });
  el.customerList.addEventListener("click", (event) => {
    const name = event.target.dataset.useCustomer;
    if (!name) return;
    const customer = getCustomers().find((item) => item.name === name);
    if (!customer) return;
    el.customerName.value = customer.name;
    if (customer.subject) el.subject.value = customer.subject;
    el.customerDialog.close();
    handleChange();
  });
}

function runSelfTests() {
  console.assert(createBlankItems(3).length === 3, "createBlankItems should return requested rows");
  console.assert(calculateTotals([{ name: "test", quantity: 2, unitPrice: 1000 }]).subtotal === 2000, "subtotal should multiply quantity and unit price");
}

function init() {
  bindEvents();
  loadAutosave();
  renderBackups();
  renderCustomers();
  runSelfTests();
}

document.addEventListener("DOMContentLoaded", init);
