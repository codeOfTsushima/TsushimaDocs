// content.js — DOM and resource scanner for PDF/PPT documents
(() => {
  if (window.__uniPdfDownloaderInjected) return;
  window.__uniPdfDownloaderInjected = true;

  const found = new Map();
  const base = document.baseURI || location.href;

  function normalize(value) {
    try {
      const url = new URL(value, base);
      if (!["http:", "https:", "blob:"].includes(url.protocol)) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function getFileType(value) {
    if (!value) return null;
    const url = normalize(value) || value;
    const lower = url.toLowerCase();

    if (
      /\.pdf(?:[?#]|$)/i.test(lower) ||
      /(?:filetype|type|format)=pdf/i.test(lower) ||
      /[?&](?:file|url|src|path)=[^&]*\.pdf/i.test(lower)
    ) return "pdf";

    if (
      /\.(?:pptx?|ppsx?|potx?|odp)(?:[?#]|$)/i.test(lower) ||
      /(?:filetype|type|format)=pptx?/i.test(lower)
    ) return "ppt";

    return null;
  }

  function labelFrom(element) {
    return (
      element?.getAttribute?.("download") ||
      element?.getAttribute?.("title") ||
      element?.getAttribute?.("aria-label") ||
      element?.textContent?.trim()?.slice(0, 100) ||
      null
    );
  }

  function add(value, label, source, forcedType) {
    const url = normalize(value);
    if (!url) return;

    const fileType = forcedType || getFileType(url);
    if (!fileType) return;

    if (!found.has(url)) {
      found.set(url, {
        url,
        label: label || (fileType === "ppt" ? "PowerPoint document" : "PDF document"),
        source,
        fileType
      });
    }
  }

  function scan() {
    // Links, including download links whose visible text is not a filename.
    document.querySelectorAll("a[href]").forEach(element => {
      const href = element.getAttribute("href");
      const type = getFileType(href);
      if (type) add(href, labelFrom(element), "link", type);
    });

    // Embedded documents.
    document.querySelectorAll("embed[src], object[data], iframe[src]").forEach(element => {
      const value = element.getAttribute("src") || element.getAttribute("data");
      const mime = (element.getAttribute("type") || "").toLowerCase();
      const type = mime.includes("pdf") ? "pdf"
        : (mime.includes("presentation") || mime.includes("powerpoint")) ? "ppt"
        : getFileType(value);

      if (type) add(value, labelFrom(element), element.tagName.toLowerCase(), type);

      // Common third-party viewer URL parameters.
      const viewerUrl = normalize(value);
      if (viewerUrl) {
        try {
          const parsed = new URL(viewerUrl);
          const inner = parsed.searchParams.get("url") ||
            parsed.searchParams.get("src") ||
            parsed.searchParams.get("file");
          const innerType = getFileType(inner);
          if (innerType) add(inner, "Document in viewer", "viewer", innerType);
        } catch {}
      }
    });

    // Resource Timing catches URLs requested after the initial page load.
    try {
      performance.getEntriesByType("resource").forEach(entry => {
        const type = getFileType(entry.name);
        if (type) add(entry.name, null, "network", type);
      });
    } catch {}

    // PDF.js exposes the source URL on many PDF.js-based viewers.
    try {
      const app = window.PDFViewerApplication;
      const pdfUrl = app?.url || app?.pdfDocument?.url;
      if (pdfUrl && pdfUrl !== "about:blank") {
        add(pdfUrl, document.title || "PDF document", "pdfjs", "pdf");
      }
    } catch {}

    // Common data attributes used by university portals.
    const attributes = [
      "data-src", "data-href", "data-url", "data-file",
      "data-pdf", "data-pdf-url", "data-document",
      "data-download", "data-presentation"
    ];
    document.querySelectorAll("*").forEach(element => {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        const type = getFileType(value);
        if (type) add(value, labelFrom(element), "data-attribute", type);
      }
    });

    return [...found.values()];
  }

  // Re-scan when a portal inserts document links asynchronously.
  let observerTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(scan, 250);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "src", "data-src", "data-url", "data-file"]
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "SCAN_PDFS") {
      sendResponse({ pdfs: scan() });
    }
  });
})();
