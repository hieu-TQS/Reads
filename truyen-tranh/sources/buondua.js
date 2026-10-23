/*
 * BuonDua (buondua.com) — nguồn truyện tranh dạng ảnh (bộ sưu tập ảnh).
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
 *  - getComicCategories()            -> [{ title, url }] (tuỳ chọn)
 *
 * ES5 thuần. Mọi hàm trả JSON string.
 */

var BD_HOST = "https://buondua.com";
var BD_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Entity map ---------- */
var BD_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", bull: "\u2022",
    middot: "\u00b7", times: "\u00d7", copy: "\u00a9", reg: "\u00ae",
    trade: "\u2122", deg: "\u00b0"
};

function BD_trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

function BD_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function BD_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) { return BD_char(parseInt(hex, 16)); });
        out = out.replace(/&#(\d+);?/g, function (all, dec) { return BD_char(parseInt(dec, 10)); });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var v = BD_ENTITIES[name];
            return v == null ? all : v;
        });
    }
    return out;
}

function BD_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return BD_HOST + u;
    return BD_HOST + "/" + u;
}

function BD_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function BD_text(html) {
    var s = BD_stripTags(html);
    s = BD_decode(s);
    s = s.replace(/\s+/g, " ");
    return BD_trim(s);
}

/* ---------- Source ---------- */

function getComicSource() {
    return JSON.stringify({
        id: "buondua",
        name: "BuonDua",
        faviconUrl: "https://www.google.com/s2/favicons?domain=buondua.com&sz=64",
        baseUrl: BD_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return BD_HOST + "/";
    return BD_HOST + "/?start=" + ((page - 1) * 20);
}

function getComicSearchRequest(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var url;
    if (page <= 1) url = BD_HOST + "/?s=" + encodeURIComponent(String(query == null ? "" : query));
    else url = BD_HOST + "/?s=" + encodeURIComponent(String(query == null ? "" : query)) + "&start=" + ((page - 1) * 20);
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": BD_UA,
            "Referer": BD_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseComicList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<div class="items-row/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('<div class="items-row');
        if (cut > 0) chunk = chunk.substring(0, cut);

        var linkM = /<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) {
            linkM = /<a class="item-link"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/i.exec(chunk);
        }
        if (!linkM) continue;
        var link = BD_abs(linkM[1]);
        if (seen[link]) continue;
        seen[link] = 1;

        var title = BD_text(linkM[2]);
        if (!title) continue;

        var imgM = /<img[^>]+src="(https:\/\/i2\.buondua\.com\/[^"]+)"/i.exec(chunk);
        if (!imgM) imgM = /<img[^>]+src="([^"]+)"/i.exec(chunk);
        var coverUrl = null;
        if (imgM) {
            var src = imgM[1];
            if (src.indexOf("data:image") === -1) coverUrl = BD_abs(src.split("?")[0]);
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
    // find ?start=N links, pick smallest > current offset
    var currentOffset = (page - 1) * 20;
    var re = /href="([^"]*\?start=(\d+)[^"]*)"/g;
    var m;
    var best = null;
    var bestOff = 999999;
    while ((m = re.exec(s)) !== null) {
        var off = parseInt(m[2], 10);
        if (!isNaN(off) && off > currentOffset && off < bestOff) {
            bestOff = off;
            best = BD_abs(m[1]);
        }
    }
    if (best) return best;
    if (page < 100) return BD_HOST + "/?start=" + (page * 20);
    return "";
}

/* ---------- Detail ---------- */

function parseComicDetail(html, url) {
    var s = String(html == null ? "" : html);
    var titleM = /<title>([\s\S]*?)<\/title>/i.exec(s);
    var title = titleM ? BD_text(titleM[1].replace(/\s*-\s*Page\s*\d+\s*\/\s*\d+/i, "")) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = BD_decode(og[1]).replace(/\s*-\s*\(?\s*Page\s*\d+\s*\/\s*\d+\s*\)?/i, "");
    }

    var coverM = /src="(https:\/\/i2\.buondua\.com\/[^"]+)"/i.exec(s);
    var coverUrl = coverM ? coverM[1].split("?")[0] : null;

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

    var titleM = /<title>([\s\S]*?)<\/title>/i.exec(s);
    var title = titleM ? BD_text(titleM[1].replace(/\s*-\s*\(?\s*Page\s*\d+\s*\/\s*\d+\s*\)?/i, "")) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = BD_decode(og[1]).replace(/\s*-\s*\(?\s*Page\s*\d+\s*\/\s*\d+\s*\)?/i, "");
    }

    // images in article-fulltext region
    var imgs = [];
    var seen = {};
    var start = s.indexOf("article-fulltext");
    var end = s.indexOf("pagination-next", start);
    var block = (start >= 0) ? s.substring(start, (end > start ? end : start + 200000)) : s;
    var re = /src="(https:\/\/i2\.buondua\.com\/[^"]+\.(?:webp|jpg|jpeg|png)(?:\?[^"]*)?)"/g;
    var m;
    while ((m = re.exec(block)) !== null) {
        var src = m[1].split("?")[0];
        if (!seen[src]) { seen[src] = 1; imgs.push(src); }
    }
    if (imgs.length === 0) {
        var re2 = /src="(https:\/\/i2\.buondua\.com\/[^"]+)"/g;
        while ((m = re2.exec(s)) !== null) {
            var src2 = m[1].split("?")[0];
            if (!seen[src2]) { seen[src2] = 1; imgs.push(src2); }
        }
    }

    // current page number from url or title
    var current = 1;
    var pm = String(url).match(/[?&]page=(\d+)/);
    if (pm) current = parseInt(pm[1], 10);
    else {
        var tm = title.match(/Page\s*(\d+)\s*\/\s*\d+/i);
        if (tm) current = parseInt(tm[1], 10);
    }
    if (isNaN(current) || current < 1) current = 1;

    var base = String(url).split("?")[0];
    if (base.charAt(base.length - 1) !== "/") base += "/";

    var nextLink = "";
    if (s.indexOf("?page=" + (current + 1)) >= 0) {
        nextLink = base + "?page=" + (current + 1);
    }
    var prevLink = "";
    if (current > 1) {
        if (current - 1 <= 1) prevLink = base.replace(/\?page=\d+/, "");
        else prevLink = base + "?page=" + (current - 1);
    }
    // clean trailing ?page=1
    if (prevLink.indexOf("?page=1") >= 0) prevLink = prevLink.split("?")[0];

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
        "User-Agent": BD_UA,
        "Referer": BD_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getComicCategories() {
    return JSON.stringify([
        { "title": "Hot", "url": "https://buondua.com/hot" }
    ]);
}
