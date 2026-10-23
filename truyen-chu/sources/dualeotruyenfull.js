/*
 * Dưa Leo Truyện Full (dualeotruyenfull.net) — nguồn truyện chữ 18+, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *  - getNovelCategories()                -> [{ title, url }]
 *
 * Lưu ý của site (WordPress + theme init-manga, KHÔNG có Cloudflare):
 *  - Truyện: /doc-truyen/<slug>/; chương: /doc-truyen/<slug>/chuong-<n>/ (một số
 *    truyện dùng slug chương riêng: chuong-ngoai-truyen-3-..., chuong-tg3-...).
 *  - Danh sách: /doc-truyen/ (24 truyện/trang), trang kế tiếp /doc-truyen/page/<n>/.
 *    Thể loại: /the-loai/<slug>/ (cũng 24/trang, /page/<n>/).
 *  - Tìm kiếm: /?s=<q> (dấu cách để nguyên %20). Không có post_type — site tìm
 *    trong toàn bộ bài viết, trả về <article> kết quả; phân trang /page/<n>/?s=...
 *  - Trang truyện: h1#manga-title (data-id = manga_id), bìa .story-cover img,
 *    tác giả trong .manga-info-details (link /tac-gia/), trạng thái #manga-status,
 *    thể loại trong #genre-tags, mô tả #manga-description.
 *  - Mục lục trang truyện chỉ có 24 chương MỚI NHẤT; phần còn lại nằm ở
 *    /doc-truyen/<slug>/chuong/page/<n>/ (cũng 24 chương/trang, mới nhất trước).
 *    Số chương lấy từ header (icon file-text cạnh "Chương") → chapterPages =
 *    page 2..ceil(count/24), tối đa 40 trang (app tự cắt).
 *  - REST /wp-json/initmanga/v1/chapters trả JSON nhưng KHÔNG có URL chương,
 *    nên dùng trang HTML để parse link tuyệt đối.
 *  - Trang chương: h1.uk-h2, nội dung div#chapter-content (các <p>), điều hướng
 *    a#prev-link / a#next-link (chương đầu/cuối thiếu một bên).
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var DL_HOST = "https://dualeotruyenfull.net";
var DL_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var DL_LIST = DL_HOST + "/doc-truyen/";
var DL_PAGE_SIZE = 24;
var DL_EMPTY_NOTICE = "Không tải được nội dung chương này từ Dưa Leo Truyện Full. Thử lại sau hoặc đọc trên website.";

/* ---------- Helpers ---------- */

var DL_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
    bull: "\u2022", middot: "\u00b7", times: "\u00d7",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122",
    aacute: "\u00e1", agrave: "\u00e0", acirc: "\u00e2", atilde: "\u00e3",
    eacute: "\u00e9", egrave: "\u00e8", ecirc: "\u00ea",
    iacute: "\u00ed", igrave: "\u00ec",
    oacute: "\u00f3", ograve: "\u00f2", ocirc: "\u00f4", otilde: "\u00f5",
    uacute: "\u00fa", ugrave: "\u00f9",
    yacute: "\u00fd",
    Aacute: "\u00c1", Agrave: "\u00c0", Acirc: "\u00c2", Atilde: "\u00c3",
    Eacute: "\u00c9", Egrave: "\u00c8", Ecirc: "\u00ca",
    Iacute: "\u00cd", Oacute: "\u00d3", Ocirc: "\u00d4", Otilde: "\u00d5",
    Uacute: "\u00da", Yacute: "\u00dd"
};

function DL_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function DL_decode(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return DL_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return DL_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (all, name) {
            return DL_ENTITIES.hasOwnProperty(name) ? DL_ENTITIES[name] : all;
        });
    }
    return out;
}

function DL_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function DL_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = DL_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return DL_trim(s);
}

function DL_abs(u) {
    u = DL_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return DL_HOST + u;
    return DL_HOST + "/" + u;
}

