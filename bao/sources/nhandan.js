/**
 * Nhan Dan (nhandan.vn) — nguồn báo dạng JS.
 *
 * Site KHÔNG bị Cloudflare: HTML tĩnh, chỉ cần UA mobile.
 *  - Chuyên mục: /chinhtri/, /kinhte/, /xahoi/, /thegioi/, /vanhoa/, /thethao/,
 *    /giai-tri/, /phapluat/, /giaoduc/, /y-te/, /khoahoc-congnghe/ (URL có gạch
 *    nối khác nhau, KHÔNG phải /chinh-tri.html).
 *  - Mỗi tin là <article class="story">: bìa figure.story__thumb, tiêu đề
 *    h2.story__heading, sapo div.story__summary, giờ <time data-time="<epoch>">.
 *  - Phân trang: KHÔNG dùng ?page=. Nút "Xem thêm" (button.control__loadmore,
 *    data-zone/data-type) gọi JSON API https://api.nhandan.vn/api/
 *    morenews-<type>-<zone>-<page>.html?phrase= (data.contents + data.load_more).
 *  - Trang chủ không có nút "Xem thêm" → chỉ 1 trang.
 *  - Tìm kiếm: trang /tim-kiem/ render bằng JS → gọi thẳng API
 *    morenews-search-0-<page>.html?phrase=<q>.
 *  - Bài viết: h1.article__title, sapo div.article__sapo, thân
 *    div.article__body (itemprop=articleBody) → dừng ở div.article__author.
 *    Ảnh trong bài là .jpg.avif; bỏ đuôi ".avif" để Glide trên Android cũ
 *    (không giải mã được AVIF) vẫn tải được bản .jpg.
 *
 * Mọi hàm trả JSON string. ES5 thuần (Rhino).
 */

var ND_HOST = "https://nhandan.vn";
var ND_API = "https://api.nhandan.vn";
var ND_SOURCE_NAME = "Nhân Dân";
var ND_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
var ND_MAX_PAGE = 40;
var ND_MAX_SEARCH_PAGE = 20;

var ND_CATEGORIES = [
    { name: "Trang chủ", pageUrl: ND_HOST + "/" },
    { name: "Chính trị", pageUrl: ND_HOST + "/chinhtri/" },
    { name: "Kinh tế", pageUrl: ND_HOST + "/kinhte/" },
    { name: "Xã hội", pageUrl: ND_HOST + "/xahoi/" },
    { name: "Thế giới", pageUrl: ND_HOST + "/thegioi/" },
    { name: "Văn hóa", pageUrl: ND_HOST + "/vanhoa/" },
    { name: "Thể thao", pageUrl: ND_HOST + "/thethao/" },
    { name: "Giải trí", pageUrl: ND_HOST + "/giai-tri/" },
    { name: "Pháp luật", pageUrl: ND_HOST + "/phapluat/" },
    { name: "Giáo dục", pageUrl: ND_HOST + "/giaoduc/" },
    { name: "Y tế", pageUrl: ND_HOST + "/y-te/" },
    { name: "Khoa học - Công nghệ", pageUrl: ND_HOST + "/khoahoc-congnghe/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "nhandan",
        name: ND_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=nhandan.vn&sz=64",
        categories: ND_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("nhandan.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": ND_MOBILE_UA,
        "Referer": ND_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
    });
}

/* ---------- Helpers ---------- */

var ND_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", bull: "\u2022",
    middot: "\u00b7", times: "\u00d7", laquo: "\u00ab", raquo: "\u00bb"
};

function ndChar(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function ndDecode(s) {
    if (s == null) return "";
    var out = String(s);
    out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (m, hex) { return ndChar(parseInt(hex, 16)); });
    out = out.replace(/&#(\d+);?/g, function (m, dec) { return ndChar(parseInt(dec, 10)); });
    out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (m, name) {
        var key = name.toLowerCase();
        return ND_ENTITIES.hasOwnProperty(key) ? ND_ENTITIES[key] : m;
    });
    return out;
}

function ndTrim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function ndText(s) {
    var out = String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    out = ndDecode(out).replace(/\u00a0/g, " ");
    return ndTrim(out.replace(/[ \t\r\f\v]+/g, " ").replace(/ *\n */g, "\n"));
}

