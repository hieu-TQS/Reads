/*
 * Vcomycs (vcomycs.cc) — nguồn truyện tranh dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsComicSite.kt):
 *  - getComicSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getComicHomeUrl(page)               -> URL trang danh sách (1-based)
 *  - getComicSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseComicList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getComicNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseComicDetail(html, url)         -> { title, coverUrl, author, description,
 *                                             chapters:[{ title, link, date }] }
 *  - parseComicChapter(html, url)        -> { title, imageUrls:[...], prevLink, nextLink }
 *  - getComicHeaders(url)                -> { Referer: "..." }
 *  - getComicCategories()                -> [{ title, url }]  danh mục (thể loại)
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var VC_HOST = "https://vcomycs.cc";
var VC_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Helpers ---------- */

var VC_ENTITIES = {
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

function VC_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function VC_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function VC_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return VC_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return VC_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var value = VC_ENTITIES[name];
            return value == null ? all : value;
        });
    }
    return out;
}

function VC_abs(u) {
    if (!u) return "";
    u = VC_trim(u);
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return VC_HOST + u;
    return VC_HOST + "/" + u;
}

function VC_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
}

function VC_text(html) {
    var s = VC_decode(VC_stripTags(html));
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/\n{3,}/g, "\n\n");
    return VC_trim(s);
}

function VC_attr(tag, name) {
    var m = new RegExp(name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag);
    if (!m) m = new RegExp(name + "\\s*=\\s*'([^']*)'", "i").exec(tag);
    return m ? VC_decode(m[1]) : "";
}

function VC_match(s, re) {
    var m = re.exec(String(s == null ? "" : s));
    return m ? m : null;
}

/* Số chương trong URL (/chapter-12/). 0 nếu không có số. */
function VC_chapNumber(url) {
    var m = /\/chapter-([0-9]+(?:\.[0-9]+)?)/i.exec(String(url == null ? "" : url));
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return isNaN(n) ? 0 : n;
}

/* Mục lục trả mới nhất trước → sắp tăng dần để đọc từ chương 1. */
function VC_sortChapters(list) {
    for (var i = 0; i < list.length; i++) list[i].__idx = i;
    list.sort(function (a, b) {
        var na = VC_chapNumber(a.link);
        var nb = VC_chapNumber(b.link);
        if (na !== nb) {
            if (na === 0) return 1;
            if (nb === 0) return -1;
            return na - nb;
        }
        return a.__idx - b.__idx;
    });
    for (var j = 0; j < list.length; j++) delete list[j].__idx;
    return list;
}

/* ---------- Source ---------- */