function DL_attr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return m[2] != null ? m[2] : m[3];
}

function DL_img(chunk) {
    var m = /<img\b[^>]*>/i.exec(String(chunk == null ? "" : chunk));
    if (!m) return null;
    var data = DL_attr(m[0], "data-src");
    var src = DL_attr(m[0], "src");
    var u = data || src;
    if (!u) return null;
    if (u.indexOf("data:image") === 0) return null;
    return DL_abs(u);
}

function DL_storyBlock(s, startMarker, endMarker, max) {
    var i = s.indexOf(startMarker);
    if (i < 0) return "";
    var j = s.indexOf(endMarker, i + startMarker.length);
    return s.substring(i, j > i ? j : i + (max || 4000));
}

/* Tiêu đề mục lục dạng "<Tên truyện> […] – Chương N: ..." → bỏ phần tên truyện. */
function DL_cleanChapterTitle(t) {
    var s = DL_text(t);
    var i = s.indexOf(" \u2013 ");
    if (i > 0) {
        var tail = s.substring(i + 3);
        if (/^(Ch\u01b0\u01a1ng|Quy\u1ec3n|Ngo\u1ea1i truy\u1ec7n|Phi\u00ean ngo\u1ea1i)\b/i.test(tail)) s = tail;
    }
    return DL_trim(s);
}

/* Số chương lấy từ khối "Chương" cạnh h1 (icon file-text). */
function DL_chapterCount(s) {
    var m = /icon:\s*file-text[^>]*>\s*<\/span>\s*([\d.,]+)/i.exec(s);
    if (!m) return 0;
    var n = parseInt(String(m[1]).replace(/[^\d]/g, ""), 10);
    return isNaN(n) ? 0 : n;
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "dualeotruyenfull",
        name: "Dưa Leo Truyện Full",
        faviconUrl: "https://www.google.com/s2/favicons?domain=dualeotruyenfull.net&sz=64",
        baseUrl: DL_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 2) return DL_LIST;
    return DL_LIST + "page/" + p + "/";
}

function getNovelSearchRequest(query, page) {
    var q = DL_trim(query);
    var url = DL_HOST + "/?s=" + encodeURIComponent(q);
    var p = parseInt(page, 10);
    if (!isNaN(p) && p > 1) url += "&paged=" + p;
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": DL_UA,
            "Referer": DL_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
        }
    });
}

/* ---------- List ---------- */

/* Trang tìm kiếm: mỗi kết quả là <article> có h2 > a + ảnh bìa. */
function DL_parseSearchResults(s) {
    var out = [];
    var seen = {};
    var parts = String(s).split(/<article\b[^>]*class="uk-grid-small uk-margin-bottom/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var h2 = /<h2\b[^>]*>([\s\S]{0,800}?)<\/h2>/i.exec(chunk);
        var a = h2 ? /<a\b[^>]*href="([^"]*\/doc-truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(h2[1]) : null;
        if (!a) continue;
        var link = DL_abs(a[1]);
        if (!link || seen[link]) continue;
        var title = DL_text(a[2]);
        if (!title) title = DL_decode(DL_attr(a[0], "title"));
        if (!title) continue;
        seen[link] = 1;

        var cover = null;
        var ci = chunk.indexOf("<img");
        if (ci >= 0) cover = DL_img(chunk.substring(ci, ci + 900));

        var author = null;
        var au = /<a\b[^>]*href="[^"]*\/author\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (au) author = DL_text(au[1]) || null;

        out.push({
            title: title,
            link: link,
            coverUrl: cover,
            author: author,
            latestChapter: null
        });
    }
    return out;
}

