/*
 * Truyện nhà Ong (truyennhaong.vn) — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách (1-based)
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
 * Lưu ý của site:
 *  - Truyện: /tac-pham/<slug>; chương: /doc-truyen/<slug>/<id 24 hex>.
 *  - Mục lục nằm trong #tab-panel-toc, đủ toàn bộ chương (không chia trang),
 *    thứ tự đọc tăng dần. Tiêu đề mục lục thường KHÔNG có "Chương N" → tự đánh số.
 *  - Trang chương có <select id="chapters-navigation-select"> liệt kê toàn bộ chương
 *    theo đúng thứ tự đọc → dùng vị trí option để suy ra chương trước/sau.
 *  - Nội dung nằm trong các <div class="... paragraph-content"> (mỗi khối theo sau là
 *    nút thả tim). Một số chương nội dung bị mã hoá base64 trong thuộc tính data-enc
 *    (site giải mã bằng atob) → script tự giải mã.
 *  - Tìm kiếm: /tim-kiem?keyword=<q> (không phân trang, tối đa ~20 kết quả).
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var TN_HOST = "https://truyennhaong.vn";
var TN_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

/* ---------- Helpers ---------- */

/* Bảng entity HTML (tên → ký tự), phủ ký tự Latin-1 + dấu tiếng Việt. */
var TN_ENTITIES = {
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

function TN_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

/* Giải mã entity: số thập phân, hex và tên; 2 lượt để gỡ cả trường hợp encode 2 lần. */
function TN_decode(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return TN_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return TN_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (all, name) {
            return TN_ENTITIES.hasOwnProperty(name) ? TN_ENTITIES[name] : all;
        });
    }
    return out;
}

function TN_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function TN_strip(html) {
    return String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
}

/* Văn bản thuần: giải mã entity, gọn khoảng trắng, giữ xuống dòng giữa các đoạn. */
function TN_text(html) {
    var s = TN_strip(html);
    s = TN_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return TN_trim(s);
}

function TN_abs(u) {
    u = TN_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return TN_HOST + u;
    return TN_HOST + "/" + u;
}

function TN_attr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return m[2] != null ? m[2] : m[3];
}

/* Giải base64 → chuỗi UTF-8 (Rhino không có atob/TextDecoder). */
function TN_bytesFromB64(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var s = String(str == null ? "" : str).replace(/[^A-Za-z0-9+/=]/g, "");
    var bytes = [];
    var buf = 0;
    var bits = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (c === "=") break;
        var v = chars.indexOf(c);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buf >> bits) & 0xFF);
        }
    }
    return bytes;
}

function TN_utf8(bytes) {
    var out = "";
    var i = 0;
    while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) {
            out += String.fromCharCode(b);
        } else if (b >= 0xC2 && b < 0xE0) {
            out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
        } else if (b >= 0xE0 && b < 0xF0) {
            out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
        } else {
            var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
            cp -= 0x10000;
            out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
    }
    return out;
}

function TN_decodeB64(str) {
    return TN_utf8(TN_bytesFromB64(str));
}

function TN_firstMatch(s, re) {
    var m = re.exec(String(s == null ? "" : s));
    return m ? m : null;
}

/* Chương đã có tiền tố "Chương N" chưa? */
function TN_hasChapterPrefix(title) {
    return /^ch(?:uong|\u01b0\u01a1ng)\s*\d/i.test(TN_trim(title));
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "truyennhaong",
        name: "Truyện nhà Ong",
        faviconUrl: "https://truyennhaong.vn/favicon.ico",
        baseUrl: TN_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    return TN_HOST + "/the-loai/tieu-thuyet/" + page;
}

function getNovelSearchRequest(query, page) {
    var q = TN_trim(query);
    var url = TN_HOST + "/tim-kiem?keyword=" + encodeURIComponent(q);
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": TN_UA,
            "Referer": TN_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi,en;q=0.8"
        }
    });
}

/* ---------- List ---------- */

var TN_CARD_MIN_CHAPTERS = /(\d[\d.,]*)\s*ch\u01b0\u01a1ng/i;
var TN_CARD_AUTHOR = /<p\b[^>]*class="[^"]*\bmt-1 text-xs\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i;

function TN_addItem(out, seen, link, title, cover, author, latest) {
    if (!link || seen[link]) return;
    if (!title) return;
    seen[link] = 1;
    out.push({
        title: title,
        link: link,
        coverUrl: cover || null,
        author: author || null,
        latestChapter: latest || null
    });
}

