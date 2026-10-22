/**
 * Mê Truyện Hot (metruyenhotvn.com) — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, url, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách (1-based)
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]  (trang mục lục phụ ?page=N)
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var MTR_HOST = "https://metruyenhotvn.com";
var MTR_LIST_PATH = "/danh-sach/truyen-moi-cap-nhat/";

var MTR_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    aacute: "\u00e1", agrave: "\u00e0", acirc: "\u00e2", atilde: "\u00e3", auml: "\u00e4", aring: "\u00e5",
    eacute: "\u00e9", egrave: "\u00e8", ecirc: "\u00ea", euml: "\u00eb",
    iacute: "\u00ed", igrave: "\u00ec", icirc: "\u00ee", iuml: "\u00ef",
    oacute: "\u00f3", ograve: "\u00f2", ocirc: "\u00f4", otilde: "\u00f5", ouml: "\u00f6",
    uacute: "\u00fa", ugrave: "\u00f9", ucirc: "\u00fb", uuml: "\u00fc",
    yacute: "\u00fd", yuml: "\u00ff", eth: "\u0111", dstrok: "\u0111",
    Aacute: "\u00c1", Agrave: "\u00c0", Acirc: "\u00c2", Atilde: "\u00c3", Auml: "\u00c4", Aring: "\u00c5",
    Eacute: "\u00c9", Egrave: "\u00c8", Ecirc: "\u00ca", Euml: "\u00cb",
    Iacute: "\u00cd", Igrave: "\u00cc", Icirc: "\u00ce", Iuml: "\u00cf",
    Oacute: "\u00d3", Ograve: "\u00d2", Ocirc: "\u00d4", Otilde: "\u00d5", Ouml: "\u00d6",
    Uacute: "\u00da", Ugrave: "\u00d9", Ucirc: "\u00db", Uuml: "\u00dc",
    Yacute: "\u00dd", ETH: "\u00d0", Dstrok: "\u0110"
};

function mtrTrim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function mtrDecode(s) {
    var out = String(s == null ? "" : s);
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (all, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    });
    out = out.replace(/&#(\d+);/g, function (all, dec) {
        return String.fromCharCode(parseInt(dec, 10));
    });
    out = out.replace(/&([a-zA-Z]+);?/g, function (all, name) {
        var value = MTR_ENTITIES[name];
        return value == null ? all : value;
    });
    return out;
}

function mtrText(html) {
    var s = String(html == null ? "" : html);
    s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|li|h\d)>/gi, "\n");
    s = s.replace(/<[^>]+>/g, "");
    s = mtrDecode(s);
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/\n{3,}/g, "\n\n");
    return mtrTrim(s);
}

function mtrMatch(str, re) {
    var m = re.exec(String(str == null ? "" : str));
    return m && m.length > 1 ? mtrTrim(m[1]) : "";
}

function mtrAbsolute(url) {
    var u = mtrTrim(url);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return MTR_HOST + u;
    return MTR_HOST + "/" + u;
}

/** Số chương trong URL (/slug/chuong-123/). */
function mtrChapterNumber(url) {
    var m = /(?:chuong|chapter)-(\d+)/i.exec(String(url == null ? "" : url));
    return m ? parseInt(m[1], 10) : 0;
}

// ----------------------------------------------------------------------
// Nguồn + URL
// ----------------------------------------------------------------------

function getNovelSource() {
    return JSON.stringify({
        id: "metruyenhotvn",
        name: "Mê Truyện Hot",
        mode: "novel",
        faviconUrl: "https://www.google.com/s2/favicons?domain=metruyenhotvn.com&sz=64",
        baseUrl: MTR_HOST,
        url: MTR_HOST + MTR_LIST_PATH,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    var p = parseInt(page, 10);
    if (!p || p < 1) p = 1;
    return MTR_HOST + MTR_LIST_PATH + "?page=" + p;
}

function getNovelSearchRequest(query, page) {
    var q = mtrTrim(query);
    var p = parseInt(page, 10);
    if (!p || p < 1) p = 1;
    var url = MTR_HOST + "/tim-truyen?q=" + encodeURIComponent(q);
    if (p > 1) url += "&page=" + p;
    return JSON.stringify({ url: url, method: "GET", body: "", headers: {} });
}

function getNovelHeaders(url) {
    return JSON.stringify({
        Referer: MTR_HOST + "/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
    });
}

// ----------------------------------------------------------------------
// Danh sách truyện: 2 kiểu markup (lưới ở trang chủ/tìm kiếm, bảng ở trang danh sách)
// ----------------------------------------------------------------------

function mtrParseGrid(html, out, seen) {
    var parts = String(html).split('class="col-xs-4 col-md-2');
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf("<div class=rate>");
        if (cut > 0) chunk = chunk.substring(0, cut);
        if (chunk.length > 2400) chunk = chunk.substring(0, 2400);

        var href = mtrMatch(chunk, /href="([^"]+)"/);
        if (!href) continue;
        var link = mtrAbsolute(href);
        if (!link || seen[link]) continue;

        var title = mtrMatch(chunk, /<div class=name-book>([\s\S]*?)<\/div>/);
        if (!title) title = mtrMatch(chunk, /title="([^"]+)"/);
        if (!title) continue;

        seen[link] = 1;
        out.push({
            title: mtrText(title),
            link: link,
            coverUrl: mtrAbsolute(mtrMatch(chunk, /(?:data-src|src)="([^"]+)"/)),
            author: mtrText(mtrMatch(chunk, /itemprop=author[^>]*>([\s\S]*?)<\/(?:span|a)>/)),
            latestChapter: mtrText(mtrMatch(chunk, /class="chap pc">\s*<a[^>]*>([\s\S]*?)<\/a>/))
        });
    }
}

