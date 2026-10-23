/*
 * Nguồn truyện chữ Zy Novel (zynovel.com) — chạy trong Rhino (ES5).
 *
 * Hợp đồng (tất cả trả JSON string):
 *  - getNovelSource()                       -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)                  -> string
 *  - getNovelSearchRequest(query, page)     -> { url, method, headers }
 *  - parseNovelList(html, url)              -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> string ("" = hết)
 *  - parseNovelDetail(html, url)            -> { title, coverUrl, author, description, status, genres, chapters, chapterPages }
 *  - parseNovelChapters(html)               -> [{ title, link, date }]
 *  - parseNovelChapter(html, url)           -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                   -> map header
 *  - getNovelCategories()                   -> [{ title, url }]
 *
 * Ghi chú: zynovel.com là SPA. Trang /novel/<slug> chỉ render tối đa 50 chương
 * trong HTML; danh sách đầy đủ lấy từ /api/chapter_list. Trang đọc chặn khách
 * ở chương >= 2 bằng JS, nhưng /api/chapter_read vẫn trả đủ nội dung, nên link
 * chương được trỏ thẳng vào API để đọc được đầy đủ.
 */

var ZN_BASE = "https://www.zynovel.com";
var ZN_SLUG = "";

function getNovelSource() {
    return JSON.stringify({
        id: "zynovel",
        name: "Zy Novel",
        faviconUrl: "https://www.google.com/s2/favicons?domain=zynovel.com&sz=64",
        baseUrl: ZN_BASE,
        searchable: true
    });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function znAbs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return ZN_BASE + u;
    return ZN_BASE + "/" + u;
}

function znJson(s) {
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
}

