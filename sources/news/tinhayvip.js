/**
 * Tin Hay VIP (tinhayvip.com) — nguồn báo 18+ dạng JS.
 */
var TV_HOST = "https://tinhayvip.com";
var TV_SOURCE_NAME = "Tin Hay VIP";
var TV_MAX_PAGE = 50;
var TV_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var TV_CATEGORIES = [
    { name: "Trang chủ", pageUrl: TV_HOST + "/" },
    { name: "Gái Xinh", pageUrl: TV_HOST + "/category/gai-xinh/" },
    { name: "JAV Idol", pageUrl: TV_HOST + "/category/jav-idol/" },
    { name: "Game 18+", pageUrl: TV_HOST + "/category/game-18/" },
    { name: "Phim 18+", pageUrl: TV_HOST + "/category/phim-18/" },
    { name: "Cosplay", pageUrl: TV_HOST + "/category/cosplay/" },
    { name: "Anime – Manga", pageUrl: TV_HOST + "/category/anime-manga/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "tinhayvip",
        name: TV_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=tinhayvip.com&sz=64",
        categories: TV_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("tinhayvip.com") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({ "User-Agent": TV_MOBILE_UA });
}

function tvStripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tvDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", copy: "©", reg: "®", trade: "™", times: "×", deg: "°" };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) {
        if (named[n.toLowerCase()]) return named[n.toLowerCase()];
        return m;
    });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    return out;
}

function tvAbs(u) {
    if (!u) return null;
    u = String(u).trim();
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return TV_HOST + u;
    return TV_HOST + "/" + u;
}

function tvImgSrc(tag) {
    var m = tag.match(/data-lazy-src="([^"]+)"/i) || tag.match(/data-src="([^"]+)"/i) || tag.match(/data-original="([^"]+)"/i);
    if (m) return m[1];
    m = tag.match(/src="([^"]+)"/i);
    if (m && m[1].indexOf("data:image") !== 0) return m[1];
    return null;
}
function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};
    var artRe = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    var m;
    while ((m = artRe.exec(source)) !== null) {
        var block = m[1];
        var linkM = block.match(/href="(https:\/\/tinhayvip\.com\/[^"]+)"/i);
        if (!linkM) continue;
        var link = tvAbs(linkM[1]);
        if (!link || seen[link]) continue;
        if (/\/category\//.test(link) || /\/tag\//.test(link) || link === TV_HOST + "/") continue;
        seen[link] = true;

        var title = "";
        var tM = block.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (tM) title = tvStripTags(tvDecode(tM[1]));
        if (!title) {
            tM = block.match(/aria-label="([^"]+)"/i);
            if (tM) title = tvDecode(tM[1]);
        }
        if (title.length < 5) continue;

        var imgM = block.match(/<img[^>]*>/i);
        var imageUrl = imgM ? tvAbs(tvImgSrc(imgM[0])) : null;

        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: imageUrl,
            pubDate: null,
            pubDateMs: 0,
            sourceName: TV_SOURCE_NAME
        });
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!html) return null;
    if (page && page >= TV_MAX_PAGE) return null;
    var source = String(html);
    var m = source.match(/class="next page-numbers"\s+href="([^"]+)"/i);
    if (!m) m = source.match(/href="([^"]+)"\s+class="next page-numbers"/i);
    if (m) return tvAbs(m[1]);

    // Fallback for pages without an explicit "next" link (e.g. trang chủ):
    // construct the next WordPress page URL up to TV_MAX_PAGE.
    if (!page || page < 1) page = 1;
    if (page >= TV_MAX_PAGE) return null;
    var base = String(currentUrl || "").split("?")[0];
    var qs = "";
    var qi = String(currentUrl || "").indexOf("?");
    if (qi >= 0) qs = String(currentUrl || "").substring(qi);
    base = base.replace(/\/page\/\d+\/?$/, "");
    base = base.replace(/\/?$/, "/");
    return base + "page/" + (page + 1) + "/" + qs;
}

function getNewsSearchUrl(query, page) {
    var q = encodeURIComponent(String(query || "").trim());
    if (!q) return null;
    var p = page || 1;
    if (p <= 1) return TV_HOST + "/?s=" + q;
    return TV_HOST + "/page/" + p + "/?s=" + q;
}

function tvScanBlocks(html) {
    var blocks = [];
    var re = /<(figure|p|h2|h3|h4)\b[^>]*>[\s\S]*?<\/\1>|<img\b[^>]*>/gi;
    var mm;
    while ((mm = re.exec(html)) !== null) {
        var tag = mm[0];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<img") === 0) {
            var src = tvImgSrc(tag);
            if (src) {
                var u = tvAbs(src);
                if (u && u.indexOf("data:image") !== 0) {
                    blocks.push({ isImage: true, text: null, imageUrl: u, isVideo: false, videoUrl: null });
                }
            }
            continue;
        }
        if (lower.indexOf("<figure") === 0) {
            var imgTag = tag.match(/<img[^>]*>/i);
            var src2 = imgTag ? tvImgSrc(imgTag[0]) : null;
            var capM = tag.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
            var caption = capM ? tvStripTags(tvDecode(capM[1])) : null;
            if (src2) {
                blocks.push({ isImage: true, text: caption, imageUrl: tvAbs(src2), isVideo: false, videoUrl: null });
            }
            continue;
        }
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        var text = tvStripTags(tvDecode(inner)).replace(/\s+/g, " ").trim();
        var isHeading = lower.indexOf("<h") === 0;
        if (text.length >= (isHeading ? 3 : 20)) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var title = "";
    var tM = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        || source.match(/property="og:title"\s+content="([^"]+)"/i)
        || source.match(/content="([^"]+)"\s+property="og:title"/i);
    if (tM) title = tvStripTags(tvDecode(tM[1])).trim();

    var bodyM = source.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<footer/i)
        || source.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i)
        || source.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!bodyM) return null;

    var blocks = tvScanBlocks(bodyM[1]);

    return JSON.stringify({
        title: title,
        blocks: blocks,
        related: []
    });
}