/* Ảnh bìa: ưu tiên ảnh /assets/cover/, không thì ảnh đầu tiên trong thẻ. */
function TN_cover(chunk) {
    var m = /<img\b[^>]*src="([^"]*\/assets\/cover\/[^"]+)"/i.exec(chunk);
    if (!m) {
        var all = /<img\b[^>]*src="([^"]+)"/i.exec(chunk);
        if (all) m = all;
    }
    if (!m) return null;
    var url = TN_abs(m[1]);
    if (!url || /macdinh\.png|error\.jpg/i.test(url)) return null;
    return url;
}

function TN_latest(chunk) {
    var m = TN_CARD_MIN_CHAPTERS.exec(chunk);
    return m ? m[1] + " chương" : null;
}

function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);

    /* 1) Thẻ lưới (trang thể loại, tìm kiếm, "xem tất cả"):
          <a href="/tac-pham/<slug>" class="group"> … </a> */
    var reTag = /<a\b[^>]*>/gi;
    var m;
    while ((m = reTag.exec(s)) !== null) {
        var tag = m[0];
        var href = TN_attr(tag, "href");
        if (!href || href.indexOf("/tac-pham/") < 0) continue;
        if (!/\bgroup\b/.test(TN_attr(tag, "class"))) continue;

        var close = s.indexOf("</a>", m.index + tag.length);
        if (close < 0) continue;
        var chunk = s.substring(m.index + tag.length, close);
        reTag.lastIndex = close;

        var titleM = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
        var title = titleM ? TN_text(titleM[1]) : "";
        if (!title) title = TN_text(chunk);

        TN_addItem(out, seen, TN_abs(href), title, TN_cover(chunk), "", TN_latest(chunk));
    }

    /* 2) Thẻ hàng ngang ở trang chủ: <article class="flex gap-4 group"> … </article> */
    var reArticle = /<article\b[^>]*class="[^"]*\bflex gap-4 group\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((m = reArticle.exec(s)) !== null) {
        var block = m[1];
        var linkM = /<a\b[^>]*href="([^"]*\/tac-pham\/[^"]+)"[^>]*>/i.exec(block);
        if (!linkM) continue;
        var tM = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(block);
        var aM = TN_CARD_AUTHOR.exec(block);
        TN_addItem(
            out, seen,
            TN_abs(linkM[1]),
            tM ? TN_text(tM[1]) : "",
            TN_cover(block),
            aM ? TN_text(aM[1]) : "",
            TN_latest(block)
        );
    }

    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    var m = /<a\b[^>]*href="([^"]+)"[^>]*>\s*<span class="sr-only">\s*Next\s*<\/span>/i.exec(s);
    if (!m) m = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]{0,300}?<span class="sr-only">\s*Next\s*<\/span>/i.exec(s);
    if (!m) return "";
    var next = TN_abs(m[1]);
    if (!next || next === currentUrl) return "";
    return next;
}

/* ---------- Detail ---------- */

function TN_introText(s) {
    var start = s.indexOf("<!-- Intro -->");
    if (start < 0) return "";
    var end = s.indexOf("<!-- CTA Button -->", start);
    if (end < 0) end = s.indexOf("<!-- Categories", start);
    if (end < 0) end = start + 8000;
    var block = s.substring(start, end);
    var parts = block.split(/<p\b[^>]*>/i);
    var lines = [];
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var stop = chunk.indexOf("</p>");
        if (stop >= 0) chunk = chunk.substring(0, stop);
        var t = TN_text(chunk);
        if (t) lines.push(t);
    }
    if (!lines.length) return TN_text(block);
    return lines.join("\n");
}

function TN_genres(s) {
    var start = s.indexOf("<!-- Categories");
    if (start < 0) start = s.indexOf("Th\u1ec3 lo\u1ea1i & Ch\u1ee7 \u0111\u1ec1");
    if (start < 0) return [];
    var end = s.indexOf("<!-- Notices", start);
    if (end < 0) end = Math.min(s.length, start + 6000);
    var block = s.substring(start, end);
    var out = [];
    var seen = {};
    var re = /<a\b[^>]*href="([^"]*\/the-loai\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var g = TN_text(m[2]);
        if (!g || seen[g]) continue;
        seen[g] = 1;
        out.push(g);
    }
    return out;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (tm) title = TN_text(tm[1]);
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = TN_text(og[1]);
    }

    var coverUrl = null;
    var cm = /<img\b[^>]*src="([^"]*\/assets\/cover\/[^"]+)"/i.exec(s);
    if (cm) coverUrl = TN_abs(cm[1]);

    var author = "";
    var am = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (am) author = TN_text(am[1]);

    var description = TN_introText(s);
    if (!description) {
        var dm = /<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i.exec(s);
        if (dm) description = TN_decode(dm[1]);
    }

    var genres = TN_genres(s);

    /* Mục lục đầy đủ trong #tab-panel-toc, thứ tự đọc từ chương 1. */
    var chapters = [];
    var seenCh = {};
    var ti = s.indexOf('id="tab-panel-toc"');
    var tj = s.indexOf('id="tab-panel-comments"', ti);
    var toc = ti >= 0 ? s.substring(ti, tj > ti ? tj : s.length) : "";

    if (toc) {
        var re = /<a\b[^>]*href="([^"]*\/doc-truyen\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        var num = 0;
        while ((m = re.exec(toc)) !== null) {
            var link = TN_abs(m[1]);
            if (!link || seenCh[link]) continue;
            var t = TN_text(m[2]);
            if (!t) continue;
            seenCh[link] = 1;
            num++;
            if (!TN_hasChapterPrefix(t)) t = "Chương " + num + ": " + t;
            chapters.push({ title: t, link: link });
        }
    }

    return JSON.stringify({
        title: title,
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters,
        chapterPages: []
    });
}

