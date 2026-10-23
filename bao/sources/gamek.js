/**
 * GameK (gamek.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * Nền tảng VCCorp (cùng hạ tầng với GenK), HTML tĩnh, không Cloudflare.
 *  - Danh sách: mỗi tin là `<article>` (trang chủ dùng class `topleft` /
 *    `topright` / không class; chuyên mục nằm trong `<li><article>`), tiêu đề
 *    `<h2>/<h3><a href="...-<id>.chn" title>`, ảnh `<img src>`, mô tả `<p>`,
 *    giờ đăng `<p class=time>... | dd/MM/yyyy HH:mm`.
 *  - Tìm kiếm: `<li>` trong `div.list_search` — tiêu đề `<h2><a>`, ngày
 *    `<span>dd/MM/yyyy</span>`, mô tả `<p>`.
 *  - Phân trang chuyên mục: `/<slug>/page-N.chn` (hoặc `.htm`); pager
 *    `<nav id=paging>`; trang không có pager (trang chủ) → hết trang.
 *  - Trang chủ tải thêm bằng AJAX: `/ajax-hometimeline/trang-N.chn`
 *    (fragment `<li class=top><article>...`, trang đầu cần trang 2).
 *  - Tìm kiếm: `/tim-kiem.chn?keyword=<q>` (+ `&page=N`).
 *  - Đọc bài: tiêu đề `<h1 data-field=title>`, sapo `<h2 data-field=sapo>`,
 *    thân `section[itemprop=articleBody]` trong `div.rightdetail_content`,
 *    ảnh `figure[type=Photo] > img[data-original]` + `figcaption.PhotoCMS_Caption`,
 *    tin liên quan `ul.relate-news`.
 *
 * UA mobile bị 302 sang m.gamek.vn (markup khác) → phải fetch bằng UA desktop.
 * Toàn bộ hàm trả JSON string, ES5 thuần (Rhino).
 */

