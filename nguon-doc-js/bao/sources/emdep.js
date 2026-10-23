/**
 * Emdep (emdep.vn) — nguồn báo dạng JS.
 * Nền tảng WordPress, HTML tĩnh, không Cloudflare/challenge.
 * 
 * - Danh sách: mỗi tin là `<article>` hoặc `<div class="item">`; tiêu đề 
 *   nằm trong `<h3>` hoặc `<h2>` kèm link; ảnh `src`/`data-src`; mô tả `div.description` hoặc `p.sapo`.
 *   Phân trang: `?page=N` (block `div.pagination`), trang chủ không phân trang.
 * - Tìm kiếm: không có trang tìm kiếm nội bộ → searchable: false.
 * - Đọc bài: `h1.entry-title`; sapo `div.entry-sapo` hoặc `meta[property="og:description"]`; 
 *   thân `div.entry-content`; dừng ở `div-related` / `div.tags` / `footer`.
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
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
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
        .replace(/<br\s*\\?>/gi, "\n")
        .replace(/<\/[p|div|li|h[1-6]|figure|figcaption]>/gi, "\n");
    s = emDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function emAbs(raw) {
    if (!raw) return null;
    var link = emDecode(raw).replace(/&/g, "&").trim();
    if (!link) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return EM_HOST + link;
    return null;
}

function emImgSrc(tag) {
    if (!tag) return null;
    var m = /data-src="([^"]+)"/i.exec(tag)
        || /data-original="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = emDecode(m[1]).replace(/&/g, "&").trim();
    if (!url || url.indexOf("data:") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

// Chỉ nhận link bài viết: /<slug>.htm, bỏ trang chủ, tag, etc.
function emIsArticleLink(link) {
    if (!link) return false;
    var low = String(link).toLowerCase();
    if (low.indexOf(EM_HOST + "/") !== 0) return false;
    var path = low.substring(EM_HOST.length);
    if (path.indexOf("?") >= 0) return false;
    // Chỉ nhận .htm và là bài viết (không phải tag, chuyên mục)
    if (!/\.htm$/i.test(path)) return false;
    // Bỏ chuyên mục và tag pages
    var nonArticles = ["tin-tuc.htm", "home.htm", "du-thi.htm", "sao-a.htm", "anh-hay-a.htm", "khoanh-khac-song-a.htm"];
    for (var i = 0; i < nonArticles.length; i++) {
        if (path === nonArticles[i]) return false;
    }
    // Bỏ các trang con khác nếu cần
    return true;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

function emParseCard(part) {
    if (!part) return null;

    var href = null;
    var title = null;
    var imageUrl = null;
    var excerpt = null;

    // Tìm link và title
    var am = /<a\b[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
    if (am) {
        var hm = /href="([^"]+)"/i.exec(am[1]);
        if (hm) href = hm[1];
        var tm = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(am[2]);
        title = emStrip(tm ? tm[1] : am[2]);
        if (!title) {
            var at = /title="([^"]+)"/i.exec(am[1]);
            if (at) title = emStrip(at[1]);
        }
    }
    if (!href) {
        var any = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
        if (any) {
            href = any[1];
            title = emStrip(any[2]);
        }
    }

    var link = emAbs(href);
    if (!link || !emIsArticleLink(link)) return null;

    if (!title) {
        var h2 = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(part);
        if (h2) title = emStrip(h2[1]);
    }
    if (!title) return null;
    title = title.replace(/\s+/g, " ").trim();
    if (title.length < 5) return null;

    // Ảnh
    var imgTag = /<img\b[^>]*>/i.exec(part);
    imageUrl = imgTag ? emImgSrc(imgTag[0]) : null;

    // Mô tả/excerpt
    var emM = /<div[^>]*class="[^"]*sapo[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(part)
        || /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(part);
    if (emM) {
        var txt = emStrip(emM[1]).replace(/\s+/g, " ").trim();
        if (txt.length >= 10) excerpt = txt;
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        sourceName: EM_SOURCE_NAME
    };
}

function emParseCards(html) {
    if (!html) return "[]";
    var source = emStrip(html).replace(/<!--[\s\S]*?-->/g, " ");
    var items = [];
    var seen = {};

    // Thử parse như JSON API trước
    var jsonStart = source.indexOf("{");
    if (jsonStart >= 0) {
        var jsonText = source.substring(jsonStart);
        try {
            var json = JSON.parse(jsonText);
            if (json.data && json.data.contents) {
                var list = json.data.contents;
                for (var i = 0; i < list.length; i++) {
                    var it = list[i];
                    if (!it) continue;
                    var link = emAbs(it.url);
                    if (!link) continue;
                    link = link.replace(/[?#].*$/, "");
                    if (!/-post\d+\.html$/i.test(link)) continue;
                    var title = emStrip(it.title).replace(/\s+/g, " ").trim();
                    if (title.length < 5) continue;
                    var excerpt = emStrip(it.description).replace(/\s+/g, " ").trim();
                    if (excerpt && excerpt.length < 20) excerpt = null;
                    var imageUrl = it.avatar_url ? emAbs(it.avatar_url) : null;
                    var epoch = parseInt(it.date, 10);
                    items.push({
                        title: title,
                        link: link,
                        excerpt: excerpt,
                        imageUrl: imageUrl,
                        pubDate: epoch ? emDateLabel(epoch) : null,
                        pubDateMs: epoch ? epoch * 1000 : 0,
                        sourceName: EM_SOURCE_NAME
                    });
                }
                return JSON.stringify(items);
            }
        } catch (e) {
            // Fall through to HTML parsing
        }
    }

    // Parse HTML
    var parts = source.split('<article ');
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 6000) part = part.substring(0, 6000);
        var item = emParseCard(part);
        if (!item) continue;
        var ilink = String(item.link).toLowerCase();
        if (seen[ilink]) continue;
        seen[ilink] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

function emDateLabel(epochSec) {
    var n = parseInt(epochSec, 10);
    if (!n || isNaN(n)) return null;
    var d = new Date(n * 1000 + 7 * 3600 * 1000);
    var dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
    var hh = d.getUTCHours(), mi = d.getUTCMinutes();
    return (dd < 10 ? "0" + dd : "") + dd + "/" + (mm < 10 ? "0" + mm : "") + mm + "/" + yy +
        " " + (hh < 10 ? "0" + hh : "") + hh + ":" + (mi < 10 ? "0" + mi : "") + mi;
}

function emQuery(url, name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)", "i").exec(String(url || ""));
    return m ? m[1] : null;
}

// ----------------------------------------------------------------------
// Phân trang
// ----------------------------------------------------------------------

function emGetNewsNextPageUrl(currentUrl, page, html) {
    if (!page || page < 2) return null;
    if (page > EM_MAX_PAGE) return null;

    var source = String(html || "");
    var pagerM = /<div class="pagination">[\s\S]*?<\/div>/i.exec(source);
    if (!pagerM) return null; // trang chủ: không phân trang

    var cur = page;
    var cm = /[?&]page=(\d+)/i.exec(String(currentUrl || ""));
    if (cm) cur = parseInt(cm[1], 10);

    var bestHref = null;
    var bestNum = 0;
    var re = /<a\b[^>]*href="([^"]+)"[^>]*>/gi;
    var m;
    while ((m = re.exec(pagerM[1])) !== null) {
        var href = m[1].replace(/&/g, "&");
        var nm = /[?&]page=(\d+)/i.exec(href);
        if (!nm) continue;
        var n = parseInt(nm[1], 10);
        if (n > cur && (bestHref === null || n < bestNum)) {
            bestHref = href;
            bestNum = n;
        }
    }
    if (!bestHref) return null; // trang cuối
    return emResolve(currentUrl, bestHref);
}

function emResolve(base, href) {
    href = String(href || "").trim().replace(/&/g, "&");
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

function emGetNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var EM_BODY_START = [
    'class="entry-content"',
    'itemprop="articleBody"',
    'class="article__body"'
];

var EM_BODY_END = [
    'class="related"',
    'class="tags"',
    '<footer'
];

function emTitle(source) {
    var res = [
        /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
        /<h1[^>]*>([\s\S]*?)<\/h1>/i,
        /<title>([\s\S]*?)<\/title>/i
    ];
    for (var i = 0; i < res.length; i++) {
        var m = res[i].exec(source);
        if (!m) continue;
        var t = emStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t.replace(/\s*-\s*EMDEP\.VN$/i, "");
    }
    return "";
}

// Vị trí bắt đầu thân bài
function emFindBodyStart(source) {
    for (var i = 0; i < EM_BODY_START.length; i++) {
        var idx = source.indexOf(EM_BODY_START[i]);
        if (idx < 0) continue;
        var gt = source.indexOf(">", idx);
        if (gt > 0) return gt + 1;
    }
    return -1;
}

function emCutBody(source, start) {
    var end = source.length;
    for (var e = 0; e < EM_BODY_END.length; e++) {
        var endIdx = source.indexOf(EM_BODY_END[e], start);
        if (endIdx >= 0 && endIdx < end) end = endIdx;
    }
    return source.substring(start, end);
}

function emScanBlocks(body) {
    var blocks = [];
    var src = String(body).replace(/<figure\b[^>]*>[\\s\\S]*?<\/figure>/gi, function (tag) {
        var imgTag = /<img\b[^>]*>/i.exec(tag);
        var src = imgTag ? emImgSrc(imgTag[0]) : null;
        var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
        var caption = capM ? emStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
        if (src) {
            blocks.push({ isImage: true, text: caption, imageUrl: emAbs(src), isVideo: false, videoUrl: null });
        } else {
            var vidM = /<(?:video|iframe)\b[^>]*src="([^"]+)"/i.exec(tag);
            if (vidM) {
                blocks.push({ isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: emAbs(vidM[1]) });
            }
        }
        return "\u0001" + (blocks.length - 1) + "\u0002";
    });

    src = src.replace(/<br\s*\\?>/gi, "\n")
        .replace(/<p\b[^>]*>/gi, "\n\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<div\b[^>]*>/gi, "\n\n")
        .replace(/<[^>]*>/g, " ");
    src = emDecode(src)
        .replace(/[ \t\u00a0]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{2,}/g, "\n\n");

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
            var b = blocks[idx];
            var bbParts = b.text ? [b.text] : [];
            for (var j = 0; j < bbParts.length; j++) {
                out.push({ isImage: b.isImage, text: bbParts[j], imageUrl: b.imageUrl, isVideo: b.isVideo, videoUrl: b.videoUrl });
            }
        }
        last = re.lastIndex;
    }
    // Xử phần còn lại
    var chunk = src.substring(last);
    var parts = chunk.split(/\n{2,}/);
    for (var i = 0; i < parts.length; i++) {
        var t = parts[i].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        if (!t || t.length < 20) continue;
        out.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
    }
    return out;
}

function emSapo(source) {
    var m = /<div[^>]*class="[^"]*entry-sapo[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!m) return null;
    var t = emStrip(m[1]).replace(/\s+/g, " ").trim();
    return t.length >= 20 ? t : null;
}

function emRelated(source, selfLink) {
    var items = [];
    var seen = {};
    var chunks = [];
    var marks = ['class="related"', 'class="tags"'];
    for (var i = 0; i < marks.length; i++) {
        var idx = source.indexOf(marks[i]);
        if (idx >= 0) chunks.push(source.substring(idx, idx + 50000));
    }
    var self = String(selfLink || "").replace(/[?#].*$/, "");
    for (var c = 0; c < chunks.length; c++) {
        var more = emParseCards(chunks[c]);
        for (var j = 0; j < more.length; j++) {
            var it = more[j];
            if (it.link === self || seen[it.link]) continue;
            seen[it.link] = true;
            items.push(it);
            if (items.length >= 12) return items;
        }
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    // Trang challenge/không có nội dung
    if (source.length < 3000) return null;

    var start = -1;
    var startMark = "";
    for (var i = 0; i < EM_BODY_START.length; i++) {
        var idx = source.indexOf(EM_BODY_START[i]);
        if (idx >= 0 && (start < 0 || idx < start)) {
            start = idx;
            startMark = EM_BODY_START[i];
        }
    }
    if (start < 0) return null;

    var gt = source.indexOf(">", start);
    if (gt < 0) return null;

    var body = source.substring(gt + 1);
    var end = body.length;
    for (var e = 0; e < EM_BODY_END.length; e++) {
        var endIdx = body.indexOf(EM_BODY_END[e]);
        if (endIdx >= 0 && endIdx < end) end = endIdx;
    }
    body = body.substring(0, end);
    body = emStrip(body).replace(/<!--[\s\S]*?-->/g, " ");

    var blocks = emScanBlocks(body);

    // Sapo nằm ngoài thân bài
    if (startMark !== 'class="entry-content"') {
        var sapo = emSapo(source);
        if (sapo) blocks.unshift({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
    }

    var title = emTitle(source);
    if (!title && blocks.length === 0) return null;
    if (blocks.length === 0) return null;

    return JSON.stringify({
        title: title,
        blocks: blocks,
        related: emRelated(source, url)
    });
}