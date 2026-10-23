/**
 * Tuoi Tre Cuoi (cuoi.tuoitre.vn) — nguồn báo dạng JS.
 */
var CT_HOST = "https://cuoi.tuoitre.vn";
var CT_SOURCE_NAME = "Tuổi Trẻ Cười";
var CT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var CT_CATEGORIES = [
    { name: "Trang chủ", pageUrl: CT_HOST + "/" },
    { name: "Xu hướng", pageUrl: CT_HOST + "/xu-huong.htm" },
    { name: "Nổi bật", pageUrl: CT_HOST + "/noi-bat.htm" },
    { name: "Đề xuất", pageUrl: CT_HOST + "/de-xuat.htm" },
    { name: "Lẩu thập cẩm", pageUrl: CT_HOST + "/lau-thap-cam.htm" },
    { name: "Biếm hoạ", pageUrl: CT_HOST + "/biem-hoa.htm" },
    { name: "Trạm hoạt hình", pageUrl: CT_HOST + "/tram-hoat-hinh.htm" },
    { name: "Truyện tranh", pageUrl: CT_HOST + "/truyen-tranh.htm" },
    { name: "Phòng mạch Tả pí Lù", pageUrl: CT_HOST + "/phong-mach-ta-pi-lu.htm" },
    { name: "Xu hướng", pageUrl: CT_HOST + "/xu-huong.htm" },
    { name: "Thể Thao Cười", pageUrl: CT_HOST + "/the-thao-cuoi.htm" },
    { name: "Showbiz", pageUrl: CT_HOST + "/showbiz.htm" },
    { name: "Đời cười", pageUrl: CT_HOST + "/doi-cuoi.htm" },
    { name: "Video", pageUrl: CT_HOST + "/video.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "cuoi",
        name: CT_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=cuoi.tuoitre.vn&sz=64",
        categories: CT_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    if (!link) return false;
    var l = String(link).toLowerCase();
    return l.indexOf("cuoi.tuoitre.vn") !== -1 || l.indexOf("tuoitre.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": CT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        "Referer": CT_HOST + "/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0"
    });
}

function ctStripTags(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function ctDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) { if (named[n.toLowerCase()]) return named[n.toLowerCase()]; return m; });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}
function parseNewsList(html, url) {
    if (!html) return "[]";
    var src = String(html);
    var out = [];
    var seen = {};
    var re = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    var m;
    while ((m = re.exec(src)) !== null) {
        var block = m[1];
        var hrefM = /href="([^"]+)"/i.exec(block);
        if (!hrefM) continue;
        var link = ctAbs(hrefM[1]);
        if (!link || seen[link]) continue;
        seen[link] = 1;
        var title = "";
        var titleM = /title="([^"]*)"/i.exec(block);
        if (titleM) title = ctDecode(titleM[1]);
        if (!title) {
            var tM = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(block);
            if (tM) title = ctStripTags(ctDecode(tM[1])).trim();
        }
        if (title.length < 4) continue;
        var imgM = /<img[^>]*>/i.exec(block);
        var img = imgM ? ctImgSrc(imgM[0]) : null;
        if (img) img = ctAbs(img);
        out.push({ title: title, url: link, description: "", imageUrl: img, pubDateMs: 0 });
        if (out.length >= 40) break;
    }
    if (out.length === 0) {
        // fallback: box-category-item links (category pages have no <article>)
        var re2 = /<a[^>]+href="([^"]*-\d{8,}[^"]*\.htm)"[^>]*title="([^"]+)"/gi;
        var m2;
        while ((m2 = re2.exec(src)) !== null) {
            var link2 = ctAbs(m2[1]);
            if (!link2 || seen[link2]) continue;
            seen[link2] = 1;
            var t2 = ctDecode(m2[2]).trim();
            if (t2.length < 4) continue;
            var imgCtx = src.substring(Math.max(0, m2.index - 300), m2.index + 400);
            var imgM2 = /<img[^>]*>/i.exec(imgCtx);
            var img2 = imgM2 ? ctImgSrc(imgM2[0]) : null;
            if (img2) img2 = ctAbs(img2);
            out.push({ title: t2, url: link2, description: "", imageUrl: img2, pubDateMs: 0 });
            if (out.length >= 40) break;
        }
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
    if (tM) title = ctStripTags(ctDecode(tM[1])).trim();

    var blocks = [];
    // Tim body bang indexOf de tranh bug nested div voi regex lazy </div>
    var html2 = null;
    // uu tien: article#main-detail-body (tuoitre), sau do fck, roi cac class khac
    var startMarkers = [
        'id="main-detail-body"',
        'class="fck"',
        'class="content-detail"',
        'class="main-content-body"',
        'class="box-660"'
    ];
    var endMarkers = [
        'class="box-related"', 'class="box-share"', 'class="related"',
        'class="comment"', 'class="footer"', 'class="sidebar"',
        'id="comment"', 'class="social"'
    ];
    for (var si = 0; si < startMarkers.length; si++) {
        var sIdx = source.indexOf(startMarkers[si]);
        if (sIdx === -1) continue;
        var openEnd = source.indexOf(">", sIdx);
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
            var src = imgTag ? ctImgSrc(imgTag[0]) : null;
            if (src) blocks.push({ isImage: true, text: null, imageUrl: ctAbs(src), isVideo: false, videoUrl: null });
            continue;
        }
        if (lower.indexOf("<img") === 0) {
            var s2 = ctImgSrc(tag);
            if (s2) blocks.push({ isImage: true, text: null, imageUrl: ctAbs(s2), isVideo: false, videoUrl: null });
            continue;
        }
        var text = ctStripTags(ctDecode(tag));
        if (text.length >= 20) blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
    }
    if (blocks.length === 0) {
        var ps = source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
        for (var j = 0; j < ps.length; j++) {
            var t = ctStripTags(ctDecode(ps[j]));
            if (t.length >= 20) blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    if (blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: [] });
}
function ctAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return CT_HOST + u;
    return CT_HOST + "/" + u;
}
function ctImgSrc(tag) {
    if (!tag) return null;
    var m = /data-original\s*=\s*"([^"]+)"/i.exec(tag) ||
            /data-src\s*=\s*"([^"]+)"/i.exec(tag) ||
            /src\s*=\s*"([^"]+)"/i.exec(tag);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/)[0];
    if (v.indexOf("data:image") === 0) return null;
    // bo qua icon/logo nho cua site
    if (v.indexOf("web_images") >= 0 || v.indexOf("icon") >= 0 || v.indexOf("logo") >= 0) return null;
    return v;
}