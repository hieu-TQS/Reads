/**
 * Kenh14 (kenh14.vn) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * Báo chuyển mobile sang m.kenh14.vn nên cào thẳng bản mobile:
 *  - Danh sách: `<li>` class `article` / `daily-hot-news` / `other-news` /
 *    `news-update-item`; tiêu đề `h3…title > a`, mô tả `div.txt-sapo`,
 *    thumbnail `img[src]` hoặc `video[poster]`, giờ đăng `span.time[title]`
 *    (fragment "tin mới" dùng `span.time-ago[data-time]` — epoch ms)
 *  - Trang chủ: HTML gốc rỗng (JS render) → cào `/ajax-home-page.chn`;
 *    "Xem thêm" gọi `/ajax-notify-tin-moi/page-<N>.chn` (tối đa 4 trang)
 *  - Phân trang chuyên mục: "Xem thêm" (`loadListNews(...)`) → API
 *    `/ajax-cate-<zone>-<cateId>/page-<N>.chn`
 *  - Tìm kiếm: `/mob-search-news.chn?keyword=<q>&page=<N>`
 *  - Đọc bài: `h1.post-title`, sapo `p.sapo`, thân `div.post-content`
 *    (kết thúc ở `#end-post-content`), tin đề xuất `[type=RelatedNewsBox]`
 *
 * Bắt buộc UA mobile. Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var K14_HOST = "https://m.kenh14.vn";
var K14_SOURCE_NAME = "Kenh14";
var K14_MAX_PAGE = 20;
var K14_SEARCH_MAX_PAGE = 15;
var K14_SEARCH_PATH = "/mob-search-news.chn";
var K14_HOME_PATH = "/ajax-home-page.chn";
var K14_NOTIFY_PATH = "/ajax-notify-tin-moi/page-";
var K14_NOTIFY_MAX_PAGE = 4;
var K14_MIN_TEXT = 30;
var K14_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var K14_CATEGORIES = [
    { name: "Trang chủ", pageUrl: K14_HOST + K14_HOME_PATH },
    { name: "Star", pageUrl: K14_HOST + "/star.chn" },
    { name: "Cine", pageUrl: K14_HOST + "/cine.chn" },
    { name: "Musik", pageUrl: K14_HOST + "/musik.chn" },
    { name: "Đời sống", pageUrl: K14_HOST + "/doi-song.chn" },
    { name: "Xã hội", pageUrl: K14_HOST + "/xa-hoi.chn" },
    { name: "Sức khỏe", pageUrl: K14_HOST + "/suc-khoe.chn" },
    { name: "Money14", pageUrl: K14_HOST + "/money14.chn" },
    { name: "Tek-life", pageUrl: K14_HOST + "/tek-life.chn" },
    { name: "Sport", pageUrl: K14_HOST + "/sport.chn" },
    { name: "Thế giới đó đây", pageUrl: K14_HOST + "/the-gioi-do-day.chn" },
    { name: "Xem mua luôn", pageUrl: K14_HOST + "/xem-mua-luon.chn" },
    { name: "Học đường", pageUrl: K14_HOST + "/hoc-duong.chn" },
    { name: "Ăn chơi đi", pageUrl: K14_HOST + "/an-choi-di.chn" },
    { name: "Beauty & Fashion", pageUrl: K14_HOST + "/beauty-fashion.chn" },
    { name: "The 30s", pageUrl: K14_HOST + "/the-30s.chn" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "kenh14",
        name: K14_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=kenh14.vn&sz=64",
        categories: K14_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("kenh14") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({ "User-Agent": K14_MOBILE_UA });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var K14_ENTITIES = {
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

function k14Decode(value) {
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
        return K14_ENTITIES.hasOwnProperty(name) ? K14_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function k14Strip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/br>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[\s\S]*?>/g, " ");
    s = k14Decode(s);
    s = s.replace(/<\/?[a-zA-Z][^>]*?>/g, " ");
    s = k14Decode(s);
    return s.replace(/[ \t]+/g, " ").trim();
}

function k14NormImg(raw) {
    if (!raw) return null;
    var url = k14Decode(raw).replace(/&amp;/g, "&").trim();
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

function k14Abs(raw) {
    if (!raw) return null;
    var link = k14Decode(raw).trim();
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return K14_HOST + link;
    return null;
}

/** "2026-10-21T15:59:00.000000" hoặc "27/09/2026 07:41" → epoch ms. */
function k14ParseDateMs(raw) {
    if (!raw) return 0;
    var value = String(raw).trim();
    if (!value) return 0;
    var m;
    if (value.indexOf("T") !== -1) {
        var cleaned = value.split(".")[0];
        if (cleaned.length > 19) cleaned = cleaned.substring(0, 19);
        m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(cleaned);
        if (!m) return 0;
        return new Date(
            parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
            parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
        ).getTime();
    }
    m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(value);
    if (!m) return 0;
    return new Date(
        parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
        m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0, 0
    ).getTime();
}

