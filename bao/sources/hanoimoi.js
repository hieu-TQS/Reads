/**
 * Ha Noi Moi (hanoimoi.vn) — nguồn báo dạng JS.
 */
var HM_HOST = "https://hanoimoi.vn";
var HM_SOURCE_NAME = "Hà Nội Mới";
var HM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var HM_CATEGORIES = [
    { name: "Trang chủ", pageUrl: HM_HOST + "/" },
    { name: "Chính trị", pageUrl: HM_HOST + "/chinh-tri.htm" },
    { name: "Kinh tế", pageUrl: HM_HOST + "/kinh-te.htm" },
    { name: "Văn hóa", pageUrl: HM_HOST + "/van-hoa.htm" },
    { name: "Xã hội", pageUrl: HM_HOST + "/xa-hoi.htm" },
    { name: "Thế giới", pageUrl: HM_HOST + "/the-gioi.htm" },
    { name: "Thể thao", pageUrl: HM_HOST + "/the-thao.htm" },
    { name: "Giải trí", pageUrl: HM_HOST + "/giai-tri.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "hanoimoi",
        name: HM_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=hanoimoi.vn&sz=64",
        categories: HM_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("hanoimoi.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": HM_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        "Referer": HM_HOST + "/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0"
    });
}

function hmStripTags(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function hmDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) { if (named[n.toLowerCase()]) return named[n.toLowerCase()]; return m; });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}
function hmAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return HM_HOST + u;
    return HM_HOST + "/" + u;
}
function hmImgSrc(tag) {
    if (!tag) return null;
    var m = /data-original\s*=\s*"([^"]+)"/i.exec(tag) || /data-src\s*=\s*"([^"]+)"/i.exec(tag) || /srcset\s*=\s*"([^"]+)"/i.exec(tag) || /src\s*=\s*"([^"]+)"/i.exec(tag);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/)[0];
    return v.indexOf("data:image") === 0 ? null : v;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var src = String(html);
    var out = [];
    var seen = {};
    // cho phép cả link tuyệt đối và relative (bắt đầu bằng /)
    var re = /<a[^>]*href="([^"]*?-\d+\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(src)) !== null) {
        var link = hmAbs(m[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var inner = m[2];
        var title = hmStripTags(hmDecode(inner)).trim();
        if (title.length < 8) continue;
        var imgM = /<img[^>]*>/i.exec(inner);
        var img = imgM ? hmImgSrc(imgM[0]) : null;
        if (img) img = hmAbs(img);
        out.push({ title: title, url: link, description: "", imageUrl: img, pubDateMs: 0 });
        if (out.length >= 40) break;
    }
    return JSON.stringify(out);
}

function getNewsNextPageUrl(html, url) {
    if (!html) return "";
    var src = String(html);
    var cur = 1;
    var cm = /[?&]page=(\d+)/i.exec(url || "");
    if (cm) cur = parseInt(cm[1], 10);
    var best = null;
    var re = /[?&]page=(\d+)/gi;
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
    if (tM) title = hmStripTags(hmDecode(tM[1])).trim();

    var blocks = [];
    // Tim block noi dung bang vi tri chuoi thay vi regex </div> (bi bat qua som do nested div)
    var html2 = null;
    var startClasses = ["c-news-detail", "b-maincontent", "entry entry", "fck_detail",
        "article-body", "entry-content", "post-content", "story-detail", "main-content"];
    var endMarkers = ["c-share-detail", "c-news-other", "c-news-readmore",
        "c-news-topread", 'id="comment', 'class="related', 'class="share'];
    for (var ci = 0; ci < startClasses.length; ci++) {
        var startIdx = source.indexOf('class="' + startClasses[ci]);
        if (startIdx === -1) continue;
        var openEnd = source.indexOf(">", startIdx);
        if (openEnd === -1) continue;
        var bodyStart = openEnd + 1;
        var bodyEnd = -1;
        for (var ei = 0; ei < endMarkers.length; ei++) {
            var eIdx = source.indexOf(endMarkers[ei], bodyStart);
            if (eIdx > bodyStart && (bodyEnd === -1 || eIdx < bodyEnd)) bodyEnd = eIdx;
        }
        if (bodyEnd === -1) bodyEnd = Math.min(bodyStart + 30000, source.length);
        html2 = source.substring(bodyStart, bodyEnd);
        break;
    }
    if (!html2) {
        var idx = source.indexOf("</h1>");
        if (idx >= 0) html2 = source.substring(idx + 5);
        else html2 = source;
    }
    var tags = html2.match(/<(?:p|h[1-6]|figure|img)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|figure)>|<img[^>]*>/gi) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? hmImgSrc(imgTag[0]) : null;
            if (src) blocks.push({ isImage: true, text: null, imageUrl: hmAbs(src), isVideo: false, videoUrl: null });
            continue;
        }
        if (lower.indexOf("<img") === 0) {
            var s2 = hmImgSrc(tag);
            if (s2) blocks.push({ isImage: true, text: null, imageUrl: hmAbs(s2), isVideo: false, videoUrl: null });
            continue;
        }
        var text = hmStripTags(hmDecode(tag));
        if (text.length >= 20) blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
    }
    if (blocks.length === 0) {
        var ps = source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
        for (var j = 0; j < ps.length; j++) {
            var t = hmStripTags(hmDecode(ps[j]));
            if (t.length >= 20) blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    if (blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}
