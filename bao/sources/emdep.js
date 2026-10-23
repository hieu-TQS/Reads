/**
 * Emdep (emdep.vn) — nguồn báo dạng JS.
 * Nền tảng WordPress, HTML tĩnh, không Cloudflare/challenge.
 *
 * Cấu trúc thực tế (cập nhật 10/2026):
 * - Danh sách:
 *     + <div class="item d-flex align-items-center flex-column card ..."> — card thường
 *     + <div class="item-hot mb-3"> — card nổi bật
 *     + <div class="item-row-2"> — card dạng hàng 2 cột
 *   Tiêu đề trong <a class="title ...">; ảnh <img src=...> (bare attr, không có dấu nháy)
 *   Link trực tiếp trong href của <a class="thumb"> hoặc <a class="title ...">
 * - Bài viết: <h1 class="title">, sapo <div class="sapo mobile-sapo">,
 *   thân bài trong <div class="mobile-body"> (chứa HTML lồng nhau).
 * - Phân trang: /category/page-N.htm
 * - Toàn bộ hàm trả JSON string, ES5 thuần (Rhino).
 */

var EM_HOST = "https://emdep.vn";
var EM_SOURCE_NAME = "Emdep";
var EM_MAX_PAGE = 100;
var EM_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var EM_CATEGORIES = [
    { name: "Trang chủ", pageUrl: EM_HOST + "/" },
    { name: "Tin tức", pageUrl: EM_HOST + "/tin-tuc.htm" },
    { name: "Thời trang", pageUrl: EM_HOST + "/thoi-trang.htm" },
    { name: "Món ngon", pageUrl: EM_HOST + "/mon-ngon.htm" },
    { name: "Làm đẹp", pageUrl: EM_HOST + "/lam-dep.htm" },
    { name: "Gia đình", pageUrl: EM_HOST + "/giu-lua-hon-nhan.htm" },
    { name: "Sống đẹp", pageUrl: EM_HOST + "/sang-dep.htm" },
    { name: "Ăn ngon", pageUrl: EM_HOST + "/an-ngon.htm" },
    { name: "Video clips", pageUrl: EM_HOST + "/video-clips-v.htm" },
    { name: "Khác", pageUrl: EM_HOST + "/khac.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "emdep",
        name: EM_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=emdep.vn&sz=64",
        categories: EM_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("emdep.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": EM_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        "Referer": EM_HOST + "/"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var EM_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
    lsquo: "'", rsquo: "'", ldquo: "\u201c", rdquo: "\u201d", bull: "•", middot: "·",
    copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", deg: "°",
    agrave: "à", aacute: "á", atilde: "ã", acirc: "â", abreve: "ă",
    egrave: "è", eacute: "é", ecirc: "ê",
    igrave: "ì", iacute: "í",
    ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ohorn: "ơ",
    ugrave: "ù", uacute: "ú", uhorn: "ư",
    yacute: "ý", ygrave: "ỳ",
    dstrok: "đ",
    Agrave: "À", Aacute: "Á", Atilde: "Ã", Acirc: "Â", Abreve: "Ă",
    Egrave: "È", Eacute: "É", Ecirc: "Ê",
    Igrave: "Ì", Iacute: "Í",
    Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ohorn: "Ơ",
    Ugrave: "Ù", Uacute: "Ú", Uhorn: "Ư",
    Yacute: "Ý", Ygrave: "Ỳ",
    Dstrok: "Đ"
};

function emDecode(value) {
    if (value === null || value === undefined) return "";
    var s = String(value);
    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
        var code = parseInt(hex, 16);
        return isNaN(code) ? m : String.fromCharCode(code);
    });
    s = s.replace(/&#(\d+);/g, function (m, dec) {
        var code = parseInt(dec, 10);
        return isNaN(code) ? m : String.fromCharCode(code);
    });
    s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, function (m, name) {
        return EM_ENTITIES.hasOwnProperty(name) ? EM_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function emStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/[p|div|li|h[1-6]|figure|figcaption]>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = emDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function emAbs(raw) {
    if (!raw) return null;
    var link = emDecode(raw).trim();
    if (!link) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return EM_HOST + link;
    return null;
}

function emImgSrc(tag) {
    if (!tag) return null;
    // Ảnh emdep dùng bare attribute: src=https://... (không có dấu nháy)
    var m = /data-src="([^"]+)"/i.exec(tag)
        || /data-original="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag)
        || /src=([^\s"'>]+)/i.exec(tag);  // bare src
    if (!m) return null;
    var url = emDecode(m[1]).trim();
    if (!url || url.indexOf("data:") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    // Bỏ qua logo và ảnh placeholder nhỏ
    if (url.indexOf("/logo") !== -1) return null;
    return url;
}

// Chỉ nhận link bài viết: /category/slug-timestamp.htm
function emIsArticleLink(link) {
    if (!link) return false;
    var low = String(link).toLowerCase();
    if (low.indexOf(EM_HOST + "/") !== 0) return false;
    var path = low.substring(EM_HOST.length);
    if (path.indexOf("?") >= 0) return false;
    if (path.indexOf("/tag/") !== -1) return false;
    if (path.indexOf("/author/") !== -1) return false;
    if (path.indexOf("/page-") !== -1) return false;
    if (!/\.htm$/i.test(path)) return false;
    // Bỏ trang chủ và trang category (không có slash thứ 2)
    if (path === "/" || path === "/index.htm" || path === "/home.htm") return false;
    var parts = path.split("/").filter(function (p) { return p.length > 0; });
    if (parts.length < 2) return false;
    return true;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

/**
 * Parse một card bất kỳ từ HTML snippet.
 * Hỗ trợ 3 kiểu card mới của emdep:
 *   - div.item.d-flex...   → a.thumb + div.info > a.title
 *   - div.item-hot         → a.thumb + a.title
 *   - div.item-row-2       → a.thumb + a.title.line-b
 */
function emParseCard(part) {
    if (!part) return null;

    var href = null;
    var title = null;
    var imageUrl = null;

    // 1. Tìm <a class="title ..."> — có trong tất cả các card kiểu mới
    var titleM = /\bhref="([^"]+)"[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(part)
        || /\bclass="[^"]*\btitle\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
    if (titleM) {
        href = titleM[1];
        title = emStrip(titleM[2]);
    }

    // 2. Fallback: lấy href từ <a class="thumb">
    if (!href) {
        var thumbM = /href="([^"]+)"[^>]*class="[^"]*\bthumb\b/i.exec(part)
            || /class="[^"]*\bthumb\b[^"]*"\s[^>]*href="([^"]+)"/i.exec(part);
        if (thumbM) href = thumbM[1];
    }

    // 3. Fallback: lấy title từ attribute title= trên <a class="title">
    if (!title) {
        var attrM = /class="[^"]*\btitle\b[^"]*"[^>]*title="([^"]+)"/i.exec(part)
            || /title="([^"]+)"[^>]*class="[^"]*\btitle\b/i.exec(part);
        if (attrM) title = emStrip(attrM[1]);
    }

    // 4. Fallback: title= trên <a class="thumb">
    if (!title) {
        var thumbTitleM = /class="[^"]*\bthumb\b[^"]*"[^>]*title="([^"]+)"/i.exec(part)
            || /title="([^"]+)"[^>]*class="[^"]*\bthumb\b/i.exec(part);
        if (thumbTitleM) title = emStrip(thumbTitleM[1]);
    }

    var link = emAbs(href);
    if (!link || !emIsArticleLink(link)) return null;
    if (!title) return null;
    title = title.replace(/\s+/g, " ").trim();
    if (title.length < 5) return null;

    // Ảnh — emdep dùng bare attribute src=url (không có dấu nháy)
    var imgTag = /<img\b[^>]*>/i.exec(part);
    imageUrl = imgTag ? emImgSrc(imgTag[0]) : null;

    return {
        title: title,
        link: link,
        excerpt: null,
        imageUrl: imageUrl,
        sourceName: EM_SOURCE_NAME
    };
}