// ----------------------------------------------------------------------
// Danh sách tin (chuyên mục + fragment ajax + trang chủ)
// ----------------------------------------------------------------------

var K14_ITEM_RE = /<li[^>]*class="[^"]*(?:article|daily-hot-news|other-news|news-update-item)[^"]*"[\s\S]*?<\/li>/gi;
var K14_TITLE_ANCHOR_RE = /<h[23][^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
var K14_TITLE_ATTR_RE = /<a[^>]+href="[^"]+"[^>]+title="([^"]+)"/i;
var K14_FIRST_ANCHOR_RE = /<a[^>]+href="([^"]+)"/i;
var K14_SAPO_RE = /<div[^>]*class="[^"]*txt-sapo[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
var K14_IMG_SRC_RE = /<img[^>]+src="(https?:\/\/[^"]+)"/i;
var K14_IMG_DATA_RE = /<img[^>]+(?:data-original|data-src)="(https?:\/\/[^"]+)"/i;
var K14_VIDEO_POSTER_RE = /<video[^>]+poster="(https?:\/\/[^"]+)"/i;
var K14_PUB_TIME_RE = /<span[^>]*class="[^"]*time[^"]*"[^>]*title="([^"]+)"/i;
var K14_PUB_TIME_MS_RE = /data-time="(\d{10,13})"/i;

