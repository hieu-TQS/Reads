/*
 * Cosblay (vn.cosblay.com) — nguồn truyện tranh dạng ảnh (bộ sưu tập ảnh cosplay/model).
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

var CB_HOST = "https://vn.cosblay.com";
var CB_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Entity map ---------- */
var CB_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", bull: "\u2022",
    middot: "\u00b7", times: "\u00d7", copy: "\u00a9", reg: "\u00ae",
    trade: "\u2122", deg: "\u00b0"
};

function CB_trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

function CB_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function CB_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) { return CB_char(parseInt(hex, 16)); });
        out = out.replace(/&#(\d+);?/g, function (all, dec) { return CB_char(parseInt(dec, 10)); });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var v = CB_ENTITIES[name];
            return v == null ? all : v;
        });
    }
    return out;
}

function CB_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return CB_HOST + u;
    return CB_HOST + "/" + u;
}

function CB_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function CB_text(html) {
    var s = CB_stripTags(html);
    s = CB_decode(s);
    s = s.replace(/\s+/g, " ");
    return CB_trim(s);
}

/* ---------- Source ---------- */

function getComicSource() {
    return JSON.stringify({
        id: "cosblay",
        name: "Cosblay",
        faviconUrl: "https://www.google.com/s2/favicons?domain=vn.cosblay.com&sz=64",
        baseUrl: CB_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return CB_HOST + "/";
    return CB_HOST + "/page/" + page;
}

function getComicSearchRequest(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var url;
    if (page <= 1) url = CB_HOST + "/?s=" + encodeURIComponent(String(query == null ? "" : query));
    else url = CB_HOST + "/page/" + page + "/?s=" + encodeURIComponent(String(query == null ? "" : query));
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": CB_UA,
            "Referer": CB_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseComicList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<article[^>]*class="[^"]*post[^"]*"/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('<article');
        if (cut > 0) chunk = chunk.substring(0, cut);

        var linkM = /<h2 class="entry-title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) {
            linkM = /<a[^>]+href="(https:\/\/vn\.cosblay\.com\/\d{4}\/[^"]+\.html)"[^>]*>([\s\S]{0,120}?)<\/a>/i.exec(chunk);
        }
        if (!linkM) continue;
        var link = CB_abs(linkM[1]);
        if (seen[link]) continue;
        seen[link] = 1;

        var title = CB_text(linkM[2]);
        if (!title) continue;

        var imgM = /<img[^>]+src="([^"]+)"/i.exec(chunk);
        var coverUrl = null;
        if (imgM) {
            var src = imgM[1];
            if (src.indexOf("cropped-") === -1) coverUrl = CB_abs(src);
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
    var re = /href="(https:\/\/vn\.cosblay\.com\/page\/(\d+)[^"]*)"/g;
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
    if (page < 100) return "https://vn.cosblay.com/page/" + (page + 1);
    return "";
}

/* ---------- Detail ---------- */

function parseComicDetail(html, url) {
    var s = String(html == null ? "" : html);
    var titleM = /<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (!titleM) titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? CB_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = CB_decode(og[1]);
    }

    var coverM = /src="(https:\/\/c1\.cosblay\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(s);
    if (!coverM) coverM = /src="(https:\/\/vn\.cosblay\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(s);
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

    var titleM = /<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (!titleM) titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? CB_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = CB_decode(og[1]);
    }

    var imgs = [];
    var seen = {};
    var re = /src="(https:\/\/c1\.cosblay\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/g;
    var m;
    while ((m = re.exec(s)) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = 1; imgs.push(m[1]); }
    }
    if (imgs.length === 0) {
        var re2 = /src="(https:\/\/vn\.cosblay\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/g;
        while ((m = re2.exec(s)) !== null) {
            if (!seen[m[1]]) { seen[m[1]] = 1; imgs.push(m[1]); }
        }
    }

    return JSON.stringify({
        title: title,
        imageUrls: imgs,
        prevLink: "",
        nextLink: ""
    });
}

/* ---------- Headers ---------- */

function getComicHeaders(url) {
    return JSON.stringify({
        "User-Agent": CB_UA,
        "Referer": CB_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getComicCategories() {
    return JSON.stringify([
        { "title": "Cosplay", "url": "https://vn.cosblay.com/category/cosplay" },
        { "title": "Vẻ đẹp Châu Á", "url": "https://vn.cosblay.com/category/ve-dep-chau-a" },
        { "title": "Vẻ đẹp Phương Tây", "url": "https://vn.cosblay.com/category/ve-dep-phuong-tay" }
    ]);
}