/* Trang archive/thể loại: thẻ lưới div.manga-item-grid. */
function DL_parseCards(s) {
    var out = [];
    var seen = {};
    var parts = String(s).split(/<div\b[^>]*class="manga-item-grid"/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var h2 = /<h2\b[^>]*>([\s\S]{0,800}?)<\/h2>/i.exec(chunk);
        var a = h2 ? /<a\b[^>]*href="([^"]*\/doc-truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(h2[1]) : null;
        if (!a) continue;
        var link = DL_abs(a[1]);
        if (!link || seen[link]) continue;
        var title = DL_text(a[2]);
        if (!title) title = DL_decode(DL_attr(a[0], "title"));
        if (!title) continue;
        seen[link] = 1;

        var ci = chunk.indexOf("<img");
        var cover = ci >= 0 ? DL_img(chunk.substring(ci, ci + 900)) : null;

        var latest = null;
        var lc = /<a\b[^>]*href="([^"]*\/chuong-[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (lc) {
            /* Trong thẻ có cả thời gian ("6 tháng"), chỉ lấy span tên chương. */
            var lp = /<span\b[^>]*class="[^"]*uk-text-truncate[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(lc[2]);
            var lt = DL_text(lp ? lp[1] : lc[2]);
            if (lt) latest = lt;
        }

        out.push({
            title: title,
            link: link,
            coverUrl: cover,
            author: null,
            latestChapter: latest
        });
    }
    return out;
}

function parseNovelList(html, url) {
    var s = String(html == null ? "" : html);
    var cur = String(url == null ? "" : url);
    if (cur.indexOf("?s=") >= 0 || cur.indexOf("/search/") >= 0) {
        return JSON.stringify(DL_parseSearchResults(s));
    }
    return JSON.stringify(DL_parseCards(s));
}

function getNovelNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 1) p = 1;

    var best = "";
    var bestNum = 9999999;
    var re = /<a\b[^>]*href="([^"]*\/page\/(\d+)\/?[^"]*)"[^>]*>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > p && num < bestNum) {
            bestNum = num;
            best = DL_abs(m[1]);
        }
    }
    return best;
}

/* ---------- Detail ---------- */

