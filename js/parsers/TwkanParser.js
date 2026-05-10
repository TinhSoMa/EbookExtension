"use strict";

parserFactory.register("twkan.com", () => new TwkanParser());

class TwkanParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocDom = dom;
        let tocUrl = this.findTocUrl(dom);
        if ((tocUrl !== null) && !TwkanParser.isTocPath(new URL(dom.baseURI).pathname)) {
            tocDom = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        }

        let chapters = util.hyperlinksToChapterList(tocDom, TwkanParser.isChapterLink);
        let bookId = TwkanParser.bookIdFromUrl(tocUrl ?? tocDom.baseURI);
        if (bookId !== null) {
            chapters = chapters.filter(c => TwkanParser.isChapterUrlForBook(c.sourceUrl, bookId));
        }
        return chapters;
    }

    findTocUrl(dom) {
        let currentUrl = new URL(dom.baseURI);
        if (TwkanParser.isTocPath(currentUrl.pathname)) {
            return currentUrl.href;
        }

        let tocLink = [...dom.querySelectorAll("a[href]")].find(a => {
            try {
                return TwkanParser.isTocPath(new URL(a.href, dom.baseURI).pathname);
            } catch (e) {
                return false;
            }
        });
        if (tocLink !== undefined) {
            return tocLink.href;
        }

        return this.tocUrlFromChapterUrl(currentUrl);
    }

    tocUrlFromChapterUrl(currentUrl) {
        let match = currentUrl.pathname.match(/^\/txt\/(\d+)\/\d+\/?$/);
        if (match === null) {
            return null;
        }
        return currentUrl.origin + "/book/" + match[1] + "/index.html";
    }

    static isChapterLink(link) {
        try {
            return TwkanParser.isChapterPath(new URL(link.href).pathname);
        } catch (e) {
            return false;
        }
    }

    static isChapterPath(pathName) {
        return /^\/txt\/\d+\/\d+\/?$/.test(pathName);
    }

    static isChapterUrlForBook(url, bookId) {
        let pathName = new URL(url).pathname;
        let match = pathName.match(/^\/txt\/(\d+)\/\d+\/?$/);
        return (match !== null) && (match[1] === bookId);
    }

    static bookIdFromUrl(url) {
        let pathName = new URL(url).pathname;
        let tocMatch = pathName.match(/^\/book\/(\d+)\/index\.html$/);
        if (tocMatch !== null) {
            return tocMatch[1];
        }

        let chapterMatch = pathName.match(/^\/txt\/(\d+)\/\d+\/?$/);
        return (chapterMatch === null) ? null : chapterMatch[1];
    }

    static isTocPath(pathName) {
        return /^\/book\/\d+\/index\.html$/.test(pathName);
    }

    findContent(dom) {
        return dom.querySelector("#txtcontent0")
            ?? dom.querySelector("div[id^='txtcontent']");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".txtnav h1");
    }

    extractTitleImpl(dom) {
        let storyTitle = dom.querySelector(".bread a[href*='/book/'][href*='/index.html']");
        if (storyTitle !== null) {
            return storyTitle;
        }

        let title = dom.querySelector("meta[property='og:title']");
        return (title === null) ? Parser.extractTitleDefault(dom) : title.getAttribute("content");
    }

    extractAuthor(dom) {
        let authorTag = [...dom.querySelectorAll(".txtinfo span, .txtinfo, .book-info span, .book-info p")]
            .find(e => e.textContent.includes("作者"));
        if (authorTag !== undefined) {
            return authorTag.textContent.replace(/^\s*作者\s*[：:]\s*/u, "").trim();
        }

        let authorMeta = dom.querySelector("meta[name='author']");
        if (authorMeta !== null) {
            return authorMeta.getAttribute("content");
        }

        return super.extractAuthor(dom);
    }

    extractLanguage() {
        return "zh";
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(
            element,
            ".txtad, .txtcenter, .txtcenter1, .bottom-ad, .sharethis-inline-share-buttons, .top_Scroll, .page1, .baocuo"
        );
        super.removeUnwantedElementsFromContentElement(element);
    }
}