function mtrParseTable(html, out, seen) {
    var rows = String(html).split("<tr>");
    for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        if (row.indexOf("rv-home-a-title") < 0) continue;

        var h3 = mtrMatch(row, /<h3 class=rv-home-a-title>([\s\S]*?)<\/h3>/);
        if (!h3) continue;
        var link = mtrAbsolute(mtrMatch(h3, /href="([^"]+)"/));
        if (!link || seen[link]) continue;

        var title = mtrMatch(h3, /title="([^"]+)"/);
        if (!title) title = mtrText(h3);
        if (!title) continue;

        seen[link] = 1;
        out.push({
            title: mtrText(title),
            link: link,
            coverUrl: mtrAbsolute(mtrMatch(row, /data-src="([^"]+)"/)),
            author: mtrText(mtrMatch(row, /itemprop=author[^>]*>([\s\S]*?)<\/(?:span|a)>/)),
            latestChapter: mtrText(mtrMatch(row, /class="chap pc">\s*<a[^>]*>([\s\S]*?)<\/a>/))
        });
    }
}

function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    if (!html) return JSON.stringify(out);
    mtrParseGrid(String(html), out, seen);
    mtrParseTable(String(html), out, seen);
    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    var next = mtrMatch(String(html == null ? "" : html), /<li class="next"><a href="([^"]+)"/);
    if (next) return mtrAbsolute(next);
    return "";
}

// ----------------------------------------------------------------------
// Chi tiết truyện + mục lục
// ----------------------------------------------------------------------

