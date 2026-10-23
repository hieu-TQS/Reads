/**
 * Tiền Phong (tienphong.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNewsSite.kt):
 *  - getNewsSource / matchesNewsSource / parseNewsList
 *  - getNewsNextPageUrl / getNewsSearchUrl / getNewsHeaders / parseNewsArticle
 *
 * Toàn bộ hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * Viết ES5 thuần: không dùng optional chaining, nullish coalescing,
 * template literal hay arrow function.
 */

var TP_HOST = "https://tienphong.vn";
var TP_API_HOST = "https://api.tienphong.vn";
var TP_SOURCE_NAME = "Tiền Phong";
var TP_SEARCH_MARKER = "morenews-search-";
var TP_SEARCH_MAX_PAGE = 20;
var TP_MIN_TEXT = 30;
var TP_MIN_HEADING = 5;

var TP_CATEGORIES = [
    { name: "Trang chủ", pageUrl: TP_HOST + "/" },
    { name: "Chính trị", pageUrl: TP_HOST + "/chinh-tri/" },
    { name: "Xã hội", pageUrl: TP_HOST + "/xa-hoi/" },
    { name: "Kinh tế", pageUrl: TP_HOST + "/kinh-te/" },
    { name: "Thế giới", pageUrl: TP_HOST + "/the-gioi/" },
    { name: "Văn hóa", pageUrl: TP_HOST + "/van-hoa/" },
    { name: "Giải trí", pageUrl: TP_HOST + "/giai-tri/" },
    { name: "Thể thao", pageUrl: TP_HOST + "/the-thao/" },
    { name: "Giáo dục", pageUrl: TP_HOST + "/giao-duc/" },
    { name: "Sức khỏe", pageUrl: TP_HOST + "/suc-khoe/" },
    { name: "Pháp luật", pageUrl: TP_HOST + "/phap-luat/" },
    { name: "Khoa học", pageUrl: TP_HOST + "/khoa-hoc/" },
    { name: "Đời sống", pageUrl: TP_HOST + "/lifestyle/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "tienphong",
        name: TP_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=tienphong.vn&sz=64",
        categories: TP_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("tienphong") !== -1;
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var TP_ENTITIES = {
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

function tpDecode(value) {
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
        return TP_ENTITIES.hasOwnProperty(name) ? TP_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function tpStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = tpDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = tpDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function tpNormImg(raw) {
    if (!raw) return null;
    var url = tpDecode(raw).replace(/&amp;/g, "&").trim();
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

// Glide 4.11 không đọc AVIF; CDN Tiền Phong phục vụ cùng path với .jpg.
function tpImage(raw) {
    var url = tpNormImg(raw);
    if (!url) return null;
    if (/\.avif$/i.test(url)) url = url.substring(0, url.length - 5) + ".jpg";
    return url;
}

function tpAbs(raw) {
    if (!raw) return null;
    var link = tpDecode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return TP_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var TP_ITEM_RE = /<article[^>]*class="[^"]*story[^"]*"[\s\S]*?<\/article>/gi;
var TP_LINK_RE = /href="(https:\/\/tienphong\.vn\/[^"]*-post\d+\.tpo)"/i;
var TP_TITLE_ATTR_RE = /title="([^"]+)"/i;
var TP_IMG_DATA_RE = /data-src="(https?:\/\/[^"]+)"/i;
var TP_IMG_SRC_RE = /src="(https?:\/\/[^"]+)"/i;

function tpParseItem(chunk) {
    var linkMatch = TP_LINK_RE.exec(chunk);
    if (!linkMatch) return null;
    var link = tpAbs(linkMatch[1]);
    if (!link) return null;

    var titleMatch = TP_TITLE_ATTR_RE.exec(chunk);
    if (!titleMatch) return null;
    var title = tpDecode(titleMatch[1]).trim();
    if (!title) return null;

    var imageMatch = TP_IMG_DATA_RE.exec(chunk) || TP_IMG_SRC_RE.exec(chunk);
    return {
        title: title,
        link: link,
        excerpt: null,
        imageUrl: imageMatch ? tpImage(imageMatch[1]) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: TP_SOURCE_NAME
    };
}

function tpParseSearch(json) {
    var items = [];
    var root;
    try {
        root = JSON.parse(json);
    } catch (e) {
        return items;
    }
    var data = root && root.data ? root.data : null;
    var contents = data && data.contents ? data.contents : null;
    if (!contents) return items;

    var seen = {};
    for (var i = 0; i < contents.length; i++) {
        var obj = contents[i] || {};
        var title = tpDecode(obj.title || "").trim();
        if (title.length < TP_MIN_HEADING) continue;
        var link = tpAbs(obj.url);
        if (!link || seen[link]) continue;
        seen[link] = true;

        var excerpt = tpStrip(obj.description || "")
            .replace(/\s+/g, " ")
            .trim();
        if (excerpt.length < TP_MIN_TEXT) excerpt = null;

        var image = obj.avatar_url;
        if (!image && obj.avatars) image = obj.avatars.W200_R1X1;
        var dateSec = 0;
        try {
            dateSec = obj.date ? parseInt(obj.date, 10) : 0;
        } catch (e2) {
            dateSec = 0;
        }

        items.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: image ? tpImage(image) : null,
            pubDate: null,
            pubDateMs: dateSec > 0 ? dateSec * 1000 : 0,
            sourceName: TP_SOURCE_NAME
        });
    }
    return items;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var head = source.replace(/^\s+/, "");
    if (head.charAt(0) === "{" || head.charAt(0) === "[") {
        return JSON.stringify(tpParseSearch(source));
    }

    var items = [];
    var seen = {};
    var chunks = source.match(TP_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        var item = tpParseItem(chunks[i]);
        if (!item || !item.title || !item.link) continue;
        if (seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl) return null;
    var url = String(currentUrl);
    if (url.toLowerCase().indexOf(TP_SEARCH_MARKER) === -1) return null;
    if (!page || page <= 1 || page > TP_SEARCH_MAX_PAGE) return null;
    if (!html || String(html).indexOf("\"content_id\"") === -1) return null;
    if (!/morenews-search-\d+-\d+\.html/.test(url)) return null;
    return url.replace(/(morenews-search-\d+-)\d+(\.html)/, function (m, a, b) {
        return a + page + b;
    });
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    var p = page ? Math.floor(page) : 1;
    if (p < 1) p = 1;
    return TP_API_HOST + "/api/morenews-search-0-" + p + ".html?phrase=" + encodeURIComponent(keyword);
}