function emParseCards(html) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};

    // Tách theo 3 loại card của emdep (thứ tự quan trọng: item-hot trước item)
    var parts = source.split(/<div\s+class="(?:item-hot\b|item-row-2\b|item\s+d-flex\b)[^"]*">/i);
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 8000) part = part.substring(0, 8000);
        var item = emParseCard(part);
        if (!item) continue;
        var ilink = String(item.link).toLowerCase();
        if (seen[ilink]) continue;
        seen[ilink] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

// ----------------------------------------------------------------------
// Phân trang
// ----------------------------------------------------------------------

function emResolve(base, href) {
    href = String(href || "").trim();
    if (!href) return null;
    if (href.indexOf("http") === 0) return href;
    if (href.indexOf("//") === 0) return "https:" + href;
    if (href.charAt(0) === "/") return EM_HOST + href;
    var b = String(base || EM_HOST + "/").split("#")[0];
    var q = b.indexOf("?");
    if (q >= 0) b = b.substring(0, q);
    if (href.charAt(0) === "?") return b + href;
    var slash = b.lastIndexOf("/");
    if (slash > 8) b = b.substring(0, slash + 1);
    return b + href;
}

/**
 * Phân trang emdep dạng: /category/page-N.htm
 * Tìm link page-N.htm tiếp theo trong <ul class="pagination ...">
 */