function DL_readChapters(s) {
    var i = s.indexOf("class=\"chapter-list");
    if (i < 0) return [];
    var region = s.substring(i, i + 700000);

    var out = [];
    var seen = {};
    var parts = region.split(/<div\b[^>]*class="chapter-item"/i);

    for (var k = 1; k < parts.length; k++) {
        var chunk = parts[k];
        var a = /<a\b[^>]*href="([^"]*\/chuong-[^"]*)"[^>]*>/i.exec(chunk);
        if (!a) continue;
        var link = DL_abs(a[1]);
        if (!link || seen[link]) continue;
        var h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
        var title = h3 ? DL_cleanChapterTitle(h3[1]) : "";
        if (!title) title = DL_decode(DL_attr(a[0], "title"));
        if (!title) continue;
        seen[link] = 1;
        out.push({ title: title, link: link });
    }
    return out;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var h = /<h1\b[^>]*id="manga-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (h) title = DL_text(h[1]);
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = DL_decode(og[1]).replace(/^Đọc Truyện\s+/i, "").replace(/\s*\[Chương[^\]]*\]$/, "");
    }

    var coverUrl = null;
    var cb = DL_storyBlock(s, "class=\"story-cover", "</a>", 1500);
    if (cb) coverUrl = DL_img(cb);
    if (!coverUrl) {
        var ogi = /<meta\b[^>]*property="og:image"[^>]*content="([^"]*)"/i.exec(s);
        if (ogi) coverUrl = DL_abs(ogi[1]);
    }

    var author = "";
    var ab = DL_storyBlock(s, "class=\"manga-info-details", "</div>", 2500);
    if (ab) {
        var au = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(ab);
        if (au) author = DL_text(au[1]);
    }

    var status = "";
    var st = /<span\b[^>]*id="manga-status"[^>]*>([\s\S]*?)<\/span>/i.exec(s);
    if (st) status = DL_text(st[1]);

    var genres = [];
    var gseen = {};
    var gb = DL_storyBlock(s, "id=\"genre-tags\"", "</div>", 6000);
    if (gb) {
        var gre = /<a\b[^>]*href="[^"]*\/the-loai\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var gm;
        while ((gm = gre.exec(gb)) !== null) {
            var g = DL_text(gm[1]);
            if (!g || gseen[g]) continue;
            gseen[g] = 1;
            genres.push(g);
        }
    }

    var description = "";
    var db = DL_storyBlock(s, "id=\"manga-description\"", "</div>", 60000);
    if (db) {
        var paras = [];
        var pre = db.split(/<p\b[^>]*>/i);
        for (var i = 1; i < pre.length; i++) {
            var stop = pre[i].indexOf("</p>");
            var line = DL_text(stop >= 0 ? pre[i].substring(0, stop) : pre[i]);
            line = line.replace(/\*\*/g, "");
            if (line) paras.push(line);
        }
        description = paras.join("\n\n");
    }

    var chapters = DL_readChapters(s);

    /* Mục lục đầy đủ: trang truyện chỉ có 24 chương mới nhất; các trang sau
     * /doc-truyen/<slug>/chuong/page/<n>/ (mới nhất trước, 24 chương/trang). */
    var chapterPages = [];
    var count = DL_chapterCount(s);
    var pages = count > 0 ? Math.ceil(count / DL_PAGE_SIZE) : 0;

    /* Fallback: số trang lớn nhất thấy trong phân trang mục lục (site hiển thị
     * trang đầu/cuối dù danh sách có bị rút gọn). */
    var maxSeen = 0;
    var pre2 = /\/chuong\/page\/(\d+)\//g;
    var pm;
    while ((pm = pre2.exec(s)) !== null) {
        var v = parseInt(pm[1], 10);
        if (!isNaN(v) && v > maxSeen) maxSeen = v;
    }
    if (maxSeen > pages) pages = maxSeen;

    var base = DL_trim(String(url == null ? "" : url)).replace(/[?#].*$/, "");
    if (base.charAt(base.length - 1) !== "/") base += "/";
    if (pages > 1) {
        var cap = Math.min(pages, 40);
        for (var n = 2; n <= cap; n++) {
            chapterPages.push(base + "chuong/page/" + n + "/");
        }
    }

    chapters.sort(function (a, b) {
        return DL_chapterNo(a.link) - DL_chapterNo(b.link);
    });

    return JSON.stringify({
        title: title,
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters,
        chapterPages: chapterPages
    });
}

function parseNovelChapters(html) {
    var list = DL_readChapters(String(html == null ? "" : html));
    list.sort(function (a, b) {
        return DL_chapterNo(a.link) - DL_chapterNo(b.link);
    });
    return JSON.stringify(list);
}

function DL_chapterNo(u) {
    var s = String(u == null ? "" : u);
    var m = /chuong-(\d+)/i.exec(s);
    if (m) return parseInt(m[1], 10);
    var t = /\/(?:phien-ngoai|ngoai-truyen|chuong-tg\d*)[^\/]*?-?(\d+)/i.exec(s);
    if (t) return 900000 + parseInt(t[1], 10);
    return 9999999;
}

/* ---------- Chapter ---------- */

function DL_nav(s, id) {
    var m = new RegExp("<a\\b[^>]*id=\"" + id + "\"[^>]*href=\"([^\"]+)\"", "i").exec(String(s));
    if (!m) {
        m = new RegExp("<a\\b[^>]*href=\"([^\"]+)\"[^>]*id=\"" + id + "\"", "i").exec(String(s));
    }
    if (!m) return "";
    var href = DL_trim(m[1]);
    if (!href || href === "#") return "";
    return DL_abs(href);
}

function DL_isJunk(line) {
    var s = DL_trim(line);
    if (!s) return true;
    if (s.indexOf("Gợi ý cá nhân hóa") === 0) return true;
    if (s.indexOf("Bạn đang đọc truyện") === 0) return true;
    if (s.indexOf("Đọc truyện tại") === 0) return true;
    return false;
}

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var h = /<h1\b[^>]*class="[^"]*uk-h2[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (h) title = DL_text(h[1]);
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = DL_decode(og[1]).replace(/\s*\u2013\s*D\u01b0a Leo Truy\u1ec7n Full$/, "");
    }

    var paragraphs = [];
    var i = s.indexOf("id=\"chapter-content\"");
    if (i >= 0) {
        var region = s.substring(i, i + 900000);
        var end = region.indexOf("class=\"manga-block init-manga-nbr");
        if (end < 0) end = region.indexOf("class=\"manga-block comment-section");
        if (end > 0) region = region.substring(0, end);

        var pre = region.split(/<p\b[^>]*>/i);
        for (var k = 1; k < pre.length; k++) {
            var stop = pre[k].indexOf("</p>");
            var line = DL_text(stop >= 0 ? pre[k].substring(0, stop) : pre[k]).replace(/\*\*/g, "");
            if (!DL_isJunk(line)) paragraphs.push(line);
        }

        if (!paragraphs.length) {
            var fallback = DL_text(region);
            var lines = fallback.split(/\n+/);
            for (var j = 0; j < lines.length; j++) {
                var ln = DL_trim(lines[j]);
                if (ln && !DL_isJunk(ln)) paragraphs.push(ln);
            }
        }
    }
    if (!paragraphs.length) paragraphs.push(DL_EMPTY_NOTICE);

    return JSON.stringify({
        title: title,
        paragraphs: paragraphs,
        prevLink: DL_nav(s, "prev-link"),
        nextLink: DL_nav(s, "next-link")
    });
}

