**A note from the developer**

Hey my fellow warriors! 

TsushimaDocs is my first Chrome extension project, built as part of my learning journey.

If you have any questions, suggestions, or run into any issues, feel free to reach out to me on LinkedIn. I'd love to hear your feedback!

— Developer of TsushimaDocs

## Install in Chrome
1. Extract this ZIP to a normal folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted `uni-pdfdownloader-fixed` folder.
5. Open the university page, sign in, navigate to the page containing the documents, then click the extension.
6. Press **Rescan** after the page finishes loading if needed.

## What it detects
- Direct PDF and PowerPoint links.
- PDF/PPT resources visible in the page's Resource Timing entries.
- Common embedded viewers and document data attributes.
- Network responses identified by URL extension or response MIME/disposition headers.

## Important limitations
- A URL does not become downloadable merely because a page displays a document. Some portals use authenticated POST requests, short-lived signed URLs, encrypted API responses, or JavaScript-generated Blob URLs.
- Chrome's content script runs in an isolated world; it cannot inspect arbitrary JavaScript variables inside the page's main world.
- This extension does not bypass university authentication, access controls, DRM, or server-side restrictions.
- If the university uses a POST-based download endpoint or a Blob URL, the scanner may need a site-specific adapter. Share the university page URL (not your password/session cookie) and the relevant Network request details with secrets removed.

## Permissions
The extension currently requests broad host access (`<all_urls>`) because it is intended to scan arbitrary university domains. You can narrow `host_permissions` and `content_scripts.matches` to your university's domain after identifying it.
