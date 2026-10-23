/*
 * MissKon (misskon.com) — nguồn truyện tranh dạng ảnh (bộ sưu tập ảnh cosplay/model).
 *
 * Hợp đồng truyện tranh (xem JsComicSite.kt):
 *  - getComicSource()                -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getComicHomeUrl(page)           -> URL trang danh sách
 *  - getComicSearchRequest(query, page) -> { url, method, body, headers }
 *  - parseComicList(html, url)        -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getComicNextPageUrl(currentUrl, page, html) -> URL kế, "" = hết
 *  - parseComicDetail(html, url)      -> { title, coverUrl, author, description, chapters:[{title,link}] }
 *  - parseComicChapter(html, url)     -> { title, imageUrls:[...], prevLink, nextLink }
 *  - getComicHeaders(url)            -> map header (Referer cho CDN ảnh)
 *  - getComicCategories()            -> [] (site không có chuyên mục ổn định)
 *
 * Mỗi bài viết là 1 "chương" ảnh; các trang /2/, /3/... là các phần của bộ ảnh.
 * ES5 thuần. Mọi hàm trả JSON string.
 */

var MK_HOST = "https://misskon.com";
var MK_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Entity map ---------- */
var MK_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", bull: "\u2022",
    middot: "\u00b7", times: "\u00d7", copy: "\u00a9", reg: "\u00ae",
    trade: "\u2122", deg: "\u00b0"
};

function MK_trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

function MK_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function MK_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) { return MK_char(parseInt(hex, 16)); });
        out = out.replace(/&#(\d+);?/g, function (all, dec) { return MK_char(parseInt(dec, 10)); });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var v = MK_ENTITIES[name];
            return v == null ? all : v;
        });
    }
    return out;
}

function MK_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return MK_HOST + u;
    return MK_HOST + "/" + u;
}

function MK_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function MK_text(html) {
    var s = MK_stripTags(html);
    s = MK_decode(s);
    s = s.replace(/\s+/g, " ");
    return MK_trim(s);
}

function MK_pageInfo(url) {
    var u = String(url || "");
    if (u.charAt(u.length - 1) !== "/") u += "/";
    var m = u.match(/\/(\d+)\/$/);
    var current = 1;
    var base = u;
    if (m && /^\d+$/.test(m[1])) {
        var n = parseInt(m[1], 10);
        if (n > 1) {
            current = n;
            base = u.replace(/\/\d+\/$/, "/");
        }
    }
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return { current: current, base: base };
}

/* ---------- Source ---------- */

function getComicSource() {
    return JSON.stringify({
        id: "misskon",
        name: "MissKon",
        faviconUrl: "https://www.google.com/s2/favicons?domain=misskon.com&sz=64",
        baseUrl: MK_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return MK_HOST + "/";
    return MK_HOST + "/page/" + page + "/";
}

function getComicSearchRequest(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var url;
    if (page <= 1) url = MK_HOST + "/?s=" + encodeURIComponent(String(query == null ? "" : query));
    else url = MK_HOST + "/page/" + page + "/?s=" + encodeURIComponent(String(query == null ? "" : query));
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": MK_UA,
            "Referer": MK_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseComicList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<article class="item-list"/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('<article class="item-list"');
        if (cut > 0) chunk = chunk.substring(0, cut);

        var linkM = /<h2 class="post-box-title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) {
            linkM = /<a[^>]+href="(https:\/\/misskon\.com\/\d+-[^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/i.exec(chunk);
        }
        if (!linkM) continue;
        var link = MK_abs(linkM[1]);
        if (seen[link]) continue;
        seen[link] = 1;

        var title = MK_text(linkM[2]);
        if (!title) continue;

        var imgM = /<img[^>]+data-src="([^"]+)"/i.exec(chunk);
        if (!imgM) imgM = /<img[^>]+src="([^"]+)"/i.exec(chunk);
        var coverUrl = null;
        if (imgM) {
            var src = imgM[1];
            if (src.indexOf("data:image") === -1) coverUrl = MK_abs(src);
        }

        out.push({
            title: title,
            link: link,
            coverUrl: coverUrl,
            author: null,
            latestChapter: null
        });
    }
    return JSON.stringify(out);
}

function getComicNextPageUrl(currentUrl, page, html) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var s = String(html == null ? "" : html);
    var re = /href="(https:\/\/misskon\.com\/page\/(\d+)\/)"/g;
    var m;
    var best = null;
    var bestNum = 999999;
    while ((m = re.exec(s)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > page && num < bestNum) {
            bestNum = num;
            best = m[1];
        }
    }
    if (best) return best;
    if (page < 100) return "https://misskon.com/page/" + (page + 1) + "/";
    return "";
}

/* ---------- Detail ---------- */

function parseComicDetail(html, url) {
    var s = String(html == null ? "" : html);
    var titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? MK_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = MK_decode(og[1]);
    }

    var coverM = /data-src="(https:\/\/pok\.misskon\.com\/[^"]+)"/i.exec(s);
    if (!coverM) coverM = /<img[^>]+src="(https:\/\/misskon\.com\/media\/[^"]+)"/i.exec(s);
    var coverUrl = coverM ? coverM[1] : null;

    var chapters = [{ title: "Xem ảnh", link: url }];

    return JSON.stringify({
        title: title || url,
        coverUrl: coverUrl,
        author: null,
        description: null,
        chapters: chapters
    });
}

/* ---------- Chapter content ---------- */

function parseComicChapter(html, url) {
    var s = String(html == null ? "" : html);

    var titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? MK_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = MK_decode(og[1]);
    }

    var imgs = [];
    var seen = {};
    var re = /data-src="(https:\/\/pok\.misskon\.com\/[^"]+\.(?:webp|jpg|jpeg|png))"/g;
    var m;
    while ((m = re.exec(s)) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = 1; imgs.push(m[1]); }
    }
    if (imgs.length === 0) {
        var re2 = /src="(https:\/\/pok\.misskon\.com\/[^"]+\.(?:webp|jpg|jpeg|png))"/g;
        while ((m = re2.exec(s)) !== null) {
            if (!seen[m[1]]) { seen[m[1]] = 1; imgs.push(m[1]); }
        }
    }

    var info = MK_pageInfo(url);
    var current = info.current;
    var base = info.base;

    var nextLink = "";
    if (s.indexOf("/" + (current + 1) + "/") >= 0) {
        nextLink = base + (current + 1) + "/";
    }
    var prevLink = "";
    if (current > 1) {
        if (current - 1 <= 1) prevLink = base;
        else prevLink = base + (current - 1) + "/";
    }

    return JSON.stringify({
        title: title,
        imageUrls: imgs,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

/* ---------- Headers ---------- */

function getComicHeaders(url) {
    return JSON.stringify({
        "User-Agent": MK_UA,
        "Referer": MK_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getComicCategories() {
    return JSON.stringify([]);
}