function k14ParseItem(chunk) {
    var titleMatch = K14_TITLE_ANCHOR_RE.exec(chunk);
    var rawLink = titleMatch ? titleMatch[1] : null;
    if (!rawLink) {
        var first = K14_FIRST_ANCHOR_RE.exec(chunk);
        if (first) rawLink = first[1];
    }
    if (!rawLink) return null;
    var link = k14Abs(rawLink);
    if (!link) return null;

    var title = titleMatch ? k14Strip(titleMatch[2]).trim() : null;
    if (!title) {
        var attr = K14_TITLE_ATTR_RE.exec(chunk);
        if (attr) title = k14Decode(attr[1]).trim();
    }
    if (!title) return null;

    var excerpt = null;
    var sapo = K14_SAPO_RE.exec(chunk);
    if (sapo) {
        excerpt = k14Strip(sapo[1]).replace(/\s+/g, " ").trim();
        if (excerpt.length < K14_MIN_TEXT) excerpt = null;
    }

    var image = K14_IMG_SRC_RE.exec(chunk)
        || K14_IMG_DATA_RE.exec(chunk)
        || K14_VIDEO_POSTER_RE.exec(chunk);

    var pubRaw = null;
    var pubMs = 0;
    var msMatch = K14_PUB_TIME_MS_RE.exec(chunk);
    if (msMatch) {
        var raw = msMatch[1];
        var num = parseInt(raw, 10);
        if (!isNaN(num)) pubMs = raw.length <= 10 ? num * 1000 : num;
    }
    if (!pubMs) {
        var timeMatch = K14_PUB_TIME_RE.exec(chunk);
        if (timeMatch) {
            pubRaw = k14Decode(timeMatch[1]).trim();
            pubMs = k14ParseDateMs(pubRaw);
        }
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: image ? k14NormImg(image[1]) : null,
        pubDate: pubRaw,
        pubDateMs: pubMs,
        sourceName: K14_SOURCE_NAME
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
    var chunks = source.match(K14_ITEM_RE) || [];
    for (var i = 0; i < chunks.length; i++) {
        var item = null;
        try {
            item = k14ParseItem(chunks[i]);
        } catch (e) {
            item = null;
        }
        if (!item || !item.title || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return JSON.stringify(items);
}

var K14_LOAD_MORE_RE = /loadListNews\(\s*this\s*,\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*'(\d+)'/;

function k14SearchNextPageUrl(currentUrl, page, html) {
    if (!page || page <= 1 || page > K14_SEARCH_MAX_PAGE) return null;
    if (!html || !K14_ITEM_RE.test(html)) return null;
    var base = String(currentUrl).replace(/[?&]page=\d+/, "");
    return base + (base.indexOf("?") !== -1 ? "&" : "?") + "page=" + page;
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl || !page) return null;
    var url = String(currentUrl);
    var source = String(html || "");

    if (url.toLowerCase().indexOf(K14_SEARCH_PATH) !== -1) {
        return k14SearchNextPageUrl(url, page, source);
    }

    if (url.toLowerCase().indexOf(K14_HOME_PATH) !== -1 ||
        url.toLowerCase().indexOf(K14_NOTIFY_PATH) !== -1) {
        if (page < 2) return null;
        var notifyPage = page - 1;
        if (notifyPage > K14_NOTIFY_MAX_PAGE) return null;
        if (!K14_ITEM_RE.test(source)) return null;
        return K14_HOST + K14_NOTIFY_PATH + notifyPage + ".chn";
    }

    var ajaxPage = page - 1;
    if (ajaxPage <= 0 || page > K14_MAX_PAGE) return null;

    if (url.toLowerCase().indexOf("/ajax-cate-") !== -1) {
        return url.split("/page-")[0] + "/page-" + ajaxPage + ".chn";
    }

    var loadMore = K14_LOAD_MORE_RE.exec(source);
    if (!loadMore) return null;
    var zone = loadMore[1] ? loadMore[1] : "0";
    var cateId = loadMore[2];
    return K14_HOST + "/ajax-cate-" + zone + "-" + cateId + "/page-" + ajaxPage + ".chn";
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    var safePage = page && page > 0 ? Math.floor(page) : 1;
    return K14_HOST + K14_SEARCH_PATH + "?keyword=" + encodeURIComponent(keyword) + "&page=" + safePage;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var K14_DETAIL_TITLE_RE = /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
var K14_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var K14_OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;
var K14_DETAIL_SAPO_RE = /<p[^>]*class="[^"]*sapo[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
var K14_BODY_RE = /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*id="end-post-content"|<div[^>]*class="[^"]*link-content-footer)/i;

var K14_BLOCK_RE = /<figure[\s\S]*?<\/figure>|<video[^>]*>[\s\S]*?<\/video>|<img[^>]+src="[^"]+"[^>]*>|<(p|h2|h3)[^>]*>[\s\S]*?<\/(p|h2|h3)>/gi;
var K14_IMG_INNER_RE = /<img[^>]+src="([^"]+)"/i;
var K14_FIGCAPTION_RE = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i;
var K14_VIDEO_SRC_RE = /<(?:video|source)[^>]+(?:data-src|src)="([^"]+)"/i;
var K14_POSTER_RE = /<video[^>]+poster="([^"]+)"/i;

function k14ImgSrc(tag) {
    var m = K14_IMG_INNER_RE.exec(tag);
    return m ? m[1] : null;
}

function k14FigCaption(tag) {
    var m = K14_FIGCAPTION_RE.exec(tag);
    return m ? m[1] : null;
}

function k14VideoSrc(tag) {
    var m = K14_VIDEO_SRC_RE.exec(tag);
    return m ? m[1] : null;
}

function k14VideoPoster(tag) {
    var m = K14_POSTER_RE.exec(tag);
    return m ? m[1] : null;
}

