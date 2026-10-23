/**
 * Quân đội nhân dân (qdnd.vn) — nguồn báo dạng JS.
 *
 * Nền tảng DotNetNuke (DNN), HTML tĩnh. **Site chặn bằng cookie**: request đầu
 * luôn trả 302 về chính nó kèm `Set-Cookie: muid_mly=…` (HttpOnly), thiếu cookie
 * thì lặp redirect vô hạn → app phải giữ cookie giữa các request.
 *
 *  - Danh sách: `<article><a href="…"><div class="article-thumbnail"><img></div></a>
 *    <h3><a href title>Tiêu đề</a></h3><p class="hidden-xs pubdate">dd/MM/yyyy HH:mm</p>
 *    <p class="hidden-xs">sapo</p></article>`; link bài dạng `/<mục>/<slug>-<id số>`.
 *  - Phân trang: `/chinh-tri/p/2`, `/chinh-tri/p/3`…; khối `div.ex_page` chứa
 *    `a.boxdv1` (trang hiện tại có class `active`). Trang cuối không có khối này.
 *  - Tìm kiếm: site **không có** tìm kiếm nội bộ (ô search đẩy sang Google) → `searchable: false`.
 *  - Đọc bài: `h1.post-title`, sapo `div.post-summary`, thân `div.post-content >
 *    div[itemprop="articleBody"]`, hết bài ở `div.post-relate` / `div.post-tag`.
 *    Ảnh nằm trong `<table class="imgEditor">` (ảnh `img.imgtelerik`, chú thích ở
 *    hàng `tr.alt_imgEditor`), tin liên quan dùng lại markup `<article>`.
 *
 * Bắt buộc UA mobile. Toàn bộ hàm trả JSON string, ES5 thuần.
 */