function getNewsHeaders(url) {
    if (url && String(url).toLowerCase().indexOf(TP_SEARCH_MARKER) !== -1) {
        return JSON.stringify({ Referer: TP_HOST + "/" });
    }
    return "{}";
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var TP_DETAIL_TITLE_RE = /<h1[^>]*class="[^"]*article__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
var TP_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var TP_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var TP_SAPO_RE = /<[^>]*class="[^"]*article__sapo[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i;
var TP_BODY_OPEN_RE = /<div[^>]*class="[^"]*article__body[^"]*"[^>]*>/i;
var TP_BODY_FALLBACK_RE = /<[^>]*class="[^"]*article__body[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

var TP_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var TP_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var TP_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var TP_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var TP_VIDEO_DATA_RE = /<video[^>]+(?:data-src|src)="([^"]+)"/i;
var TP_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function tpImgSrc(tag) {
    var m = TP_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function tpFigCaption(tag) {
    var m = TP_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function tpVideoSrc(tag) {
    var m = TP_VIDEO_SRC_RE.exec(tag) || TP_VIDEO_DATA_RE.exec(tag);
    return m ? m[1] : null;
}

function tpVideoPoster(tag) {
    var m = TP_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function tpDivInner(html, openRe) {
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

function tpScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(TP_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = tpNormImg(tpVideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: tpNormImg(tpVideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = tpNormImg(tpVideoSrc(tag));
                if (vUrl) {
                    var poster = tpNormImg(tpVideoPoster(tag)) || tpImage(tpImgSrc(tag));
                    var caption = tpFigCaption(tag);
                    caption = caption ? tpStrip(caption).trim() : null;
                    if (caption && !caption.length) caption = null;
                    blocks.push({
                        isImage: false,
                        text: caption,
                        imageUrl: poster,
                        isVideo: true,
                        videoUrl: vUrl
                    });
                }
                continue;
            }

            var imageUrl = tpImage(tpImgSrc(tag));
            if (!imageUrl) continue;
            var imageCaption = tpFigCaption(tag);
            imageCaption = imageCaption ? tpStrip(imageCaption).trim() : null;
            if (imageCaption && !imageCaption.length) imageCaption = null;
            blocks.push({ isImage: true, text: imageCaption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = tpStrip(inner)
            .replace(/[ \t]+/g, " ")
            .replace(/\n+/g, " ")
            .trim();
        var minLength = isHeading ? TP_MIN_HEADING : TP_MIN_TEXT;
        if (text.length >= minLength) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function tpParseRelated(html) {
    var source = String(html);
    var start = source.indexOf("article-footer");
    if (start < 0) return [];
    var end = source.indexOf("</footer>", start);
    if (end < 0) end = source.length;
    var section = source.substring(start, end);

    var items = [];
    var seen = {};
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(section)) !== null) {
        var attrs = m[1] || "";
        var hrefMatch = /href="([^"]+)"/i.exec(attrs);
        if (!hrefMatch) continue;
        var link = tpAbs(hrefMatch[1]);
        if (!link || !/-post\d+\.tpo/i.test(link)) continue;

        var titleMatch = /title="([^"]+)"/i.exec(attrs);
        var title = titleMatch ? tpDecode(titleMatch[1]).trim() : tpStrip(m[2]).trim();
        if (title.length < TP_MIN_HEADING || seen[link]) continue;
        seen[link] = true;
        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: null,
            pubDate: null,
            pubDateMs: 0,
            sourceName: TP_SOURCE_NAME
        });
        if (items.length >= 8) break;
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = TP_DETAIL_TITLE_RE.exec(source)
        || TP_H1_RE.exec(source)
        || TP_OG_TITLE_RE.exec(source);
    var title = titleMatch ? tpStrip(titleMatch[1]).trim() : "";

    var rawBody = tpDivInner(source, TP_BODY_OPEN_RE);
    if (!rawBody) {
        var fallback = TP_BODY_FALLBACK_RE.exec(source);
        rawBody = fallback ? fallback[1] : null;
    }
    if (!rawBody) return null;

    var blocks = [];
    var sapoMatch = TP_SAPO_RE.exec(source);
    if (sapoMatch) {
        var sapo = tpStrip(sapoMatch[1]).replace(/\s+/g, " ").trim();
        if (sapo.length >= TP_MIN_TEXT) {
            blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    var bodyBlocks = tpScanBlocks(rawBody);
    for (var i = 0; i < bodyBlocks.length; i++) blocks.push(bodyBlocks[i]);

    return JSON.stringify({
        title: title,
        blocks: blocks,
        related: tpParseRelated(source)
    });
}
