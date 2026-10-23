/**
 * VnReview (vnreview.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * - Danh sách: `div.vnrhomeNews-listItem` với tiêu đề `h3...-title > a`,
 *   thumbnail `<img src>` trong khối tin
 * - Phân trang chuyên mục: `/chuyen-muc/<slug>.<id>/page-N`
 * - Tìm kiếm: XenForo GET `/search/search?keywords=...` → 303 sang `/search/<id>/?q=...`;
 *   trang kế lấy từ `<link rel="next" href="...">` trong HTML
 * - Đọc bài: `h1.p-title-value`, thân bài `div.bbWrapper`
 *
 * Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var VR_HOST = "https://vnreview.vn";
var VR_SOURCE_NAME = "VnReview";
var VR_MAX_PAGE = 10;
var VR_MIN_TEXT = 30;

var VR_CATEGORIES = [
    { name: "Trang chủ", pageUrl: VR_HOST + "/" },
    { name: "Đồ công nghệ", pageUrl: VR_HOST + "/chuyen-muc/do-cong-nghe.2/" },
    { name: "Máy tính", pageUrl: VR_HOST + "/chuyen-muc/may-tinh.18/" },
    { name: "iOS", pageUrl: VR_HOST + "/chuyen-muc/ios.16/" },
    { name: "Android", pageUrl: VR_HOST + "/chuyen-muc/android.17/" },
    { name: "Phụ kiện", pageUrl: VR_HOST + "/chuyen-muc/phu-kien.20/" },
    { name: "Smartwatch", pageUrl: VR_HOST + "/chuyen-muc/smartwatch-smartband.21/" },
    { name: "Tai nghe - Loa", pageUrl: VR_HOST + "/chuyen-muc/tai-nghe-loa.31/" },
    { name: "TV", pageUrl: VR_HOST + "/chuyen-muc/tv.19/" },
    { name: "Xe", pageUrl: VR_HOST + "/chuyen-muc/xe.5/" },
    { name: "Xe điện", pageUrl: VR_HOST + "/chuyen-muc/xe-dien.22/" },
    { name: "Khoa học", pageUrl: VR_HOST + "/chuyen-muc/khoa-hoc-thuong-thuc.27/" },
    { name: "Khám phá", pageUrl: VR_HOST + "/chuyen-muc/kham-pha.1/" },
    { name: "Đời sống", pageUrl: VR_HOST + "/chuyen-muc/do-dung-tien-ich.14/" },
    { name: "Làm ăn kinh doanh", pageUrl: VR_HOST + "/chuyen-muc/lam-an-kinh-doanh.7/" },
    { name: "Xu hướng", pageUrl: VR_HOST + "/chuyen-muc/xu-huong.4/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "vnreview",
        name: VR_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=vnreview.vn&sz=64",
        categories: VR_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("vnreview") !== -1;
}

function getNewsHeaders(url) {
    return "{}";
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var VR_ENTITIES = {
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

function vrDecode(value) {
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
        return VR_ENTITIES.hasOwnProperty(name) ? VR_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function vrStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = vrDecode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = vrDecode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function vrNormImg(raw) {
    if (!raw) return null;
    var url = vrDecode(raw).replace(/&amp;/g, "&").trim();
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

function vrAbs(raw) {
    if (!raw) return null;
    var link = vrDecode(raw).replace(/&amp;/g, "&").trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return VR_HOST + link;
    return null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var VR_MARKER = "vnrhomeNews-listItem js-vnrhomeNews-article";
var VR_TITLE_LINK_RE = /class="vnrhomeNews-listItem-title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
var VR_LINK_ANY_RE = /href="(\/threads\/[^"]+)"/i;
var VR_IMG_RE = /<img[^>]+src="(https?:\/\/[^"]+)"/i;

function vrParseItem(chunk) {
    var titleMatch = VR_TITLE_LINK_RE.exec(chunk);
    var rawLink = titleMatch ? titleMatch[1] : null;
    if (!rawLink) {
        var any = VR_LINK_ANY_RE.exec(chunk);
        if (any) rawLink = any[1];
    }
    if (!rawLink) return null;
    var link = vrAbs(rawLink);
    if (!link) return null;

    var title = titleMatch ? vrStrip(titleMatch[2]).trim() : null;
    if (!title) return null;

    var image = VR_IMG_RE.exec(chunk);
    return {
        title: title,
        url: link,
        excerpt: null,
        imageUrl: image ? vrNormImg(image[1]) : null,
        pubDate: null,
        pubDateMs: 0,
        sourceName: VR_SOURCE_NAME
    };
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};

    var positions = [];
    var idx = 0;
    while (true) {
        var found = source.indexOf(VR_MARKER, idx);
        if (found < 0) break;
        positions.push(found);
        idx = found + VR_MARKER.length;
    }

    for (var i = 0; i < positions.length; i++) {
        var start = positions[i];
        var end = i + 1 < positions.length ? positions[i + 1] : source.length;
        var chunk = source.substring(start, end);
        var article = null;
        try {
            article = vrParseItem(chunk);
        } catch (e) {
            article = null;
        }
        if (!article || !article.title || seen[article.url]) continue;
        seen[article.url] = true;
        items.push(article);
    }

    if (items.length === 0) {
        var re = new RegExp(VR_TITLE_LINK_RE.source, "gi");
        var m;
        while ((m = re.exec(source)) !== null) {
            var link = vrAbs(m[1]);
            var title = vrStrip(m[2]).trim();
            if (!link || !title || seen[link]) continue;
            seen[link] = true;
            items.push({
                title: title,
                url: link,
                excerpt: null,
                imageUrl: null,
                pubDate: null,
                pubDateMs: 0,
                sourceName: VR_SOURCE_NAME
            });
        }
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(html, url) {
    if (!html || !url) return "";
    var src = String(html);
    var currentUrl = String(url);

    // Trang search: lay link tu <link rel="next">
    if (currentUrl.toLowerCase().indexOf("/search/") !== -1) {
        var m = /<link rel="next" href="([^"]+)"/i.exec(src);
        return m ? vrAbs(m[1]) : "";
    }

    // Lay so trang hien tai tu URL (/page-N)
    var curPage = 1;
    var pm = /\/page-(\d+)/.exec(currentUrl);
    if (pm) curPage = parseInt(pm[1], 10);
    if (curPage >= VR_MAX_PAGE) return "";

    // Kiem tra neu co trang tiep theo trong HTML (pagination link)
    var nextPage = curPage + 1;
    var base = currentUrl.split("/page-")[0];
    if (base.charAt(base.length - 1) !== "/") base += "/";
    var nextUrl = base + "page-" + nextPage;

    // Xac nhan co ton tai link page tiep theo trong HTML
    var pageRe = new RegExp("/page-" + nextPage + "[\"/]");
    if (pageRe.test(src)) return nextUrl;

    return "";
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword || (page && page > 1)) return null;
    return VR_HOST + "/search/search?keywords=" + encodeURIComponent(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var VR_DETAIL_TITLE_RE = /<h1[^>]*class="[^"]*p-title-value[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
var VR_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var VR_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var VR_BODY_OPEN_RE = /<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>/i;

/** Nội dung bbWrapper có thể chứa div lồng nhau → cắt theo độ sâu thẻ div. */
function vrDivInner(html, openRe) {
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

var VR_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var VR_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var VR_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var VR_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var VR_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function vrImgSrc(tag) {
    var m = VR_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function vrFigCaption(tag) {
    var m = VR_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function vrVideoSrc(tag) {
    var m = VR_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function vrVideoPoster(tag) {
    var m = VR_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function vrScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];

    // --- Pass 1: figure / <video> blocks (giu nguyen logic cu) ---
    var figs = s.match(/<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>/gi) || [];
    for (var fi = 0; fi < figs.length; fi++) {
        var tag = figs[fi];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
            var vUrl = vrNormImg(vrVideoSrc(tag));
            if (vUrl) {
                var poster = vrNormImg(vrVideoPoster(tag)) || vrNormImg(vrImgSrc(tag));
                var vCap = vrFigCaption(tag);
                vCap = vCap ? vrStrip(vCap).trim() : null;
                blocks.push({ isImage: false, text: vCap, imageUrl: poster, isVideo: true, videoUrl: vUrl });
            }
        } else {
            var imageUrl = vrNormImg(vrImgSrc(tag));
            if (imageUrl) {
                var cap = vrFigCaption(tag);
                cap = cap ? vrStrip(cap).trim() : null;
                blocks.push({ isImage: true, text: cap, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            }
        }
    }

    // --- Pass 2: XenForo bbWrapper style ---
    // Remove figure blocks da xu ly
    var s2 = s.replace(/<figure[\s\S]*?<\/figure>/gi, "")
               .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, "");

    // Buoc 2a: Extract tat ca img (ke ca khi nam trong <a> multiline)
    var seenImgs = {};
    var imgTagRe = /<img[^>]+>/gi;
    var imgM2;
    while ((imgM2 = imgTagRe.exec(s2)) !== null) {
        var rawSrc2 = /src\s*=\s*"([^"]+)"/i.exec(imgM2[0]);
        if (!rawSrc2) continue;
        var imgUrl2 = vrNormImg(rawSrc2[1]);
        if (!imgUrl2 || seenImgs[imgUrl2]) continue;
        seenImgs[imgUrl2] = true;
        blocks.push({ isImage: true, text: null, imageUrl: imgUrl2, isVideo: false, videoUrl: null });
    }

    // Buoc 2b: Xoa tat ca the HTML block (a>img, a, img) roi tach text theo br
    var textOnly = s2
        .replace(/<a[^>]*>[\s\S]*?<\/a>/gi, " ")  // xoa <a>...</a> (ke ca multiline)
        .replace(/<img[^>]+>/gi, " ")              // xoa img con lai
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n");

    var segments = textOnly.split("\n");
    for (var si = 0; si < segments.length; si++) {
        var text = vrStrip(segments[si]).replace(/[ \t]+/g, " ").trim();
        if (text.length >= VR_MIN_TEXT) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    // --- Pass 3: fallback - p|h2|h3 neu chua co text block nao ---
    var hasText = false;
    for (var bi = 0; bi < blocks.length; bi++) {
        if (!blocks[bi].isImage && !blocks[bi].isVideo) { hasText = true; break; }
    }
    if (!hasText) {
        var pTags = s.match(/<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi) || [];
        for (var pi = 0; pi < pTags.length; pi++) {
            var isH = pTags[pi].toLowerCase().indexOf("<h") === 0;
            var inner = pTags[pi].substring(pTags[pi].indexOf(">") + 1, pTags[pi].lastIndexOf("<"));
            var t = vrStrip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
            if (t.length >= (isH ? 5 : VR_MIN_TEXT)) {
                blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
            }
        }
    }

    return blocks;
}
function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = VR_DETAIL_TITLE_RE.exec(source)
        || VR_H1_RE.exec(source)
        || VR_OG_TITLE_RE.exec(source);
    var title = titleMatch ? vrStrip(titleMatch[1]).trim() : "";

    var body = vrDivInner(source, VR_BODY_OPEN_RE);
    if (!body) return null;

    return JSON.stringify({
        title: title,
        blocks: vrScanBlocks(body),
        related: []
    });
}