var QD_HOST = "https://www.qdnd.vn";
var QD_SOURCE_NAME = "Quân đội nhân dân";
var QD_MAX_PAGE = 40;
var QD_MIN_TEXT = 20;
var QD_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var QD_CATEGORIES = [
    { name: "Trang chủ", pageUrl: QD_HOST + "/" },
    { name: "Chính trị", pageUrl: QD_HOST + "/chinh-tri" },
    { name: "Chính trị - Tin tức", pageUrl: QD_HOST + "/chinh-tri/tin-tuc" },
    { name: "Quốc phòng - An ninh", pageUrl: QD_HOST + "/quoc-phong-an-ninh" },
    { name: "QP-AN - Tin tức", pageUrl: QD_HOST + "/quoc-phong-an-ninh/tin-tuc" },
    { name: "Xây dựng quân đội", pageUrl: QD_HOST + "/quoc-phong-an-ninh/xay-dung-quan-doi" },
    { name: "Bảo vệ nền tảng tư tưởng", pageUrl: QD_HOST + "/bao-ve-nen-tang-tu-tuong-cua-dang" },
    { name: "Kinh tế", pageUrl: QD_HOST + "/kinh-te" },
    { name: "Kinh tế - Tin tức", pageUrl: QD_HOST + "/kinh-te/tin-tuc" },
    { name: "Xã hội", pageUrl: QD_HOST + "/xa-hoi" },
    { name: "Xã hội - Tin tức", pageUrl: QD_HOST + "/xa-hoi/tin-tuc" },
    { name: "Văn hóa", pageUrl: QD_HOST + "/van-hoa" },
    { name: "Văn hóa - Đời sống", pageUrl: QD_HOST + "/van-hoa/doi-song" },
    { name: "Văn học - Nghệ thuật", pageUrl: QD_HOST + "/van-hoa/van-hoc-nghe-thuat" },
    { name: "Phóng sự - Điều tra", pageUrl: QD_HOST + "/phong-su-dieu-tra" },
    { name: "Quốc tế", pageUrl: QD_HOST + "/quoc-te" },
    { name: "Quân sự thế giới", pageUrl: QD_HOST + "/quan-su-the-gioi" },
    { name: "Cùng bàn luận", pageUrl: QD_HOST + "/cung-ban-luan" },
    { name: "Y tế", pageUrl: QD_HOST + "/y-te" },
    { name: "Thể thao", pageUrl: QD_HOST + "/the-thao" },
    { name: "Đa phương tiện", pageUrl: QD_HOST + "/da-phuong-tien" },
    { name: "Phóng sự ảnh", pageUrl: QD_HOST + "/da-phuong-tien/phong-su-anh" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "qdnd",
        name: QD_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=qdnd.vn&sz=64",
        categories: QD_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("qdnd.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": QD_MOBILE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9",
        "Referer": QD_HOST + "/"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var QD_ENTITIES = {
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

function qdDecode(value) {
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
        return QD_ENTITIES.hasOwnProperty(name) ? QD_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function qdStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = qdDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function qdClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "");
}

function qdAbs(raw) {
    if (!raw) return null;
    var link = qdDecode(raw).replace(/&amp;/g, "&").trim();
    if (!link) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return QD_HOST + link;
    return null;
}

function qdImgSrc(tag) {
    if (!tag) return null;
    var m = /data-original="([^"]+)"/i.exec(tag)
        || /data-src="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = qdDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("data:") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

/** "23/10/2026 08:03" (giờ VN, GMT+7) → epoch ms. */
function qdDateMs(raw) {
    if (!raw) return 0;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(raw).trim());
    if (!m) return 0;
    var ms = Date.UTC(
        parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
        m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0, 0
    ) - 7 * 3600 * 1000;
    return isNaN(ms) ? 0 : ms;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

function qdParseItem(chunk) {
    if (!chunk) return null;

    var link = null;
    var title = null;

    var h3 = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(chunk);
    if (h3) {
        var a = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(h3[1]);
        if (a) {
            link = qdAbs(a[1]);
            title = qdStrip(a[2]).replace(/\s+/g, " ").trim();
            if (!title) {
                var t = /title="([^"]+)"/i.exec(a[0]);
                if (t) title = qdStrip(t[1]).replace(/\s+/g, " ").trim();
            }
        }
    }
    if (!link) {
        var first = /<a\b[^>]*href="([^"]+)"/i.exec(chunk);
        if (first) link = qdAbs(first[1]);
    }
    if (!link) return null;
    // Chỉ nhận bài viết: /<mục>/<slug>-<id số> (bỏ trang mục, tag, 404…)
    if (!/^https?:\/\/www\.qdnd\.vn\/[a-z0-9\-]+\/[^?#]*-\d+$/i.test(link)) return null;
    if (!title) return null;
    if (title.length < 5) return null;

    var imgTag = /<img\b[^>]*>/i.exec(chunk);
    var imageUrl = imgTag ? qdImgSrc(imgTag[0]) : null;
    if (imageUrl && /noimages\.jpg/i.test(imageUrl)) imageUrl = null;

    var pubDate = null;
    var pubDateMs = 0;
    var pm = /<p[^>]*class="[^"]*pubdate[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    if (pm) {
        var raw = qdStrip(pm[1]).replace(/\s+/g, " ").trim();
        if (raw) {
            pubDate = raw;
            pubDateMs = qdDateMs(raw);
        }
    }

    var excerpt = null;
    var ps = chunk.match(/<p\b[^>]*class="[^"]*hidden-xs[^"]*"[^>]*>([\s\S]*?)<\/p>/gi) || [];
    for (var i = 0; i < ps.length; i++) {
        if (/pubdate/i.test(ps[i])) continue;
        var txt = qdStrip(ps[i]).replace(/\s+/g, " ").trim();
        if (txt.length >= QD_MIN_TEXT) {
            excerpt = txt;
            break;
        }
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDate: pubDate,
        pubDateMs: pubDateMs,
        sourceName: QD_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = qdClean(html).replace(/<!--[\s\S]*?-->/g, " ");

    // Trang danh sách bọc bài trong div.list-news-category; cắt bớt để không
    // nuốt các box sidebar (cùng dùng thẻ <article>). Phân trang nằm ngay sau danh sách.
    var start = source.indexOf('<div class="list-news-category">');
    if (start >= 0) {
        source = source.substring(start);
        var ends = ['<div class="ex_page">', '<div class="col-right"', 'class="lasted-post', '<div class="container mgbt15"'];
        var cut = source.length;
        for (var e = 0; e < ends.length; e++) {
            var eIdx = source.indexOf(ends[e]);
            if (eIdx >= 0 && eIdx < cut) cut = eIdx;
        }
        source = source.substring(0, cut);
    }

    var items = [];
    var seen = {};
    var chunks = source.split(/<article\b/i);
    for (var i = 1; i < chunks.length; i++) {
        var chunk = chunks[i];
        if (chunk.length > 6000) chunk = chunk.substring(0, 6000);
        var item = null;
        try {
            item = qdParseItem(chunk);
        } catch (e) {
            item = null;
        }
        if (!item || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

var QD_PAGE_RE = /\/p\/(\d+)\/?$/i;

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        if (!currentUrl || !page || page < 2) return null;
        if (page > QD_MAX_PAGE) return null;
        var source = String(html || "");
        // Trang cuối không còn khối phân trang
        if (source.indexOf('<div class="ex_page">') < 0) return null;
        if (source.indexOf("<article") < 0) return null;

        var url = String(currentUrl).split("#")[0].split("?")[0];
        var base = url.replace(QD_PAGE_RE, "").replace(/\/+$/, "");
        if (!base) return null;
        return base + "/p/" + page;
    } catch (e) {
        return null;
    }
}

/** Site không có tìm kiếm nội bộ (ô tìm kiếm đẩy sang Google) → không hỗ trợ. */
function getNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var QD_BODY_END = [
    'class="post-relate',
    'class="post-tag',
    'class="post-news-comment',
    'class="form-comment',
    'id="comments"',
    'class="comments-title'
];

var QD_BLOCK_RE = /<table\b[^>]*>[\s\S]*?<\/table>|<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>|<(p|h2|h3|h4|blockquote)\b[^>]*>[\s\S]*?<\/\2>|<img\b[^>]*class="[^"]*imgtelerik[^"]*"[^>]*>/gi;

function qdTitle(source) {
    var res = [
        /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
        /<title>([\s\S]*?)<\/title>/i,
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
    ];
    for (var i = 0; i < res.length; i++) {
        var m = res[i].exec(source);
        if (!m) continue;
        var t = qdStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t;
    }
    return "";
}

function qdVideoSrc(tag) {
    var m = /<(?:video|source|iframe)\b[^>]*(?:data-src|src)="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = qdDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url;
}

function qdTableRows(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(qdStrip(cells[c]).replace(/\s+/g, " "));
        var line = parts.join(" | ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function qdListText(tag) {
    var lis = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < lis.length; i++) {
        var txt = qdStrip(lis[i]).replace(/\s+/g, " ").trim();
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function qdScanBlocks(body) {
    var blocks = [];
    var re = new RegExp(QD_BLOCK_RE.source, "gi");
    var m;
    while ((m = re.exec(body)) !== null) {
        var tag = m[0];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<table") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var imgSrc = imgTag ? qdImgSrc(imgTag[0]) : null;
            if (imgSrc && !/noimages\.jpg/i.test(imgSrc)) {
                var capM = /<tr[^>]*class="[^"]*alt_imgEditor[^"]*"[^>]*>([\s\S]*?)<\/tr>/i.exec(tag);
                var caption = capM ? qdStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
                if (caption && caption.length < 3) caption = null;
                blocks.push({ isImage: true, text: caption, imageUrl: imgSrc, isVideo: false, videoUrl: null });
                continue;
            }
            var tableText = qdTableRows(tag);
            if (tableText.length >= QD_MIN_TEXT) {
                blocks.push({ isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0) {
            var fImg = /<img\b[^>]*>/i.exec(tag);
            var fSrc = fImg ? qdImgSrc(fImg[0]) : null;
            var capM2 = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var cap2 = capM2 ? qdStrip(capM2[1]).replace(/\s+/g, " ").trim() : null;
            if (fSrc) {
                blocks.push({ isImage: true, text: cap2, imageUrl: fSrc, isVideo: false, videoUrl: null });
            } else {
                var vSrc = qdVideoSrc(tag);
                if (vSrc) blocks.push({ isImage: false, text: cap2, imageUrl: null, isVideo: true, videoUrl: vSrc });
            }
            continue;
        }

        if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var vSrc2 = qdVideoSrc(tag);
            if (vSrc2) {
                blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vSrc2 });
            }
            continue;
        }

        if (lower.indexOf("<ul") === 0 || lower.indexOf("<ol") === 0) {
            var listText = qdListText(tag);
            if (listText.length >= QD_MIN_TEXT) {
                blocks.push({ isImage: false, text: listText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        if (lower.indexOf("<img") === 0) {
            var soloSrc = qdImgSrc(tag);
            if (soloSrc && !/noimages\.jpg/i.test(soloSrc)) {
                blocks.push({ isImage: true, text: null, imageUrl: soloSrc, isVideo: false, videoUrl: null });
            }
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0 || lower.indexOf("<h4") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));

        // Ảnh lẻ nằm ngay trong <p>
        if (inner.toLowerCase().indexOf("<img") !== -1) {
            var innerImg = /<img\b[^>]*>/i.exec(inner);
            var innerSrc = innerImg ? qdImgSrc(innerImg[0]) : null;
            if (innerSrc && !/noimages\.jpg/i.test(innerSrc)) {
                blocks.push({ isImage: true, text: null, imageUrl: innerSrc, isVideo: false, videoUrl: null });
            }
        }

        var text = qdStrip(inner).replace(/\s+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : QD_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
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
    for (var i = 0; i < QD_BODY_END.length; i++) {
        var idx = body.indexOf(QD_BODY_END[i]);
        if (idx >= 0 && idx < end) end = idx;
    }
    var tail = body.substring(end);
    body = qdClean(body.substring(0, end)).replace(/<!--[\s\S]*?-->/g, " ");

    var blocks = [];

    // Sapo (div.post-summary) đứng trước thân bài
    var sapoM = /<div[^>]*class="[^"]*post-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (sapoM) {
        var sapo = qdStrip(sapoM[1]).replace(/\s+/g, " ").trim();
        if (sapo.length >= QD_MIN_TEXT) {
            blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    var bodyBlocks = qdScanBlocks(body);
    for (var b = 0; b < bodyBlocks.length; b++) blocks.push(bodyBlocks[b]);

    if (blocks.length === 0) return null;

    var related = [];
    try {
        var relIdx = tail.indexOf('class="post-relate');
        if (relIdx < 0) relIdx = source.indexOf('class="post-relate');
        if (relIdx >= 0) {
            related = JSON.parse(parseNewsList(tail.length > 0 ? tail : source.substring(relIdx), ""));
        }
    } catch (e) {
        related = [];
    }
    if (related.length > 12) related = related.slice(0, 12);

    return JSON.stringify({
        title: qdTitle(source),
        blocks: blocks,
        related: related
    });
}
