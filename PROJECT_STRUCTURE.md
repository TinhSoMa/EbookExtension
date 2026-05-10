# WebToEpub Project Structure & Developer Guide

This document captures the project structure, core logic, and recent architectural changes for future reference.

## 1. Overview
WebToEpub is a browser extension (Chrome/Firefox) that converts web content into EPUB files. It follows a modular architecture centered around a `Parser` factory pattern.

## 2. Directory Structure

```
js/
├── ParserFactory.js       # Central registry for all site-specific parsers.
├── Parser.js              # Base class. Implements core fetching, cleaning, and image collection logic.
├── EpubItem.js            # Defines files inside the EPUB (chapters, images, TOC, etc.).
├── EpubPacker.js          # Assembles EPUB items into a ZIP file.
├── Download.js            # Handles browser-native download APIs.
├── ImageCollector.js      # Scans DOM for images, fetches them, and updates src attributes.
├── UserPreferences.js     # Manages persistent settings (localStorage).
├── ChapterUrlsUI.js       # Controls the chapter list table in popup.html.
├── UIText.js              # I18n string management.
├── Util.js                # DOM, URL, and String utilities.
└── parsers/               # Site-specific parser implementations (extends Parser).
    ├── DefaultParser.js   # Fallback parser using heuristics.
    └── ... (many others)
```

## 3. Core Workflows

### A. Initialization
1.  **`popup.html`** loads `js/main.js`.
2.  `main.js` initializes `UserPreferences`.
3.  User enters a URL.

### B. Parser Selection
1.  `ParserFactory.fetch(url)` iterates through registered rules.
2.  If a rule matches (by regex or hostname), the specific parser is instantiated.
3.  Otherwise, `DefaultParser` is used.

### C. Content Fetching & Processing (The "Pack EPUB" flow)
1.  **Start**: `fetchContentAndPackEpub` in `js/main.js`.
2.  **Fetch Loop**: `Parser.fetchWebPages()` iterates through selected chapters.
    -   **Concurrency**: Controlled by `maxSimultanousFetchSize` (user-configurable).
    -   **Images**: `ImageCollector` fetches images used in the chapter content.
    -   **Cleaning**: `Parser.removeUnwantedElementsFromContentElement` and other methods clean the DOM.
3.  **Packing**: `EpubPacker.assemble(...)` takes the processed content.
    -   Generates `content.opf`, `toc.ncx`.
    -   Zips content into `.epub` file.
4.  **Download**: `Download.save(...)` triggers the browser download.

## 4. Key Classes & Responsibilities

| Class | Responsibility | Key Methods |
| :--- | :--- | :--- |
| **`Parser`** | Base logic for all sites. | `fetchWebPages`, `fetchChapter`, `convertRawDomToContent` |
| **`ParserFactory`** | Router/Factory. | `registerRule`, `fetch`, `manuallySelectParser` |
| **`UserPreferences`** | Settings management. | `readFromLocalStorage`, `addPreference` |
| **`EpubPacker`** | EPUB generation. | `assemble`, `buildContentOpf` |
| **`ChapterUrlsUI`** | UI for chapter selection. | `populateChapterUrlsTable`, `showDownloadState` |

## 5. Recent Modifications (Simultaneous Downloads)

### Feature: Configurable Concurrency
-   **Goal**: Allow users to speed up downloads by fetching multiple chapters in parallel.
-   **Implementation**:
    -   **`UserPreferences.js`**: Added `maxSimultanousFetch` preference.
    -   **`popup.html`**: Added input field for `maxSimultanousFetch`.
    -   **`Parser.js`**: `onUserPreferencesUpdate` reads this value and sets `maxSimultanousFetchSize`.
    -   **Logic**: `Parser.fetchWebPages` uses `Promise.all` on chunks of size `maxSimultanousFetchSize`.

## 6. How to Extend
-   **New Site Support**: Create a new class in `js/parsers/` extending `Parser`. Implement `extractTitle`, `findContent`, `getChapterUrls`. Register in `ParserFactory.js`.
-   **New Setting**: Add to `UserPreferences.js`, add UI in `popup.html`, and hook up logic in relevant class.
