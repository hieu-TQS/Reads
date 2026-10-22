/**
 * 24h (24h.com.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * - Danh sách: mỗi tin là `<article>` gồm `figure > a` (ảnh) + `h3 > a` (tiêu đề/link).
 *   Ảnh lazy-load: `src` là GIF 1px, URL thật ở `data-original`
 * - Phân trang: nút "Xem thêm" gọi AJAX fragment
 *   `24h.24hstatic.com/ajax/.../index/<categoryId>/<page>/...` (URL mẫu nằm trong
 *   `onclick="ajax_xem_them_..."`)
 * - Tìm kiếm: báo dùng Google site search → không cào được
 * - Đọc bài: `h1[itemprop=headline]`, thân `article#div_news_content`
 *   (sapo `h2.…-sum`, ảnh lazy-load `data-original`), tin liên quan
 *   `article.box_tin_lien_quan_duoi_noi_dung_bai_mobile`
 *
 * Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var NH_HOST = "https://www.24h.com.vn";
var NH_SOURCE_NAME = "24h";
var NH_MAX_PAGE = 12;
var NH_MIN_TEXT = 30;
var NH_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var NH_CATEGORIES = [
    { name: "Trang chủ", pageUrl: NH_HOST + "/" },
    { name: "Tin tức", pageUrl: NH_HOST + "/tin-tuc-trong-ngay-c46.html" },
    { name: "Bóng đá", pageUrl: NH_HOST + "/bong-da-c48.html" },
    { name: "Ngoại hạng Anh", pageUrl: NH_HOST + "/bong-da-ngoai-hang-anh-c149.html" },
    { name: "Thể thao", pageUrl: NH_HOST + "/the-thao-c101.html" },
    { name: "Thế giới", pageUrl: NH_HOST + "/tin-tuc-quoc-te-c415.html" },
    { name: "Kinh doanh", pageUrl: NH_HOST + "/kinh-doanh-c161.html" },
    { name: "Giải trí", pageUrl: NH_HOST + "/giai-tri-c731.html" },
    { name: "Sức khỏe", pageUrl: NH_HOST + "/suc-khoe-doi-song-c62.html" },
    { name: "Hi-tech", pageUrl: NH_HOST + "/thoi-trang-hi-tech-c407.html" },
    { name: "Ô tô", pageUrl: NH_HOST + "/o-to-c747.html" },
    { name: "Đẹp", pageUrl: NH_HOST + "/dep-c78.html" },
    { name: "An ninh - Xã hội", pageUrl: NH_HOST + "/an-ninh-xa-hoi-c51.html" },
    { name: "Giáo dục", pageUrl: NH_HOST + "/giao-duc-c216.html" },
    { name: "Video", pageUrl: NH_HOST + "/video-highlight-c953.html" },
    { name: "Quân sự", pageUrl: NH_HOST + "/quan-su-c705.html" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "24h",
        name: NH_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=24h.com.vn&sz=64",
        categories: NH_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("24h.com.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({ "User-Agent": NH_MOBILE_UA });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var NH_ENTITIES = {
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

function nhDecode(value) {
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
        return NH_ENTITIES.hasOwnProperty(name) ? NH_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function nhStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = nhDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = nhDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function nhNormImg(raw) {
    if (!raw) return null;
    var url = nhDecode(raw).replace(/&amp;/g, "&").trim();
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

function nhAbs(raw) {
    if (!raw) return null;
    var link = nhDecode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return NH_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin (trang chuyên mục + fragment ajax "Xem thêm")
// ----------------------------------------------------------------------

var NH_ITEM_RE = /<article[^>]*>[\s\S]*?<\/article>/gi;
var NH_TITLE_ANCHOR_RE = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
var NH_FIRST_ANCHOR_RE = /<a[^>]+href="([^"]+)"/i;
var NH_TITLE_ATTR_RE = /<a[^>]+href="[^"]+"[^>]+title="([^"]+)"/i;
var NH_IMG_ALT_RE = /<img[^>]+alt="([^"]+)"/i;
var NH_IMG_DATA_RE = /<img[^>]+(?:data-original|data-src)="(https?:\/\/[^"]+)"/i;
var NH_IMG_SRC_RE = /<img[^>]+src="(https?:\/\/[^"]+)"/i;
var NH_NEWS_LINK_RE = /-c\d+a\d+\.html/i;

function nhParseItem(chunk) {
    var titleMatch = NH_TITLE_ANCHOR_RE.exec(chunk);
    var rawLink = titleMatch ? titleMatch[1] : null;
    if (!rawLink) {
        var first = NH_FIRST_ANCHOR_RE.exec(chunk);
        if (first) rawLink = first[1];
    }
    if (!rawLink) return null;
    var link = nhAbs(rawLink);
    if (!link || !NH_NEWS_LINK_RE.test(link)) return null;

    var title = null;
    if (titleMatch) title = nhStrip(titleMatch[2]).trim();
    if (!title) {
        var alt = NH_IMG_ALT_RE.exec(chunk);
        if (alt) title = nhDecode(alt[1]).trim();
    }
    if (!title) {
        var attr = NH_TITLE_ATTR_RE.exec(chunk);
        if (attr) title = nhDecode(attr[1]).trim();
    }
    if (!title) return null;

    var image = NH_IMG_DATA_RE.exec(chunk) || NH_IMG_SRC_RE.exec(chunk);
    var imageUrl = image ? image[1] : null;
    if (imageUrl && imageUrl.toLowerCase().indexOf(".svg") !== -1) imageUrl = null;

    return {
        title: title,
        link: link,
        excerpt: null,
        imageUrl: imageUrl ? nhNormImg(imageUrl) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: NH_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var items = [];
    var seen = {};
    var chunks = source.match(NH_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        var item = null;
        try {
            item = nhParseItem(chunks[i]);
        } catch (e) {
            item = null;
        }
        if (!item || !item.title || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

var NH_AJAX_URL_RE = /ajax_xem_them_[^(]*\(\s*'[^']*'\s*,\s*'([^']+)'/i;
var NH_AJAX_PAGE_RE = /(\/index\/\d+\/)(\d+)(\/)/;
var NH_MAX_PAGE_ATTR_RE = /data-max-page="(\d+)"/;

function nhAjaxUrlForPage(template, page) {
    if (template.indexOf("{page}") !== -1) return template.replace(/\{page\}/g, String(page));
    var m = NH_AJAX_PAGE_RE.exec(template);
    if (!m) return null;
    return template.replace(NH_AJAX_PAGE_RE, m[1] + page + m[3]);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl || !page || page <= 1) return null;
    var source = String(html || "");
    var maxMatch = NH_MAX_PAGE_ATTR_RE.exec(source);
    var limit = maxMatch ? parseInt(maxMatch[1], 10) : NH_MAX_PAGE;
    if (isNaN(limit) || limit <= 0) limit = NH_MAX_PAGE;
    if (page > limit) return null;

    var url = String(currentUrl);
    var template = null;
    if (url.toLowerCase().indexOf("/index/") !== -1) {
        template = url;
    } else {
        var ajax = NH_AJAX_URL_RE.exec(source);
        if (ajax) template = ajax[1].replace(/&amp;/g, "&");
    }
    if (!template) return null;
    return nhAjaxUrlForPage(template, page);
}

function getNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var NH_DETAIL_TITLE_RE = /<h1[^>]*itemprop="headline"[^>]*>([\s\S]*?)<\/h1>/i;
var NH_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var NH_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var NH_BODY_START_RE = /<article[^>]*id="div_news_content"[^>]*>/i;

var NH_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var NH_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var NH_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var NH_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var NH_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function nhImgSrc(tag) {
    var m = NH_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function nhFigCaption(tag) {
    var m = NH_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function nhVideoSrc(tag) {
    var m = NH_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function nhVideoPoster(tag) {
    var m = NH_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function nhScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(NH_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = nhNormImg(nhVideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: nhNormImg(nhVideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = nhNormImg(nhVideoSrc(tag));
                if (vUrl) {
                    var poster = nhNormImg(nhVideoPoster(tag)) || nhNormImg(nhImgSrc(tag));
                    var vCaption = nhFigCaption(tag);
                    vCaption = vCaption ? nhStrip(vCaption).trim() : null;
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

            var imageUrl = nhNormImg(nhImgSrc(tag));
            if (!imageUrl) continue;
            var caption = nhFigCaption(tag);
            caption = caption ? nhStrip(caption).trim() : null;
            blocks.push({ isImage: true, text: caption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = nhStrip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : NH_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

var NH_IMG_TAG_RE = /<img[^>]+>/gi;
var NH_IMG_DATA_ATTR_RE = /data-original="([^"]+)"/i;
var NH_IMG_SRC_ATTR_RE = /src="[^"]*"/i;
var NH_SVG_IMG_RE = /<img[^>]+src="[^"]*\.svg[^"]*"[^>]*>/gi;
var NH_BLOCK_P_OPEN_RE = /<p[^>]*>\s*(?=<(?:div|img|span)\b)/gi;

function nhPromoteLazyImages(html) {
    return String(html).replace(NH_IMG_TAG_RE, function (tag) {
        var original = NH_IMG_DATA_ATTR_RE.exec(tag);
        if (!original) return tag;
        var src = NH_IMG_SRC_ATTR_RE.exec(tag);
        if (!src) return tag;
        return tag.replace(src[0], "src=\"" + original[1] + "\"");
    });
}

function nhCleanBody(raw) {
    var body = String(raw);

    var popup = /<section[^>]*inpage-child-ignore/i.exec(body);
    if (popup) body = body.substring(0, popup.index);

    var inline = /<div[^>]*class="[^"]*bv-lq[^"]*"[^>]*>/i.exec(body);
    if (inline) {
        var inlineEnd = body.indexOf("<p class=\"tuht_all\">", inline.index);
        if (inlineEnd > inline.index) {
            body = body.substring(0, inline.index) + body.substring(inlineEnd);
        }
    }

    return nhPromoteLazyImages(body)
        .replace(NH_SVG_IMG_RE, "")
        .replace(NH_BLOCK_P_OPEN_RE, "")
        .replace(/<\/div>\s*<\/p>/gi, "</div>");
}

var NH_RELATED_ITEM_RE = /<article[^>]*box_tin_lien_quan_duoi_noi_dung_bai_mobile[^>]*>[\s\S]*?<\/article>/gi;
var NH_RELATED_ANCHOR_RE = /<span[^>]*class="[^"]*nwsTit[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

function nhParseRelated(html, currentLink) {
    var items = [];
    var seen = {};
    var source = String(html);
    var blocks = source.match(NH_RELATED_ITEM_RE) || [];
    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var anchor = NH_RELATED_ANCHOR_RE.exec(block);
        if (!anchor) continue;
        var link = nhAbs(anchor[1]);
        var title = nhStrip(anchor[2]).trim();
        if (!link || title.length < 5 || link === currentLink || seen[link]) continue;
        seen[link] = true;

        var image = NH_IMG_DATA_RE.exec(block) || NH_IMG_SRC_RE.exec(block);
        var imageUrl = image ? image[1] : null;
        if (imageUrl && imageUrl.toLowerCase().indexOf(".svg") !== -1) imageUrl = null;

        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: imageUrl ? nhNormImg(imageUrl) : null,
            pubDate: null,
            pubDateMs: 0,
            sourceName: NH_SOURCE_NAME
        });
        if (items.length >= 8) break;
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = NH_DETAIL_TITLE_RE.exec(source)
        || NH_H1_RE.exec(source)
        || NH_OG_TITLE_RE.exec(source);
    var title = titleMatch ? nhStrip(titleMatch[1]).trim() : "";

    var startMatch = NH_BODY_START_RE.exec(source);
    if (!startMatch) return null;
    var start = startMatch.index + startMatch[0].length;
    var end = source.indexOf("</article>", start);
    if (end <= start) return null;

    var body = nhCleanBody(source.substring(start, end));
    return JSON.stringify({
        title: title,
        blocks: nhScanBlocks(body),
        related: nhParseRelated(source, url)
    });
}