function ndAbs(u) {
    u = ndTrim(u).replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return ND_HOST + u;
    return ND_HOST + "/" + u;
}

function ndAttr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return m[2] != null ? m[2] : m[3];
}

function ndQuery(url, name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)", "i").exec(String(url == null ? "" : url));
    return m ? m[1] : "";
}

/** Ảnh .jpg.avif → .jpg (Glide máy cũ không giải mã AVIF). */
function ndImageUrl(u) {
    var url = ndAbs(u);
    if (!url) return null;
    if (/\.avif$/i.test(url)) url = url.replace(/\.avif$/i, "");
    return url;
}

function ndImgSrc(tag) {
    if (!tag) return null;
    var m = /data-src\s*=\s*"([^"]+)"/i.exec(tag)
        || /data-original\s*=\s*"([^"]+)"/i.exec(tag)
        || /data-srcset\s*=\s*"([^"]+)"/i.exec(tag)
        || /srcset\s*=\s*"([^"]+)"/i.exec(tag)
        || /src\s*=\s*"([^"]+)"/i.exec(tag);
    if (!m) return null;
    var v = ndTrim(m[1]).split(/\s+/)[0];
    if (!v || v.indexOf("data:image") === 0) return null;
    return v;
}

function ndTryJson(s) {
    var t = ndTrim(s);
    if (!t || t.charAt(0) !== "{") return null;
    try { return JSON.parse(t); } catch (e) { return null; }
}

function ndEpochMs(epoch, unit) {
    if (epoch === null || epoch === undefined || !isFinite(epoch)) return 0;
    return unit === "s" ? epoch * 1000 : epoch;
}

function ndDateText(ms) {
    if (!ms || ms <= 0) return null;
    var d = new Date(ms);
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ---------- List: thẻ tin ---------- */

function ndItemsFromCards(html, max) {
    var out = [];
    var seen = {};
    var parts = String(html == null ? "" : html).split(/<article\b[^>]*class="story[^"]*"/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var te = chunk.indexOf("</article>");
        if (te >= 0) chunk = chunk.substring(0, te);

        var hrefM = /<a\b[^>]*href="([^"]*post\d+\.html[^"]*)"[^>]*>/i.exec(chunk);
        if (!hrefM) continue;
        var link = ndAbs(hrefM[1]);
        if (!link) continue;
        link = link.replace(/[?#].*$/, "");
        if (seen[link]) continue;

        var title = "";
        var tm = /<h2\b[^>]*class="[^"]*story__heading[^"]*"[^>]*>([\s\S]*?)<\/h2>/i.exec(chunk);
        if (tm) {
            var aIn = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(tm[1]);
            title = ndText(aIn ? aIn[1] : tm[1]);
        }
        if (!title) title = ndDecode(ndAttr(hrefM[0], "title"));
        title = ndTrim(title).replace(/\s+/g, " ");
        if (!title || title.length < 5) continue;
        seen[link] = 1;

        var imgTag = /<img\b[^>]*>/i.exec(chunk);
        var imageUrl = imgTag ? ndImageUrl(ndImgSrc(imgTag[0])) : null;

        var excerpt = null;
        var em = /<div\b[^>]*class="[^"]*story__summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
        if (em) {
            excerpt = ndText(em[1]).replace(/\s+/g, " ");
            if (excerpt.length < 20) excerpt = null;
            else if (excerpt.length > 300) excerpt = excerpt.substring(0, 300).replace(/\s+\S*$/, "") + "…";
        }

        var pubDateMs = 0;
        var epochM = /<time\b[^>]*data-time="(\d+)"/i.exec(chunk);
        if (epochM) {
            pubDateMs = ndEpochMs(parseInt(epochM[1], 10), "s");
        } else {
            var isoM = /<time\b[^>]*datetime="([^"]+)"/i.exec(chunk);
            if (isoM) {
                var parsed = Date.parse(isoM[1]);
                if (!isNaN(parsed)) pubDateMs = parsed;
            }
        }

        var pubDate = null;
        var timeText = /<time\b[^>]*>([\s\S]*?)<\/time>/i.exec(chunk);
        if (timeText) pubDate = ndText(timeText[1]).replace(/\s+/g, " ");

        out.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: imageUrl,
            pubDate: pubDate || ndDateText(pubDateMs),
            pubDateMs: pubDateMs,
            sourceName: ND_SOURCE_NAME
        });
        if (max && out.length >= max) break;
    }
    return out;
}