/* ---------- Headers ---------- */

function getNovelHeaders(url) {
    return JSON.stringify({
        "User-Agent": DL_UA,
        "Referer": DL_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Đam Mỹ","url":"https://dualeotruyenfull.net/the-loai/dam-my/"},
        {"title":"Boylove","url":"https://dualeotruyenfull.net/the-loai/boyloves/"},
        {"title":"Danmei","url":"https://dualeotruyenfull.net/the-loai/danmei/"},
        {"title":"1x1","url":"https://dualeotruyenfull.net/the-loai/1x1/"},
        {"title":"Cao H","url":"https://dualeotruyenfull.net/the-loai/caoh/"},
        {"title":"H Văn","url":"https://dualeotruyenfull.net/the-loai/hvan/"},
        {"title":"Hiện Đại","url":"https://dualeotruyenfull.net/the-loai/hiendai/"},
        {"title":"Đô Thị","url":"https://dualeotruyenfull.net/the-loai/do-thi/"},
        {"title":"Cổ Đại","url":"https://dualeotruyenfull.net/the-loai/co-dai/"},
        {"title":"Cung Đấu","url":"https://dualeotruyenfull.net/the-loai/cung-dau/"},
        {"title":"Tiên Hiệp","url":"https://dualeotruyenfull.net/the-loai/tien-hiep/"},
        {"title":"Huyền Huyễn","url":"https://dualeotruyenfull.net/the-loai/huyen-huyen/"},
        {"title":"Ngôn Tình","url":"https://dualeotruyenfull.net/the-loai/ngon-tinh/"},
        {"title":"Sủng","url":"https://dualeotruyenfull.net/the-loai/sung/"},
        {"title":"Hài Hước","url":"https://dualeotruyenfull.net/the-loai/hai-huoc/"},
        {"title":"Hệ Thống","url":"https://dualeotruyenfull.net/the-loai/he-thong/"},
        {"title":"Mạt Thế","url":"https://dualeotruyenfull.net/the-loai/mat-the/"},
        {"title":"Song Tính","url":"https://dualeotruyenfull.net/the-loai/songtinh/"},
        {"title":"Trọng Sinh","url":"https://dualeotruyenfull.net/the-loai/trong-sinh/"},
        {"title":"Khác","url":"https://dualeotruyenfull.net/the-loai/khac/"}
    ]);
}
