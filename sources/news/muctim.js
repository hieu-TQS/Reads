/**
 * Muc Tim (muctim.tuoitre.vn) — nguồn báo dạng JS.
 */
var MT_HOST = "https://muctim.tuoitre.vn";
var MT_SOURCE_NAME = "Mực Tím";
var MT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var MT_CATEGORIES = [
    { name: "Trang chủ", pageUrl: MT_HOST + "/" },
    { name: "Học đường", pageUrl: MT_HOST + "/hoc-duong.htm" },
    { name: "Đời sống", pageUrl: MT_HOST + "/doi-song.htm" },
    { name: "Xu hướng", pageUrl: MT_HOST + "/xu-huong.htm" },
    { name: "Gen Z", pageUrl: MT_HOST + "/gen-z.htm" },
    { name: "Tuổi chúng mình", pageUrl: MT_HOST + "/tuoi-chung-minh.htm" },
    { name: "Giải trí", pageUrl: MT_HOST + "/giai-tri.htm" },
    { name: "Kỹ năng", pageUrl: MT_HOST + "/ky-nang.htm" },
    { name: "Quiz", pageUrl: MT_HOST + "/quiz.htm" },
    { name: "Vòm me xanh", pageUrl: MT_HOST + "/vom-me-xanh.htm" },
    { name: "Video", pageUrl: MT_HOST + "/video.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "muctim",
        name: MT_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=muctim.tuoitre.vn&sz=64",
        categories: MT_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    if (!link) return false;
    var l = String(link).toLowerCase();
    return l.indexOf("muctim.tuoitre.vn") !== -1 || l.indexOf("tuoitre.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": MT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        "Referer": MT_HOST + "/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0"
    });
}

function mtStripTags(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function mtDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", yacute: "ý", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Yacute: "Ý", agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù", ygrave: "ỳ", Agrave: "À", Egrave: "È", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù", Ygrave: "Ỳ", atilde: "ã", etilde: "ẽ", itilde: "ĩ", otilde: "õ", utilde: "ũ", ytilde: "ỹ", Atilde: "Ã", Etilde: "Ẽ", Itilde: "Ĩ", Otilde: "Õ", Utilde: "Ũ", Ytilde: "Ỹ", acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û", Acirc: "Â", Ecirc: "Ê", Icirc: "Î", Ocirc: "Ô", Ucirc: "Û", adot: "ạ", edot: "ẹ", idot: "ị", odot: "ọ", udot: "ụ", ydot: "ỵ", Adot: "Ạ", Edot: "Ẹ", Idot: "Ị", Odot: "Ọ", Udot: "Ụ", Ydot: "Ỵ" };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) { if (named[n]) return named[n]; return m; });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}
function mtAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return MT_HOST + u;
    return MT_HOST + "/" + u;
}
function mtImgSrc(tag) {
    if (!tag) return null;
    var m = /src\s*=\s*"([^"]+)"/i.exec(tag) || /data-src\s*=\s*"([^"]+)"/i.exec(tag);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/)[0];
    return v.indexOf("data:image") === 0 ? null : v;
}
function parseNewsList(html, url) {
    if (!html) return "[]";
    var src = String(html);
    var out = [];
    var seen = {};
    var re = /<a[^>]*href="([^"]*?-\d+\.htm[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(src)) !== null) {
        var link = mtAbs(m[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var inner = m[2];
        var title = mtStripTags(mtDecode(inner)).trim();
        if (title.length < 8) {
            var tAttr = /title="([^"]+)"/i.exec(m[0]);
            if (tAttr) title = mtDecode(tAttr[1]).trim();
        }
        if (title.length < 8) continue;
        var imgM = /<img[^>]*>/i.exec(inner);
        var img = imgM ? mtImgSrc(imgM[0]) : null;
        if (img) img = mtAbs(img);
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
        var tm2 = /class="box-category-link-title"[^>]*>([\s\S]*?)<\/a>/i.exec(source);
        if (tm2) tM = tm2;
    }
    if (tM) title = mtStripTags(mtDecode(tM[1])).trim();

    var blocks = [];
    var bodyM = /<div[^>]*class="[^"]*(?:detail-content|afcbc-body|content fck|main-content-body|content-detail|article-content|entry-content|post-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!bodyM) {
        var idx = source.indexOf("</h1>");
        if (idx >= 0) bodyM = { 1: source.substring(idx + 5) };
    }
    var html2 = bodyM ? bodyM[1] : source;
    var cutIdx = html2.search(/class="[^"]*(?:related|comment|footer|sidebar|share|box-related|box-share)/i);
    if (cutIdx > 0) html2 = html2.substring(0, cutIdx);
    var tags = html2.match(/<(?:p|h[1-6]|figure|img)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|figure)>|<img[^>]*>/gi) || [];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var lower = tag.toLowerCase();
        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? mtImgSrc(imgTag[0]) : null;
            if (src) blocks.push({ isImage: true, text: null, imageUrl: mtAbs(src), isVideo: false, videoUrl: null });
            continue;
        }
        if (lower.indexOf("<img") === 0) {
            var s2 = mtImgSrc(tag);
            if (s2) blocks.push({ isImage: true, text: null, imageUrl: mtAbs(s2), isVideo: false, videoUrl: null });
            continue;
        }
        var text = mtStripTags(mtDecode(tag));
        if (text.length >= 20) blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
    }
    if (blocks.length === 0) {
        var ps = source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
        for (var j = 0; j < ps.length; j++) {
            var t = mtStripTags(mtDecode(ps[j]));
            if (t.length >= 20) blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    if (blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}