/* ---------- List: JSON API ---------- */

function ndItemsFromJson(json, max) {
    var out = [];
    if (!json || !json.data || !json.data.contents) return out;
    var list = json.data.contents;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it) continue;
        var link = ndAbs(it.url);
        if (!link) continue;
        link = link.replace(/[?#].*$/, "");
        if (!/post\d+\.html$/i.test(link)) continue;
        var title = ndTrim(ndText(it.title)).replace(/\s+/g, " ");
        if (!title || title.length < 5) continue;

        var excerpt = it.description ? ndText(it.description).replace(/\s+/g, " ") : "";
        if (excerpt.length < 20) excerpt = null;
        else if (excerpt.length > 300) excerpt = excerpt.substring(0, 300).replace(/\s+\S*$/, "") + "…";

        var epoch = parseInt(it.date, 10);
        var ms = isNaN(epoch) ? 0 : epoch * 1000;

        out.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: it.avatar_url ? ndImageUrl(it.avatar_url) : null,
            pubDate: ndDateText(ms),
            pubDateMs: ms,
            sourceName: ND_SOURCE_NAME
        });
        if (max && out.length >= max) break;
    }
    return out;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var json = ndTryJson(html);
    if (json) return JSON.stringify(ndItemsFromJson(json, 60));

    var src = String(html);
    /* Trang chuyên mục: cắt box "Các chuyên mục khác" ở cuối để không lẫn tin zone khác. */
    if (src.indexOf("control__loadmore") >= 0) {
        var mp = src.indexOf('<div class="multi-pack"');
        if (mp > 0) src = src.substring(0, mp);
    }
    return JSON.stringify(ndItemsFromCards(src, 60));
}

/* ---------- Pagination ---------- */

function ndApiUrl(type, zone, page, phraseEncoded) {
    return ND_API + "/api/morenews-" + type + "-" + zone + "-" + page + ".html?phrase=" + (phraseEncoded || "");
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        if (!currentUrl) return null;
        var p = parseInt(page, 10);
        if (isNaN(p) || p < 2) return null;

        var apiM = /\/api\/morenews-([a-z]+)-(\d+)-(\d+)\.html/i.exec(String(currentUrl));
        if (apiM) {
            var json = ndTryJson(html);
            if (!json || !json.data) return null;
            if (json.data.load_more === false) return null;
            var cap = apiM[1] === "search" ? ND_MAX_SEARCH_PAGE : ND_MAX_PAGE;
            if (p > cap) return null;
            return ndApiUrl(apiM[1], apiM[2], p, ndQuery(currentUrl, "phrase"));
        }

        if (p > ND_MAX_PAGE) return null;
        var btn = /<button\b[^>]*class="[^"]*control__loadmore[^"]*"[^>]*>/i.exec(String(html || ""));
        if (!btn) return null;
        var zone = ndAttr(btn[0], "data-zone");
        var type = ndAttr(btn[0], "data-type") || "zone";
        if (!zone) return null;
        return ndApiUrl(type, zone, p, "");
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    var q = ndTrim(query);
    if (!q) return null;
    var p = page && page > 0 ? Math.floor(page) : 1;
    if (p > ND_MAX_SEARCH_PAGE) return null;
    return ndApiUrl("search", "0", p, encodeURIComponent(q));
}

/* ---------- Article ---------- */

var ND_TITLE_RES = [
    /<h1\b[^>]*class="[^"]*article__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta\b[^>]*property="og:title"[^>]*content="([^"]+)"/i
];

var ND_BODY_START = ['class="article__body', 'itemprop="articleBody"', 'class="detail-content'];

var ND_BODY_END = [
    '<div class="article__author"',
    '<div class="article__tag"',
    '<div class="wrap-comment',
    '<div class="article-footer"',
    '<div class="related-news"',
    '<div class="multi-pack"'
];

var ND_BLOCK_RE = /<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<table\b[^>]*>[\s\S]*?<\/table>|<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>|<(p|h1|h2|h3|h4|h5|blockquote)\b[^>]*>[\s\S]*?<\/\2>/gi;

function ndFindBodyStart(source) {
    for (var i = 0; i < ND_BODY_START.length; i++) {
        var idx = source.indexOf(ND_BODY_START[i]);
        if (idx < 0) continue;
        var gt = source.indexOf(">", idx);
        if (gt > 0) return gt + 1;
    }
    return -1;
}