function getNewsNextPageUrl(currentUrl, page, html) {
    if (!page || page < 2) return null;
    if (page > EM_MAX_PAGE) return null;

    var source = String(html || "");

    // Tìm khối pagination
    var pagerM = /<ul[^>]*class="[^"]*pagination[^"]*"[^>]*>[\s\S]*?<\/ul>/i.exec(source);
    if (!pagerM) return null;

    var pagerHtml = pagerM[0];

    // Tìm tất cả href dạng page-N.htm
    var re = /href="([^"]*\/page-(\d+)\.htm[^"]*)"/gi;
    var m;
    var bestNum = 0;
    var bestHref = null;
    var cur = page - 1; // trang hiện tại là page-1 khi page=2, v.v.

    // Xác định trang hiện tại từ URL
    var curM = /\/page-(\d+)\.htm/i.exec(String(currentUrl || ""));
    if (curM) cur = parseInt(curM[1], 10);

    while ((m = re.exec(pagerHtml)) !== null) {
        var n = parseInt(m[2], 10);
        if (n > cur && (bestNum === 0 || n < bestNum)) {
            bestNum = n;
            bestHref = m[1];
        }
    }

    if (!bestHref || page > bestNum) return null;

    // Xây URL trang kế: thay/thêm page-N.htm vào base URL
    var base = String(currentUrl || "");
    // Nếu URL hiện tại đã có page-N.htm → thay thế
    if (/\/page-\d+\.htm/i.test(base)) {
        return base.replace(/\/page-\d+\.htm/i, "/page-" + page + ".htm");
    }
    // Nếu URL dạng /category.htm → /category/page-N.htm
    if (/\.htm$/i.test(base)) {
        return base.replace(/\.htm$/i, "/page-" + page + ".htm");
    }
    // Fallback
    return emAbs(bestHref);
}

function getNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

function emTitle(source) {
    var res = [
        /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
        /<title>([\s\S]*?)<\/title>/i
    ];
    for (var i = 0; i < res.length; i++) {
        var m = res[i].exec(source);
        if (!m) continue;
        var t = emStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t;
    }
    return "";
}

/**
 * Sapo mới: <div class="sapo mobile-sapo">
 * Có chứa <img class="sapo-img"> ở đầu cần bỏ đi.
 */
function emSapo(source) {
    var m = /<div[^>]*class="[^"]*\bsapo\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!m) return null;
    // Bỏ thẻ img (logo sapo-img)
    var inner = m[1].replace(/<img\b[^>]*>/gi, "");
    var t = emStrip(inner).replace(/\s+/g, " ").trim();
    t = t.replace(/^[\s\-–—|]+/, "").trim();
    return t.length >= 20 ? t : null;
}

