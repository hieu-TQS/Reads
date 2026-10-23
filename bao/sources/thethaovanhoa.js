/**
 * Thể thao & Văn hóa (thethaovanhoa.vn) — nguồn báo dạng JS.
 *
 * Nền tảng VCCorp (mediacdn), trang HTML tĩnh, không Cloudflare.
 *  - Danh sách: mỗi tin là `<div class="box-category-item [itemN]">`; tiêu đề
 *    `<a class="box-category-link-title" href title>`, thumbnail
 *    `img.box-category-avatar` (src đã là URL mediacdn), mô tả
 *    `p.box-category-sapo`, giờ đăng `span.box-category-time` ("dd/MM/yyyy HH:mm").
 *  - Phân trang: KHÔNG có link trang kế. Trang chuyên mục có nút "Xem thêm"
 *    (`#btn-xemthem`) gọi AJAX `/ajax/lastest-stream/<zoneId>-<page>.htm`
 *    (zoneId nằm trong `input#hdZoneId`). Trang chủ không có zoneId → không phân trang.
 *  - Tìm kiếm: `/tim-kiem.htm?search=<q>` (10 tin/trang); "Xem thêm" gọi
 *    `/ajax/search-stream/<slug>-<page>.htm`, slug đọc từ
 *    `tagsearchscript.init("search", "<slug>", <tổng>, <trang>)`.
 *  - Đọc bài: 2 mẫu trang, cả hai đều có `itemprop="articleBody"`:
 *      + bài thường: `h1.title`, thân `div.detail-content.afcbc-body`,
 *        hết bài ở `p.author`, tin liên quan `div.box-related a.relation-title`;
 *      + bài long-form/E-Magazine: thân `div#editor_magazine.vceditor-content`,
 *        hết bài ở `div.box-sub-new` ("Xem thêm").
 *    Ảnh nằm trong `<figure class="VCSortableInPreviewMode" type="Photo">`
 *    (ảnh thật ở `data-original`/`src`, chú thích `figcaption.PhotoCMS_Caption`).
 *    Box tin liên quan chèn giữa bài nằm giữa `<!-- bonewsrelation -->` và
 *    `<!-- eonewsrelation -->` → cắt bỏ để không lẫn tiêu đề lạ.
 *
 * Bắt buộc UA mobile (bản desktop nặng hơn nhiều). Toàn bộ hàm trả JSON string, ES5 thuần.
 */

