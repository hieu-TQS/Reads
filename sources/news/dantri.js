/**
 * Dân trí (dantri.com.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNewsSite.kt):
 *  - getNewsSource / matchesNewsSource / parseNewsList
 *  - getNewsNextPageUrl / getNewsSearchUrl / getNewsHeaders / parseNewsArticle
 *
 * Toàn bộ hàm trả JSON string. Viết ES5 thuần (không optional chaining,
 * nullish coalescing, template literal hay arrow function).
 *
 * UA mobile bị trả layout timeline (không có article-item) → ép UA desktop.
 */

var DT_HOST = "https://dantri.com.vn";
var DT_SOURCE_NAME = "Dân trí";
var DT_MAX_PAGE = 10;
var DT_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var DT_MIN_TEXT = 30;

var DT_CATEGORIES = [
    { name: "Trang chủ", pageUrl: DT_HOST + "/tin-moi-nhat.htm" },
    { name: "Thời sự", pageUrl: DT_HOST + "/thoi-su.htm" },
    { name: "Thế giới", pageUrl: DT_HOST + "/the-gioi.htm" },
    { name: "Kinh doanh", pageUrl: DT_HOST + "/kinh-doanh.htm" },
    { name: "Đời sống", pageUrl: DT_HOST + "/doi-song.htm" },
    { name: "Giải trí", pageUrl: DT_HOST + "/giai-tri.htm" },
    { name: "Thể thao", pageUrl: DT_HOST + "/the-thao.htm" },
    { name: "Giáo dục", pageUrl: DT_HOST + "/giao-duc.htm" },
    { name: "Sức khỏe", pageUrl: DT_HOST + "/suc-khoe.htm" },
    { name: "Pháp luật", pageUrl: DT_HOST + "/phap-luat.htm" },
    { name: "Khoa học", pageUrl: DT_HOST + "/khoa-hoc.htm" },
    { name: "Công nghệ", pageUrl: DT_HOST + "/cong-nghe.htm" },
    { name: "Ô tô - Xe máy", pageUrl: DT_HOST + "/o-to-xe-may.htm" },
    { name: "Bất động sản", pageUrl: DT_HOST + "/bat-dong-san.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "dantri",
        name: DT_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=dantri.com.vn&sz=64",
        categories: DT_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("dantri") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": DT_DESKTOP_UA,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var DT_ENTITIES = {
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

function dtDecode(value) {
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
        return DT_ENTITIES.hasOwnProperty(name) ? DT_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function dtStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = dtDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = dtDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function dtNormImg(raw) {
    if (!raw) return null;
    var url = dtDecode(raw).replace(/&amp;/g, "&").trim();
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

function dtAbs(raw) {
    if (!raw) return null;
    var link = dtDecode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return DT_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var DT_ITEM_RE = /<article[^>]*class="[^"]*article-item[^"]*"[\s\S]*?<\/article>/gi;
var DT_LINK_RE = /href="([^"]+\.htm)"/i;
var DT_LINK_TARGET_RE = /data-content-target="([^"]+)"/i;
var DT_TITLE_ATTR_RE = /title="([^"]+)"/i;
var DT_TITLE_H_RE = /<h[23][^>]*class="[^"]*article-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i;
var DT_TITLE_A_RE = /<a[^>]*class="[^"]*dt-text-black-mine[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
var DT_IMG_DATA_RE = /<img[^>]+data-src="(https?:\/\/[^"]+)"/i;
var DT_IMG_SRC_RE = /<img[^>]+src="(https?:\/\/[^"]+)"/i;