function k14ScanBlocks(body) {
    var s = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    var blocks = [];
    var tags = s.match(K14_BLOCK_RE) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<video") === 0) {
            var videoUrl = k14NormImg(k14VideoSrc(tag));
            if (videoUrl) {
                blocks.push({
                    isImage: false,
                    text: null,
                    imageUrl: k14NormImg(k14VideoPoster(tag)),
                    isVideo: true,
                    videoUrl: videoUrl
                });
            }
            continue;
        }

        if (lower.indexOf("<figure") === 0 || lower.indexOf("<img") === 0) {
            if (lower.indexOf("<video") !== -1 || lower.indexOf("<source") !== -1) {
                var vUrl = k14NormImg(k14VideoSrc(tag));
                if (vUrl) {
                    var poster = k14NormImg(k14VideoPoster(tag)) || k14NormImg(k14ImgSrc(tag));
                    var vCaption = k14FigCaption(tag);
                    vCaption = vCaption ? k14Strip(vCaption).trim() : null;
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

            var imageUrl = k14NormImg(k14ImgSrc(tag));
            if (!imageUrl) continue;
            var caption = k14FigCaption(tag);
            caption = caption ? k14Strip(caption).trim() : null;
            blocks.push({ isImage: true, text: caption, imageUrl: imageUrl, isVideo: false, videoUrl: null });
            continue;
        }

        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        if (!isHeading && inner.toLowerCase().indexOf("<img") !== -1) continue;

        var text = k14Strip(inner).replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim();
        if (text.length >= (isHeading ? 5 : K14_MIN_TEXT)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

var K14_RELATED_BOX_RE = /<(?:figure|div)[^>]*type="RelatedNewsBox"[^>]*>[\s\S]*?(?:<\/ul>|<\/figure>)/gi;
var K14_RELATED_LI_RE = /<li[^>]*data-url="([^"]+)"[^>]*>/gi;
var K14_ATTR_TITLE_RE = /data-title="([^"]+)"/i;
var K14_ATTR_AVATAR_RE = /data-avatar="([^"]+)"/i;
var K14_ATTR_DATE_RE = /data-date="([^"]+)"/i;

function k14ParseRelated(html) {
    var items = [];
    var seen = {};
    var boxes = String(html).match(K14_RELATED_BOX_RE) || [];
    for (var b = 0; b < boxes.length; b++) {
        var re = new RegExp(K14_RELATED_LI_RE.source, "gi");
        var li;
        while ((li = re.exec(boxes[b])) !== null) {
            var tag = li[0];
            var link = k14Abs(li[1]);
            if (!link) continue;

            var titleMatch = K14_ATTR_TITLE_RE.exec(tag);
            if (!titleMatch) continue;
            var title = k14Decode(titleMatch[1]).trim();
            if (title.length < 5) continue;

            var avatar = K14_ATTR_AVATAR_RE.exec(tag);
            var pubRaw = K14_ATTR_DATE_RE.exec(tag);
            if (seen[link]) continue;
            seen[link] = true;

            var pubDate = pubRaw ? k14Decode(pubRaw[1]).trim() : null;
            items.push({
                title: title,
                link: link,
                excerpt: null,
                imageUrl: avatar ? k14NormImg(avatar[1]) : null,
                pubDate: pubDate,
                pubDateMs: k14ParseDateMs(pubDate),
                sourceName: K14_SOURCE_NAME
            });
            if (items.length >= 8) return items;
        }
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var titleMatch = K14_DETAIL_TITLE_RE.exec(source)
        || K14_H1_RE.exec(source)
        || K14_OG_TITLE_RE.exec(source);
    var title = titleMatch ? k14Strip(titleMatch[1]).trim() : "";

    var bodyMatch = K14_BODY_RE.exec(source);
    if (!bodyMatch) return null;

    var blocks = [];
    var sapoMatch = K14_DETAIL_SAPO_RE.exec(source);
    if (sapoMatch) {
        var sapo = k14Strip(sapoMatch[1]).replace(/\s+/g, " ").trim();
        if (sapo.length >= K14_MIN_TEXT) {
            blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    var bodyBlocks = k14ScanBlocks(bodyMatch[1]);
    for (var i = 0; i < bodyBlocks.length; i++) blocks.push(bodyBlocks[i]);

    return JSON.stringify({
        title: title,
        blocks: blocks,
        related: k14ParseRelated(source)
    });
}