function getComicSource() {
    return JSON.stringify({
        id: "vcomycs",
        name: "Vcomycs",
        faviconUrl: "https://www.google.com/s2/favicons?domain=vcomycs.cc&sz=64",
        baseUrl: VC_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return VC_HOST + "/tim-truyen/";
    return VC_HOST + "/tim-truyen/page/" + page + "/";
}

function getComicSearchRequest(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var q = encodeURIComponent(String(query == null ? "" : query));
    var url = page <= 1
        ? VC_HOST + "/?s=" + q
        : VC_HOST + "/page/" + page + "/?s=" + q;
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": VC_UA,
            "Referer": VC_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseComicList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<div\b[^>]*class\s*=\s*["'][^"']*\bcomic-item\b[^"']*["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('<div class="comic-item"');
        if (cut > 0) chunk = chunk.substring(0, cut);

        var linkM = /class\s*=\s*["']comic-title["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) continue;
        var link = VC_abs(VC_attr("<a " + linkM[1] + ">", "href"));
        if (!link || seen[link]) continue;

        var title = VC_text(linkM[2]);
        if (!title) title = VC_decode(VC_attr("<a " + linkM[1] + ">", "title"));
        if (!title) continue;
        seen[link] = 1;

        var imgM = /<img\b[^>]*>/i.exec(chunk);
        var coverUrl = "";
        if (imgM) {
            coverUrl = VC_abs(VC_attr(imgM[0], "src"));
            if (!coverUrl) coverUrl = VC_abs(VC_attr(imgM[0], "data-src"));
        }

        var latestM = /class\s*=\s*["']comic-chapter-last["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(chunk);
        var latestChapter = latestM ? VC_text(latestM[2]) : "";

        out.push({
            title: title,
            link: link,
            coverUrl: coverUrl || null,
            author: null,
            latestChapter: latestChapter || null
        });
    }
    return JSON.stringify(out);
}

function getComicNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;

    /* Ưu tiên thẻ rel=next của WordPress. */
    var relM = /<a\b([^>]*\brel\s*=\s*["']next["'][^>]*)>/i.exec(s);
    if (relM) {
        var relUrl = VC_abs(VC_attr("<a " + relM[1] + ">", "href"));
        if (relUrl && relUrl !== currentUrl) return relUrl;
    }

    /* Dự phòng: quét các link phân trang dạng /page/N/. */
    var re = /<a\b([^>]*class\s*=\s*["'][^"']*\bpage-numbers\b[^"']*["'][^>]*)>/gi;
    var m;
    var best = "";
    var bestNum = 999999;
    while ((m = re.exec(s)) !== null) {
        var href = VC_attr("<a " + m[1] + ">", "href");
        if (!href) continue;
        var numM = /\/page\/(\d+)/.exec(href);
        if (!numM) continue;
        var num = parseInt(numM[1], 10);
        if (isNaN(num) || num <= page || num >= bestNum) continue;
        bestNum = num;
        best = VC_abs(href);
    }
    return best;
}

/* ---------- Detail ---------- */

function parseComicDetail(html, url) {
    var s = String(html == null ? "" : html);

    var titleM = /<h1\b[^>]*class\s*=\s*["'][^"']*\bcomic-title-detail\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? VC_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(s);
        if (og) title = VC_decode(og[1]);
    }

    var coverM = /class\s*=\s*["'][^"']*\bcomic-image-container\b[^"']*["'][\s\S]{0,400}?<img\b[^>]*>/i.exec(s);
    var coverUrl = "";
    if (coverM) coverUrl = VC_abs(VC_attr(coverM[0].substring(coverM[0].indexOf("<img")), "src"));
    if (!coverUrl) {
        var ogImg = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(s);
        if (ogImg) coverUrl = VC_abs(ogImg[1]);
    }

    var authorM = /class\s*=\s*["']comic-info__fact-label["'][^>]*>\s*Tác giả\s*<\/span>[\s\S]{0,400}?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    var author = authorM ? VC_text(authorM[1]) : "";

    var description = "";
    var descM = /<div\b[^>]*class\s*=\s*["']post-content["'][^>]*>([\s\S]*?)<\/div>/i.exec(s);
    if (descM) {
        var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
        var pm;
        var paras = [];
        while ((pm = pRe.exec(descM[1])) !== null && paras.length < 5) {
            var t = VC_text(pm[1]);
            if (t) paras.push(t);
        }
        description = paras.join("\n\n");
    }
    if (!description) {
        var metaDesc = /<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(s);
        if (metaDesc) description = VC_decode(metaDesc[1]);
    }
    if (description.length > 1500) description = description.substring(0, 1500).replace(/\s+\S*$/, "") + "…";

    var chapters = [];
    var seenCh = {};
    var gridM = /<div\b[^>]*class\s*=\s*["'][^"']*\bepisodes-grid\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(s);
    var scope = gridM ? gridM[1] : s;
    var aRe = /<a\b([^>]*\bepisode-item\b[^>]*)>([\s\S]*?)<\/a>/gi;
    var am;
    while ((am = aRe.exec(scope)) !== null) {
        var cLink = VC_abs(VC_attr("<a " + am[1] + ">", "href"));
        if (!cLink || seenCh[cLink]) continue;
        var cTitle = VC_text(am[2]);
        if (!cTitle) continue;
        seenCh[cLink] = 1;
        chapters.push({ title: cTitle, link: cLink, date: "" });
    }

    /* Vài truyện có link phụ chết dạng /chapter-bonus/ (301 về trang chủ).
       Khi đã có chương đánh số thì bỏ các link không có số chương. */
    var hasNumbered = false;
    for (var k = 0; k < chapters.length; k++) {
        if (VC_chapNumber(chapters[k].link) > 0) { hasNumbered = true; break; }
    }
    if (hasNumbered) {
        var kept = [];
        for (var n = 0; n < chapters.length; n++) {
            if (VC_chapNumber(chapters[n].link) > 0) kept.push(chapters[n]);
        }
        chapters = kept;
    }

    return JSON.stringify({
        title: title || (url || ""),
        coverUrl: coverUrl || null,
        author: author || null,
        description: description || null,
        chapters: VC_sortChapters(chapters)
    });
}

/* ---------- Chapter content ---------- */

function parseComicChapter(html, url) {
    var s = String(html == null ? "" : html);

    var titleM = /<span\b[^>]*class\s*=\s*["']current-chapter["'][^>]*>([\s\S]*?)<\/span>/i.exec(s);
    var title = titleM ? VC_text(titleM[1]) : "";
    if (!title) {
        var t = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (t) {
            var raw = VC_decode(t[1]);
            var chM = /\[(Chapter[^\]]+)\]/i.exec(raw);
            if (!chM) chM = /(Chapter\s+[0-9]+(?:\.[0-9]+)?)/i.exec(raw);
            title = chM ? VC_trim(chM[1]) : VC_trim(raw.split(" - ")[0]);
        }
    }

    /* Chỉ lấy ảnh trong khối nội dung chương (bỏ logo/ảnh sidebar). */
    var imageUrls = [];
    var seenImg = {};
    var startIdx = s.indexOf('class="chapter-content"');
    if (startIdx >= 0) {
        var from = s.indexOf(">", startIdx);
        var endIdx = s.indexOf("chapter-navigation", from);
        var block = (from >= 0)
            ? s.substring(from + 1, (endIdx > from) ? endIdx : (from + 400000))
            : "";
        var re = /<img\b[^>]*>/gi;
        var m;
        while ((m = re.exec(block)) !== null) {
            var src = VC_attr(m[0], "data-src");
            if (!src) src = VC_attr(m[0], "src");
            if (!src || src.indexOf("data:") === 0) continue;
            var abs = VC_abs(src);
            if (!abs || seenImg[abs]) continue;
            seenImg[abs] = 1;
            imageUrls.push(abs);
        }
    }

    var prevM = /<a\b([^>]*\bprev-chapter\b[^>]*)>/i.exec(s);
    var nextM = /<a\b([^>]*\bnext-chapter\b[^>]*)>/i.exec(s);
    var prevLink = prevM ? VC_abs(VC_attr("<a " + prevM[1] + ">", "href")) : "";
    var nextLink = nextM ? VC_abs(VC_attr("<a " + nextM[1] + ">", "href")) : "";
    if (prevLink.indexOf("javascript:") >= 0) prevLink = "";
    if (nextLink.indexOf("javascript:") >= 0) nextLink = "";

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

/* ---------- Headers ---------- */

function getComicHeaders(url) {
    return JSON.stringify({
        "User-Agent": VC_UA,
        "Referer": VC_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getComicCategories() {
    return JSON.stringify([
        { title: "Action", url: VC_HOST + "/action/" },
        { title: "Adventure", url: VC_HOST + "/adventure/" },
        { title: "Anime", url: VC_HOST + "/anime/" },
        { title: "Chuyển Sinh", url: VC_HOST + "/chuyen-sinh/" },
        { title: "Cổ Đại", url: VC_HOST + "/co-dai/" },
        { title: "Comedy", url: VC_HOST + "/comedy/" },
        { title: "Comic", url: VC_HOST + "/comic/" },
        { title: "Đam Mỹ", url: VC_HOST + "/dam-my/" },
        { title: "Drama", url: VC_HOST + "/drama/" },
        { title: "Ecchi", url: VC_HOST + "/ecchi/" },
        { title: "Fantasy", url: VC_HOST + "/fantasy/" },
        { title: "Harem", url: VC_HOST + "/harem/" },
        { title: "Historical", url: VC_HOST + "/historical/" },
        { title: "Horror", url: VC_HOST + "/horror/" },
        { title: "Josei", url: VC_HOST + "/josei/" },
        { title: "Manga", url: VC_HOST + "/manga/" },
        { title: "Manhua", url: VC_HOST + "/manhua/" },
        { title: "Manhwa", url: VC_HOST + "/manhwa/" },
        { title: "Martial Arts", url: VC_HOST + "/martial-arts/" },
        { title: "Mature", url: VC_HOST + "/mature/" },
        { title: "Mecha", url: VC_HOST + "/mecha/" },
        { title: "Mystery", url: VC_HOST + "/mystery/" },
        { title: "Ngôn Tình", url: VC_HOST + "/ngon-tinh/" },
        { title: "Psychological", url: VC_HOST + "/psychological/" },
        { title: "Romance", url: VC_HOST + "/romance/" },
        { title: "School Life", url: VC_HOST + "/school-life/" },
        { title: "Sci-fi", url: VC_HOST + "/sci-fi/" },
        { title: "Seinen", url: VC_HOST + "/seinen/" },
        { title: "Shoujo", url: VC_HOST + "/shoujo/" },
        { title: "Slice of Life", url: VC_HOST + "/slice-of-life/" },
        { title: "Sports", url: VC_HOST + "/sports/" },
        { title: "Supernatural", url: VC_HOST + "/supernatural/" },
        { title: "Trinh Thám", url: VC_HOST + "/trinh-tham/" },
        { title: "Truyện Màu", url: VC_HOST + "/truyen-mau/" },
        { title: "Webtoon", url: VC_HOST + "/webtoon/" },
        { title: "Xuyên Không", url: VC_HOST + "/xuyen-khong/" }
    ]);
}