var GAMEK_HOST = "https://gamek.vn";
var GAMEK_SOURCE_NAME = "GameK";
var GAMEK_MIN_TEXT = 20;
var GAMEK_MAX_PAGE = 60;
var GAMEK_MAX_SEARCH_PAGE = 30;
var GAMEK_MAX_HOME_PAGE = 100;
var GAMEK_MAX_RELATED = 12;
var GAMEK_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var GAMEK_CATEGORIES = [
    { name: "Trang chủ", pageUrl: GAMEK_HOST + "/" },
    { name: "Game Online", pageUrl: GAMEK_HOST + "/game-online.chn" },
    { name: "Game Mobile", pageUrl: GAMEK_HOST + "/mobile-social.chn" },
    { name: "eSports", pageUrl: GAMEK_HOST + "/esport.chn" },
    { name: "PC / Console", pageUrl: GAMEK_HOST + "/pc-console.chn" },
    { name: "Khám phá", pageUrl: GAMEK_HOST + "/kham-pha.chn" },
    { name: "Manga / Film", pageUrl: GAMEK_HOST + "/manga-film.chn" },
    { name: "Hóng", pageUrl: GAMEK_HOST + "/hong.chn" },
    { name: "Cộng đồng mạng", pageUrl: GAMEK_HOST + "/cong-dong-mang.htm" },
    { name: "Gaming Gear", pageUrl: GAMEK_HOST + "/gaming-gear.chn" },
    { name: "Thị trường", pageUrl: GAMEK_HOST + "/thi-truong.chn" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "gamek",
        name: GAMEK_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=gamek.vn&sz=64",
        categories: GAMEK_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("gamek.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": GAMEK_DESKTOP_UA,
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        "Referer": GAMEK_HOST + "/",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var GAMEK_ENTITIES = {
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

function gkDecode(value) {
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
        return GAMEK_ENTITIES.hasOwnProperty(name) ? GAMEK_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function gkStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = gkDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = gkDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Bỏ script/style/comment — HTML gamek rất nặng (CSS inline > 150KB). */
function gkClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Đọc thuộc tính, hỗ trợ cả kiểu không có nháy (HTML gamek nén mạnh). */
function gkAttr(tag, name) {
    if (!tag) return null;
    var re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
    var m = re.exec(tag);
    if (!m) return null;
    var v = m[1];
    if (v === undefined) v = m[2];
    if (v === undefined) v = m[3];
    return gkDecode(v);
}

function gkHasClass(tag, cls) {
    var value = gkAttr(tag, "class");
    if (!value) return false;
    return new RegExp("(^|\\s)" + cls + "(\\s|$)", "i").test(value);
}

function gkNormImg(raw) {
    if (!raw) return null;
    var url = gkDecode(raw).replace(/&amp;/g, "&").trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("data:") === 0 || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

/** Ảnh trong 1 thẻ `<img>`: ưu tiên ảnh gốc `data-original` hơn thumbnail. */
function gkImgSrc(tag) {
    if (!tag) return null;
    var v = gkAttr(tag, "data-original");
    if (!v) v = gkAttr(tag, "data-src");
    if (!v) v = gkAttr(tag, "src");
    if (!v && gkAttr(tag, "srcset")) {
        v = String(gkAttr(tag, "srcset")).split(",")[0];
        v = v ? v.replace(/\s+\S+$/, "").trim() : null;
    }
    return gkNormImg(v);
}

function gkAbs(raw) {
    if (!raw) return null;
    var link = gkDecode(raw).replace(/&amp;/g, "&").trim();
    if (!link || link.indexOf("javascript") === 0) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return GAMEK_HOST + link;
    return null;
}

/** Link bài viết: kết thúc bằng `-<id>.chn` (hoặc `.htm` với bài rất cũ). */
function gkIsArticleLink(href) {
    if (!href) return false;
    var h = String(href).replace(/&amp;/g, "&").replace(/[?#].*$/, "");
    return /-\d+\.(chn|htm)$/i.test(h);
}

/** "dd/MM/yyyy HH:mm" (giờ VN) → mốc epoch ms; trả 0 nếu không có giờ. */
function gkDateMs(text) {
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?)?/.exec(String(text || ""));
    if (!m) return 0;
    var dd = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10);
    var yy = parseInt(m[3], 10);
    var hh = m[4] ? parseInt(m[4], 10) : 0;
    var mi = m[5] ? parseInt(m[5], 10) : 0;
    var ampm = m[6] ? String(m[6]).toLowerCase() : "";
    if (ampm === "pm" && hh < 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2000) return 0;
    return Date.UTC(yy, mm - 1, dd, hh, mi) - 7 * 3600 * 1000;
}

function gkDateLabel(text) {
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(text || ""));
    if (!m) return "";
    var t = /(\d{1,2}):(\d{2})/.exec(String(text || ""));
    return m[0] + (t ? " " + t[0] : "");
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

function gkFirstArticleAnchor(chunk) {
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(chunk)) !== null) {
        var href = gkAttr(m[1], "href");
        if (!gkIsArticleLink(href)) continue;
        return { attrs: m[1], inner: m[2], href: href };
    }
    return null;
}

/**
 * Bóc 1 thẻ tin (khối `<article>` của danh sách/trang chủ, hoặc `<li>` của
 * kết quả tìm kiếm). Trả null nếu không phải bài viết.
 */
function gkParseCard(chunk) {
    if (!chunk) return null;

    var anchor = null;
    var headM = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(chunk);
    if (headM) anchor = gkFirstArticleAnchor(headM[1]);
    if (!anchor) anchor = gkFirstArticleAnchor(chunk);
    if (!anchor) return null;

    var link = gkAbs(anchor.href);
    if (!link) return null;
    link = link.replace(/[?#].*$/, "");

    var title = gkStrip(anchor.inner).replace(/\s+/g, " ").trim();
    if (!title) {
        var attr = gkAttr(anchor.attrs, "title");
        title = attr ? attr.replace(/\s+/g, " ").trim() : "";
    }
    if (title.length < 5) return null;

    var imgTag = /<img\b[^>]*>/i.exec(chunk);
    var imageUrl = imgTag ? gkImgSrc(imgTag[0]) : null;

    var excerpt = null;
    var dateText = "";

    // Tách theo từng `<p>` (gamek không đóng thẻ `</p>` nên không thể regex cặp).
    var parts = chunk.split(/<p(?=[\s>])/i);
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        var gt = part.indexOf(">");
        if (gt < 0) continue;
        var open = part.substring(0, gt);
        var inner = part.substring(gt + 1);
        var isTime = /\btime\b/i.test(open);
        var text = gkStrip(inner).replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (isTime) {
            if (!dateText && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) dateText = text;
            continue;
        }
        if (text === title) continue;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{1,2}:\d{2})?$/.test(text)) {
            if (!dateText) dateText = text;
            continue;
        }
        if (!excerpt && text.length >= GAMEK_MIN_TEXT) excerpt = text;
    }

    if (!dateText) {
        var spanM = /<span\b[^>]*>([\s\S]*?)<\/span>/i.exec(chunk);
        if (spanM && /\d{1,2}\/\d{1,2}\/\d{4}/.test(spanM[1])) {
            dateText = gkStrip(spanM[1]);
        }
    }
    if (!dateText) {
        var timeM = /<time\b[^>]*>([\s\S]*?)<\/time>/i.exec(chunk);
        if (timeM) dateText = gkStrip(timeM[1]);
    }
    if (!dateText) {
        var pipeM = /\|\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/.exec(gkStrip(chunk));
        if (pipeM) dateText = pipeM[1];
    }

    var pubDate = dateText ? gkDateLabel(dateText) : null;
    var pubDateMs = dateText ? gkDateMs(dateText) : 0;
    if (!pubDate) pubDate = null;
    if (excerpt && excerpt.length > 400) {
        excerpt = excerpt.substring(0, 400).replace(/\s+\S*$/, "") + "…";
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDate: pubDate,
        pubDateMs: pubDateMs,
        sourceName: GAMEK_SOURCE_NAME
    };
}

/** Ảnh gần link bài (một số box chỉ có tiêu đề, ảnh nằm ở anchor kế bên). */
function gkImageNear(source, link) {
    var needle = link.indexOf(GAMEK_HOST) === 0 ? link.substring(GAMEK_HOST.length) : link;
    if (!needle) return null;
    var from = 0;
    while (from < source.length) {
        var idx = source.indexOf(needle, from);
        if (idx < 0) return null;
        var start = idx - 900;
        if (start < 0) start = 0;
        var end = idx + 900;
        if (end > source.length) end = source.length;
        var imgTag = /<img\b[^>]*>/i.exec(source.substring(start, end));
        if (imgTag) {
            var url = gkImgSrc(imgTag[0]);
            if (url) return url;
        }
        from = idx + needle.length;
    }
    return null;
}

function gkCollect(items, seen, card) {
    if (!card || !card.link) return;
    if (seen[card.link]) {
        var old = seen[card.link];
        if (!old.imageUrl && card.imageUrl) old.imageUrl = card.imageUrl;
        return;
    }
    seen[card.link] = card;
    items.push(card);
}

function gkParseChunks(chunks, items, seen) {
    for (var i = 0; i < chunks.length; i++) {
        var card = null;
        try {
            card = gkParseCard(chunks[i]);
        } catch (e) {
            card = null;
        }
        gkCollect(items, seen, card);
    }
}

/** Cắt vùng danh sách chính, bỏ sidebar quảng cáo/footer. */
function gkListRegion(source) {
    var s = source;
    // <main> chứa cả cột phụ wptopright (vẫn là tin) → cắt đúng theo </main>
    var mainIdx = s.search(/<main\b/i);
    if (mainIdx >= 0) {
        var rest = s.substring(mainIdx);
        var close = rest.search(/<\/main>/i);
        return close > 0 ? rest.substring(0, close) : rest;
    }
    var left = s.search(/class=["']?contentleft/i);
    if (left >= 0) s = s.substring(left);
    var end = s.length;
    var markers = ["class=contentright", 'class="contentright', "class=adm-rightsection", "<footer", 'id="admStickyFooter', "id=admStickyFooter"];
    for (var i = 0; i < markers.length; i++) {
        var idx = s.indexOf(markers[i]);
        if (idx >= 0 && idx < end) end = idx;
    }
    return s.substring(0, end);
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = gkClean(html);
    var items = [];
    var seen = {};

    // 1. Kết quả tìm kiếm: <li> trong div.list_search
    var searchIdx = source.search(/class=["']?list_search/i);
    var isSearch = searchIdx >= 0;
    if (isSearch) {
        var region = source.substring(searchIdx);
        var stop = region.search(/id=["']?paging|<aside\b|class=["']?contentright/i);
        if (stop > 0) region = region.substring(0, stop);
        gkParseChunks(region.split(/<li(?=[\s>])/i), items, seen);
    }

    // 2. Trang chủ / chuyên mục / fragment AJAX: mỗi tin là <article>
    var listRegion = gkListRegion(source);
    if (!isSearch) {
        var chunks = listRegion.split(/<article\b/i);
        var cards = [];
        for (var i = 1; i < chunks.length; i++) {
            var endIdx = chunks[i].toLowerCase().indexOf("</article>");
            cards.push(endIdx >= 0 ? chunks[i].substring(0, endIdx) : chunks[i]);
        }
        gkParseChunks(cards, items, seen);

        // 3. Box video / tin nhỏ nằm ngoài <article> (li.top video, li.end video…)
        gkParseChunks(listRegion.split(/<li(?=[\s>])/i), items, seen);
    }

    // 4. Fallback: layout lạ (emagazine…) → đi theo từng link bài viết
    if (items.length === 0) {
        var re = /<a\b([^>]*)>/gi;
        var m;
        while ((m = re.exec(source)) !== null) {
            var href = gkAttr(m[1], "href");
            if (!gkIsArticleLink(href)) continue;
            var link = gkAbs(href);
            if (!link) continue;
            link = link.replace(/[?#].*$/, "");
            if (seen[link]) continue;
            var title = gkAttr(m[1], "title");
            title = title ? title.replace(/\s+/g, " ").trim() : "";
            if (title.length < 5) continue;
            var card = {
                title: title,
                link: link,
                excerpt: null,
                imageUrl: gkImageNear(source, link),
                pubDate: null,
                pubDateMs: 0,
                sourceName: GAMEK_SOURCE_NAME
            };
            gkCollect(items, seen, card);
        }
    }

    for (var k = 0; k < items.length; k++) {
        if (!items[k].imageUrl && items[k].link) {
            var near = gkImageNear(source, items[k].link);
            if (near) items[k].imageUrl = near;
        }
    }
    return JSON.stringify(items);
}

// ----------------------------------------------------------------------
// Phân trang
// ----------------------------------------------------------------------

function gkIsHome(url) {
    return /^https?:\/\/(www\.)?gamek\.vn\/?(?:[?#].*)?$/i.test(String(url || ""));
}

function gkPagerMax(html) {
    var s = String(html || "");
    var idx = s.search(/id=["']?paging/i);
    if (idx < 0) return 0;
    var chunk = s.substring(idx, idx + 6000);
    var re = /[?&]page=(\d+)|\/page-(\d+)\.(?:chn|htm)/gi;
    var max = 0;
    var m;
    while ((m = re.exec(chunk)) !== null) {
        var n = parseInt(m[1] || m[2], 10);
        if (n > max) max = n;
    }
    return max;
}

function gkClientPage(url) {
    var m = /[?&]page=(\d+)/i.exec(url);
    if (m) return parseInt(m[1], 10);
    m = /\/page-(\d+)\.(?:chn|htm)/i.exec(url);
    if (m) return parseInt(m[1], 10);
    return 1;
}

function gkKeywordOf(url) {
    var m = /[?&]keyword=([^&#]*)/i.exec(String(url || ""));
    if (!m) return "";
    var q = m[1].replace(/\+/g, " ");
    try {
        q = decodeURIComponent(q);
    } catch (e) {
        // giữ nguyên nếu chuỗi không phải URI hợp lệ
    }
    return q;
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        if (!currentUrl || !page || page < 2) return null;
        var url = String(currentUrl);
        var source = String(html || "");
        var reqPage = Math.floor(page);

        // Fragment AJAX trang chủ
        if (/\/ajax-hometimeline\/trang-\d+\.chn/i.test(url)) {
            if (reqPage > GAMEK_MAX_HOME_PAGE) return null;
            var linkCount = (source.match(/-\d+\.chn/gi) || []).length;
            if (linkCount === 0) return null;
            return GAMEK_HOST + "/ajax-hometimeline/trang-" + reqPage + ".chn";
        }

        // Trang chủ: trang 1 (HTML) → tải tiếp bằng AJAX từ trang 2
        if (gkIsHome(url)) {
            if (reqPage > GAMEK_MAX_HOME_PAGE) return null;
            var links = (source.match(/-\d+\.chn/gi) || []).length;
            if (links === 0) return null;
            return GAMEK_HOST + "/ajax-hometimeline/trang-" + reqPage + ".chn";
        }

        // Tìm kiếm
        if (/\/tim-kiem\.chn/i.test(url)) {
            if (reqPage > GAMEK_MAX_SEARCH_PAGE) return null;
            var maxSearch = gkPagerMax(source);
            if (reqPage > maxSearch) return null;
            var keyword = gkKeywordOf(url);
            if (!keyword) return null;
            return GAMEK_HOST + "/tim-kiem.chn?keyword=" + encodeURIComponent(keyword) + "&page=" + reqPage;
        }

        // Chuyên mục: /<slug>/page-N.(chn|htm)
        if (reqPage > GAMEK_MAX_PAGE) return null;
        var maxCat = gkPagerMax(source);
        if (reqPage > maxCat) return null;
        var m = /^(https?:\/\/[^?#]+?)(?:\/page-\d+)?(\.chn|\.htm)$/i.exec(url);
        if (!m) return null;
        return m[1] + "/page-" + reqPage + m[2];
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    // Trang > 1 do getNewsNextPageUrl dựng (kèm &page=N)
    if (page && page > 1) return null;
    return GAMEK_HOST + "/tim-kiem.chn?keyword=" + encodeURIComponent(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var GAMEK_TITLE_RES = [
    /<h1\b[^>]*(?:data-field\s*=\s*["']?title|itemprop\s*=\s*["']?headline)[^>]*>([\s\S]*?)<\/h1>/i,
    /<header\b[^>]*class\s*=\s*["']?[^"'>]*topdetail[^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/i
];

var GAMEK_BODY_START = [
    /<section\b[^>]*itemprop\s*=\s*["']?articleBody[^>]*>/i,
    /<div\b[^>]*data-field\s*=\s*["']?body[^>]*>/i,
    /<div\b[^>]*class\s*=\s*["']?[^"'>]*rightdetail_content[^>]*>/i
];

/** Nội dung bên trong thẻ mở, khớp độ sâu theo tên thẻ (section/div/ul). */
function gkInnerOf(html, openRe, tagName) {
    var m = openRe.exec(html);
    if (!m) return null;
    var start = m.index + m[0].length;
    var re = new RegExp("<(/?)" + tagName + "\\b[^>]*>", "gi");
    re.lastIndex = start;
    var depth = 1;
    var tag;
    while ((tag = re.exec(html)) !== null) {
        if (tag[1] === "/") depth--; else depth++;
        if (depth === 0) return html.substring(start, tag.index);
    }
    return html.substring(start);
}

/** Meta og:title / description / og:image (thuộc tính có thể không có nháy). */
function gkMeta(source, key) {
    var re = /<meta\b[^>]*>/gi;
    var m;
    while ((m = re.exec(source)) !== null) {
        var tag = m[0];
        var name = gkAttr(tag, "property") || gkAttr(tag, "name") || "";
        if (String(name).toLowerCase() !== key) continue;
        var content = gkAttr(tag, "content");
        if (content) return gkDecode(content);
    }
    return null;
}

function gkTitle(source) {
    for (var i = 0; i < GAMEK_TITLE_RES.length; i++) {
        var m = GAMEK_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = gkStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t;
    }
    var og = gkMeta(source, "og:title");
    if (og) return gkStrip(og).replace(/\s+/g, " ").trim();
    var tm = /<title>([\s\S]*?)<\/title>/i.exec(source);
    if (tm) {
        return gkStrip(tm[1]).replace(/\s*\|\s*GameK.*$/i, "").trim();
    }
    return "";
}

function gkSapo(source) {
    var m = /<h2\b[^>]*data-field\s*=\s*["']?sapo[^>]*>([\s\S]*?)<\/h2>/i.exec(source);
    if (m) {
        var t = gkStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t.length >= GAMEK_MIN_TEXT) return t;
    }
    var desc = gkMeta(source, "description");
    if (desc) {
        desc = gkStrip(desc).replace(/\s+/g, " ").trim();
        if (desc.length >= GAMEK_MIN_TEXT) return desc;
    }
    return "";
}

function gkBodyHtml(source) {
    for (var i = 0; i < GAMEK_BODY_START.length; i++) {
        var open = GAMEK_BODY_START[i];
        var m = open.exec(source);
        if (!m) continue;
        var tagName = i === 0 ? "section" : "div";
        var inner = gkInnerOf(source, open, tagName);
        if (inner && inner.length > 0) return inner;
    }
    return null;
}

function gkTableText(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(gkStrip(cells[c]).replace(/\s+/g, " "));
        var line = parts.join(" | ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function gkListText(tag) {
    var lis = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < lis.length; i++) {
        var txt = gkStrip(lis[i]).replace(/\s+/g, " ").trim();
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function gkVideoSrc(tag) {
    var m = /<(?:video|source|iframe)\b[^>]*(?:data-src|data-original|src)="([^"]+)"/i.exec(tag);
    if (!m) return null;
    return gkNormImg(m[1]);
}

/** Tách 1 `<figure>` thành các block ảnh/video (giữ chú thích PhotoCMS_Caption). */
function gkFigureBlocks(tag) {
    var blocks = [];
    var capM = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
    var caption = capM ? gkStrip(capM[1]).replace(/\s+/g, " ").trim() : "";
    if (caption && caption.length < 3) caption = "";

    if (/<video\b|<iframe\b/i.test(tag)) {
        var vUrl = gkVideoSrc(tag);
        if (vUrl) {
            var posterM = /<video\b[^>]*poster="([^"]+)"/i.exec(tag);
            var poster = posterM ? gkNormImg(posterM[1]) : null;
            if (!poster) {
                var pImg = /<img\b[^>]*>/i.exec(tag);
                if (pImg) poster = gkImgSrc(pImg[0]);
            }
            blocks.push({
                isImage: false,
                text: caption ? caption : null,
                imageUrl: poster,
                isVideo: true,
                videoUrl: vUrl
            });
            return blocks;
        }
    }

    var imgs = tag.match(/<img\b[^>]*>/gi) || [];
    for (var i = 0; i < imgs.length; i++) {
        var src = gkImgSrc(imgs[i]);
        if (!src) continue;
        blocks.push({
            isImage: true,
            text: i === 0 && caption ? caption : null,
            imageUrl: src,
            isVideo: false,
            videoUrl: null
        });
    }
    return blocks;
}

/**
 * Quét thân bài thành các block theo đúng thứ tự tài liệu.
 * Gamek không đóng `</p>` → thay figure/heading/list/bảng bằng marker rồi mới
 * tách đoạn theo thẻ `<p>` mở.
 */
function gkScanBlocks(body) {
    var store = [];
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    function pushBlocks(list) {
        var out = "";
        for (var i = 0; i < list.length; i++) {
            store.push(list[i]);
            out += "\u0001" + (store.length - 1) + "\u0001";
        }
        return out;
    }

    function textBlock(html, isHeading) {
        var txt = gkStrip(html).replace(/\s+/g, " ").trim();
        if (!txt) return [];
        if (txt.length < (isHeading ? 8 : GAMEK_MIN_TEXT)) return [];
        return [{ isImage: false, text: txt, imageUrl: null, isVideo: false, videoUrl: null }];
    }

    // Bỏ box link "Xem thêm" cuối bài (không phải nội dung)
    s = s.replace(/<div\b[^>]*class\s*=\s*["']?[^"'>]*link-content-footer[^>]*>[\s\S]*?<\/div>/gi, " ");

    s = s.replace(/<figure\b[\s\S]*?<\/figure>/gi, function (m) {
        return "\n" + pushBlocks(gkFigureBlocks(m)) + "\n";
    });
    s = s.replace(/<video\b[\s\S]*?<\/video>/gi, function (m) {
        return "\n" + pushBlocks(gkFigureBlocks(m)) + "\n";
    });
    s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, function (m) {
        return "\n" + pushBlocks(gkFigureBlocks(m)) + "\n";
    });
    s = s.replace(/<table\b[\s\S]*?<\/table>/gi, function (m) {
        var text = gkTableText(m);
        if (text.length < GAMEK_MIN_TEXT) return " ";
        return "\n" + pushBlocks([{ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null }]) + "\n";
    });
    s = s.replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, function (m) {
        var text = gkListText(m);
        if (text.length < GAMEK_MIN_TEXT) return " ";
        return "\n" + pushBlocks([{ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null }]) + "\n";
    });
    s = s.replace(/<h([2-4])\b[^>]*>[\s\S]*?<\/h\1>/gi, function (m) {
        return "\n" + pushBlocks(textBlock(m, true)) + "\n";
    });
    // Ảnh lẻ không bọc <figure>
    s = s.replace(/<img\b[^>]*>/gi, function (m) {
        var src = gkImgSrc(m);
        if (!src) return " ";
        return pushBlocks([{ isImage: true, text: null, imageUrl: src, isVideo: false, videoUrl: null }]);
    });

    s = s.replace(/<p(?=[\s>])/gi, "\n");
    s = s.replace(/<\/(p|div|section|article|header|footer|li|h[1-6])>/gi, "\n");
    s = s.replace(/<[^>]*>/g, " ");
    s = gkDecode(s);

    var blocks = [];
    var lines = s.split("\n");
    for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        if (!line) continue;
        var re = /\u0001(\d+)\u0001/g;
        var last = 0;
        var mm;
        while ((mm = re.exec(line)) !== null) {
            var before = line.substring(last, mm.index);
            var txt = before.replace(/\s+/g, " ").trim();
            if (txt.length >= GAMEK_MIN_TEXT) {
                blocks.push({ isImage: false, text: txt, imageUrl: null, isVideo: false, videoUrl: null });
            }
            var idx = parseInt(mm[1], 10);
            if (!isNaN(idx) && store[idx]) blocks.push(store[idx]);
            last = re.lastIndex;
        }
        var tail = line.substring(last).replace(/\s+/g, " ").trim();
        if (tail.length >= GAMEK_MIN_TEXT) {
            blocks.push({ isImage: false, text: tail, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function gkRelated(source) {
    var open = /<ul\b[^>]*class\s*=\s*["']?[^"'>]*relate-news[^>]*>/i;
    var inner = gkInnerOf(source, open, "ul");
    if (!inner) return [];
    var items = [];
    var seen = {};
    var parts = inner.split(/<li(?=[\s>])/i);
    for (var i = 1; i < parts.length; i++) {
        var card = null;
        try {
            card = gkParseCard(parts[i]);
        } catch (e) {
            card = null;
        }
        gkCollect(items, seen, card);
    }
    if (items.length > GAMEK_MAX_RELATED) items = items.slice(0, GAMEK_MAX_RELATED);
    return items;
}

function gkArticle(html) {
    var source = gkClean(html);
    var title = gkTitle(source);
    var bodyHtml = gkBodyHtml(source);
    if (!title && !bodyHtml) return null;

    var blocks = bodyHtml ? gkScanBlocks(bodyHtml) : [];

    var sapo = gkSapo(source);
    if (sapo) {
        var firstText = null;
        for (var i = 0; i < blocks.length; i++) {
            if (!blocks[i].isImage && !blocks[i].isVideo) {
                firstText = blocks[i].text;
                break;
            }
        }
        if (!firstText || String(firstText).replace(/\s+/g, " ").trim() !== sapo) {
            blocks.unshift({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    return {
        title: title,
        blocks: blocks,
        related: gkRelated(source)
    };
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    try {
        var data = gkArticle(html);
        return data ? JSON.stringify(data) : null;
    } catch (e) {
        return null;
    }
}
