/*
 * Mê Truyện (metruyen.fit) — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
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
 * Lưu ý của site (WordPress + theme Madara):
 *  - Truyện: /truyen/<slug>/; chương: /truyen/<slug>/chuong-<n>/ (đôi khi
 *    chuong-<n>-<slug-chuong>); thể loại: /the-loai/<slug>/.
 *  - Danh sách tất cả truyện: /truyen/ (12 truyện/trang), trang kế tiếp dạng
 *    /truyen/page/<n>/ — KHÔNG dùng ?paged= cho archive.
 *  - Tìm kiếm: ?s=<q>&post_type=wp-manga. Thiếu post_type sẽ tìm trong bài viết
 *    thường và luôn ra "No matches found". Phân trang bằng &paged=<n> (12/trang),
 *    không có link phân trang trong HTML nên tự ghép URL.
 *  - Trang truyện: tên trong div.post-title h1; bìa div.summary_image img; tác giả
 *    div.author-content; thể loại div.genres-content; trạng thái theo heading
 *    "Status"; mô tả div.description-summary .summary__content.
 *  - Mục lục nằm trọn trong 1 trang (ul.main.version-chap), site xếp MỚI NHẤT
 *    TRƯỚC → phải sort tăng dần theo số chương trong URL. Không cần chapterPages.
 *  - Trang chương: h1#chapter-heading ("<Tên truyện> - Chương N"), nội dung
 *    div.reading-content > div.text-left chứa các <p>; điều hướng
 *    div.nav-previous / div.nav-next (lặp 2 lần ở đầu và cuối trang).
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var MT_HOST = "https://metruyen.fit";
var MT_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var MT_LIST = MT_HOST + "/truyen/";
var MT_PAGE_SIZE = 12;
var MT_EMPTY_NOTICE = "Không tải được nội dung chương này từ Mê Truyện. Thử lại sau hoặc đọc trên website.";

/* ---------- Helpers ---------- */

var MT_ENTITIES = {
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

function MT_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function MT_decode(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return MT_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return MT_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (all, name) {
            return MT_ENTITIES.hasOwnProperty(name) ? MT_ENTITIES[name] : all;
        });
    }
    return out;
}

function MT_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function MT_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = MT_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return MT_trim(s);
}

function MT_abs(u) {
    u = MT_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return MT_HOST + u;
    return MT_HOST + "/" + u;
}

function MT_attr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return m[2] != null ? m[2] : m[3];
}

function MT_img(chunk) {
    var m = /<img\b[^>]*>/i.exec(String(chunk == null ? "" : chunk));
    if (!m) return null;
    var data = MT_attr(m[0], "data-src");
    var src = MT_attr(m[0], "src");
    var u = data || src;
    if (!u) return null;
    if (u.indexOf("data:image") === 0) return null;
    return MT_abs(u);
}

function MT_chapterNo(u) {
    var m = /chuong-(\d+)/i.exec(String(u == null ? "" : u));
    return m ? parseInt(m[1], 10) : 0;
}

/* Nội dung chương: h1 dạng "<Tên truyện> - Chương N" → bỏ phần tên truyện. */
function MT_cleanChapterTitle(t) {
    var s = MT_text(t);
    var i = s.search(/\s-\s(?:Ch\u01b0\u01a1ng|Quy\u1ec3n|Ngo\u1ea1i truy\u1ec7n|Phi\u00ean ngo\u1ea1i)\b/i);
    if (i > 0) s = s.substring(i + 3);
    return MT_trim(s);
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "metruyenfit",
        name: "Mê Truyện",
        faviconUrl: "https://www.google.com/s2/favicons?domain=metruyen.fit&sz=64",
        baseUrl: MT_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 2) return MT_LIST;
    return MT_LIST + "page/" + p + "/";
}

function getNovelSearchRequest(query, page) {
    var q = MT_trim(query);
    var url = MT_HOST + "/?s=" + encodeURIComponent(q).replace(/%20/g, "+") + "&post_type=wp-manga";
    var p = parseInt(page, 10);
    if (!isNaN(p) && p > 1) url += "&paged=" + p;
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": MT_UA,
            "Referer": MT_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
        }
    });
}

/* ---------- List ---------- */

