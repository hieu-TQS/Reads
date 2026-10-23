/*
 * Nguồn truyện tranh Thế Giới Truyện (thegioitruyen.vn) — chạy trong Rhino (ES5).
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

var TGT_BASE = "https://thegioitruyen.vn";

function getComicSource() {
    return JSON.stringify({
        id: "thegioitruyen",
        name: "Thế Giới Truyện",
        faviconUrl: "https://www.google.com/s2/favicons?domain=thegioitruyen.vn&sz=64",
        baseUrl: TGT_BASE,
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
    if (u.charAt(0) === "/") return TGT_BASE + u;
    return TGT_BASE + "/" + u;
}

var TGT_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0",
    aacute: "\u00e1", agrave: "\u00e0", acirc: "\u00e2", atilde: "\u00e3",
    eacute: "\u00e9", egrave: "\u00e8", ecirc: "\u00ea",
    iacute: "\u00ed", igrave: "\u00ec", icirc: "\u00ee",
    oacute: "\u00f3", ograve: "\u00f2", ocirc: "\u00f4", otilde: "\u00f5",
    uacute: "\u00fa", ugrave: "\u00f9", ucirc: "\u00fb",
    yacute: "\u00fd", eth: "\u0111", dstrok: "\u0111",
    Aacute: "\u00c1", Agrave: "\u00c0", Acirc: "\u00c2",
    Eacute: "\u00c9", Ecirc: "\u00ca",
    Iacute: "\u00cd", Oacute: "\u00d3", Uacute: "\u00da", ETH: "\u0110", Dstrok: "\u0110"
};

function entityChar(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

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
            var value = TGT_ENTITIES[name];
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

function attrOf(tag, name) {
    var m = new RegExp(name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag);
    if (!m) m = new RegExp(name + "\\s*=\\s*'([^']*)'", "i").exec(tag);
    return m ? decodeEntities(m[1]) : "";
}

function chapNumber(url) {
    var m = /chap-([0-9]+(?:\.[0-9]+)?)/i.exec(String(url || ""));
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return isNaN(n) ? 0 : n;
}

function sortChaptersByNumber(list) {
    list.sort(function (a, b) {
        var na = chapNumber(a.link);
        var nb = chapNumber(b.link);
        if (na !== nb) return na - nb;
        return 0;
    });
    return list;
}

/* ------------------------------------------------------------------ */
/* Trang danh sách                                                     */
/* ------------------------------------------------------------------ */

function getComicHomeUrl(page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page <= 1) return TGT_BASE + "/truyen/";
    return TGT_BASE + "/truyen/page/" + page + "/";
}

function getComicSearchRequest(query, page) {
    var url = TGT_BASE + "/?s=" + encodeURIComponent(String(query || "")) + "&post_type=truyen";
    return JSON.stringify({
        url: url,
        method: "GET",
        headers: { "Referer": TGT_BASE + "/" }
    });
}

