// background.js — Manifest V3 service worker
// Captured URLs are stored in storage.session so they survive service-worker suspension.

const STORAGE_PREFIX = "capturedDocs:";
const writeQueues = new Map();
const PDF_PATTERN = /\.pdf(?:[?#]|$)/i;
const PPT_PATTERN = /\.(?:pptx?|ppsx?|potx?|odp)(?:[?#]|$)/i;

function getFileType(url) {
  if (!url) return null;
  if (PDF_PATTERN.test(url) || /(?:filetype|type|format)=pdf/i.test(url)) return "pdf";
  if (PPT_PATTERN.test(url) || /(?:filetype|type|format)=pptx?/i.test(url)) return "ppt";
  return null;
}

function getTypeFromMime(mime) {
  const value = (mime || "").toLowerCase();
  if (value.includes("application/pdf")) return "pdf";
  if (
    value.includes("powerpoint") ||
    value.includes("presentation") ||
    value.includes("officedocument.presentationml")
  ) return "ppt";
  return null;
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function labelFromUrl(url) {
  try {
    const name = new URL(url).pathname.split("/").pop();
    return name ? safeDecode(name) : "Document";
  } catch {
    return "Document";
  }
}

async function storeDoc(tabId, url, fileType, label) {
  if (!Number.isInteger(tabId) || tabId < 0 || !url) return;

  const key = STORAGE_PREFIX + tabId;
  const previous = writeQueues.get(tabId) || Promise.resolve();
  const next = previous.then(async () => {
    const stored = await chrome.storage.session.get(key);
    const docs = Array.isArray(stored[key]) ? stored[key] : [];
    const existing = docs.findIndex(doc => doc.url === url);

    const doc = {
      url,
      label: label || labelFromUrl(url),
      source: "network",
      fileType: fileType || getFileType(url) || "pdf"
    };

    if (existing >= 0) {
      docs[existing] = { ...docs[existing], ...doc };
    } else {
      docs.push(doc);
    }
    await chrome.storage.session.set({ [key]: docs });
  }).catch(error => console.warn("Could not store captured document:", error));

  writeQueues.set(tabId, next);
  await next;
}

chrome.webRequest.onCompleted.addListener(
  details => {
    if (!details.url || details.tabId < 0) return;
    const type = getFileType(details.url);
    if (type) void storeDoc(details.tabId, details.url, type);
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (!details.url || details.tabId < 0) return;
    const headers = details.responseHeaders || [];
    const contentType = headers.find(h => h.name.toLowerCase() === "content-type");
    const disposition = headers.find(h => h.name.toLowerCase() === "content-disposition");

    let type = getTypeFromMime(contentType && contentType.value);
    let filename = null;

    if (disposition && disposition.value) {
      const match = disposition.value.match(/filename\*?\s*=\s*(?:UTF-8''|")?([^";]+)/i);
      if (match) {
        filename = safeDecode(match[1].trim().replace(/^["']|["']$/g, ""));
        const ext = filename.toLowerCase().split(".").pop();
        if (ext === "pdf") type = "pdf";
        else if (["ppt", "pptx", "pps", "ppsx", "pot", "potx", "odp"].includes(ext)) type = "ppt";
      }
    }

    if (type) void storeDoc(details.tabId, details.url, type, filename);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.storage.session.remove(STORAGE_PREFIX + tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_CAPTURED_PDFS") {
    const tabId = Number(msg.tabId);
    chrome.storage.session.get(STORAGE_PREFIX + tabId)
      .then(result => sendResponse({ pdfs: result[STORAGE_PREFIX + tabId] || [] }))
      .catch(error => sendResponse({ pdfs: [], error: error.message }));
    return true;
  }

  if (msg.action === "DOWNLOAD_PDF") {
    const { url, filename } = msg;
    chrome.downloads.download(
      { url, filename: filename || "document", saveAs: false, conflictAction: "uniquify" },
      downloadId => {
        const error = chrome.runtime.lastError;
        sendResponse(error
          ? { ok: false, error: error.message }
          : { ok: true, downloadId });
      }
    );
    return true;
  }

  if (msg.action === "DOWNLOAD_ALL") {
    const docs = Array.isArray(msg.pdfs) ? msg.pdfs : [];
    if (!docs.length) {
      sendResponse({ ok: true, count: 0, failed: 0 });
      return false;
    }

    let completed = 0;
    let failed = 0;

    docs.forEach(doc => {
      const safe = (doc.label || "document")
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 100);
      const filename = /\\.[a-z0-9]{2,5}$/i.test(safe)
        ? safe
        : safe + (doc.fileType === "ppt" ? ".pptx" : ".pdf");

      chrome.downloads.download(
        { url: doc.url, filename, saveAs: false, conflictAction: "uniquify" },
        () => {
          if (chrome.runtime.lastError) failed++;
          completed++;
          if (completed === docs.length) {
            sendResponse({ ok: failed === 0, count: completed - failed, failed });
          }
        }
      );
    });
    return true;
  }});
