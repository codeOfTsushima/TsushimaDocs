
let allDocs = [];
const $ = id => document.getElementById(id);

const els = {
  badge: $("badge"),
  progressBar: $("progressBar"),
  actionBar: $("actionBar"),
  stateScanning: $("stateScanning"),
  stateEmpty: $("stateEmpty"),
  stateError: $("stateError"),
  listWrap: $("listWrap"),
  footer: $("footer"),
  footerInfo: $("footerInfo"),
  btnDownloadAll: $("btnDownloadAll"),
  btnRescan: $("btnRescan"),
  btnSelectAll: $("btnSelectAll")
};

function showState(name) {
  ["stateScanning", "stateEmpty", "stateError"].forEach(id => {
    $(id).style.display = id === name ? "flex" : "none";
  });
  els.listWrap.style.display = "none";
  els.footer.style.display = "none";
  els.actionBar.style.display = "none";
}

const SOURCE_MAP = {
  link: ["Link", "src-link"],
  embed: ["Embed", "src-embed"],
  iframe: ["iFrame", "src-iframe"],
  object: ["Object", "src-object"],
  viewer: ["Viewer", "src-iframe"],
  network: ["Network", "src-network"],
  pdfjs: ["PDF.js", "src-pdfjs"],
  "data-attribute": ["Data", "src-data-attr"]
};

function sourceInfo(source) {
  return SOURCE_MAP[source] || [source || "Page", "src-link"];
}

const TYPE_CONFIG = {
  pdf: { label: "PDF", iconBg: "linear-gradient(135deg, #f87171, #ef4444)" },
  ppt: { label: "PPT", iconBg: "linear-gradient(135deg, #fb923c, #d97706)" }
};

function filenameFromUrl(url, label, fileType) {
  let candidate = "";
  try {
    const parsed = new URL(url);
    candidate = decodeURIComponent(parsed.pathname.split("/").pop() || "");
  } catch {}

  if (!candidate || !/\.(pdf|pptx?|ppsx?|potx?|odp)$/i.test(candidate)) {
    candidate = label || (fileType === "ppt" ? "presentation.pptx" : "document.pdf");
  }

  candidate = candidate.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  if (!/\.[a-z0-9]{2,5}$/i.test(candidate)) {
    candidate += fileType === "ppt" ? ".pptx" : ".pdf";
  }
  return candidate;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderList(docs) {
  els.listWrap.innerHTML = "";

  if (!docs.length) {
    showState("stateEmpty");
    els.badge.textContent = "0 Files";
    els.progressBar.classList.remove("active");
    els.progressBar.style.width = "0";
    return;
  }

  ["stateScanning", "stateEmpty", "stateError"].forEach(id => {
    $(id).style.display = "none";
  });
  els.listWrap.style.display = "block";
  els.footer.style.display = "flex";
  els.actionBar.style.display = "flex";

  const pdfCount = docs.filter(doc => doc.fileType === "pdf").length;
  const pptCount = docs.filter(doc => doc.fileType === "ppt").length;
  els.badge.textContent = [
    pdfCount ? `${pdfCount} PDF${pdfCount === 1 ? "" : "s"}` : "",
    pptCount ? `${pptCount} PPT${pptCount === 1 ? "" : "s"}` : ""
  ].filter(Boolean).join(", ");
  els.badge.classList.add("has-pdfs");
  els.footerInfo.textContent = `${docs.length} file${docs.length === 1 ? "" : "s"} found`;

  els.progressBar.classList.remove("active");
  els.progressBar.style.width = "100%";
  setTimeout(() => { els.progressBar.style.width = "0"; }, 600);

  docs.forEach(doc => {
    const item = document.createElement("div");
    item.className = "pdf-item";

    const filename = filenameFromUrl(doc.url, doc.label, doc.fileType);
    const [sourceLabel, sourceClass] = sourceInfo(doc.source);
    const typeConfig = TYPE_CONFIG[doc.fileType] || TYPE_CONFIG.pdf;

    item.innerHTML = `
      <div class="pdf-icon" style="background:${typeConfig.iconBg};color:#fff">${typeConfig.label}</div>
      <div class="pdf-info">
        <div class="pdf-name" title="${escapeHtml(doc.label)}">${escapeHtml(doc.label)}</div>
        <div class="pdf-meta">
          <span class="pdf-source ${sourceClass}">${escapeHtml(sourceLabel)}</span>
          <span title="${escapeHtml(doc.url)}">${escapeHtml(filename)}</span>
        </div>
      </div>
      <button class="dl-btn" type="button" title="Download" aria-label="Download ${escapeHtml(filename)}">&#11015;</button>
    `;

    item.querySelector(".dl-btn").addEventListener("click", event => {
      downloadSingle(doc, event.currentTarget);
    });
    els.listWrap.appendChild(item);
  });
}

function downloadSingle(doc, button) {
  button.textContent = "...";
  button.disabled = true;

  chrome.runtime.sendMessage({
    action: "DOWNLOAD_PDF",
    url: doc.url,
    filename: filenameFromUrl(doc.url, doc.label, doc.fileType)
  }, response => {
    const error = chrome.runtime.lastError;
    if (!error && response?.ok) {
      button.textContent = "✓";
      button.classList.add("done");
    } else {
      button.textContent = "↓";
      button.disabled = false;
      button.title = response?.error || error?.message || "Download failed";
    }
  });
}

function downloadAll() {
  if (!allDocs.length) return;

  els.btnDownloadAll.disabled = true;
  els.btnDownloadAll.textContent = "Downloading...";

  chrome.runtime.sendMessage({ action: "DOWNLOAD_ALL", pdfs: allDocs }, response => {
    const error = chrome.runtime.lastError;
    if (error || !response?.ok) {
      els.btnDownloadAll.textContent = "Some downloads failed";
      els.btnDownloadAll.title = response?.failed
        ? `${response.failed} download(s) failed`
        : (response?.error || error?.message || "Download failed");
    } else {
      els.btnDownloadAll.textContent = "Downloads started";
    }

    setTimeout(() => {
      els.btnDownloadAll.disabled = false;
      els.btnDownloadAll.textContent = "Download All";
    }, 2500);
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(response?.pdfs || []);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(response?.pdfs || []);
    });
  });
}

async function scan() {
  showState("stateScanning");
  els.progressBar.classList.add("active");
  els.badge.textContent = "Scanning...";
  els.badge.classList.remove("has-pdfs");
  allDocs = [];

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || /^(chrome|chrome-extension|about|edge):/i.test(tab.url)) {
      showState("stateError");
      els.badge.textContent = "Unavailable";
      els.progressBar.classList.remove("active");
      return;
    }

    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    } catch {
     
    }

    const [domDocs, networkDocs] = await Promise.all([
      sendMessageToTab(tab.id, { action: "SCAN_PDFS" }),
      sendRuntimeMessage({ action: "GET_CAPTURED_PDFS", tabId: tab.id })
    ]);

    const merged = new Map();
    [...domDocs, ...networkDocs].forEach(doc => {
      if (doc?.url && !merged.has(doc.url)) merged.set(doc.url, doc);
    });

    allDocs = [...merged.values()];
    renderList(allDocs);
  } catch (error) {
    console.error("PDF Downloader scan failed:", error);
    showState("stateError");
    els.badge.textContent = "Scan error";
    els.progressBar.classList.remove("active");
  }
}

els.btnDownloadAll.addEventListener("click", downloadAll);
els.btnRescan.addEventListener("click", scan);
els.btnSelectAll.addEventListener("click", () => {
  document.querySelectorAll(".dl-btn:not(.done)").forEach(button => button.click());
});

scan();