var THVH_HOST = "https://thethaovanhoa.vn";
var THVH_SOURCE_NAME = "Thể thao & Văn hóa";
var THVH_MAX_PAGE = 30;
var THVH_SEARCH_MAX_PAGE = 15;
var THVH_MIN_TEXT = 20;
var THVH_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var THVH_CATEGORIES = [
    { name: "Trang chủ", pageUrl: THVH_HOST + "/" },
    { name: "Tin tức 24h", pageUrl: THVH_HOST + "/tin-tuc-24h.htm" },
    { name: "Trong nước", pageUrl: THVH_HOST + "/tin-tuc-24h/tin-tuc-trong-nuoc.htm" },
    { name: "Thế giới", pageUrl: THVH_HOST + "/tin-tuc-24h/tin-tuc-the-gioi.htm" },
    { name: "Bình luận", pageUrl: THVH_HOST + "/tin-tuc-24h/binh-luan.htm" },
    { name: "Thể thao", pageUrl: THVH_HOST + "/the-thao.htm" },
    { name: "Bóng đá Việt", pageUrl: THVH_HOST + "/bong-da-viet-nam.htm" },
    { name: "Bóng đá quốc tế", pageUrl: THVH_HOST + "/bong-da-quoc-te.htm" },
    { name: "Nhận định bóng đá", pageUrl: THVH_HOST + "/du-doan-bong-da.htm" },
    { name: "Bóng chuyền", pageUrl: THVH_HOST + "/the-thao/bong-chuyen.htm" },
    { name: "Tennis", pageUrl: THVH_HOST + "/the-thao/the-thao-tennis.htm" },
    { name: "Golf", pageUrl: THVH_HOST + "/the-thao/the-thao-golf.htm" },
    { name: "Pickleball", pageUrl: THVH_HOST + "/the-thao/pickleball.htm" },
    { name: "Văn hóa", pageUrl: THVH_HOST + "/van-hoa.htm" },
    { name: "Văn hóa sống khỏe", pageUrl: THVH_HOST + "/van-hoa-song-khoe.htm" },
    { name: "Đọc - Xem", pageUrl: THVH_HOST + "/van-hoa/doc-xem.htm" },
    { name: "Công nghiệp Văn hóa", pageUrl: THVH_HOST + "/cong-nghiep-van-hoa.htm" },
    { name: "Giải trí", pageUrl: THVH_HOST + "/giai-tri.htm" },
    { name: "Phim", pageUrl: THVH_HOST + "/giai-tri/phim.htm" },
    { name: "Âm nhạc", pageUrl: THVH_HOST + "/giai-tri/am-nhac.htm" },
    { name: "Thế giới sao", pageUrl: THVH_HOST + "/the-gioi-sao.htm" },
    { name: "Hightech", pageUrl: THVH_HOST + "/hightech.htm" },
    { name: "Tiêu điểm - Spotlight", pageUrl: THVH_HOST + "/tieu-diem-spotlight.htm" },
    { name: "Bạn cần biết", pageUrl: THVH_HOST + "/ban-can-biet.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "thethaovanhoa",
        name: THVH_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=thethaovanhoa.vn&sz=64",
        categories: THVH_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("thethaovanhoa.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": THVH_MOBILE_UA,
        "Referer": THVH_HOST + "/"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var THVH_ENTITIES = {
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

function thvhDecode(value) {
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
        return THVH_ENTITIES.hasOwnProperty(name) ? THVH_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function thvhStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = thvhDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Bỏ script/style/comment — HTML thô của báo rất nặng, lọc trước khi regex. */
function thvhClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "");
}

function thvhAbs(raw) {
    if (!raw) return null;
    var link = thvhDecode(raw).replace(/&amp;/g, "&").trim();
    if (!link) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return THVH_HOST + link;
    return null;
}

function thvhImgSrc(tag) {
    if (!tag) return null;
    var m = /data-original="([^"]+)"/i.exec(tag)
        || /data-src="([^"]+)"/i.exec(tag)
        || /data-srcset="([^"]+)"/i.exec(tag)
        || /srcset="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = thvhDecode(m[1]).replace(/&amp;/g, "&").trim().split(",")[0].trim().split(" ")[0];
    if (!url || url.indexOf("data:") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

/** "19/10/2026 06:47" (giờ VN, GMT+7) → epoch ms. */
function thvhDateMs(raw) {
    if (!raw) return 0;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(raw).trim());
    if (!m) return 0;
    var ms = Date.UTC(
        parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
        m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0, 0
    ) - 7 * 3600 * 1000;
    return isNaN(ms) ? 0 : ms;
}

/**
 * `data-newsid="20261023075131362"` = yyyyMMddHHmmss + 3 số phụ (giờ VN).
 * Danh sách của báo không in giờ đăng nên đây là nguồn thời gian duy nhất.
 */
function thvhNewsIdDate(id) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(id || ""));
    if (!m) return { label: null, ms: 0 };
    var ms = Date.UTC(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
    ) - 7 * 3600 * 1000;
    if (isNaN(ms)) return { label: null, ms: 0 };
    return { label: m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5], ms: ms };
}

