/**
 * VietNamNet (vietnamnet.vn) — nguồn báo dạng JS.
 */
var VN_HOST = "https://vietnamnet.vn";
var VN_SOURCE_NAME = "VietNamNet";
var VN_MAX_PAGE = 30;
var VN_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var VN_CATEGORIES = [
    { name: "Trang chủ", pageUrl: VN_HOST + "/" },
    { name: "Thời sự", pageUrl: VN_HOST + "/thoi-su" },
    { name: "Kinh doanh", pageUrl: VN_HOST + "/kinh-doanh" },
    { name: "Giáo dục", pageUrl: VN_HOST + "/giao-duc" },
    { name: "Thế giới", pageUrl: VN_HOST + "/the-gioi" },
    { name: "Đời sống", pageUrl: VN_HOST + "/doi-song" },
    { name: "Công nghệ", pageUrl: VN_HOST + "/cong-nghe" },
    { name: "Thể thao", pageUrl: VN_HOST + "/the-thao" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "vietnamnet",
        name: VN_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=vietnamnet.vn&sz=64",
        categories: VN_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("vietnamnet.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({ "User-Agent": VN_MOBILE_UA });
}

function vnStripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function vnDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) {
        if (named[n.toLowerCase()]) return named[n.toLowerCase()];
        return m;
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}

function vnAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return VN_HOST + u;
    return VN_HOST + "/" + u;
}

function vnImgSrc(tag) {
    var m = tag.match(/data-original="([^"]+)"/i)
        || tag.match(/data-src="([^"]+)"/i)
        || tag.match(/data-srcset="([^"]+)"/i)
        || tag.match(/srcset="([^"]+)"/i);
    if (m) return m[1].split(",")[0].trim().split(" ")[0];
    m = tag.match(/src="([^"]+)"/i);
    if (m && m[1].indexOf("data:image") !== 0) return m[1];
    return null;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);
    var items = [];
    var seen = {};
    var re = /<a[^>]*href="([^"]+\.html)"[^>]*title="([^"]+)"[^>]*>/gi;
    var m;
    while ((m = re.exec(source)) !== null) {
        var link = vnAbs(m[1]);
        var title = vnDecode(m[2]).trim();
        if (!link || seen[link]) continue;
        seen[link] = true;
        if (title.length < 5) continue;
        items.push({
            title: title,
            link: link,
            excerpt: null,
            imageUrl: null,
            pubDate: null,
            pubDateMs: 0,
            sourceName: VN_SOURCE_NAME
        });
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!page || page < 1) page = 1;
    if (page >= VN_MAX_PAGE) return null;
    var base = String(currentUrl || "").split("?")[0];
    var params = [];
    var qm = String(currentUrl || "").match(/[?&]q=([^&]+)/);
    if (qm) params.push("q=" + qm[1]);
    params.push("page=" + (page + 1));
    return base + "?" + params.join("&");
}

function getNewsSearchUrl(query, page) {
    var q = encodeURIComponent(String(query || "").trim());
    if (!q) return null;
    var p = page || 1;
    if (p <= 1) return VN_HOST + "/tim-kiem?q=" + q;
    return VN_HOST + "/tim-kiem?q=" + q + "&page=" + p;
}function vnScanBlocks(html) {
    var blocks = [];
    var re = /<(p|figure)\b[^>]*>[\s\S]*?<\/\1>|<img\b[^>]*>/gi;
    var mm;
    while ((mm = re.exec(html)) !== null) {
        var tag = mm[0];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<img") === 0) {
            var src = vnImgSrc(tag);
            if (src) {
                var u = vnAbs(src);
                if (u && u.indexOf("data:image") !== 0) {
                    blocks.push({ isImage: true, text: null, imageUrl: u, isVideo: false, videoUrl: null });
                }
            }
            continue;
        }
        if (lower.indexOf("<figure") === 0) {
            var imgTag = tag.match(/<img[^>]*>/i);
            var src2 = imgTag ? vnImgSrc(imgTag[0]) : null;
            var capM = tag.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
            var caption = capM ? vnStripTags(vnDecode(capM[1])) : null;
            if (src2) {
                blocks.push({ isImage: true, text: caption, imageUrl: vnAbs(src2), isVideo: false, videoUrl: null });
            }
            continue;
        }
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        var text = vnStripTags(vnDecode(inner)).replace(/\s+/g, " ").trim();
        if (text.length >= 20) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var title = "";
    var tM = source.match(/<h1[^>]*class="content-detail-title"[^>]*>([\s\S]*?)<\/h1>/i)
        || source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (tM) title = vnStripTags(vnDecode(tM[1])).trim();

    var blocks = [];
    var sapoM = source.match(/class="content-detail-sapo[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/i);
    if (sapoM) {
        var sapo = vnStripTags(vnDecode(sapoM[1])).replace(/\s+/g, " ").trim();
        if (sapo.length >= 20) blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
    }

    var bodyM = source.match(/<div[^>]*class="maincontent main-content"[^>]*>([\s\S]*?)<\/div>/i);
    if (bodyM) {
        var b = vnScanBlocks(bodyM[1]);
        for (var i = 0; i < b.length; i++) blocks.push(b[i]);
    }

    if (blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}