/* Trang tìm kiếm: mỗi kết quả là một hàng ngang div.row.c-tabs-item__content. */
function MT_parseSearchRows(s) {
    var out = [];
    var seen = {};
    var parts = String(s).split(/<div\b[^>]*class="row c-tabs-item__content/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var ti = chunk.indexOf("class=\"post-title");
        var tb = ti >= 0 ? chunk.substring(ti, ti + 3000) : "";
        var a = /<a\b[^>]*href="([^"]*\/truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(tb);
        if (!a) continue;
        var link = MT_abs(a[1]);
        if (!link || seen[link]) continue;
        var title = MT_text(a[2]);
        if (!title) continue;
        seen[link] = 1;

        var cover = null;
        var thi = chunk.indexOf("class=\"tab-thumb");
        if (thi >= 0) cover = MT_img(chunk.substring(thi, thi + 1200));

        var author = null;
        var au = /class="post-content_item mg_author[\s\S]{0,400}?<div class="summary-content">([\s\S]*?)<\/div>/i.exec(chunk);
        if (au) author = MT_text(au[1]) || null;

        var latest = null;
        var lc = /class="meta-item latest-chap"[\s\S]{0,600}?<a\b[^>]*href="([^"]*\/chuong-[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (lc) latest = MT_text(lc[2]) || null;

        out.push({
            title: title,
            link: link,
            coverUrl: cover,
            author: author,
            latestChapter: latest
        });
    }
    return out;
}

/* Trang archive/thể loại: thẻ lưới div.page-item-detail. */
function MT_parseCards(s) {
    var src = String(s);
    var cut = src.indexOf("class=\"c-sidebar");
    if (cut > 0) src = src.substring(0, cut);

    var out = [];
    var seen = {};
    var parts = src.split(/<div\b[^>]*class="page-item-detail/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var ti = chunk.indexOf("class=\"post-title");
        var tb = ti >= 0 ? chunk.substring(ti, ti + 3000) : "";
        var te = tb.indexOf("</h3>");
        if (te >= 0) tb = tb.substring(0, te);
        var a = /<a\b[^>]*href="([^"]*\/truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(tb);
        if (!a) continue;
        var link = MT_abs(a[1]);
        if (!link || seen[link]) continue;
        var title = MT_text(a[2]);
        if (!title) title = MT_decode(MT_attr(a[0], "title"));
        if (!title) continue;
        seen[link] = 1;

        var cover = null;
        var thi = chunk.indexOf("class=\"item-thumb");
        if (thi >= 0) cover = MT_img(chunk.substring(thi, thi + 1200));

        var latest = null;
        var lc = /<a\b[^>]*href="([^"]*\/chuong-[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (lc) latest = MT_text(lc[2]) || null;

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
    var out = MT_parseSearchRows(s);
    if (out.length) return JSON.stringify(out);
    /* Trang tìm kiếm 0 kết quả: không được lấy thẻ ở sidebar làm kết quả. */
    if (String(url == null ? "" : url).indexOf("post_type=wp-manga") >= 0) return "[]";
    return JSON.stringify(MT_parseCards(s));
}

function getNovelNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    var cur = String(currentUrl == null ? "" : currentUrl);
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 1) p = 1;

    /* Tìm kiếm: không có link phân trang, app tự ghép &paged=<n+1>.
     * Dừng khi trang trả về ít hơn 12 kết quả. */
    if (cur.indexOf("post_type=wp-manga") >= 0) {
        var rows = (s.match(/class="row c-tabs-item__content/gi) || []).length;
        if (rows < MT_PAGE_SIZE) return "";
        var base = cur.replace(/[?&]paged=\d+/i, "").replace(/[?&]+$/, "");
        return base + (base.indexOf("?") >= 0 ? "&" : "?") + "paged=" + (p + 1);
    }

    var best = "";
    var bestNum = 9999999;
    var re = /<a\b[^>]*href="([^"]*\/page\/(\d+)\/?[^"]*)"[^>]*>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > p && num < bestNum) {
            bestNum = num;
            best = MT_abs(m[1]);
        }
    }
    return best;
}

/* ---------- Detail ---------- */

function MT_block(s, startMarker, endMarker, max) {
    var i = s.indexOf(startMarker);
    if (i < 0) return "";
    var j = s.indexOf(endMarker, i + startMarker.length);
    return s.substring(i, j > i ? j : i + (max || 4000));
}

