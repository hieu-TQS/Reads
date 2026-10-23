/**
 * Thể thao 247 (thethao247.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * - Danh sách: HTML chuyên mục `/<slug>-c<id>/`, mỗi tin là `<li>` chứa
 *   `<a class="thumb">` (ảnh) + `<h2 class="title"><a>` + `<p class="sapo">`
 * - Phân trang: `?page=N` (server render)
 * - Tìm kiếm: báo dùng Google CSE (JS) → không cào được
 * - Đọc bài: `h1#title_detail`, sapo `p.sapo_detail`, thân bài `#content_detail`
 *
 * Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var TT_HOST = "https://thethao247.vn";
var TT_SOURCE_NAME = "Thể thao 247";
var TT_MAX_PAGE = 6;
var TT_MIN_TEXT = 30;

var TT_CATEGORIES = [
    { name: "Trang chủ", pageUrl: TT_HOST + "/" },
    { name: "Bóng đá Việt Nam", pageUrl: TT_HOST + "/bong-da-viet-nam-c1/" },
    { name: "V-League", pageUrl: TT_HOST + "/v-league-c15/" },
    { name: "Đội tuyển Quốc gia", pageUrl: TT_HOST + "/tuyen-quoc-gia-vn-c19/" },
    { name: "Cúp C1", pageUrl: TT_HOST + "/cup-c1-c13/" },
    { name: "Ngoại hạng Anh", pageUrl: TT_HOST + "/ngoai-hang-anh-c8/" },
    { name: "Bóng đá quốc tế", pageUrl: TT_HOST + "/bong-da-quoc-te-c2/" },
    { name: "La Liga", pageUrl: TT_HOST + "/bong-da-tay-ban-nha-la-liga-c9/" },
    { name: "Serie A", pageUrl: TT_HOST + "/bong-da-y-c10/" },
    { name: "Bundesliga", pageUrl: TT_HOST + "/bong-da-duc-c11/" },
    { name: "Nhận định", pageUrl: TT_HOST + "/nhan-dinh-bong-da-c288/" },
    { name: "Chuyển nhượng", pageUrl: TT_HOST + "/chuyen-nhuong-c14/" },
    { name: "Thể Thao", pageUrl: TT_HOST + "/the-thao-c5/" },
    { name: "Esports", pageUrl: TT_HOST + "/esports-c180/" },
    { name: "Xe", pageUrl: TT_HOST + "/xe-c191/" },
    { name: "Công nghệ", pageUrl: TT_HOST + "/cong-nghe-c344/" },
    { name: "Xu hướng", pageUrl: TT_HOST + "/can-biet-c123/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "thethao247",
        name: TT_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=thethao247.vn&sz=64",
        categories: TT_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("thethao247") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var TT_ENTITIES = {
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

function ttDecode(value) {
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
        return TT_ENTITIES.hasOwnProperty(name) ? TT_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function ttStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = ttDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = ttDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function ttNormImg(raw) {
    if (!raw) return null;
    var url = ttDecode(raw).replace(/&amp;/g, "&").trim();
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

function ttAbs(raw) {
    if (!raw) return null;
    var link = ttDecode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return TT_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var TT_ITEM_RE = /<li[^>]*>[\s\S]*?<\/li>/gi;
var TT_THUMB_RE = /<a[^>]*href="([^"]+)"[^>]*class="thumb/i;
var TT_TITLE_RE = /<a[^>]*href="([^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/i;
var TT_TITLE_H2_RE = /<h2[^>]*class="title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
var TT_TITLE_ATTR_RE = /title="([^"]+)"/i;
var TT_IMG_RE = /<img[^>]+src="(https?:\/\/[^"]+)"/i;
var TT_SAPO_RE = /<p[^>]*class="sapo"[^>]*>([\s\S]*?)<\/p>/i;

function ttParseItem(chunk) {
    if (chunk.toLowerCase().indexOf("class=\"thumb\"") === -1) return null;

    var titleMatch = TT_TITLE_RE.exec(chunk) || TT_TITLE_H2_RE.exec(chunk);
    var rawLink = null;
    if (titleMatch) { rawLink = titleMatch[1]; } else {
        var thumb = TT_THUMB_RE.exec(chunk);
        if (thumb) rawLink = thumb[1];
    }
    if (!rawLink) return null;
    var link = ttAbs(rawLink);
    if (!link) return null;

    var title = null;
    if (titleMatch) title = ttStrip(titleMatch[2]).trim();
    if (!title) {
        var attr = TT_TITLE_ATTR_RE.exec(chunk);
        if (attr) title = ttDecode(attr[1]).trim();
    }
    if (!title) return null;

    var excerpt = null;
    var sapo = TT_SAPO_RE.exec(chunk);
    if (sapo) {
        excerpt = ttStrip(sapo[1]).replace(/\s+/g, " ").trim();
        if (excerpt.length < TT_MIN_TEXT) excerpt = null;
    }

    var image = TT_IMG_RE.exec(chunk);
    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: image ? ttNormImg(image[1]) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: TT_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};
    var chunks = source.match(TT_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        var item = null;
        try {
            item = ttParseItem(chunks[i]);
        } catch (e) {
            item = null;
        }
        if (!item || !item.title || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl || !page || page <= 1 || page > TT_MAX_PAGE) return null;
    var base = String(currentUrl).replace(/[?&]page=\d+/, "");
    while (base.length && (base.charAt(base.length - 1) === "?" || base.charAt(base.length - 1) === "&")) {
        base = base.substring(0, base.length - 1);
    }
    return base + (base.indexOf("?") !== -1 ? "&" : "?") + "page=" + page;
}

function getNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var TT_DETAIL_TITLE_RE = /<h1[^>]*id="title_detail"[^>]*>([\s\S]*?)<\/h1>/i;
var TT_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var TT_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var TT_BODY_RE = /<div[^>]*id="content_detail"[^>]*>([\s\S]*?)(?:<div[^>]*id="comment_area"|<\/main>)/i;

var TT_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var TT_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var TT_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var TT_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var TT_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function ttImgSrc(tag) {
    var m = TT_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function ttFigCaption(tag) {
    var m = TT_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function ttVideoSrc(tag) {
    var m = TT_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function ttVideoPoster(tag) {
    var m = TT_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function ttScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(TT_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = ttNormImg(ttVideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: ttNormImg(ttVideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = ttNormImg(ttVideoSrc(tag));
                if (vUrl) {
                    var poster = ttNormImg(ttVideoPoster(tag)) || ttNormImg(ttImgSrc(tag));
                    var vCaption = ttFigCaption(tag);
                    vCaption = vCaption ? ttStrip(vCaption).trim() : null;
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

            var imageUrl = ttNormImg(ttImgSrc(tag));
            if (!imageUrl) continue;
            var caption = ttFigCaption(tag);
            caption = caption ? ttStrip(caption).trim() : null;
            blocks.push({ isImage: true, text: caption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = ttStrip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : TT_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function ttParseRelated(html) {
    var source = String(html);
    var idx = source.indexOf("explus_related");
    if (idx < 0) return [];
    var endIdx = source.indexOf("comment_area", idx);
    var section = endIdx > idx
        ? source.substring(idx, endIdx)
        : source.substring(idx, Math.min(idx + 2000, source.length));

    var items = [];
    var seen = {};
    var re = /title="([^"]+)"[^>]*href="(https:\/\/(?:m\.)?thethao247\.vn\/[^"]+)"/gi;
    var m;
    while ((m = re.exec(section)) !== null) {
        var title = ttDecode(m[1]).trim();
        var link = ttAbs(m[2]);
        if (!link || title.length < 5 || seen[link]) continue;
        seen[link] = true;
        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: null,
            pubDate: null,
            pubDateMs: 0,
            sourceName: TT_SOURCE_NAME
        });
        if (items.length >= 8) break;
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = TT_DETAIL_TITLE_RE.exec(source)
        || TT_H1_RE.exec(source)
        || TT_OG_TITLE_RE.exec(source);
    var title = titleMatch ? ttStrip(titleMatch[1]).trim() : "";

    var bodyMatch = TT_BODY_RE.exec(source);
    if (!bodyMatch) return null;
    var body = bodyMatch[1].split("explus_related")[0].split("Bài liên quan")[0];

    return JSON.stringify({
        title: title,
        blocks: ttScanBlocks(body),
        related: ttParseRelated(source)
    });
}
