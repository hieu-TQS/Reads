/**
 * GenK (genk.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * - Danh sách: `<article class="gknews_box">`, tiêu đề `<a class="gknews_title">`,
 *   ảnh nằm ở `background-image: url(...)` (trang chủ/chuyên mục) hoặc `<img>`
 * - Phân trang: `/<slug>/trang-N.htm`; tìm kiếm `.../trang-N.chn`
 * - Tìm kiếm: `/tim-kiem/<từ-khóa>.chn`
 * - Đọc bài: `h1.kbwc-title`, sapo `.knc-sapo`, thân `.knc-content.detail-content`
 *
 * UA mobile bị 302 sang m.genk.vn → phải fetch bằng UA desktop.
 * Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var GK_HOST = "https://genk.vn";
var GK_SOURCE_NAME = "GenK";
var GK_MIN_TEXT = 30;
var GK_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var GK_CATEGORIES = [
    { name: "Trang chủ", pageUrl: GK_HOST + "/" },
    { name: "Mobile", pageUrl: GK_HOST + "/mobile.chn" },
    { name: "AI", pageUrl: GK_HOST + "/ai.chn" },
    { name: "Apps & Games", pageUrl: GK_HOST + "/apps-games.chn" },
    { name: "Blockchain", pageUrl: GK_HOST + "/blockchain.chn" },
    { name: "Đánh giá", pageUrl: GK_HOST + "/danh-gia.chn" },
    { name: "Đồ chơi số", pageUrl: GK_HOST + "/do-choi-so.chn" },
    { name: "Gia dụng", pageUrl: GK_HOST + "/gia-dung.chn" },
    { name: "Internet", pageUrl: GK_HOST + "/internet.chn" },
    { name: "Khám phá", pageUrl: GK_HOST + "/kham-pha.chn" },
    { name: "Thu thủ thuật", pageUrl: GK_HOST + "/thu-thuat.chn" },
    { name: "Tin ICT", pageUrl: GK_HOST + "/tin-ict.chn" },
    { name: "Trà đá công nghệ", pageUrl: GK_HOST + "/tra-da-cong-nghe.chn" },
    { name: "Xe", pageUrl: GK_HOST + "/xe.chn" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "genk",
        name: GK_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=genk.vn&sz=64",
        categories: GK_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("genk") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": GK_DESKTOP_UA,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var GK_ENTITIES = {
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
        return GK_ENTITIES.hasOwnProperty(name) ? GK_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function gkStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = gkDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = gkDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function gkNormImg(raw) {
    if (!raw) return null;
    var url = gkDecode(raw).replace(/&amp;/g, "&").trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http%3A") === 0 || url.indexOf("https%3A") === 0) {
        try {
            url = decodeURIComponent(url);
        } catch (e) {
            return null;
        }
    }
    if (url.indexOf("data:") === 0) return null;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function gkAbs(raw) {
    if (!raw) return null;
    var link = gkDecode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return GK_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var GK_ITEM_RE = /<article[^>]*class="[^"]*gknews_box[^"]*"[\s\S]*?<\/article>/gi;
var GK_LIST_ITEM_RE = /<li[^>]*class="[^"]*\bcc\b[^"]*"[\s\S]*?<\/li>/gi;
var GK_TITLE_LINK_RE = /<a([^>]*\bclass="[^"]*gknews_title[^"]*"[^>]*)>([\s\S]*?)<\/a>/i;
var GK_HEADING_LINK_RE = /<h[23][^>]*>[\s\S]{0,800}?<a([^>]*\bhref="[^"]+\.chn"[^>]*)>([\s\S]*?)<\/a>/i;
var GK_HREF_RE = /\bhref="([^"]+)"/i;
var GK_TITLE_ATTR_RE = /\btitle="([^"]+)"/i;
var GK_IMG_BG_RE = /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i;
var GK_IMG_SRC_RE = /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"/i;

function gkParseItem(chunk) {
    var m = GK_TITLE_LINK_RE.exec(chunk) || GK_HEADING_LINK_RE.exec(chunk);
    if (!m) return null;
    var attrs = m[1] || "";
    var href = GK_HREF_RE.exec(attrs);
    if (!href) return null;
    var link = gkAbs(href[1]);
    if (!link) return null;

    var title = gkStrip(m[2]).trim();
    if (!title) {
        var attr = GK_TITLE_ATTR_RE.exec(attrs);
        if (attr) title = gkDecode(attr[1]).trim();
    }
    if (!title) return null;

    var image = GK_IMG_BG_RE.exec(chunk) || GK_IMG_SRC_RE.exec(chunk);
    return {
        title: title,
        link: link,
        excerpt: null,
        imageUrl: image ? gkNormImg(image[1]) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: GK_SOURCE_NAME
    };
}

function gkImageNear(html, link) {
    var needle = link.indexOf(GK_HOST) === 0 ? link.substring(GK_HOST.length) : link;
    if (!needle) return null;
    var from = 0;
    while (from < html.length) {
        var idx = html.indexOf(needle, from);
        if (idx < 0) return null;
        var start = idx - 1200;
        if (start < 0) start = 0;
        var end = idx + 1200;
        if (end > html.length) end = html.length;
        var window = html.substring(start, end);
        var raw = GK_IMG_BG_RE.exec(window) || GK_IMG_SRC_RE.exec(window);
        if (raw) return gkNormImg(raw[1]);
        from = idx + needle.length;
    }
    return null;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var index = {};

    function add(article) {
        if (!article || !article.title) return;
        var i = index[article.link];
        if (i === undefined) {
            index[article.link] = items.length;
            items.push(article);
        } else if (!items[i].imageUrl && article.imageUrl) {
            items[i].imageUrl = article.imageUrl;
        }
    }

    var chunks = source.match(GK_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        try {
            add(gkParseItem(chunks[i]));
        } catch (e) {
            // bỏ qua tin lỗi
        }
    }
    if (items.length === 0) {
        chunks = source.match(GK_LIST_ITEM_RE) || [];
        for (var j = 0; j < chunks.length; j++) {
            try {
                add(gkParseItem(chunks[j]));
            } catch (e2) {
                // bỏ qua tin lỗi
            }
        }
    }
    if (items.length === 0) {
        var rest = source;
        var re = new RegExp(GK_TITLE_LINK_RE.source, "gi");
        var m;
        while ((m = re.exec(rest)) !== null) {
            try {
                add(gkParseItem(m[0]));
            } catch (e3) {
                // bỏ qua
            }
        }
    }

    for (var k = 0; k < items.length; k++) {
        if (!items[k].imageUrl) {
            var near = gkImageNear(source, items[k].link);
            if (near) items[k].imageUrl = near;
        }
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl || !page || page <= 1) return null;
    var url = String(currentUrl);
    var base = url.split("/trang-")[0];
    var isSearch = url.toLowerCase().indexOf("/tim-kiem/") !== -1;
    var stem = base.replace(/\.chn$/, "").replace(/\.htm$/, "");
    if (isSearch) return stem + "/trang-" + page + ".chn";
    if (stem === GK_HOST || stem === GK_HOST + "/") return null;
    return stem + "/trang-" + page + ".htm";
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword || (page && page > 1)) return null;
    return GK_HOST + "/tim-kiem/" + encodeURIComponent(keyword).replace(/%20/g, "-") + ".chn";
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var GK_DETAIL_TITLE_RE = /<h1[^>]*class="[^"]*kbwc-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
var GK_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var GK_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var GK_SAPO_RE = /<[^>]*class="[^"]*knc-sapo[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i;
var GK_BODY_OPEN_RE = /<div[^>]*class="[^"]*knc-content[^"]*detail-content[^"]*"[^>]*>/i;
var GK_BODY_FALLBACK_OPEN_RE = /<div[^>]*class="[^"]*kbwc-body[^"]*"[^>]*>/i;

var GK_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var GK_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var GK_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var GK_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var GK_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function gkDivInner(html, openRe) {
    var m = openRe.exec(html);
    if (!m) return null;
    var start = m.index + m[0].length;
    var re = /<(\/?)div\b[^>]*>/gi;
    re.lastIndex = start;
    var depth = 1;
    var tag;
    while ((tag = re.exec(html)) !== null) {
        if (tag[1] === "/") depth--; else depth++;
        if (depth === 0) return html.substring(start, tag.index);
    }
    return html.substring(start);
}

function gkImgSrc(tag) {
    var m = GK_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function gkFigCaption(tag) {
    var m = GK_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function gkVideoSrc(tag) {
    var m = GK_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function gkVideoPoster(tag) {
    var m = GK_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function gkScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(GK_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = gkNormImg(gkVideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: gkNormImg(gkVideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = gkNormImg(gkVideoSrc(tag));
                if (vUrl) {
                    var poster = gkNormImg(gkVideoPoster(tag)) || gkNormImg(gkImgSrc(tag));
                    var vCaption = gkFigCaption(tag);
                    vCaption = vCaption ? gkStrip(vCaption).trim() : null;
                    blocks.push({
                        isImage: false,
                        text: vCaption,
                        imageUrl: poster,
                        isVideo: true,
                        videoUrl: vUrl
                    });
                }
                continue;
            }

            var imageUrl = gkNormImg(gkImgSrc(tag));
            if (!imageUrl) continue;
            var caption = gkFigCaption(tag);
            caption = caption ? gkStrip(caption).trim() : null;
            blocks.push({ isImage: true, text: caption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = gkStrip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : GK_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = GK_DETAIL_TITLE_RE.exec(source)
        || GK_H1_RE.exec(source)
        || GK_OG_TITLE_RE.exec(source);
    var title = titleMatch ? gkStrip(titleMatch[1]).trim() : "";

    var rawBody = gkDivInner(source, GK_BODY_OPEN_RE);
    if (!rawBody) rawBody = gkDivInner(source, GK_BODY_FALLBACK_OPEN_RE);
    if (!rawBody) return null;

    var blocks = [];
    var sapoMatch = GK_SAPO_RE.exec(source);
    if (sapoMatch) {
        var sapo = gkStrip(sapoMatch[1]).replace(/\s+/g, " ").trim();
        if (sapo.length >= GK_MIN_TEXT) {
            blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    var bodyBlocks = gkScanBlocks(rawBody);
    for (var i = 0; i < bodyBlocks.length; i++) blocks.push(bodyBlocks[i]);

    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}