function MT_readChapters(s) {
    var i = s.indexOf("<ul class=\"main version-chap");
    if (i < 0) return [];
    var j = s.indexOf("</ul>", i);
    var block = s.substring(i, j > i ? j : i + 800000);

    var out = [];
    var seen = {};
    var re = /<li\b[^>]*wp-manga-chapter[^>]*>[\s\S]{0,600}?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var link = MT_abs(m[1]);
        if (!link || seen[link]) continue;
        var title = MT_text(m[2]);
        if (!title) title = MT_decode(MT_attr(m[0], "title"));
        if (!title) continue;
        seen[link] = 1;
        out.push({ title: title, link: link });
    }

    out.sort(function (a, b) {
        return MT_chapterNo(a.link) - MT_chapterNo(b.link);
    });
    return out;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tb = MT_block(s, "class=\"post-title\"", "</div>", 2000);
    if (tb) {
        var h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(tb);
        if (h) title = MT_text(h[1]);
    }
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = MT_decode(og[1]);
    }

    var coverUrl = null;
    var sb = MT_block(s, "class=\"summary_image\"", "</div>", 2000);
    if (sb) coverUrl = MT_img(sb);

    var author = "";
    var ab = MT_block(s, "class=\"author-content\"", "</div>", 1500);
    if (ab) author = MT_text(ab.replace(/^[^>]*>/, ""));

    var status = "";
    var st = /<h5>\s*Status\s*<\/h5>[\s\S]{0,300}?<div class="summary-content">([\s\S]*?)<\/div>/i.exec(s);
    if (st) status = MT_text(st[1]);

    var genres = [];
    var gseen = {};
    var gb = MT_block(s, "class=\"genres-content\"", "</div>", 4000);
    if (gb) {
        var gre = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
        var gm;
        while ((gm = gre.exec(gb)) !== null) {
            var g = MT_text(gm[1]);
            if (!g || gseen[g]) continue;
            gseen[g] = 1;
            genres.push(g);
        }
    }

    var description = "";
    var db = /<div class="summary__content[^"]*">([\s\S]*?)<\/div>/i.exec(s);
    if (db) {
        var paras = [];
        var pre = db[1].split(/<p\b[^>]*>/i);
        for (var i = 1; i < pre.length; i++) {
            var stop = pre[i].indexOf("</p>");
            var line = MT_text(stop >= 0 ? pre[i].substring(0, stop) : pre[i]);
            if (line) paras.push(line);
        }
        description = paras.join("\n\n");
    }

    var chapters = MT_readChapters(s);

    return JSON.stringify({
        title: title,
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters,
        chapterPages: []
    });
}

function parseNovelChapters(html) {
    return JSON.stringify(MT_readChapters(String(html == null ? "" : html)));
}

/* ---------- Chapter ---------- */

function MT_nav(s, cls) {
    var re = new RegExp("<div\\b[^>]*class=\"nav-" + cls + "\\b[^\"]*\"[^>]*>[\\s\\S]{0,400}?<a\\b[^>]*href=\"([^\"]+)\"", "i");
    var m = re.exec(String(s));
    if (!m) return "";
    return MT_abs(m[1]);
}

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var h = /<h1\b[^>]*id="chapter-heading"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (h) title = MT_cleanChapterTitle(h[1]);
    if (!title) {
        var tt = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (tt) title = MT_trim(MT_text(tt[1]).split("|")[0]);
    }

    var paragraphs = [];
    var i = s.indexOf("<div class=\"reading-content\">");
    if (i < 0) i = s.indexOf("class=\"reading-content\"");
    if (i >= 0) {
        var region = s.substring(i, i + 900000);
        var tl = region.indexOf("class=\"text-left\"");
        if (tl >= 0) region = region.substring(tl);
        var end = region.indexOf("</div>");
        if (end > 0) region = region.substring(0, end);

        var pre = region.split(/<p\b[^>]*>/i);
        for (var k = 1; k < pre.length; k++) {
            var stop = pre[k].indexOf("</p>");
            var line = MT_text(stop >= 0 ? pre[k].substring(0, stop) : pre[k]);
            if (line) paragraphs.push(line);
        }
    }
    if (!paragraphs.length) paragraphs.push(MT_EMPTY_NOTICE);

    return JSON.stringify({
        title: title,
        paragraphs: paragraphs,
        prevLink: MT_nav(s, "previous"),
        nextLink: MT_nav(s, "next")
    });
}

/* ---------- Headers ---------- */

