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

function decodeEntities(s) {
    if (!s) return "";
    return String(s)
        .replace(/&#0*39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&#0*34;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
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
        chapters: chapters
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

    var prevLink = "";
    var nextLink = "";
    var prevA = firstMatch(html, /<a\b([^>]*\bgo-btn\s+prev\b[^>]*)>/i);
    if (prevA) prevLink = absUrl(attrOf("<a " + prevA[1] + ">", "href"));
    var nextA = firstMatch(html, /<a\b([^>]*\bgo-btn\s+next\b[^>]*)>/i);
    if (nextA) nextLink = absUrl(attrOf("<a " + nextA[1] + ">", "href"));

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getComicHeaders(url) {
    /* CDN ảnh (i178.truyenvua.com / i.hinhhinh.com) chặn hotlink nếu thiếu Referer */
    return JSON.stringify({
        "Referer": QQ_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}