/** Bỏ dấu tiếng Việt → slug ASCII (fallback khi không đọc được init của trang tìm kiếm). */
function thvhSlugify(text) {
    var s = String(text === null || text === undefined ? "" : text).toLowerCase();
    s = s.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
        .replace(/[èéẹẻẽêềếệểễ]/g, "e")
        .replace(/[ìíịỉĩ]/g, "i")
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
        .replace(/[ùúụủũưừứựửữ]/g, "u")
        .replace(/[ỳýỵỷỹ]/g, "y")
        .replace(/đ/g, "d");
    return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ----------------------------------------------------------------------
// Danh sách tin (trang chuyên mục + fragment ajax + trang chủ)
// ----------------------------------------------------------------------

function thvhParseItem(part) {
    if (!part) return null;

    var href = null;
    var title = null;

    var am = /<a\b[^>]*class="[^"]*box-category-link-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
    if (am) {
        var hm = /href="([^"]+)"/i.exec(am[0]);
        if (hm) href = hm[1];
        title = thvhStrip(am[1]);
        if (!title) {
            var tm = /title="([^"]+)"/i.exec(am[0]);
            if (tm) title = thvhStrip(tm[1]);
        }
    }

    if (!href) {
        var h3 = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(part);
        if (h3) {
            var a2 = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(h3[1]);
            if (a2) {
                href = a2[1];
                title = title || thvhStrip(a2[2]);
            }
        }
    }
    if (!href) return null;

    var link = thvhAbs(href);
    if (!link) return null;
    // Chỉ nhận bài viết: slug kết thúc bằng -<timestamp>.htm (bỏ chuyên mục, trang sự kiện -e123.htm)
    if (!/\/[^\/]*-\d{10,}\.htm$/i.test(link)) return null;

    if (!title) return null;
    title = title.replace(/\s+/g, " ").trim();
    if (title.length < 5) return null;

    var imgTag = /<img\b[^>]*class="[^"]*box-category-avatar[^"]*"[^>]*>/i.exec(part)
        || /<img\b[^>]*>/i.exec(part);
    var imageUrl = imgTag ? thvhImgSrc(imgTag[0]) : null;

    var excerpt = null;
    var em = /<p[^>]*class="[^"]*box-category-sapo[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(part);
    if (em) {
        var txt = thvhStrip(em[1]).replace(/\s+/g, " ").trim();
        if (txt.length >= THVH_MIN_TEXT) excerpt = txt;
    }

    var pubDate = null;
    var pubDateMs = 0;
    var tm2 = /<span[^>]*class="[^"]*box-category-time[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(part);
    if (tm2) {
        var raw = thvhStrip(tm2[1]).replace(/\s+/g, " ").trim();
        if (raw) {
            pubDate = raw;
            pubDateMs = thvhDateMs(raw);
        }
    }
    if (!pubDateMs) {
        var idM = /data-newsid="(\d+)"/i.exec(part);
        if (idM) {
            var fromId = thvhNewsIdDate(idM[1]);
            pubDate = fromId.label;
            pubDateMs = fromId.ms;
        }
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDate: pubDate,
        pubDateMs: pubDateMs,
        sourceName: THVH_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = thvhClean(html).replace(/<!--[\s\S]*?-->/g, " ");

    var items = [];
    var seen = {};
    var parts = source.split('<div class="box-category-item');
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 9000) part = part.substring(0, 9000);
        var item = null;
        try {
            item = thvhParseItem(part);
        } catch (e) {
            item = null;
        }
        if (!item || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

var THVH_AJAX_STREAM_RE = /\/ajax\/lastest-stream\/(\d+)-(\d+)\.htm/i;
var THVH_AJAX_SEARCH_RE = /\/ajax\/search-stream\/([^\/\?]+)-(\d+)\.htm/i;
var THVH_ZONE_RE = /<input[^>]*value="(\d+)"[^>]*id="hdZoneId"/i;
var THVH_SEARCH_INIT_RE = /tagsearchscript\.init\(\s*"search"\s*,\s*"([^"]*)"/i;

function thvhNextPage(currentUrl, page, html) {
    if (!currentUrl || !page || page < 2) return null;

    var url = String(currentUrl);
    var source = String(html || "");

    // Phân trang kết quả tìm kiếm (fragment ajax)
    var sAjax = THVH_AJAX_SEARCH_RE.exec(url);
    if (sAjax) {
        if (page > THVH_SEARCH_MAX_PAGE) return null;
        if (source.indexOf("box-category-item") < 0) return null;
        return THVH_HOST + "/ajax/search-stream/" + sAjax[1] + "-" + page + ".htm";
    }

    // Trang tìm kiếm gốc → trang ajax kế đầu tiên (slug đọc từ init của trang)
    if (url.toLowerCase().indexOf("/tim-kiem.htm") !== -1) {
        if (page > THVH_SEARCH_MAX_PAGE) return null;
        if (source.indexOf("box-category-item") < 0) return null;
        var slug = null;
        var initM = THVH_SEARCH_INIT_RE.exec(source);
        if (initM) {
            slug = initM[1];
        } else {
            var qM = /[?&]search=([^&]*)/i.exec(url);
            if (qM) {
                try {
                    slug = thvhSlugify(decodeURIComponent(qM[1].replace(/\+/g, " ")));
                } catch (e) {
                    slug = thvhSlugify(qM[1]);
                }
            }
        }
        if (!slug) return null;
        return THVH_HOST + "/ajax/search-stream/" + slug + "-2.htm";
    }

    // Phân trang chuyên mục (fragment ajax)
    var cAjax = THVH_AJAX_STREAM_RE.exec(url);
    if (cAjax) {
        if (page > THVH_MAX_PAGE) return null;
        if (source.indexOf("box-category-item") < 0) return null;
        return THVH_HOST + "/ajax/lastest-stream/" + cAjax[1] + "-" + page + ".htm";
    }

    // Trang chuyên mục gốc → cần zoneId; trang chủ không có → không phân trang
    if (page > THVH_MAX_PAGE) return null;
    if (source.indexOf("box-category-item") < 0) return null;
    var zoneM = THVH_ZONE_RE.exec(source);
    if (!zoneM) return null;
    return THVH_HOST + "/ajax/lastest-stream/" + zoneM[1] + "-" + page + ".htm";
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        return thvhNextPage(currentUrl, page, html);
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    var p = page && page > 0 ? Math.floor(page) : 1;
    // Phân trang kết quả đi qua getNewsNextPageUrl (AJAX), trang > 1 không dựng trực tiếp được
    if (p > 1) return null;
    return THVH_HOST + "/tim-kiem.htm?search=" + encodeURIComponent(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var THVH_TITLE_RES = [
    /<h1[^>]*class="[^"]*\btitle\b[^"]*"[^>]*data-role="title"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
    /<title>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
];

var THVH_BODY_END = [
    '<div class="box-sub-new"',
    '<div class="box-related"',
    '<p class="author"',
    '<div class="box-tag"',
    '<div class="comment-box"',
    '<div class="box-contact"',
    'name="hdNewsUrl"'
];

var THVH_BLOCK_RE = /<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<table\b[^>]*>[\s\S]*?<\/table>|<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>|<(p|h2|h3|h4|blockquote)\b[^>]*>[\s\S]*?<\/\2>/gi;

function thvhTitle(source) {
    for (var i = 0; i < THVH_TITLE_RES.length; i++) {
        var m = THVH_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = thvhStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t;
    }
    return "";
}

function thvhTableText(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(thvhStrip(cells[c]).replace(/\s+/g, " "));
        var line = parts.join(" | ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function thvhListText(tag) {
    var lis = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < lis.length; i++) {
        var txt = thvhStrip(lis[i]).replace(/\s+/g, " ").trim();
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function thvhVideoSrc(tag) {
    var m = /<(?:video|source|iframe)\b[^>]*(?:data-src|src)="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = thvhDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url;
}

function thvhScanBlocks(body) {
    var blocks = [];
    var re = new RegExp(THVH_BLOCK_RE.source, "gi");
    var m;
    while ((m = re.exec(body)) !== null) {
        var tag = m[0];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<figure") === 0) {
            // Box tin liên quan chèn giữa bài → bỏ
            if (/type="RelatedNewsBox"/i.test(tag)) continue;
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? thvhImgSrc(imgTag[0]) : null;
            var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var caption = capM ? thvhStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
            if (caption && caption.length < 3) caption = null;
            if (src) {
                blocks.push({ isImage: true, text: caption, imageUrl: src, isVideo: false, videoUrl: null });
            } else {
                var vUrl = thvhVideoSrc(tag);
                if (vUrl) {
                    blocks.push({ isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: vUrl });
                }
            }
            continue;
        }

        if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var src2 = thvhVideoSrc(tag);
            if (src2) {
                blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: src2 });
            }
            continue;
        }

        if (lower.indexOf("<table") === 0) {
            var tableText = thvhTableText(tag);
            if (tableText.length >= THVH_MIN_TEXT) {
                blocks.push({ isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        if (lower.indexOf("<ul") === 0 || lower.indexOf("<ol") === 0) {
            var listText = thvhListText(tag);
            if (listText.length >= THVH_MIN_TEXT) {
                blocks.push({ isImage: false, text: listText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        // <p>/<h2..h4>/<blockquote>
        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0 || lower.indexOf("<h4") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));

        // Ảnh lẻ nằm ngay trong <p>
        if (inner.toLowerCase().indexOf("<img") !== -1) {
            var innerImg = /<img\b[^>]*>/i.exec(inner);
            var innerSrc = innerImg ? thvhImgSrc(innerImg[0]) : null;
            if (innerSrc) {
                blocks.push({ isImage: true, text: null, imageUrl: innerSrc, isVideo: false, videoUrl: null });
            }
        }

        var text = thvhStrip(inner).replace(/\s+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : THVH_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function thvhRelated(source, tail) {
    var items = [];
    var seen = {};

    // 1) "Tin liên quan" dạng link chữ (bài thường)
    var re = /<a\b[^>]*class="[^"]*relation-title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(source)) !== null) {
        var tag = m[0];
        var hrefM = /href="([^"]+)"/i.exec(tag);
        if (!hrefM) continue;
        var link = thvhAbs(hrefM[1]);
        if (!link || !/\/[^\/]*-\d{10,}\.htm$/i.test(link) || seen[link]) continue;
        var title = thvhStrip(m[1]).replace(/\s+/g, " ").trim();
        if (!title) {
            var tm = /title="([^"]+)"/i.exec(tag);
            if (tm) title = thvhStrip(tm[1]).replace(/\s+/g, " ").trim();
        }
        if (title.length < 5) continue;
        seen[link] = true;
        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: null,
            pubDate: null,
            pubDateMs: 0,
            sourceName: THVH_SOURCE_NAME
        });
        if (items.length >= 12) return items;
    }

    // 2) Khối "Xem thêm" dạng thẻ tin (cả 2 mẫu trang)
    if (tail) {
        var idx = tail.indexOf('<div class="box-sub-new"');
        if (idx < 0) idx = tail.indexOf('<div class="box-category-middle xemthem"');
        if (idx >= 0) {
            var chunk = tail.substring(idx, idx + 40000);
            var more = null;
            try {
                more = JSON.parse(parseNewsList(chunk, ""));
            } catch (e) {
                more = [];
            }
            for (var i = 0; i < more.length; i++) {
                if (seen[more[i].link]) continue;
                seen[more[i].link] = true;
                items.push(more[i]);
                if (items.length >= 12) break;
            }
        }
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var start = source.indexOf('itemprop="articleBody"');
    if (start < 0) return null;
    var gt = source.indexOf(">", start);
    if (gt < 0) return null;

    var body = source.substring(gt + 1);
    var end = body.length;
    for (var i = 0; i < THVH_BODY_END.length; i++) {
        var idx = body.indexOf(THVH_BODY_END[i]);
        if (idx >= 0 && idx < end) end = idx;
    }
    var tail = body.substring(end);
    body = body.substring(0, end);

    // Box tin liên quan chèn giữa bài nằm giữa 2 comment đánh dấu
    body = body.replace(/<!--\s*bonewsrelation\s*-->[\s\S]*?<!--\s*eonewsrelation\s*-->/gi, " ");
    body = thvhClean(body).replace(/<!--[\s\S]*?-->/g, " ");

    var blocks = thvhScanBlocks(body);
    if (blocks.length === 0) return null;

    return JSON.stringify({
        title: thvhTitle(source),
        blocks: blocks,
        related: thvhRelated(source, tail)
    });
}