function parseNovelChapters(html) {
    var s = String(html == null ? "" : html);
    var out = [];
    var seen = {};
    var re = /<a\b[^>]*href="([^"]*\/doc-truyen\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var num = 0;
    while ((m = re.exec(s)) !== null) {
        var link = TN_abs(m[1]);
        if (!link || seen[link]) continue;
        var t = TN_text(m[2]);
        if (!t) continue;
        seen[link] = 1;
        num++;
        if (!TN_hasChapterPrefix(t)) t = "Chương " + num + ": " + t;
        out.push({ title: t, link: link });
    }
    return JSON.stringify(out);
}

/* ---------- Chapter ---------- */

/* Toàn bộ chương trong <select id="chapters-navigation-select">, đúng thứ tự đọc. */
function TN_chapterOptions(s) {
    var idx = s.indexOf('id="chapters-navigation-select"');
    if (idx < 0) return [];
    var start = s.lastIndexOf("<select", idx);
    var end = s.indexOf("</select>", idx);
    if (start < 0 || end < 0) return [];
    var block = s.substring(start, end);
    var out = [];
    var re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var id = TN_attr(m[1], "value");
        if (!id) continue;
        out.push({ id: id, title: TN_text(m[2]) });
    }
    return out;
}

/* Tách /doc-truyen/<slug>/<id> từ URL chương. */
function TN_chapterParts(url) {
    var m = /\/doc-truyen\/([^\/?#]+)\/([^\/?#]+)/i.exec(TN_trim(url));
    if (!m) return null;
    return { slug: m[1], id: m[2] };
}

function TN_chapterLink(slug, id) {
    return TN_HOST + "/doc-truyen/" + slug + "/" + id;
}

/* Nội dung chương: các khối .paragraph-content, cắt trước nút thả tim / điều hướng. */
function TN_readerRegion(s) {
    var start = s.indexOf('id="reader-content"');
    if (start < 0) return "";
    var end = s.indexOf('<h3 class="text-lg font-bold text-gray-900 dark:text-white mb-6">', start);
    if (end < 0) end = s.indexOf('<div class="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">', start);
    if (end < 0) end = s.length;
    return s.substring(start, end);
}

function TN_paragraphs(region) {
    var out = [];
    var re = /<div\b[^>]*class="[^"]*\bparagraph-content\b[^"]*"[^>]*>/gi;
    var m;
    while ((m = re.exec(region)) !== null) {
        var from = m.index + m[0].length;
        var chunk = region.substring(from);
        var stop = chunk.indexOf('<div class="flex flex-col items-center');
        if (stop >= 0) chunk = chunk.substring(0, stop);
        stop = chunk.search(/<select\b|chapters-navigation-select|location\.href=/i);
        if (stop >= 0) chunk = chunk.substring(0, stop);

        var enc = TN_attr(m[0], "data-enc");
        if (enc) chunk = TN_decodeB64(enc);

        var blocks = chunk.split(/<p\b[^>]*>/i);
        for (var i = 1; i < blocks.length; i++) {
            TN_pushParagraph(out, blocks[i]);
        }
        if (blocks.length <= 1) {
            var text = TN_text(chunk);
            var lines = text.split(/\n+/);
            for (var j = 0; j < lines.length; j++) {
                var line = TN_trim(lines[j]);
                if (line) out.push(line);
            }
        }
    }
    return out;
}

function TN_pushParagraph(out, html) {
    var stop = html.indexOf("</p>");
    if (stop >= 0) html = html.substring(0, stop);
    var t = TN_text(html);
    if (!t) return;
    out.push(t);
}

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (tm) title = TN_text(tm[1]);

    var parts = TN_chapterParts(url);
    var prevLink = "";
    var nextLink = "";
    var position = -1;

    var options = TN_chapterOptions(s);
    if (parts && options.length) {
        for (var i = 0; i < options.length; i++) {
            if (options[i].id === parts.id) { position = i; break; }
        }
        if (position > 0) prevLink = TN_chapterLink(parts.slug, options[position - 1].id);
        if (position >= 0 && position < options.length - 1) nextLink = TN_chapterLink(parts.slug, options[position + 1].id);
        if (!title && position >= 0) title = options[position].title;
    }

    if (title && position >= 0 && !TN_hasChapterPrefix(title)) {
        title = "Chương " + (position + 1) + ": " + title;
    }

    var paragraphs = TN_paragraphs(TN_readerRegion(s));
    if (!paragraphs.length) {
        paragraphs = ["Không tải được nội dung chương này từ Truyện nhà Ong. Thử lại sau hoặc đọc trên website."];
    }

    return JSON.stringify({
        title: title,
        paragraphs: paragraphs,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

/* ---------- Headers ---------- */

function getNovelHeaders(url) {
    return JSON.stringify({
        "User-Agent": TN_UA,
        "Referer": TN_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Tiểu thuyết","url":"https://truyennhaong.vn/the-loai/tieu-thuyet/1"},
        {"title":"Truyện ngắn","url":"https://truyennhaong.vn/the-loai/truyen-ngan/1"},
        {"title":"Lãng mạn","url":"https://truyennhaong.vn/the-loai/lang-man/1"},
        {"title":"Hiện thực","url":"https://truyennhaong.vn/the-loai/hien-thuc/1"},
        {"title":"Giả tưởng","url":"https://truyennhaong.vn/the-loai/gia-tuong/1"},
        {"title":"Bí ẩn","url":"https://truyennhaong.vn/the-loai/bi-an/1"},
        {"title":"Kinh dị","url":"https://truyennhaong.vn/the-loai/kinh-di/1"},
        {"title":"Phiêu lưu","url":"https://truyennhaong.vn/the-loai/phieu-luu/1"},
        {"title":"Giật gân","url":"https://truyennhaong.vn/the-loai/giat-gan/1"},
        {"title":"Hiện thực huyền diệu","url":"https://truyennhaong.vn/the-loai/hien-thuc-huyen-dieu/1"},
        {"title":"Khoa học viễn tưởng","url":"https://truyennhaong.vn/the-loai/khoa-hoc-vien-tuong/1"},
        {"title":"Cổ đại","url":"https://truyennhaong.vn/the-loai/co-dai/1"},
        {"title":"Hiện đại","url":"https://truyennhaong.vn/the-loai/hien-dai/1"},
        {"title":"Cổ trang","url":"https://truyennhaong.vn/the-loai/co-trang/1"},
        {"title":"Kiếm hiệp","url":"https://truyennhaong.vn/the-loai/kiem-hiep/1"},
        {"title":"Võ thuật","url":"https://truyennhaong.vn/the-loai/vo-thuat/1"},
        {"title":"Lịch sử","url":"https://truyennhaong.vn/the-loai/lich-su/1"},
        {"title":"Tâm lý","url":"https://truyennhaong.vn/the-loai/tam-ly/1"},
        {"title":"Tình cảm","url":"https://truyennhaong.vn/the-loai/tinh-cam/1"},
        {"title":"Học đường","url":"https://truyennhaong.vn/the-loai/hoc-duong/1"},
        {"title":"Hài hước","url":"https://truyennhaong.vn/the-loai/hai-huoc/1"},
        {"title":"Gia đình","url":"https://truyennhaong.vn/the-loai/gia-dinh/1"},
        {"title":"Hành động","url":"https://truyennhaong.vn/the-loai/hanh-dong/1"},
        {"title":"Trinh thám","url":"https://truyennhaong.vn/the-loai/trinh-tham/1"},
        {"title":"Linh dị","url":"https://truyennhaong.vn/the-loai/linh-di/1"},
        {"title":"Tái sinh","url":"https://truyennhaong.vn/the-loai/tai-sinh/1"},
        {"title":"Vượt thời không","url":"https://truyennhaong.vn/the-loai/vuot-thoi-khong/1"},
        {"title":"Sinh tồn","url":"https://truyennhaong.vn/the-loai/sinh-ton/1"},
        {"title":"Tận thế","url":"https://truyennhaong.vn/the-loai/tan-the/1"},
        {"title":"Vùng quê","url":"https://truyennhaong.vn/the-loai/vung-que/1"},
        {"title":"Truyện teen","url":"https://truyennhaong.vn/the-loai/truyen-teen/1"},
        {"title":"Truyện thiếu nhi","url":"https://truyennhaong.vn/the-loai/truyen-thieu-nhi/1"},
        {"title":"Tản văn","url":"https://truyennhaong.vn/the-loai/tan-van/1"}
    ]);
}
