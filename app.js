const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
const siteStorageKey = "work-calendar-sites";
const closingStorageKey = "work-calendar-closing-days";

const today = new Date();
let year = today.getFullYear();
let month = today.getMonth() + 1;
let selectedDay = today.getDate();
let currentView = "input";
let workData = {};
let savedSites = [];
let closingDays = {};
let draft = null;
let editingSite = "";
let editingSiteName = "";
let justSavedDay = null;
let checkedGroups = {};

const defaultWork = {
  site: "",
  mark: "○",
  price: 22000,
  invoice: true,
};

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getMonthKey() {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getWorkStorageKey() {
  return `work-calendar-${getMonthKey()}`;
}

function getClosingDay() {
  return closingDays[getMonthKey()] ?? 25;
}

function setClosingDay(value) {
  const safe = Math.min(31, Math.max(1, Number(value) || 1));
  closingDays = { ...closingDays, [getMonthKey()]: safe };
  writeStorage(closingStorageKey, closingDays);
}

function loadMonthData() {
  workData = readStorage(getWorkStorageKey(), {});
}

function saveMonthData() {
  writeStorage(getWorkStorageKey(), workData);
}

function loadGlobalData() {
  savedSites = readStorage(siteStorageKey, []);
  closingDays = readStorage(closingStorageKey, {});
}

function saveSites() {
  writeStorage(siteStorageKey, savedSites);
}

function getSelectedData() {
  return workData[selectedDay] || { ...defaultWork };
}

function resetDraft() {
  draft = { ...getSelectedData() };
  justSavedDay = null;
}

function getDaysInMonth() {
  return new Date(year, month, 0).getDate();
}

function getCalendarDays() {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const blanks = Array.from({ length: firstDay }, (_, index) => ({ blank: true, key: `blank-${index}` }));
  const days = Array.from({ length: getDaysInMonth() }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month - 1, day);
    return {
      blank: false,
      key: `day-${day}`,
      day,
      week: weekDays[date.getDay()],
    };
  });
  return [...blanks, ...days];
}

function setDraft(key, value, shouldRender = true) {
  draft = { ...(draft || getSelectedData()), [key]: value };
  justSavedDay = null;
  if (shouldRender) renderInputPage();
}

function rememberSite(site) {
  const trimmed = site.trim();
  if (!trimmed) return;
  if (!savedSites.includes(trimmed)) {
    savedSites = [...savedSites, trimmed];
    saveSites();
  }
}