function parseComicList(html, url) {
    if (!html) return JSON.stringify([]);
    var items = [];
    var parts = html.split(/<div\b[^>]*class\s*=\s*["']tgt-card["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var titleAnchor = firstMatch(chunk, /<a\b([^>]*\btgt-card-title\b[^>]*)>([\s\S]*?)<\/a>/i);
        var title = "";
        var link = "";
        if (titleAnchor) {
            link = attrOf("<a " + titleAnchor[1] + ">", "href");
            title = cleanText(titleAnchor[2]);
        }
        if (!link) {
            var anyA = firstMatch(chunk, /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i);
            if (anyA) link = anyA[1];
        }
        if (!title && link) title = link;

        var img = firstMatch(chunk, /<img\b[^>]*>/i);
        var coverUrl = "";
        if (img) {
            var src = attrOf(img[0], "src");
            if (src) coverUrl = absUrl(src);
        }

        var chapM = firstMatch(chunk, /class\s*=\s*["'][^"']*\btgt-card-chap\b[^"']*["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
        var latestChapter = chapM ? cleanText(chapM[1]) : "";

        if (!link || !title) continue;
        link = absUrl(link);
        /* Bỏ kết quả tìm kiếm không phải trang truyện (link ?p=... thường 404) */
        if (link.indexOf("/truyen/") < 0) continue;
        items.push({
            title: title,
            link: link,
            coverUrl: coverUrl,
            author: "",
            latestChapter: latestChapter
        });
    }

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
    if (!m) m = firstMatch(html, /<a\b[^>]*class\s*=\s*["'][^"']*\bnext page-numbers\b[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i);
    if (!m) return "";
    var next = absUrl(m[1]);
    return next === currentUrl ? "" : next;
}

/* ------------------------------------------------------------------ */
/* Chi tiết truyện                                                     */
/* ------------------------------------------------------------------ */

function parseComicDetail(html, url) {
    if (!html) return "";
    var title = "";
    var titleM = firstMatch(html, /<h1\b[^>]*class\s*=\s*["'][^"']*\btgt-info-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (titleM) title = cleanText(titleM[1]);
    if (!title) {
        var ogTitle = firstMatch(html, /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i);
        if (ogTitle) title = cleanText(ogTitle[1]);
    }

    var cover = "";
    var thumbM = firstMatch(html, /class\s*=\s*["'][^"']*\btgt-info-thumb\b[^"']*["'][\s\S]*?<img\b[^>]*>/i);
    if (thumbM) {
        var imgTag = firstMatch(thumbM[0], /<img\b[^>]*>/i);
        if (imgTag) cover = absUrl(attrOf(imgTag[0], "src"));
    }
    if (!cover) {
        var ogImg = firstMatch(html, /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
        if (ogImg) cover = absUrl(ogImg[1]);
    }

    var author = "";
    var authorM = firstMatch(html, /Tác giả<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (authorM) author = cleanText(authorM[1]);

    var description = "";
    var descM = firstMatch(html, /class\s*=\s*["'][^"']*\btgt-desc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (descM) description = cleanText(descM[1]);
    if (description.length > 1200) description = description.substring(0, 1200).replace(/\s+\S*$/, "") + "\u2026";

    var chapters = [];
    var seen = {};
    var re = /<a\b([^>]*\btgt-chapter-item\b[^>]*)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var attrs = m[1];
        var body = m[2];
        var href = attrOf("<a " + attrs + ">", "href");
        if (!href) continue;
        var link = absUrl(href);
        if (seen[link]) continue;
        seen[link] = true;
        var chapTitle = "";
        var nameM = firstMatch(body, /class\s*=\s*["'][^"']*\btgt-chap-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (nameM) chapTitle = cleanText(nameM[1]);
        if (!chapTitle) chapTitle = cleanText(body);
        if (!chapTitle) continue;
        chapters.push({ title: chapTitle, link: link });
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

function parseComicChapter(html, url) {
    if (!html) return "";
    var title = "";
    var selM = firstMatch(html, /<option\b[^>]*selected[^>]*>([\s\S]*?)<\/option>/i);
    if (selM) title = cleanText(selM[1]);
    if (!title) {
        var tM = firstMatch(html, /<title>([\s\S]*?)<\/title>/i);
        if (tM) title = cleanText(tM[1]);
    }

    var imageUrls = [];
    var seen = {};
    var imgRe = /<img\b[^>]*>/gi;
    var im;
    while ((im = imgRe.exec(html)) !== null) {
        var tag = im[0];
        if (tag.indexOf("tgt-reader-page") < 0) continue;
        var u = attrOf(tag, "src");
        if (!u) continue;
        if (u.indexOf("data:") === 0) continue;
        var abs = absUrl(u);
        if (seen[abs]) continue;
        seen[abs] = true;
        imageUrls.push(abs);
    }

    var prevLink = "";
    var nextLink = "";
    var aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var am;
    while ((am = aRe.exec(html)) !== null) {
        var attrs = am[1];
        if (attrs.indexOf("tgt-reader-btn") < 0) continue;
        var href = attrOf("<a " + attrs + ">", "href");
        if (!href) continue;
        var abs = absUrl(href);
        var text = cleanText(am[2]);
        if (/tr\u01b0\u1edbc/i.test(text)) {
            if (!prevLink) prevLink = abs;
        } else if (/sau/i.test(text)) {
            if (!nextLink) nextLink = abs;
        }
    }

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getComicHeaders(url) {
    return JSON.stringify({
        "Referer": TGT_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

function getComicCategories() {
    return JSON.stringify([
    { title: '16+', url: 'https://thegioitruyen.vn/the-loai/16/' },
    { title: 'Action', url: 'https://thegioitruyen.vn/the-loai/action/' },
    { title: 'Adult', url: 'https://thegioitruyen.vn/the-loai/adult/' },
    { title: 'Adventure', url: 'https://thegioitruyen.vn/the-loai/adventure/' },
    { title: 'Anime', url: 'https://thegioitruyen.vn/the-loai/anime/' },
    { title: 'Chuyển Sinh', url: 'https://thegioitruyen.vn/the-loai/chuyen-sinh/' },
    { title: 'Cổ Đại', url: 'https://thegioitruyen.vn/the-loai/co-dai/' },
    { title: 'Comedy', url: 'https://thegioitruyen.vn/the-loai/comedy/' },
    { title: 'Comic', url: 'https://thegioitruyen.vn/the-loai/comic/' },
    { title: 'Cooking', url: 'https://thegioitruyen.vn/the-loai/cooking/' },
    { title: 'Đam Mỹ', url: 'https://thegioitruyen.vn/the-loai/dam-my/' },
    { title: 'Doujinshi', url: 'https://thegioitruyen.vn/the-loai/doujinshi/' },
    { title: 'Drama', url: 'https://thegioitruyen.vn/the-loai/drama/' },
    { title: 'Ecchi', url: 'https://thegioitruyen.vn/the-loai/ecchi/' },
    { title: 'Fantasy', url: 'https://thegioitruyen.vn/the-loai/fantasy/' },
    { title: 'Gender Bender', url: 'https://thegioitruyen.vn/the-loai/gender-bender/' },
    { title: 'Harem', url: 'https://thegioitruyen.vn/the-loai/harem/' },
    { title: 'Historical', url: 'https://thegioitruyen.vn/the-loai/historical/' },
    { title: 'Horror', url: 'https://thegioitruyen.vn/the-loai/horror/' },
    { title: 'Josei', url: 'https://thegioitruyen.vn/the-loai/josei/' },
    { title: 'Live action', url: 'https://thegioitruyen.vn/the-loai/live-action/' },
    { title: 'Manga', url: 'https://thegioitruyen.vn/the-loai/manga/' },
    { title: 'Manhua', url: 'https://thegioitruyen.vn/the-loai/manhua/' },
    { title: 'Manhwa', url: 'https://thegioitruyen.vn/the-loai/manhwa/' },
    { title: 'Martial Arts', url: 'https://thegioitruyen.vn/the-loai/martial-arts/' },
    { title: 'Mature', url: 'https://thegioitruyen.vn/the-loai/mature/' },
    { title: 'Mecha', url: 'https://thegioitruyen.vn/the-loai/mecha/' },
    { title: 'Mystery', url: 'https://thegioitruyen.vn/the-loai/mystery/' },
    { title: 'Ngôn Tình', url: 'https://thegioitruyen.vn/the-loai/ngon-tinh/' },
    { title: 'One shot', url: 'https://thegioitruyen.vn/the-loai/one-shot/' },
    { title: 'Psychological', url: 'https://thegioitruyen.vn/the-loai/psychological/' },
    { title: 'Romance', url: 'https://thegioitruyen.vn/the-loai/romance/' },
    { title: 'School Life', url: 'https://thegioitruyen.vn/the-loai/school-life/' },
    { title: 'Sci-fi', url: 'https://thegioitruyen.vn/the-loai/sci-fi/' },
    { title: 'Seinen', url: 'https://thegioitruyen.vn/the-loai/seinen/' },
    { title: 'Shoujo', url: 'https://thegioitruyen.vn/the-loai/shoujo/' },
    { title: 'Shoujo Ai', url: 'https://thegioitruyen.vn/the-loai/shoujo-ai/' },
    { title: 'Shounen', url: 'https://thegioitruyen.vn/the-loai/shounen/' },
    { title: 'Shounen Ai', url: 'https://thegioitruyen.vn/the-loai/shounen-ai/' },
    { title: 'Slice of Life', url: 'https://thegioitruyen.vn/the-loai/slice-of-life/' },
    { title: 'Smut', url: 'https://thegioitruyen.vn/the-loai/smut/' },
    { title: 'Soft Yaoi', url: 'https://thegioitruyen.vn/the-loai/soft-yaoi/' },
    { title: 'Soft Yuri', url: 'https://thegioitruyen.vn/the-loai/soft-yuri/' },
    { title: 'Sports', url: 'https://thegioitruyen.vn/the-loai/sports/' },
    { title: 'Supernatural', url: 'https://thegioitruyen.vn/the-loai/supernatural/' },
    { title: 'Tạp chí truyện tranh', url: 'https://thegioitruyen.vn/the-loai/tap-chi-truyen-tranh/' },
    { title: 'Thiếu Nhi', url: 'https://thegioitruyen.vn/the-loai/thieu-nhi/' },
    { title: 'Tragedy', url: 'https://thegioitruyen.vn/the-loai/tragedy/' },
    { title: 'Trinh Thám', url: 'https://thegioitruyen.vn/the-loai/trinh-tham/' },
    { title: 'Truyện Màu', url: 'https://thegioitruyen.vn/the-loai/truyen-mau/' },
    { title: 'Truyện scan', url: 'https://thegioitruyen.vn/the-loai/truyen-scan/' },
    { title: 'Việt Nam', url: 'https://thegioitruyen.vn/the-loai/viet-nam/' },
    { title: 'Webtoon', url: 'https://thegioitruyen.vn/the-loai/webtoon/' },
    { title: 'Xuyên Không', url: 'https://thegioitruyen.vn/the-loai/xuyen-khong/' }
    ]);
}
