/**
 * Znews (znews.vn) — nguồn báo dạng JS.
 */
var ZN_HOST = "https://znews.vn";
var ZN_SOURCE_NAME = "Znews";
var ZN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var ZN_CATEGORIES = [
    { name: "Trang chủ", pageUrl: ZN_HOST + "/" },
    { name: "Xuất bản", pageUrl: ZN_HOST + "/xuat-ban.html" },
    { name: "Sách hay", pageUrl: ZN_HOST + "/sach-hay.html" },
    { name: "Kinh doanh", pageUrl: ZN_HOST + "/kinh-doanh.html" },
    { name: "Văn hóa", pageUrl: ZN_HOST + "/van-hoa.html" },
    { name: "Công nghệ", pageUrl: ZN_HOST + "/cong-nghe.html" },
    { name: "Đời sống", pageUrl: ZN_HOST + "/doi-song.html" },
    { name: "Du lịch", pageUrl: ZN_HOST + "/du-lich.html" },
    { name: "Xã hội", pageUrl: ZN_HOST + "/xa-hoi.html" },
    { name: "Văn hoá đọc", pageUrl: ZN_HOST + "/van-hoa-doc.html" },
    { name: "Thể thao", pageUrl: ZN_HOST + "/the-thao.html" },
    { name: "Giải trí", pageUrl: ZN_HOST + "/giai-tri.html" },
   
    { name: "Sức khỏe", pageUrl: ZN_HOST + "/suc-khoe.html" }
    
    
    
];

function getNewsSource() {
    return JSON.stringify({
        id: "znews",
        name: ZN_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=znews.vn&sz=64",
        categories: ZN_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    if (!link) return false;
    var l = String(link).toLowerCase();
    return l.indexOf("znews.vn") !== -1 || l.indexOf("zingnews.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": ZN_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        "Referer": ZN_HOST + "/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0"
    });
}

function znStripTags(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function znDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) { if (named[n.toLowerCase()]) return named[n.toLowerCase()]; return m; });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}
function znAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return ZN_HOST + u;
    return ZN_HOST + "/" + u;
}
function znImgSrc(tag) {
    if (!tag) return null;
    var m = /data-src\s*=\s*"([^"]+)"/i.exec(tag) || /data-original\s*=\s*"([^"]+)"/i.exec(tag) || /srcset\s*=\s*"([^"]+)"/i.exec(tag) || /src\s*=\s*"([^"]+)"/i.exec(tag);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/)[0];
    return v.indexOf("data:image") === 0 ? null : v;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var src = String(html);
    var out = [];
    var seen = {};
    var re = /<a[^>]*href="([^"]*?-post\d+\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(src)) !== null) {
        var link = znAbs(m[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var inner = m[2];
        var title = znStripTags(znDecode(inner)).trim();
        if (title.length < 8) {
            var altM = /alt="([^"]*)"/i.exec(inner);
            if (altM) title = znDecode(altM[1]).trim();
            var titleM = /title="([^"]*)"/i.exec(m[0]);
            if (title.length < 8 && titleM) title = znDecode(titleM[1]).trim();
        }
        if (title.length < 8) continue;
        var imgM = /<img[^>]*>/i.exec(inner);
        var img = imgM ? znImgSrc(imgM[0]) : null;
        if (img) img = znAbs(img);
        out.push({ title: title, link: link, description: "", imageUrl: img, pubDateMs: 0 });
        if (out.length >= 40) break;
    }
    return JSON.stringify(out);
}

function getNewsNextPageUrl(html, url) {
    if (!html) return "";
    var src = String(html);
    var cur = 1;
    var cm = /[?&](?:p|page|trang)=(\d+)/i.exec(url || "");
    if (cm) cur = parseInt(cm[1], 10);
    var best = null;
    var re = /[?&](?:p|page|trang)=(\d+)/gi;
    var m;
    while ((m = re.exec(src)) !== null) {
        var n = parseInt(m[1], 10);
        if (n > cur && (best === null || n < best)) best = n;
    }
    if (best !== null) {
        var base = String(url || "").split("?")[0];
        return base + "?page=" + best;
    }
    return "";
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);
    var title = "";
    var tM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source);
    if (!tM) {
        var tm2 = /class="the-article-title"[^>]*>([\s\S]*?)<\/[^>]+>/i.exec(source);
        if (tm2) tM = tm2;
    }
    if (tM) title = znStripTags(znDecode(tM[1])).trim();

    var blocks = [];
    var bodyM = /<div[^>]*class="[^"]*the-article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!bodyM) {
        var idx = source.indexOf("</h1>");
        if (idx >= 0) bodyM = { 1: source.substring(idx + 5) };
    }
    var html2 = bodyM ? bodyM[1] : source;
    var cutIdx = html2.search(/class="[^"]*(?:the-article-credit|the-article-tags|related|comment|footer|sidebar|share)/i);
    if (cutIdx > 0) html2 = html2.substring(0, cutIdx);
    var tags = html2.match(/<(?:p|h[1-6]|figure|img)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|figure)>|<img[^>]*>/gi) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? znImgSrc(imgTag[0]) : null;
            if (src) blocks.push({ isImage: true, text: null, imageUrl: znAbs(src), isVideo: false, videoUrl: null });
            continue;
        }
        if (lower.indexOf("<img") === 0) {
            var s2 = znImgSrc(tag);
            if (s2) blocks.push({ isImage: true, text: null, imageUrl: znAbs(s2), isVideo: false, videoUrl: null });
            continue;
        }
        var text = znStripTags(znDecode(tag));
        if (text.length >= 20) blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
    }
    if (blocks.length === 0) {
        var ps = source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
        for (var j = 0; j < ps.length; j++) {
            var t = znStripTags(znDecode(ps[j]));
            if (t.length >= 20) blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    if (blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}