function getNovelHeaders(url) {
    return JSON.stringify({
        "User-Agent": MT_UA,
        "Referer": MT_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Đề cử","url":"https://metruyen.fit/the-loai/de-cu/"},
        {"title":"Hài Hước","url":"https://metruyen.fit/the-loai/hai-huoc/"},
        {"title":"Hiện Đại","url":"https://metruyen.fit/the-loai/hien-dai/"},
        {"title":"Huyền Huyễn","url":"https://metruyen.fit/the-loai/huyen-huyen/"},
        {"title":"Kinh Dị","url":"https://metruyen.fit/the-loai/kinh-di/"},
        {"title":"Linh Dị","url":"https://metruyen.fit/the-loai/linh-di/"},
        {"title":"Tu Tiên","url":"https://metruyen.fit/the-loai/tu-tien/"},
        {"title":"Báo Thù","url":"https://metruyen.fit/the-loai/bao-thu/"},
        {"title":"Tình Cảm","url":"https://metruyen.fit/the-loai/tinh-cam/"},
        {"title":"Ngọt Sủng","url":"https://metruyen.fit/the-loai/ngot-sung/"},
        {"title":"Cổ Đại","url":"https://metruyen.fit/the-loai/co-dai/"},
        {"title":"HE","url":"https://metruyen.fit/the-loai/he/"},
        {"title":"Hoàng Cung","url":"https://metruyen.fit/the-loai/hoang-cung/"},
        {"title":"Ngôn Tình","url":"https://metruyen.fit/the-loai/ngon-tinh/"},
        {"title":"Sủng","url":"https://metruyen.fit/the-loai/sung/"},
        {"title":"Nữ Cường","url":"https://metruyen.fit/the-loai/nu-cuong/"},
        {"title":"Đọc Tâm","url":"https://metruyen.fit/the-loai/doc-tam/"},
        {"title":"Xuyên Sách","url":"https://metruyen.fit/the-loai/xuyen-sach/"},
        {"title":"ABO","url":"https://metruyen.fit/the-loai/abo/"},
        {"title":"BE","url":"https://metruyen.fit/the-loai/be/"},
        {"title":"Chữa Lành","url":"https://metruyen.fit/the-loai/chua-lanh/"},
        {"title":"Cung Đấu","url":"https://metruyen.fit/the-loai/cung-dau/"},
        {"title":"Cứu Rỗi","url":"https://metruyen.fit/the-loai/cuu-roi/"},
        {"title":"Gia Đấu","url":"https://metruyen.fit/the-loai/gia-dau/"},
        {"title":"Hoán Đổi Thân Xác","url":"https://metruyen.fit/the-loai/hoan-doi-than-xac/"},
        {"title":"Hào Môn","url":"https://metruyen.fit/the-loai/hao-mon/"},
        {"title":"Hệ Thống","url":"https://metruyen.fit/the-loai/he-thong/"},
        {"title":"Mạt Thế","url":"https://metruyen.fit/the-loai/mat-the/"},
        {"title":"Ngược","url":"https://metruyen.fit/the-loai/nguoc/"},
        {"title":"Nhân Thú","url":"https://metruyen.fit/the-loai/nhan-thu/"},
        {"title":"OE","url":"https://metruyen.fit/the-loai/oe/"},
        {"title":"SE","url":"https://metruyen.fit/the-loai/se/"},
        {"title":"Showbiz","url":"https://metruyen.fit/the-loai/showbiz/"},
        {"title":"Sinh Tồn","url":"https://metruyen.fit/the-loai/sinh-ton/"},
        {"title":"Sảng Văn","url":"https://metruyen.fit/the-loai/sang-van/"},
        {"title":"Thanh Xuân Vườn Trường","url":"https://metruyen.fit/the-loai/thanh-xuan-vuon-truong/"},
        {"title":"Thiên Kim","url":"https://metruyen.fit/the-loai/thien-kim/"},
        {"title":"Thế Thân","url":"https://metruyen.fit/the-loai/the-than/"},
        {"title":"Trọng Sinh","url":"https://metruyen.fit/the-loai/trong-sinh/"},
        {"title":"Tình Cảm Gia Đình","url":"https://metruyen.fit/the-loai/tinh-cam-gia-dinh/"},
        {"title":"Tổng Tài","url":"https://metruyen.fit/the-loai/tong-tai/"},
        {"title":"Tội Phạm","url":"https://metruyen.fit/the-loai/toi-pham/"},
        {"title":"Vả Mặt","url":"https://metruyen.fit/the-loai/va-mat/"},
        {"title":"Xuyên Không","url":"https://metruyen.fit/the-loai/xuyen-khong/"},
        {"title":"Đam Mỹ","url":"https://metruyen.fit/the-loai/dam-my/"},
        {"title":"Điền Văn","url":"https://metruyen.fit/the-loai/dien-van/"}
    ]);
}