function mtrParseChapters(html) {
    var result = [];
    var seen = {};
    var re = /<a[^>]+href="([^"]*\/chuong-\d+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var source = String(html == null ? "" : html);
    while ((m = re.exec(source)) !== null) {
        var link = mtrAbsolute(m[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var title = mtrText(m[2]);
        if (!title) title = "Chương " + mtrChapterNumber(link);
        result.push({ title: title, link: link });
    }
    result.sort(function (a, b) {
        return mtrChapterNumber(a.link) - mtrChapterNumber(b.link);
    });
    return result;
}

function parseNovelChapters(html) {
    var s = String(html == null ? "" : html);
    // Bỏ khối "Chương mới nhất" ở đầu trang để không lặp chương
    var start = s.indexOf("Danh s\u00e1ch ch\u01b0\u01a1ng");
    if (start >= 0) s = s.substring(start);
    return JSON.stringify(mtrParseChapters(s));
}

/** Số trang trong URL mục lục (?page=3). */
function mtrPageNumber(url) {
    var m = /[?&]page=(\d+)/.exec(String(url == null ? "" : url));
    return m ? parseInt(m[1], 10) : 0;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = mtrText(mtrMatch(s, /<h1 class=title>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/));
    if (!title) title = mtrText(mtrMatch(s, /<meta property="og:title" content="([^"]+)"/));

    var cover = mtrMatch(s, /<meta property="og:image"[^>]*content="([^"]+)"/);
    if (!cover) cover = mtrMatch(s, /class="row wrap-detail"[\s\S]*?data-src="([^"]+)"/);

    var author = mtrText(mtrMatch(s, /<span itemprop="author"[^>]*>([\s\S]*?)<\/span>/));
    if (!author) author = mtrText(mtrMatch(s, /itemprop=author[^>]*>([\s\S]*?)<\/(?:span|a)>/));

    var status = mtrText(mtrMatch(s, /<span class=status>([\s\S]*?)<\/span>/));

    var genres = [];
    var genreRe = /itemprop=genre[^>]*>([\s\S]*?)<\/(?:span|a)>/gi;
    var gm;
    while ((gm = genreRe.exec(s)) !== null) {
        var g = mtrText(gm[1]);
        if (g && genres.join("|").indexOf(g) < 0) genres.push(g);
    }

    // Mô tả: khối content1 (bỏ ô thông tin tác giả / thể loại / trạng thái)
    var description = "";
    var contentStart = s.indexOf("<div class=content1>");
    if (contentStart >= 0) {
        var contentEnd = s.indexOf('<div id=s_c_content', contentStart);
        if (contentEnd < 0) contentEnd = contentStart + 20000;
        var block = s.substring(contentStart, contentEnd);
        block = block.replace(/<div class=info>[\s\S]*?<\/div>/i, " ");
        description = mtrText(block);
        description = description.replace(/^Th\u00f4ng tin chi ti\u1ebft:\s*/i, "");
        description = description.replace(/\s*Ngu\u1ed3n:[\s\S]*$/, "");
    }

    // Mục lục: chỉ lấy phần sau tiêu đề "Danh sách chương" để tránh khối "Chương mới nhất"
    var listStart = s.indexOf("Danh s\u00e1ch ch\u01b0\u01a1ng");
    var chapterScope = listStart >= 0 ? s.substring(listStart) : s;
    var chapters = mtrParseChapters(chapterScope);

    // Các trang mục lục còn lại (?page=2#s_c_content …)
    var pages = [];
    var pageSeen = {};
    var pageRe = /<a[^>]+href="([^"]*\?page=\d+[^"]*)"/gi;
    var pm;
    while ((pm = pageRe.exec(s)) !== null) {
        var pageUrl = mtrAbsolute(pm[1]);
        var hash = pageUrl.indexOf("#");
        if (hash >= 0) pageUrl = pageUrl.substring(0, hash);
        if (!pageUrl || pageSeen[pageUrl]) continue;
        if (/[?&]page=1(&|$)/.test(pageUrl)) continue;
        pageSeen[pageUrl] = 1;
        pages.push(pageUrl);
    }
    pages.sort(function (a, b) {
        return mtrPageNumber(a) - mtrPageNumber(b);
    });

    return JSON.stringify({
        title: title,
        coverUrl: mtrAbsolute(cover),
        author: author,
        description: description,
        status: status,
        genres: genres.join(", "),
        chapters: chapters,
        chapterPages: pages
    });
}

// ----------------------------------------------------------------------
// Nội dung chương
// ----------------------------------------------------------------------

function mtrChapterNav(html, url) {
    var current = mtrChapterNumber(url);
    var prev = "";
    var next = "";
    var seen = {};
    var re = /<li class="detail-chapter-btn">\s*<a[^>]+href="([^"]+)"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var link = mtrAbsolute(m[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var num = mtrChapterNumber(link);
        if (!num || !current) {
            if (!prev) prev = link;
            else if (!next) next = link;
        } else if (num < current) {
            if (!prev || mtrChapterNumber(prev) < num) prev = link;
        } else if (num > current) {
            if (!next || mtrChapterNumber(next) > num) next = link;
        }
    }
    return { prev: prev, next: next };
}

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = mtrText(mtrMatch(s, /<span class="rv-chapt-title[^"]*">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/));
    if (!title) title = mtrText(mtrMatch(s, /<h1[^>]*>([\s\S]*?)<\/h1>/));

    var paragraphs = [];
    var re = /<p class=['"]watch-page-fiction-content['"]>([\s\S]*?)<\/p>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var text = mtrText(m[1]);
        if (text) paragraphs.push(text);
    }

    // Fallback: khối nội dung chính (một số chương cũ không gắn class cho <p>)
    if (paragraphs.length === 0) {
        var start = s.indexOf("chapter-c");
        if (start >= 0) {
            var block = s.substring(start, start + 200000);
            var end = block.indexOf("content-metruyenhot");
            if (end > 0) block = block.substring(0, end);
            var pre = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            var pm;
            while ((pm = pre.exec(block)) !== null) {
                var t = mtrText(pm[1]);
                if (t) paragraphs.push(t);
            }
        }
    }

    var nav = mtrChapterNav(s, url);
    return JSON.stringify({
        title: title,
        paragraphs: paragraphs,
        prevLink: nav.prev,
        nextLink: nav.next
    });
}