function znClean(s) {
    if (s == null) return "";
    s = String(s);
    s = s.replace(/<[^>]*>/g, " ");
    s = s.replace(/&nbsp;/gi, " ")
         .replace(/&amp;/gi, "&")
         .replace(/&quot;/gi, "\"")
         .replace(/&#0*39;|&apos;/gi, "'")
         .replace(/&lt;/gi, "<")
         .replace(/&gt;/gi, ">")
         .replace(/&hellip;/gi, "…")
         .replace(/&#8211;|&ndash;/gi, "–")
         .replace(/&#8212;|&mdash;/gi, "—");
    s = s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    return s;
}

function znSlugFromUrl(url) {
    var m = /\/novel\/([^\/?#]+)/.exec(String(url || ""));
    return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Bỏ dấu tiếng Việt trước khi gửi `q`. API tự bỏ dấu sai (tiên → tin,
 * kiếm → kim) nên phải chuyển sẵn sang ASCII để tìm đúng.
 */
function znNonAccent(s) {
    s = String(s == null ? "" : s).toLowerCase();
    s = s.replace(/[\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1ead\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5]/g, "a");
    s = s.replace(/[\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5]/g, "e");
    s = s.replace(/[\u00ec\u00ed\u1ecb\u1ec9\u0129]/g, "i");
    s = s.replace(/[\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed3\u1ed1\u1ed9\u1ed5\u1ed7\u01a1\u1edd\u1edb\u1ee3\u1edf\u1ee1]/g, "o");
    s = s.replace(/[\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1eeb\u1ee9\u1ef1\u1eed\u1eef]/g, "u");
    s = s.replace(/[\u1ef3\u00fd\u1ef5\u1ef7\u1ef9]/g, "y");
    s = s.replace(/\u0111/g, "d");
    s = s.replace(/[^a-z0-9 ]/g, " ");
    s = s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    return s;
}

function znSetPage(url, page) {
    var u = String(url || "");
    u = u.replace(/([?&])page=\d+(&|$)/, function (m, p1, p2) {
        return p2 ? p1 : "";
    });
    if (/[?&]$/.test(u)) u = u.slice(0, -1);
    var sep = u.indexOf("?") >= 0 ? "&" : "?";
    return u + sep + "page=" + page;
}

function znChapterApi(slug, no) {
    return ZN_BASE + "/api/chapter_read?novel_slug=" + encodeURIComponent(slug)
        + "&chapter_no=" + no + "&user_id=0&user_token=";
}

function znChapterListApi(slug, page) {
    return ZN_BASE + "/api/chapter_list?slug=" + encodeURIComponent(slug)
        + "&page=" + page + "&limit=100&sort=asc";
}

function znExploreApi(page, extra) {
    return ZN_BASE + "/api/explore?limit=24&page=" + page + "&sort=last_chapter" + (extra || "");
}

function znParseLd(html) {
    if (!html) return null;
    var re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var obj = znJson(m[1]);
        if (!obj) continue;
        var t = obj["@type"];
        var isBook = (t === "Book" || t === "CreativeWorkSeries" || t === "BookSeries");
        if (isBook) return obj;
        if (t && t.length && typeof t !== "string") {
            for (var i = 0; i < t.length; i++) {
                if (t[i] === "Book" || t[i] === "CreativeWorkSeries" || t[i] === "BookSeries") return obj;
            }
        }
    }
    return null;
}

function znBookImage(book) {
    if (!book || !book.image) return "";
    if (typeof book.image === "string") return znAbs(book.image);
    if (book.image.url) return znAbs(book.image.url);
    if (book.image["@id"]) return znAbs(book.image["@id"]);
    return "";
}

function znBookGenres(book) {
    if (!book || !book.genre) return "";
    var g = book.genre;
    if (typeof g === "string") return znClean(g);
    if (g.length) {
        var out = [];
        for (var i = 0; i < g.length; i++) {
            var v = znClean(g[i]);
            if (v) out.push(v);
        }
        return out.join(", ");
    }
    return "";
}

function znChapterNoFromText(text, href) {
    var s = String(text || "");
    var m = /ch[ưu][ơo]ng\s*(\d+)/i.exec(s);
    if (m) return parseInt(m[1], 10) || 0;
    m = /(?:^|\/)(\d+)\/?(?:[?#]|$)/.exec(String(href || ""));
    if (m) return parseInt(m[1], 10) || 0;
    return 0;
}

/**
 * HTML trang chi tiết in "Chương N: Chương N: Tên" (site lặp tiền tố).
 * Chuẩn hoá còn "Chương N: Tên".
 */
function znFixChapterTitle(title, no) {
    var t = znClean(title);
    if (!t) return no > 0 ? ("Chương " + no) : "";
    var m = /^(Chương\s*\d+)\s*:\s*/i.exec(t);
    if (!m) return t;
    var rest = t.slice(m[0].length);
    var m2 = /^Chương\s*\d+\s*:\s*/i.exec(rest);
    if (m2) rest = rest.slice(m2[0].length);
    return m[1] + ": " + rest;
}

function znTotalChapters(html) {
    var m = /id="nd_info_total"[^>]*>\s*([\d.,]+)\s*chương/i.exec(String(html || ""));
    if (!m) return 0;
    var s = m[1].replace(/[.,]/g, "");
    return parseInt(s, 10) || 0;
}

function znStatus(html) {
    var m = /id="nd_meta_row"[^>]*>([\s\S]*?)<\/div>/i.exec(String(html || ""));
    var block = m ? m[1] : "";
    if (/class="completed"/i.test(block)) return "Hoàn thành";
    if (/class="paused"/i.test(block)) return "Tạm dừng";
    if (/class="ongoing"/i.test(block)) return "Đang ra";
    return "";
}

function znGenresFromMeta(html) {
    var m = /id="nd_meta_row"[^>]*>([\s\S]*?)<\/div>/i.exec(String(html || ""));
    if (!m) return "";
    var block = m[1];
    var re = /<a[^>]*class="tag"[^>]*>([\s\S]*?)<\/a>/gi;
    var out = [];
    var x;
    while ((x = re.exec(block)) !== null) {
        var g = znClean(x[1]);
        if (g) out.push(g);
    }
    return out.join(", ");
}

function znSplitParagraphs(text) {
    var out = [];
    if (!text) return out;
    var blocks = String(text).split(/\n\s*\n/);
    for (var i = 0; i < blocks.length; i++) {
        var lines = blocks[i].split(/\n/);
        for (var j = 0; j < lines.length; j++) {
            var p = lines[j].replace(/^\s+|\s+$/g, "");
            if (p) out.push(p);
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Trang danh sách                                                     */
/* ------------------------------------------------------------------ */

function getNovelHomeUrl(page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page < 1) page = 1;
    return znExploreApi(page, "");
}

function getNovelSearchRequest(query, page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page < 1) page = 1;
    var q = znNonAccent(query);
    if (!q) q = String(query || "").replace(/^\s+|\s+$/g, "");
    var url = znExploreApi(page, "&q=" + encodeURIComponent(q));
    return JSON.stringify({
        url: url,
        method: "GET",
        headers: { "Accept": "application/json" }
    });
}

function parseNovelList(html, url) {
    var d = znJson(html);
    if (!d || !d.data) return JSON.stringify([]);
    var items = d.data.items || [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var n = items[i];
        if (!n || !n.slug) continue;
        var latest = "";
        var no = parseInt(n.last_chapter_number, 10) || 0;
        if (no > 0) latest = "Chương " + no;
        out.push({
            title: znClean(n.title || ""),
            link: ZN_BASE + "/novel/" + encodeURIComponent(n.slug),
            coverUrl: n.cover ? znAbs(n.cover) : "",
            author: znClean(n.author_name || ""),
            latestChapter: latest
        });
    }
    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    var d = znJson(html);
    if (!d || !d.data) return "";
    var cur = parseInt(d.data.page, 10) || parseInt(page, 10) || 1;
    var pages = parseInt(d.data.pages, 10) || 1;
    if (cur >= pages) return "";
    return znSetPage(currentUrl, cur + 1);
}

/* ------------------------------------------------------------------ */
/* Chi tiết truyện                                                     */
/* ------------------------------------------------------------------ */

function znSsrChapters(html, slug) {
    var out = [];
    if (!html) return out;
    var re = /<a[^>]*class="ch-row"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var title = znClean(m[2]);
        var no = znChapterNoFromText(title, href);
        var link = no > 0 ? znChapterApi(slug, no) : znAbs(href);
        if (!link) continue;
        title = znFixChapterTitle(title, no);
        if (!title) title = no > 0 ? ("Chương " + no) : link;
        out.push({ title: title, link: link, date: "", _no: no });
    }
    out.sort(function (a, b) {
        var x = a._no || 0, y = b._no || 0;
        if (x !== y) return x - y;
        return 0;
    });
    var clean = [];
    for (var i = 0; i < out.length; i++) {
        clean.push({ title: out[i].title, link: out[i].link, date: out[i].date });
    }
    return clean;
}

function parseNovelDetail(html, url) {
    if (!html) return "";
    var slug = znSlugFromUrl(url);
    ZN_SLUG = slug;

    var book = znParseLd(html);
    var title = book && book.name ? znClean(book.name) : "";
    if (!title) {
        var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        if (h1) title = znClean(h1[1]);
    }
    var cover = znBookImage(book);
    var author = "";
    if (book && book.author) {
        author = typeof book.author === "string" ? book.author : (book.author.name || "");
        author = znClean(author);
    }
    if (!author) {
        var ap = /<a[^>]*class="author-pill"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
        if (ap) author = znClean(ap[1]);
    }

    var description = book && book.description ? znClean(book.description) : "";
    var descHtml = /id="nd_desc"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (descHtml) {
        var d2 = znClean(descHtml[1]);
        if (d2.length > description.length) description = d2;
    }

    var genres = znBookGenres(book);
    var metaGenres = znGenresFromMeta(html);
    if (metaGenres) genres = metaGenres;
    var status = znStatus(html);

    var chapters = znSsrChapters(html, slug);

    var maxNo = 0;
    for (var i = 0; i < chapters.length; i++) {
        var no = znChapterNoFromText(chapters[i].title, chapters[i].link);
        if (no > maxNo) maxNo = no;
    }

    var total = znTotalChapters(html);
    var knownTotal = total > 0 ? total : maxNo;

    var chapterPages = [];
    if (slug && (!chapters.length || knownTotal > chapters.length)) {
        var pageCount = knownTotal > 0 ? Math.ceil(knownTotal / 100) : 1;
        if (pageCount < 1) pageCount = 1;
        if (pageCount > 40) pageCount = 40;
        for (var p = 1; p <= pageCount; p++) {
            chapterPages.push(znChapterListApi(slug, p));
        }
    }

    return JSON.stringify({
        title: title,
        coverUrl: cover,
        author: author,
        description: description,
        status: status,
        genres: genres,
        chapters: chapters,
        chapterPages: chapterPages
    });
}

function parseNovelChapters(html) {
    var d = znJson(html);
    if (!d || !d.data) return JSON.stringify([]);
    var items = d.data.items || [];
    var slug = ZN_SLUG;
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var c = items[i];
        if (!c) continue;
        var no = parseInt(c.chapter_number, 10) || 0;
        var link = "";
        if (slug && no > 0) link = znChapterApi(slug, no);
        else if (slug && c.slug) link = znAbs("/read/" + slug + "/" + c.slug);
        if (!link) continue;
        out.push({
            title: znClean(c.title || ("Chương " + no)),
            link: link,
            date: c.published_at ? String(c.published_at) : ""
        });
    }
    out.sort(function (a, b) {
        var x = znChapterNoFromText(a.title, a.link);
        var y = znChapterNoFromText(b.title, b.link);
        return x - y;
    });
    return JSON.stringify(out);
}

/* ------------------------------------------------------------------ */
/* Trang đọc chương                                                    */
/* ------------------------------------------------------------------ */

function parseNovelChapter(html, url) {
    var d = znJson(html);
    if (!d || !d.data) return "";
    var ch = d.data.chapter || {};
    var nov = d.data.novel || {};
    var nav = d.data.nav || {};
    var slug = nov.slug ? String(nov.slug) : ZN_SLUG;

    var content = ch.content ? String(ch.content) : "";
    var paragraphs = znSplitParagraphs(content);

    if (!paragraphs.length) {
        if (parseInt(ch.is_locked, 10)) {
            paragraphs.push("Chương này đang bị khoá. Vui lòng mở khoá trên zynovel.com để đọc.");
        } else {
            return "";
        }
    }

    var prevLink = "";
    if (nav.prev && nav.prev.chapter_number && slug) {
        prevLink = znChapterApi(slug, parseInt(nav.prev.chapter_number, 10));
    }
    var nextLink = "";
    if (nav.next && nav.next.chapter_number && slug) {
        nextLink = znChapterApi(slug, parseInt(nav.next.chapter_number, 10));
    }

    return JSON.stringify({
        title: znClean(ch.title || ""),
        paragraphs: paragraphs,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getNovelHeaders(url) {
    return JSON.stringify({
        "Referer": ZN_BASE + "/",
        "Accept": "application/json, text/html;q=0.9, */*;q=0.8"
    });
}

function getNovelCategories() {
    return JSON.stringify([
        { title: "Tiên Hiệp", url: znExploreApi(1, "&genre=tien-hiep") },
        { title: "Huyền Huyễn", url: znExploreApi(1, "&genre=huyen-huyen") },
        { title: "Đô Thị", url: znExploreApi(1, "&genre=do-thi") },
        { title: "Ngôn Tình", url: znExploreApi(1, "&genre=ngon-tinh") },
        { title: "Khoa Huyễn", url: znExploreApi(1, "&genre=khoa-huyen") },
        { title: "Cổ Đại", url: znExploreApi(1, "&genre=co-dai") },
        { title: "Lịch Sử", url: znExploreApi(1, "&genre=lich-su") },
        { title: "Trò Chơi", url: znExploreApi(1, "&genre=tro-choi") },
        { title: "Kiếm Hiệp", url: znExploreApi(1, "&genre=kiem-hiep") },
        { title: "Đam Mỹ", url: znExploreApi(1, "&genre=dam-my") },
        { title: "Hệ Thống", url: znExploreApi(1, "&genre=he-thong") },
        { title: "Trinh Thám", url: znExploreApi(1, "&genre=trinh-tham") },
        { title: "Hiện Đại", url: znExploreApi(1, "&genre=hien-dai") },
        { title: "Thanh Xuân", url: znExploreApi(1, "&genre=thanh-xuan") },
        { title: "Bách Hợp", url: znExploreApi(1, "&genre=bach-hop") },
        { title: "Kỳ Huyễn", url: znExploreApi(1, "&genre=ky-huyen") },
        { title: "Xuyên Không", url: znExploreApi(1, "&genre=xuyen-khong") },
        { title: "Trọng Sinh", url: znExploreApi(1, "&genre=trong-sinh") },
        { title: "Mạt Thế", url: znExploreApi(1, "&genre=mat-the") },
        { title: "Kinh Dị", url: znExploreApi(1, "&genre=kinh-di") },
        { title: "Linh Dị", url: znExploreApi(1, "&genre=linh-di") }
    ]);
}