function dtParseItem(chunk) {
    var rawLink = DT_LINK_TARGET_RE.exec(chunk);
    var link = rawLink ? dtAbs(rawLink[1]) : null;
    if (!link) {
        var linkMatch = DT_LINK_RE.exec(chunk);
        if (!linkMatch) return null;
        link = dtAbs(linkMatch[1]);
    }
    if (!link) return null;

    var title = null;
    var m = DT_TITLE_H_RE.exec(chunk);
    if (!m) m = DT_TITLE_A_RE.exec(chunk);
    if (m) title = dtStrip(m[1]).trim();
    if (!title) {
        var attr = DT_TITLE_ATTR_RE.exec(chunk);
        if (attr) title = dtDecode(attr[1]).trim();
    }
    if (!title) return null;

    var imageMatch = DT_IMG_DATA_RE.exec(chunk) || DT_IMG_SRC_RE.exec(chunk);
    return {
        title: title,
        link: link,
        excerpt: null,
        imageUrl: imageMatch ? dtNormImg(imageMatch[1]) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: DT_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};
    var chunks = source.match(DT_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        var item = null;
        try {
            item = dtParseItem(chunks[i]);
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
    if (!currentUrl || !page || page <= 1 || page > DT_MAX_PAGE) return null;
    var url = String(currentUrl);
    if (url.toLowerCase().indexOf("/tim-kiem/") !== -1) return null;
    // Timeline "tin mới nhất" không có route /trang-N
    if (url.toLowerCase().indexOf("tin-moi-nhat") !== -1) return null;
    if (!html || String(html).indexOf("article-item") === -1) return null;
    var base = url.split("/trang-")[0];
    var stem = base.split(".htm")[0];
    return stem + "/trang-" + page + ".htm";
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword || (page && page > 1)) return null;
    return DT_HOST + "/tim-kiem/" + encodeURIComponent(keyword) + ".htm";
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var DT_DETAIL_TITLE_RE = /<h1[^>]*data-slot="title"[^>]*>([\s\S]*?)<\/h1>/i;
var DT_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var DT_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var DT_SAPO_RE = /<h2[^>]*data-slot="sapo"[^>]*>([\s\S]*?)<\/h2>/i;
var DT_BODY_RE = /<div[^>]*data-slot="content"[^>]*>([\s\S]*?)<\/article>/i;

var DT_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var DT_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var DT_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var DT_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var DT_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function dtImgSrc(tag) {
    var m = DT_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function dtFigCaption(tag) {
    var m = DT_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function dtVideoSrc(tag) {
    var m = DT_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function dtVideoPoster(tag) {
    var m = DT_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function dtScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(DT_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = dtNormImg(dtVideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: dtNormImg(dtVideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = dtNormImg(dtVideoSrc(tag));
                if (vUrl) {
                    var poster = dtNormImg(dtVideoPoster(tag)) || dtNormImg(dtImgSrc(tag));
                    var vCaption = dtFigCaption(tag);
                    vCaption = vCaption ? dtStrip(vCaption).trim() : null;
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

            var imageUrl = dtNormImg(dtImgSrc(tag));
            if (!imageUrl) continue;
            var caption = dtFigCaption(tag);
            caption = caption ? dtStrip(caption).trim() : null;
            blocks.push({ isImage: true, text: caption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = dtStrip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
        var minLength = isHeading ? 5 : DT_MIN_TEXT;
        if (text.length >= minLength) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = DT_DETAIL_TITLE_RE.exec(source)
        || DT_H1_RE.exec(source)
        || DT_OG_TITLE_RE.exec(source);
    var title = titleMatch ? dtStrip(titleMatch[1]).trim() : "";

    var bodyMatch = DT_BODY_RE.exec(source);
    if (!bodyMatch) return null;

    var blocks = [];
    var sapoMatch = DT_SAPO_RE.exec(source);
    if (sapoMatch) {
        var sapo = dtStrip(sapoMatch[1]).replace(/\s+/g, " ").trim();
        if (sapo.length >= DT_MIN_TEXT) {
            blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    var bodyBlocks = dtScanBlocks(bodyMatch[1]);
    for (var i = 0; i < bodyBlocks.length; i++) blocks.push(bodyBlocks[i]);

    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}