function emScanBlocks(body) {
    var blocks = [];

    var src = String(body);

    // Thay figure/video/iframe/table bằng marker
    src = src.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<table\b[^>]*>[\s\S]*?<\/table>/gi, function (tag) {
        var lower = tag.toLowerCase();
        var b = null;

        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var imgSrc = imgTag ? emImgSrc(imgTag[0]) : null;
            var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var caption = capM ? emStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
            if (imgSrc) {
                b = { isImage: true, text: caption, imageUrl: emAbs(imgSrc), isVideo: false, videoUrl: null };
            } else {
                var vidM = /<(?:video|iframe)\b[^>]*src="([^"]+)"/i.exec(tag);
                if (vidM) {
                    b = { isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: emAbs(vidM[1]) };
                }
            }
        } else if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var vM = /src="([^"]+)"/i.exec(tag);
            if (vM && vM[1].indexOf("about:blank") < 0) {
                b = { isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: emAbs(vM[1]) };
            }
        } else if (lower.indexOf("<table") === 0) {
            var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
            var lines = [];
            for (var r = 0; r < rows.length; r++) {
                var cells = rows[r].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
                var cparts = [];
                for (var c = 0; c < cells.length; c++) cparts.push(emStrip(cells[c]));
                var line = cparts.join(" | ").replace(/\s+/g, " ").trim();
                if (line) lines.push(line);
            }
            var tableText = lines.join("\n");
            if (tableText.length >= 20) {
                b = { isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null };
            }
        }

        if (!b) return " ";
        blocks.push(b);
        return "\u0001" + (blocks.length - 1) + "\u0002";
    });

    // Ảnh standalone (không trong figure)
    src = src.replace(/<img\b[^>]*>/gi, function (tag) {
        var imgSrc = emImgSrc(tag);
        if (!imgSrc) return " ";
        var b = { isImage: true, text: null, imageUrl: imgSrc, isVideo: false, videoUrl: null };
        blocks.push(b);
        return "\u0001" + (blocks.length - 1) + "\u0002";
    });

    // Chuyển các thẻ còn lại thành text
    src = src.replace(/<br\s*\/?>/gi, "\n")
        .replace(/<p\b[^>]*>/gi, "\n\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<div\b[^>]*>/gi, "\n\n")
        .replace(/<[^>]*>/g, " ");
    src = emDecode(src)
        .replace(/[ \t\u00a0]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{2,}/g, "\n\n");

    // Ghép lại text và blocks
    var out = [];
    var re = /\u0001(\d+)\u0002/g;
    var last = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
        var chunk = src.substring(last, m.index);
        var parts = chunk.split(/\n{2,}/);
        for (var i = 0; i < parts.length; i++) {
            var t = parts[i].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
            if (!t || t.length < 20) continue;
            out.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
        var idx = parseInt(m[1], 10);
        if (!isNaN(idx) && blocks[idx]) {
            out.push(blocks[idx]);
        }
        last = re.lastIndex;
    }
    // Phần còn lại
    var chunk = src.substring(last);
    var parts = chunk.split(/\n{2,}/);
    for (var i = 0; i < parts.length; i++) {
        var t = parts[i].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        if (!t || t.length < 20) continue;
        out.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
    }
    return out;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    // Trang challenge / không có nội dung
    if (source.length < 3000) return null;

    var title = emTitle(source);
    if (!title) return null;

    var blocks = [];

    // Sapo: <div class="sapo mobile-sapo">
    var sapo = emSapo(source);
    if (sapo) {
        blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
    }

    // Thân bài: <div class="mobile-body">
    var bodyStart = source.indexOf('class="mobile-body"');
    if (bodyStart < 0) bodyStart = source.indexOf("class='mobile-body'");
    if (bodyStart >= 0) {
        var gt = source.indexOf(">", bodyStart);
        if (gt > 0) {
            var body = source.substring(gt + 1);
            // Dừng ở </section> hoặc footer hoặc section liên quan
            var endIdx = body.search(/<\/section>|<footer|<div class="bg-white py-2"|<section class="bg-white/i);
            if (endIdx > 0) body = body.substring(0, endIdx);

            // Strip HTML wrapper lồng nhau (emdep nhúng full HTML document vào mobile-body)
            body = body.replace(/<!DOCTYPE[^>]*>/gi, "")
                .replace(/<html[^>]*>/gi, "")
                .replace(/<\/html>/gi, "")
                .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
                .replace(/<body[^>]*>/gi, "")
                .replace(/<\/body>/gi, "");

            var bodyBlocks = emScanBlocks(body);
            for (var i = 0; i < bodyBlocks.length; i++) {
                blocks.push(bodyBlocks[i]);
            }
        }
    }

    // Fallback: <div class="body mb-3 container-mobile"> (wrapper mới)
    if (blocks.length === 0 || (!sapo && blocks.length <= 1)) {
        var contStart = source.indexOf('class="body mb-3 container-mobile"');
        if (contStart < 0) contStart = source.indexOf('class="content"');
        if (contStart >= 0) {
            var gt2 = source.indexOf(">", contStart);
            if (gt2 > 0) {
                var section = source.substring(gt2 + 1);
                var endSec = section.search(/<\/section>|<section\b/i);
                if (endSec > 0) section = section.substring(0, endSec);

                // Thử lấy mobile-body bên trong
                var innerBodyStart = section.indexOf('class="mobile-body"');
                if (innerBodyStart >= 0) {
                    var gt3 = section.indexOf(">", innerBodyStart);
                    if (gt3 > 0) {
                        var body2 = section.substring(gt3 + 1);
                        body2 = body2.replace(/<!DOCTYPE[^>]*>/gi, "")
                            .replace(/<html[^>]*>/gi, "")
                            .replace(/<\/html>/gi, "")
                            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
                            .replace(/<body[^>]*>/gi, "")
                            .replace(/<\/body>/gi, "");

                        var bodyBlocks2 = emScanBlocks(body2);
                        var insertIdx = sapo ? 1 : 0;
                        for (var i = bodyBlocks2.length - 1; i >= 0; i--) {
                            blocks.splice(insertIdx, 0, bodyBlocks2[i]);
                        }
                    }
                } else {
                    // Không có mobile-body → scan toàn bộ section
                    var bodyBlocks3 = emScanBlocks(section);
                    var insertIdx2 = sapo ? 1 : 0;
                    for (var i = bodyBlocks3.length - 1; i >= 0; i--) {
                        blocks.splice(insertIdx2, 0, bodyBlocks3[i]);
                    }
                }
            }
        }
    }

    // Lọc trùng lặp blocks
    var finalBlocks = [];
    var seenText = {};
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.isImage || b.isVideo) {
            finalBlocks.push(b);
            continue;
        }
        var key = b.text ? b.text.substring(0, 100) : "";
        if (!key || seenText[key]) continue;
        seenText[key] = true;
        finalBlocks.push(b);
    }

    if (finalBlocks.length === 0) return null;

    return JSON.stringify({
        title: title,
        blocks: finalBlocks,
        related: []
    });
}