function updateCalendarCell(day, data) {
  const cell = document.querySelector(`.day-button[data-day="${day}"]`);
  if (!cell) return;

  const mark = cell.querySelector(".day-mark");
  const site = cell.querySelector(".day-site");
  if (mark) mark.textContent = data.mark || "-";
  if (site) site.textContent = data.site || "";

  cell.classList.add("saved");
  cell.classList.add("selected");
  requestAnimationFrame(() => {
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function saveSelectedDay() {
  const saveButtonBefore = document.querySelector("#saveButton");
  if (saveButtonBefore) {
    saveButtonBefore.textContent = "保存中...";
    saveButtonBefore.classList.remove("saved");
    saveButtonBefore.classList.add("saving");
  }

  const siteInput = document.querySelector("#siteInput");
  const priceInput = document.querySelector("#priceInput");
  const currentDraft = draft || getSelectedData();
  const draftData = {
    ...currentDraft,
    site: (siteInput ? siteInput.value : currentDraft.site).trim(),
    price: priceInput ? Number(priceInput.value || 0) : Number(currentDraft.price || 0),
  };

  draft = { ...draftData };
  workData[selectedDay] = { ...draftData };
  justSavedDay = selectedDay;
  rememberSite(draftData.site);
  saveMonthData();
  renderCalendar();
  updateCalendarCell(selectedDay, draftData);
  renderSavedBanner();
  renderInputForm();
  renderSiteHistory();

  const saveButton = document.querySelector("#saveButton");
  saveButton.textContent = "決定済み";
  saveButton.classList.remove("saving");
  saveButton.classList.add("saved");

  const savedCell = document.querySelector(`.day-button[data-day="${selectedDay}"]`);
  if (savedCell) {
    savedCell.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getGroups() {
  const map = {};
  Object.values(workData).forEach((data) => {
    if (!data.site || data.mark === "×") return;
    const key = `${data.site}-${data.invoice ? "invoice" : "no-invoice"}`;
    if (!map[key]) {
      map[key] = {
        key,
        site: data.site,
        invoice: data.invoice,
        fullDays: 0,
        halfDays: 0,
        total: 0,
      };
    }

    const price = Number(data.price || 0);
    map[key].total += data.mark === "△" ? price / 2 : price;
    if (data.mark === "○") map[key].fullDays += 1;
    if (data.mark === "△") map[key].halfDays += 1;
  });

  return Object.values(map).map((group) => {
    const tax = group.invoice ? Math.floor(group.total * 0.1) : 0;
    return {
      ...group,
      tax,
      grand: group.total + tax,
      workDays: group.fullDays + group.halfDays * 0.5,
    };
  });
}

function syncCheckedGroups() {
  const next = {};
  getGroups().forEach((group) => {
    next[group.key] = checkedGroups[group.key] ?? true;
  });
  checkedGroups = next;
}

function getSelectedGroups() {
  return getGroups().filter((group) => checkedGroups[group.key]);
}

function shareToLine() {
  const selected = getSelectedGroups();
  if (selected.length === 0) return;

  const text = selected
    .map((group) =>
      [
        `現場名: ${group.site}`,
        `○日数: ${group.fullDays}日`,
        `△日数: ${group.halfDays}日`,
        `換算日数: ${group.workDays}日`,
        `税抜: ${group.total.toLocaleString()}円`,
        `消費税: ${group.tax.toLocaleString()}円`,
        `請求額: ${group.grand.toLocaleString()}円`,
      ].join("\n"),
    )
    .join("\n\n");

  window.open(`https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function renderBase() {
  document.querySelector("#monthTitle").textContent = `${year}年 ${month}月`;
  document.querySelector("#closingDay").value = getClosingDay();
  document.querySelector("#inputTab").classList.toggle("active", currentView === "input");
  document.querySelector("#summaryTab").classList.toggle("active", currentView === "summary");
  document.querySelector("#inputPage").classList.toggle("hidden", currentView !== "input");
  document.querySelector("#summaryPage").classList.toggle("hidden", currentView !== "summary");
}

function renderCalendarHead() {
  document.querySelector("#calendarHead").innerHTML = weekDays
    .map((week) => `<div class="${week === "日" ? "week-sun" : week === "土" ? "week-sat" : ""}">${week}</div>`)
    .join("");
}

function renderCalendar() {
  document.querySelector("#calendar").innerHTML = getCalendarDays()
    .map((item) => {
      if (item.blank) return `<div class="blank-day"></div>`;

      const data = item.day === justSavedDay ? draft || workData[item.day] || {} : workData[item.day] || {};
      const isSelected = selectedDay === item.day;
      const isSaved = justSavedDay === item.day;

      return `
        <button type="button" data-day="${item.day}" class="day-button ${isSelected ? "selected" : ""} ${isSaved ? "saved" : ""}">
          <div class="day-number">${item.day}</div>
          <div class="day-week ${item.week === "日" ? "week-sun" : item.week === "土" ? "week-sat" : ""}">${item.week}</div>
          <div class="day-mark">${data.mark || "-"}</div>
          <div class="day-site">${data.site || ""}</div>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".day-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDay = Number(button.dataset.day);
      resetDraft();
      renderInputPage();
    });
  });
}

function renderSavedBanner() {
  const banner = document.querySelector("#savedBanner");
  if (!justSavedDay) {
    banner.innerHTML = "";
    return;
  }
  const data = draft || getSelectedData();
  banner.innerHTML = `
    <div class="saved-banner">
      <strong>保存しました</strong>
      ${month}月${justSavedDay}日 / ${data.site || "現場名未入力"} / ${data.mark} / インボイス${data.invoice ? "有り" : "無し"}
    </div>
  `;
}

function renderSiteHistory() {
  const root = document.querySelector("#siteHistory");
  if (savedSites.length === 0) {
    root.innerHTML = `<div class="history-empty">保存すると現場名がここに表示されます。</div>`;
    return;
  }

  root.innerHTML = savedSites
    .map((site) => {
      if (editingSite === site) {
        return `
          <div class="history-item">
            <input class="edit-site-input" value="${editingSiteName}" />
            <div class="row" style="margin-top:8px;">
              <button type="button" class="small-button save-site-edit">保存</button>
              <button type="button" class="small-button cancel-site-edit">戻る</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="history-item">
          <div class="row">
            <button type="button" class="site-select" data-site="${site}">${site}</button>
            <button type="button" class="small-button site-edit" data-site="${site}">編集</button>
            <button type="button" class="small-button danger site-delete" data-site="${site}">削除</button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".site-select").forEach((button) => {
    button.addEventListener("click", () => setDraft("site", button.dataset.site));
  });
  document.querySelectorAll(".site-edit").forEach((button) => {
    button.addEventListener("click", () => {
      editingSite = button.dataset.site;
      editingSiteName = button.dataset.site;
      renderInputPage();
    });
  });
  document.querySelectorAll(".site-delete").forEach((button) => {
    button.addEventListener("click", () => {
      const site = button.dataset.site;
      savedSites = savedSites.filter((item) => item !== site);
      if (draft.site === site) draft.site = "";
      if (editingSite === site) {
        editingSite = "";
        editingSiteName = "";
      }
      saveSites();
      renderInputPage();
    });
  });

  const editInput = document.querySelector(".edit-site-input");
  if (editInput) {
    editInput.addEventListener("input", (event) => {
      editingSiteName = event.target.value;
    });
    document.querySelector(".save-site-edit").addEventListener("click", () => {
      const nextName = editingSiteName.trim();
      if (!nextName) return;
      savedSites = savedSites.map((site) => (site === editingSite ? nextName : site));
      Object.entries(workData).forEach(([day, data]) => {
        if (data.site === editingSite) workData[day] = { ...data, site: nextName };
      });
      if (draft.site === editingSite) draft.site = nextName;
      editingSite = "";
      editingSiteName = "";
      saveSites();
      saveMonthData();
      renderInputPage();
    });
    document.querySelector(".cancel-site-edit").addEventListener("click", () => {
      editingSite = "";
      editingSiteName = "";
      renderInputPage();
    });
  }
}

function renderInputForm() {
  const data = draft || getSelectedData();
  document.querySelector("#selectedDateTitle").textContent = `${year}年${month}月${selectedDay}日`;
  document.querySelector("#siteInput").value = data.site;
  document.querySelector("#priceInput").value = data.price;
  document.querySelector("#savePreview").innerHTML = `
    <strong>${data.site || "現場名未入力"}</strong><br>
    ${data.mark} / ${Number(data.price || 0).toLocaleString()}円 / インボイス${data.invoice ? "有り" : "無し"}
  `;
  document.querySelector("#savedMessage").textContent = justSavedDay ? "カレンダーに反映しました" : "";

  document.querySelector("#markWork").className = `choice-button ${data.mark === "○" ? "active work" : ""}`;
  document.querySelector("#markHalf").className = `choice-button ${data.mark === "△" ? "active half" : ""}`;
  document.querySelector("#invoiceOn").className = `choice-button ${data.invoice ? "active invoice-on" : ""}`;
  document.querySelector("#invoiceOff").className = `choice-button ${!data.invoice ? "active invoice-off" : ""}`;
  document.querySelector("#saveButton").textContent = justSavedDay ? "決定済み" : "決定";
  document.querySelector("#saveButton").classList.remove("saving");
  document.querySelector("#saveButton").classList.toggle("saved", Boolean(justSavedDay));
}

function renderInputPage() {
  renderBase();
  renderSavedBanner();
  renderCalendarHead();
  renderCalendar();
  renderSiteHistory();
  renderInputForm();
}

function renderSummaryPage() {
  renderBase();
  syncCheckedGroups();

  const groups = getGroups();
  const selected = getSelectedGroups();
  const selectedTotal = selected.reduce((sum, group) => sum + group.grand, 0);
  const allChecked = groups.length > 0 && groups.every((group) => checkedGroups[group.key]);

  document.querySelector("#toggleAll").textContent = allChecked ? "全解除" : "全選択";
  document.querySelector("#selectedTotal").textContent = `${selectedTotal.toLocaleString()}円`;
  document.querySelector("#lineButton").disabled = selected.length === 0;

  if (groups.length === 0) {
    document.querySelector("#summaryList").innerHTML = `<div class="notice">まだ集計する出勤データがありません。</div>`;
    return;
  }

  document.querySelector("#summaryList").innerHTML = groups
    .map(
      (group) => `
        <label class="summary-card">
          <div class="row">
            <input class="summary-check" type="checkbox" data-group="${group.key}" ${checkedGroups[group.key] ? "checked" : ""}>
            <div class="summary-main">
              <div class="card-head">
                <div class="summary-site">${group.site}</div>
                <div class="invoice-label ${group.invoice ? "on" : "off"}">${group.invoice ? "有り" : "無し"}</div>
              </div>
              <div class="summary-stats">
                <div class="stat">○<b>${group.fullDays}日</b></div>
                <div class="stat">△<b>${group.halfDays}日</b></div>
                <div class="stat">換算<b>${group.workDays}日</b></div>
              </div>
              <div class="invoice-detail">
                <div>税抜<br><b>${group.total.toLocaleString()}円</b></div>
                <div>消費税<br><b>${group.tax.toLocaleString()}円</b></div>
                <div>請求額<br><b>${group.grand.toLocaleString()}円</b></div>
              </div>
            </div>
          </div>
        </label>
      `,
    )
    .join("");

  document.querySelectorAll(".summary-check").forEach((input) => {
    input.addEventListener("change", () => {
      checkedGroups[input.dataset.group] = input.checked;
      renderSummaryPage();
    });
  });
}

function renderCurrentView() {
  if (currentView === "input") renderInputPage();
  else renderSummaryPage();
}

document.querySelector("#prevMonth").addEventListener("click", () => {
  if (month === 1) {
    year -= 1;
    month = 12;
  } else {
    month -= 1;
  }
  selectedDay = 1;
  loadMonthData();
  resetDraft();
  renderCurrentView();
});

document.querySelector("#nextMonth").addEventListener("click", () => {
  if (month === 12) {
    year += 1;
    month = 1;
  } else {
    month += 1;
  }
  selectedDay = 1;
  loadMonthData();
  resetDraft();
  renderCurrentView();
});

document.querySelector("#inputTab").addEventListener("click", () => {
  currentView = "input";
  renderInputPage();
});

document.querySelector("#summaryTab").addEventListener("click", () => {
  currentView = "summary";
  renderSummaryPage();
});

document.querySelector("#closingDay").addEventListener("input", (event) => {
  setClosingDay(event.target.value);
});

document.querySelector("#siteInput").addEventListener("input", (event) => {
  setDraft("site", event.target.value, false);
  document.querySelector("#savePreview").innerHTML = `
    <strong>${event.target.value || "現場名未入力"}</strong><br>
    ${draft.mark} / ${Number(draft.price || 0).toLocaleString()}円 / インボイス${draft.invoice ? "有り" : "無し"}
  `;
});

document.querySelector("#priceInput").addEventListener("input", (event) => {
  setDraft("price", Number(event.target.value || 0), false);
});

document.querySelector("#markWork").addEventListener("click", () => setDraft("mark", "○"));
document.querySelector("#markHalf").addEventListener("click", () => setDraft("mark", "△"));
document.querySelector("#invoiceOn").addEventListener("click", () => setDraft("invoice", true));
document.querySelector("#invoiceOff").addEventListener("click", () => setDraft("invoice", false));
document.querySelector("#saveButton").addEventListener("click", saveSelectedDay);
document.querySelector("#toggleAll").addEventListener("click", () => {
  const groups = getGroups();
  const allChecked = groups.length > 0 && groups.every((group) => checkedGroups[group.key]);
  groups.forEach((group) => {
    checkedGroups[group.key] = !allChecked;
  });
  renderSummaryPage();
});
document.querySelector("#lineButton").addEventListener("click", shareToLine);

loadGlobalData();
loadMonthData();
resetDraft();
renderInputPage();
