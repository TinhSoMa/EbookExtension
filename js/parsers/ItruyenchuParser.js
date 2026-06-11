"use strict";

parserFactory.register("itruyenchu.org", () => new ItruyenchuParser());

class ItruyenchuParser extends Parser {
    constructor() {
        super();
        this.bookJsonLd = null;
        this.accessToken = null;
    }

    async onLoadFirstPage(url, dom) {
        this.captureAccessToken(dom);
        return super.onLoadFirstPage(url, dom);
    }

    async getChapterUrls(dom) {
        let payload = this.extractEmbeddedPayload(dom);
        if (payload && payload.chapters && payload.chapters.length > 0) {
            let bookSlug = payload.bookSlug || this.extractBookSlugFromUrl(dom.baseURI);
            let chapters = payload.chapters
                .filter(c => c && c.chapterNumber != null)
                .sort((a, b) => a.chapterNumber - b.chapterNumber)
                .map(c => this.buildChapterUrlEntry(bookSlug, c));
            return chapters;
        }

        // Fallback: best-effort extraction from visible links
        let links = [...dom.querySelectorAll("a[href*='/chuong-']")];
        if (links.length > 0) {
            return links.map(link => util.hyperLinkToChapter(link));
        }

        return [];
    }

    findContent(dom) {
        return dom.querySelector("div.content");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h2.chapter-title");
    }

    extractTitleImpl(dom) {
        let book = this.getBookJsonLd(dom);
        if (book && book.name) {
            return book.name;
        }
        let title = dom.querySelector("h1");
        return title?.textContent ?? super.extractTitleImpl(dom);
    }

    extractAuthor(dom) {
        let book = this.getBookJsonLd(dom);
        if (book && book.author && book.author.name) {
            return book.author.name;
        }
        let authorMeta = dom.querySelector("meta[name='author']");
        return authorMeta?.getAttribute("content") ?? super.extractAuthor(dom);
    }

    extractDescription(dom) {
        let book = this.getBookJsonLd(dom);
        if (book && book.description) {
            return book.description;
        }
        let descriptionMeta = dom.querySelector("meta[name='description']");
        return descriptionMeta?.getAttribute("content") ?? super.extractDescription(dom);
    }

    extractSubject(dom) {
        let book = this.getBookJsonLd(dom);
        if (book && book.genre) {
            if (Array.isArray(book.genre)) {
                return book.genre.join(", ");
            }
            if (typeof book.genre === "string") {
                return book.genre;
            }
        }
        return super.extractSubject(dom);
    }

    findCoverImageUrl(dom) {
        let book = this.getBookJsonLd(dom);
        if (book && book.image) {
            return book.image;
        }
        let ogImage = dom.querySelector("meta[property='og:image']");
        if (ogImage) {
            return ogImage.getAttribute("content");
        }
        return super.findCoverImageUrl(dom);
    }

    extractEmbeddedPayload(dom) {
        let scripts = [...dom.querySelectorAll("script")];
        for (let script of scripts) {
            let text = script.textContent;
            if (!text || text.indexOf("\"chapters\"") === -1) {
                continue;
            }
            let chapters = util.locateAndExtractJson(text, "\"chapters\"");
            if (!Array.isArray(chapters) || chapters.length === 0) {
                continue;
            }
            let bookSlug = this.extractBookSlug(text);
            return { chapters, bookSlug };
        }
        return null;
    }

    extractBookSlug(text) {
        let match = text.match(/"bookSlug"\s*:\s*"([^"]+)"/);
        return match ? match[1] : null;
    }

    extractBookSlugFromUrl(url) {
        let match = url.match(/\/truyen\/([^/]+)/);
        return match ? match[1] : null;
    }

    extractChapterNumberFromUrl(url) {
        let match = url.match(/\/chuong-(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    captureAccessToken(dom) {
        let authStorage = dom?._authStorage;
        if (!authStorage) {
            return;
        }
        try {
            let parsed = JSON.parse(authStorage);
            let token = parsed?.state?.accessToken;
            if (token) {
                this.accessToken = token;
            }
        } catch (error) {
            // Ignore invalid storage payloads
        }
    }

    async fetchChapter(url) {
        let bookSlug = this.extractBookSlugFromUrl(url);
        let chapterNumber = this.extractChapterNumberFromUrl(url);
        if (this.accessToken && bookSlug && (chapterNumber != null)) {
            try {
                let apiUrl = `https://api.ngoctieucac.link/chapters/${bookSlug}/content/${chapterNumber}?platform=web`;
                let response = await fetch(apiUrl, {
                    credentials: "include",
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`
                    }
                });
                if (response.ok) {
                    let payload = await response.json();
                    if (typeof payload?.content === "string" && payload.content.startsWith("http")) {
                        let contentText = await this.fetchAndDecompressContent(payload.content);
                        if (!util.isNullOrEmpty(contentText)) {
                            return this.buildDomFromText(url, contentText);
                        }
                    }
                }
            } catch (error) {
                // Fall back to HTML fetch
            }
        }
        return super.fetchChapter(url);
    }

    async fetchAndDecompressContent(contentUrl) {
        let response = await fetch(contentUrl);
        if (!response.ok) {
            return null;
        }
        let buffer = await response.arrayBuffer();
        let bytes = new Uint8Array(buffer);
        if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
            if ("DecompressionStream" in window) {
                let stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
                return new Response(stream).text();
            }
            return null;
        }
        return new TextDecoder().decode(bytes);
    }

    buildDomFromText(url, contentText) {
        let dom = document.implementation.createHTMLDocument("");
        util.setBaseTag(url, dom);
        let content = dom.createElement("div");
        content.className = "content";
        dom.body.appendChild(content);
        Parser.addTextToChapterContent({ dom, content }, contentText);
        return dom;
    }

    buildChapterUrlEntry(bookSlug, chapter) {
        let chapterNumber = chapter.chapterNumber;
        let title = chapter.title || "";
        let displayTitle = this.normalizeChapterTitle(title, chapterNumber);
        return {
            sourceUrl: this.buildChapterUrl(bookSlug, chapterNumber),
            title: displayTitle,
            isIncludeable: true
        };
    }

    buildChapterUrl(bookSlug, chapterNumber) {
        if (bookSlug == null || chapterNumber == null) {
            return null;
        }
        return `https://itruyenchu.org/truyen/${bookSlug}/chuong-${chapterNumber}`;
    }

    normalizeChapterTitle(title, chapterNumber) {
        if (!title) {
            return `Chuong ${chapterNumber}`;
        }
        let lower = title.toLowerCase();
        let chapterNum = String(chapterNumber);
        if (lower.includes("chuong") || lower.includes("chapter") || title.includes(chapterNum)) {
            return title;
        }
        return `Chuong ${chapterNumber}: ${title}`;
    }

    getBookJsonLd(dom) {
        if (this.bookJsonLd) {
            return this.bookJsonLd;
        }
        let scripts = [...dom.querySelectorAll("script[type='application/ld+json']")];
        for (let script of scripts) {
            try {
                let data = JSON.parse(script.textContent);
                if (Array.isArray(data)) {
                    let book = data.find(item => item && item["@type"] === "Book");
                    if (book) {
                        this.bookJsonLd = book;
                        return book;
                    }
                } else if (data && data["@type"] === "Book") {
                    this.bookJsonLd = data;
                    return data;
                }
            } catch (error) {
                // Ignore parse errors and continue
            }
        }
        return null;
    }
}
