/*
 * Nguồn truyện tranh TruyenQQ (truyenqqko.com) — chạy trong Rhino (ES5).
 *
 * Hợp đồng (tất cả trả JSON string):
 *  - getComicSource()                       -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getComicHomeUrl(page)                  -> string
 *  - getComicSearchRequest(query, page)     -> { url, method, body, headers }
 *  - parseComicList(html, url)              -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getComicNextPageUrl(currentUrl, page, html) -> string ("" nếu hết trang)
 *  - parseComicDetail(html, url)            -> { title, coverUrl, author, description, chapters:[{title,link}] }
 *  - parseComicChapter(html, url)           -> { title, imageUrls:[...], prevLink, nextLink }
 *  - getComicHeaders(url)                   -> { Referer: "..." }
 *  - getComicCategories()                   -> [{ title, url }]  danh mục (thể loại)
 */

var QQ_BASE = "https://truyenqqko.com";

function getComicSource() {
    return JSON.stringify({
        id: "truyenqq",
        name: "TruyenQQ",
        faviconUrl: "https://www.google.com/s2/favicons?domain=truyenqqko.com&sz=64",
        baseUrl: QQ_BASE,
        searchable: true
    });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function absUrl(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return QQ_BASE + u;
    return QQ_BASE + "/" + u;
}

/* Bảng entity HTML (tên → ký tự) — thiếu mã nào là chữ hiện &ldquo; thay vì dấu “ */
var QQ_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    sbquo: "\u201a", bdquo: "\u201e", laquo: "\u00ab", raquo: "\u00bb",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", minus: "\u2212",
    bull: "\u2022", middot: "\u00b7", times: "\u00d7", divide: "\u00f7",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0",
    plusmn: "\u00b1", frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be",
    sup2: "\u00b2", sup3: "\u00b3", euro: "\u20ac", pound: "\u00a3",
    yen: "\u00a5", cent: "\u00a2", ensp: " ", emsp: " ", thinsp: " ",
    shy: "", zwnj: "", zwj: "", lrm: "", rlm: "",
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

/* Mã điểm Unicode → ký tự (xử lý cả cặp surrogate cho emoji). */
function entityChar(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

/**
 * Giải mã HTML entity: số thập phân, hex và tên (kể cả entity thiếu dấu ";").
 * Chạy 2 lượt để gỡ cả trường hợp bị encode 2 lần (&amp;ldquo;).
 */
function decodeEntities(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return entityChar(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return entityChar(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var value = QQ_ENTITIES[name];
            return value == null ? all : value;
        });
    }
    return out;
}

function stripTags(s) {
    return String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function cleanText(s) {
    return decodeEntities(stripTags(s)).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function firstMatch(s, re) {
    var m = re.exec(s);
    return m ? m : null;
}

/* Số chương trong URL (-chap-12 / -chuong-12). trả 0 nếu không có. */
function chapNumber(url) {
    var m = /(?:-|^)(?:chap|chuong)-([0-9]+(?:\.[0-9]+)?)/i.exec(String(url || ""));
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return isNaN(n) ? 0 : n;
}

/* Mục lục truyenqq trả mới nhất trước → sắp tăng dần để đọc từ chương 1. */
function sortChaptersByNumber(list) {
    list.sort(function (a, b) {
        var na = chapNumber(a.link);
        var nb = chapNumber(b.link);
        if (na !== nb) return na - nb;
        return 0;
    });
    return list;
}

function attrOf(tag, name) {
    var m = new RegExp(name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag);
    if (!m) m = new RegExp(name + "\\s*=\\s*'([^']*)'", "i").exec(tag);
    return m ? decodeEntities(m[1]) : "";
}

/* Tách tất cả thẻ <a ...>...</a> trong 1 đoạn html. */
function collectAnchors(html) {
    var out = [];
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        out.push({ attrs: m[1], text: m[2] });
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Trang danh sách                                                     */
/* ------------------------------------------------------------------ */

function getComicHomeUrl(page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page <= 1) return QQ_BASE + "/doc-truyen";
    return QQ_BASE + "/truyen-moi-cap-nhat/trang-" + page;
}

function getComicSearchRequest(query, page) {
    var body = "search=" + encodeURIComponent(String(query || "")) + "&type=0";
    return JSON.stringify({
        url: QQ_BASE + "/frontend/search/search",
        method: "POST",
        body: body,
        headers: { "Referer": QQ_BASE + "/doc-truyen" }
    });
}

function parseSearchItems(html) {
    var items = [];
    var parts = html.split(/<li\b[^>]*>/i);
    for (var i = 0; i < parts.length; i++) {
        var chunk = parts[i];
        if (chunk.indexOf("search_info") < 0) continue;

        var anchor = firstMatch(chunk, /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i);
        var img = firstMatch(chunk, /<img\b[^>]*>/i);
        var name = firstMatch(chunk, /class\s*=\s*["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
        if (!anchor || !name) continue;

        var latest = firstMatch(chunk, /<p[^>]*>\s*([^<]*Chương[^<]*)<\/p>/i);
        items.push({
            title: cleanText(name[1]),
            link: absUrl(anchor[1]),
            coverUrl: img ? absUrl(attrOf(img[0], "src")) : "",
            author: "",
            latestChapter: latest ? cleanText(latest[1]) : ""
        });
    }
    return items;
}

function parseBookListItems(html) {
    var items = [];
    var parts = html.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bbook_avatar\b[^"']*["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var anchor = firstMatch(chunk, /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i);
        var img = firstMatch(chunk, /<img\b[^>]*>/i);
        var name = firstMatch(chunk, /class\s*=\s*["'][^"']*\bbook_name\b[^"']*["'][\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i);
        if (!name) {
            var alt = img ? attrOf(img[0], "alt") : "";
            if (!anchor || !alt) continue;
            name = [null, alt];
        }
        if (!anchor) continue;

        var latest = firstMatch(chunk, /class\s*=\s*["'][^"']*\blast_chapter\b[^"']*["'][\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i);

        items.push({
            title: cleanText(name[1]),
            link: absUrl(anchor[1]),
            coverUrl: img ? absUrl(attrOf(img[0], "src")) : "",
            author: "",
            latestChapter: latest ? cleanText(latest[1]) : ""
        });
    }
    return items;
}

function parseComicList(html, url) {
    if (!html) return JSON.stringify([]);

    var items = html.indexOf("search_info") >= 0
        ? parseSearchItems(html)
        : parseBookListItems(html);

    /* Bỏ trùng theo link, bỏ mục không có link/tên */
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.link || !it.title) continue;
        if (seen[it.link]) continue;
        seen[it.link] = true;
        out.push(it);
    }
    return JSON.stringify(out);
}

function getComicNextPageUrl(currentUrl, page, html) {
    if (!html) return "";
    var m = firstMatch(html, /<link\b[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"']+)["']/i);
    if (!m) m = firstMatch(html, /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']next["']/i);
    if (!m) return "";
    var next = absUrl(m[1]);
    return next === currentUrl ? "" : next;
}

/* ------------------------------------------------------------------ */
/* Chi tiết truyện                                                     */
/* ------------------------------------------------------------------ */

function parseComicDetail(html, url) {
    if (!html) return "";

    var titleM = firstMatch(html, /<h1\b[^>]*itemprop\s*=\s*["']name["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (!titleM) titleM = firstMatch(html, /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    var title = titleM ? cleanText(titleM[1]) : "";

    var cover = "";
    var avatarM = firstMatch(html, /class\s*=\s*["'][^"']*\bbook_avatar\b[^"']*["'][\s\S]*?<img\b[^>]*>/i);
    if (avatarM) {
        var imgTag = firstMatch(avatarM[0], /<img\b[^>]*>/i);
        if (imgTag) cover = absUrl(attrOf(imgTag[0], "src"));
    }
    if (!cover) {
        var ogImg = firstMatch(html, /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
        if (ogImg) cover = absUrl(ogImg[1]);
    }

    var author = "";
    var authorM = firstMatch(html, /class\s*=\s*["'][^"']*\borg\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (authorM) author = cleanText(authorM[1]);

    var description = "";
    var descM = firstMatch(html, /class\s*=\s*["'][^"']*\bstory-detail-info\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (descM) description = cleanText(descM[1]);
    if (description.length > 1200) description = description.substring(0, 1200).replace(/\s+\S*$/, "") + "…";

    var chapters = [];
    var seen = {};
    var parts = html.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bworks-chapter-item\b[^"']*["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var m = firstMatch(chunk, /class\s*=\s*["'][^"']*\bname-chap\b[^"']*["'][\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i);
        if (!m) continue;
        var href = attrOf("<a " + m[1] + ">", "href");
        if (!href) continue;
        var link = absUrl(href);
        if (seen[link]) continue;
        seen[link] = true;
        var ctitle = cleanText(m[2]);
        if (!ctitle) continue;
        var dateM = firstMatch(chunk, /class\s*=\s*["'][^"']*\btime-chap\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        chapters.push({
            title: ctitle,
            link: link,
            date: dateM ? cleanText(dateM[1]) : ""
        });
    }

    return JSON.stringify({
        title: title,
        coverUrl: cover,
        author: author,
        description: description,
        chapters: sortChaptersByNumber(chapters)
    });
}

/* ------------------------------------------------------------------ */
/* Trang đọc chương                                                    */
/* ------------------------------------------------------------------ */

function pickImageUrl(imgTag) {
    var u = attrOf(imgTag, "data-original");
    if (!u) u = attrOf(imgTag, "data-cdn");
    if (!u) u = attrOf(imgTag, "src");
    if (!u || u.indexOf("data:") === 0 || u.indexOf("no_image") >= 0) return "";
    return absUrl(u);
}

/*
 * TruyenQQ gắn class "go-btn prev" cho CẢ nút "Chap trước" lẫn "Chap sau"
 * (lỗi markup của site) nên không thể tin class. Quy ước của app:
 *  - prevLink = chương có số nhỏ hơn gần nhất
 *  - nextLink = chương có số lớn hơn gần nhất
 */
function parseChapterNav(html, url) {
    var current = chapNumber(url);
    var prev = "";
    var next = "";
    var prevNum = 0;
    var nextNum = 0;
    var seen = {};

    if (current > 0) {
        var re = /<a\b([^>]*\bgo-btn\b[^>]*)>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
            var href = attrOf("<a " + m[1] + ">", "href");
            if (!href) continue;
            var link = absUrl(href);
            if (!link || seen[link]) continue;
            seen[link] = true;
            var num = chapNumber(link);
            if (!num || num === current) continue;
            if (num < current) {
                if (!prev || num > prevNum) { prev = link; prevNum = num; }
            } else if (!next || num < nextNum) {
                next = link;
                nextNum = num;
            }
        }
        return { prevLink: prev, nextLink: next };
    }

    /* URL không có số chương: dùng class + nhãn chữ như trước. */
    var anchors = collectAnchors(html);
    for (var i = 0; i < anchors.length; i++) {
        var attrs = anchors[i].attrs || "";
        if (attrs.indexOf("go-btn") < 0) continue;
        var rawHref = attrOf("<a " + attrs + ">", "href");
        if (!rawHref) continue;
        var abs = absUrl(rawHref);
        if (!abs || seen[abs]) continue;
        seen[abs] = true;
        var text = cleanText(anchors[i].text);
        if (/\bprev\b/i.test(attrs) || /tr\u01b0\u1edbc/i.test(text)) {
            if (!prev) prev = abs;
        } else if (!next) {
            next = abs;
        }
    }
    return { prevLink: prev, nextLink: next };
}

function parseComicChapter(html, url) {
    if (!html) return "";

    var title = "";
    var titleM = firstMatch(html, /<h1\b[^>]*class\s*=\s*["'][^"']*\bdetail-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (titleM) title = cleanText(titleM[1]);

    var imageUrls = [];
    var seen = {};
    var parts = html.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bpage-chapter\b[^"']*["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var img = firstMatch(parts[i], /<img\b[^>]*>/i);
        if (!img) continue;
        var u = pickImageUrl(img[0]);
        if (!u || seen[u]) continue;
        seen[u] = true;
        imageUrls.push(u);
    }

    var nav = parseChapterNav(html, url);

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: nav.prevLink,
        nextLink: nav.nextLink
    });
}

function getComicHeaders(url) {
    /* CDN ảnh (i178.truyenvua.com / i.hinhhinh.com) chặn hotlink nếu thiếu Referer */
    return JSON.stringify({
        "Referer": QQ_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

/* Danh mục (thể loại) cho hàng chip ở màn chính. Trang thể loại dùng lại
   parse danh sách + phân trang sẵn có nên không cần hàm riêng. */
function getComicCategories() {
    return JSON.stringify([
        { title: "Action", url: QQ_BASE + "/the-loai/action-26" },
        { title: "Adventure", url: QQ_BASE + "/the-loai/adventure-27" },
        { title: "Anime", url: QQ_BASE + "/the-loai/anime-62" },
        { title: "Chuyển Sinh", url: QQ_BASE + "/the-loai/chuyen-sinh-91" },
        { title: "Cổ Đại", url: QQ_BASE + "/the-loai/co-dai-90" },
        { title: "Comedy", url: QQ_BASE + "/the-loai/comedy-28" },
        { title: "Comic", url: QQ_BASE + "/the-loai/comic-60" },
        { title: "Demons", url: QQ_BASE + "/the-loai/demons-99" },
        { title: "Detective", url: QQ_BASE + "/the-loai/detective-100" },
        { title: "Doujinshi", url: QQ_BASE + "/the-loai/doujinshi-96" },
        { title: "Drama", url: QQ_BASE + "/the-loai/drama-29" },
        { title: "Fantasy", url: QQ_BASE + "/the-loai/fantasy-30" },
        { title: "Gender Bender", url: QQ_BASE + "/the-loai/gender-bender-45" },
        { title: "Harem", url: QQ_BASE + "/the-loai/harem-47" },
        { title: "Historical", url: QQ_BASE + "/the-loai/historical-51" },
        { title: "Horror", url: QQ_BASE + "/the-loai/horror-44" },
        { title: "Huyền Huyễn", url: QQ_BASE + "/the-loai/huyen-huyen-468" },
        { title: "Isekai", url: QQ_BASE + "/the-loai/isekai-85" },
        { title: "Josei", url: QQ_BASE + "/the-loai/josei-54" },
        { title: "Mafia", url: QQ_BASE + "/the-loai/mafia-69" },
        { title: "Magic", url: QQ_BASE + "/the-loai/magic-58" },
        { title: "Manga", url: QQ_BASE + "/the-loai/manga-469" },
        { title: "Manhua", url: QQ_BASE + "/the-loai/manhua-35" },
        { title: "Manhwa", url: QQ_BASE + "/the-loai/manhwa-49" },
        { title: "Martial Arts", url: QQ_BASE + "/the-loai/martial-arts-41" },
        { title: "Military", url: QQ_BASE + "/the-loai/military-101" },
        { title: "Mystery", url: QQ_BASE + "/the-loai/mystery-39" },
        { title: "Ngôn Tình", url: QQ_BASE + "/the-loai/ngon-tinh-87" },
        { title: "One shot", url: QQ_BASE + "/the-loai/one-shot-95" },
        { title: "Psychological", url: QQ_BASE + "/the-loai/psychological-40" },
        { title: "Romance", url: QQ_BASE + "/the-loai/romance-36" },
        { title: "School Life", url: QQ_BASE + "/the-loai/school-life-37" },
        { title: "Sci-fi", url: QQ_BASE + "/the-loai/sci-fi-43" },
        { title: "Seinen", url: QQ_BASE + "/the-loai/seinen-42" },
        { title: "Shoujo", url: QQ_BASE + "/the-loai/shoujo-38" },
        { title: "Shoujo Ai", url: QQ_BASE + "/the-loai/shoujo-ai-98" },
        { title: "Shounen", url: QQ_BASE + "/the-loai/shounen-31" },
        { title: "Shounen Ai", url: QQ_BASE + "/the-loai/shounen-ai-86" },
        { title: "Slice of life", url: QQ_BASE + "/the-loai/slice-of-life-46" },
        { title: "Sports", url: QQ_BASE + "/the-loai/sports-57" },
        { title: "Supernatural", url: QQ_BASE + "/the-loai/supernatural-32" },
        { title: "Tragedy", url: QQ_BASE + "/the-loai/tragedy-52" },
        { title: "Trọng Sinh", url: QQ_BASE + "/the-loai/trong-sinh-82" },
        { title: "Truyện Màu", url: QQ_BASE + "/the-loai/truyen-mau-92" },
        { title: "Webtoon", url: QQ_BASE + "/the-loai/webtoon-55" },
        { title: "Xuyên Không", url: QQ_BASE + "/the-loai/xuyen-khong-88" }
    ]);
}