function ndCutBody(source, start) {
    var end = source.length;
    for (var i = 0; i < ND_BODY_END.length; i++) {
        var idx = source.indexOf(ND_BODY_END[i], start);
        if (idx >= 0 && idx < end) end = idx;
    }
    return source.substring(start, end);
}

function ndVideoSrc(tag) {
    var m = /<(?:video|source|iframe)\b[^>]*(?:data-src|src)="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = ndDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function ndTableText(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(ndText(cells[c]).replace(/\s+/g, " "));
        var line = ndTrim(parts.join(" | ").replace(/\s+/g, " "));
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function ndListText(tag) {
    var items = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < items.length; i++) {
        var txt = ndText(items[i]).replace(/\s+/g, " ");
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function ndScanBlocks(body) {
    var blocks = [];
    var re = new RegExp(ND_BLOCK_RE.source, "gi");
    var m;
    while ((m = re.exec(body)) !== null) {
        var tag = m[0];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var imgSrc = imgTag ? ndImageUrl(ndImgSrc(imgTag[0])) : null;
            var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var caption = capM ? ndText(capM[1]).replace(/\s+/g, " ") : null;
            if (caption && caption.length < 3) caption = null;
            if (imgSrc) {
                blocks.push({ isImage: true, text: caption, imageUrl: imgSrc, isVideo: false, videoUrl: null });
            } else {
                var vUrl = ndVideoSrc(tag);
                if (vUrl) blocks.push({ isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: vUrl });
            }
            continue;
        }

        if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var vSrc = ndVideoSrc(tag);
            if (vSrc) blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vSrc });
            continue;
        }

        if (lower.indexOf("<table") === 0) {
            var tableText = ndTableText(tag);
            if (tableText) blocks.push({ isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null });
            continue;
        }

        if (lower.indexOf("<ul") === 0 || lower.indexOf("<ol") === 0) {
            var listText = ndListText(tag);
            if (listText) blocks.push({ isImage: false, text: listText, imageUrl: null, isVideo: false, videoUrl: null });
            continue;
        }

        var text = ndText(tag).replace(/\s+/g, " ");
        var isHeading = lower.indexOf("<h1") === 0 || lower.indexOf("<h2") === 0 ||
            lower.indexOf("<h3") === 0 || lower.indexOf("<h4") === 0 || lower.indexOf("<h5") === 0;
        if (text && text.length >= (isHeading ? 4 : 20)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function ndArticleTitle(source) {
    for (var i = 0; i < ND_TITLE_RES.length; i++) {
        var m = ND_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = ndTrim(ndText(m[1])).replace(/\s+/g, " ");
        if (t) return t;
    }
    return "";
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);
    var title = ndArticleTitle(source);

    var bodyStart = ndFindBodyStart(source);
    var blocks = [];
    if (bodyStart >= 0) {
        var body = ndCutBody(source, bodyStart);
        /* Bỏ khối tin liên quan chèn giữa bài (article.story) và script/quảng cáo. */
        body = body.replace(/<article\b[\s\S]*?<\/article>/gi, " ")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

        var sapoIdx = source.indexOf('class="article__sapo');
        if (sapoIdx >= 0) {
            var sapoOpenEnd = source.indexOf(">", sapoIdx);
            var sapoEnd = source.indexOf("</div>", sapoOpenEnd);
            var sapoHtml = source.substring(sapoOpenEnd + 1, sapoEnd > sapoOpenEnd ? sapoEnd : sapoOpenEnd + 4000);
            var sapoText = ndText(sapoHtml).replace(/\s+/g, " ");
            if (sapoText && sapoText.length >= 20) {
                blocks.push({ isImage: false, text: sapoText, imageUrl: null, isVideo: false, videoUrl: null });
            }
        }

        blocks = blocks.concat(ndScanBlocks(body));
    }

    var related = [];
    try {
        var cards = ndItemsFromCards(source, 20);
        var cur = String(url || "").replace(/[?#].*$/, "");
        for (var i = 0; i < cards.length && related.length < 12; i++) {
            if (cards[i].link === cur) continue;
            related.push(cards[i]);
        }
    } catch (e) { related = []; }

    if (!title && blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: related });
}
