/*
 * KhoaHoc.tv — nguồn báo khoa học / công nghệ dạng JS.
 *
 * Hợp đồng báo (xem JsNewsSite.kt):
 *  - getNewsSource()                -> { id, name, faviconUrl, categories:[{name,pageUrl}], searchable }
 *  - matchesNewsSource(link)        -> true/false
 *  - parseNewsList(html, url)       -> mảng item {title, link, excerpt, imageUrl, pubDate, pubDateMs, sourceName}
 *  - getNewsNextPageUrl(currentUrl, page, html) -> URL trang kế, null = hết
 *  - getNewsSearchUrl(query, page)  -> URL tìm kiếm, null = không hỗ trợ
 *  - getNewsHeaders(url)            -> {} (không cần header đặc biệt)
 *  - parseNewsArticle(html, url)    -> { title, blocks, related } hoặc null
 *
 * ES5 thuần. Mọi hàm trả JSON string.
 */

var KH_HOST = "https://khoahoc.tv";
var KH_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Entity map (reuse) ---------- */
var KH_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", bull: "\u2022",
    middot: "\u00b7", times: "\u00d7", copy: "\u00a9", reg: "\u00ae",
    trade: "\u2122", deg: "\u00b0", agrave: "\u00e0", aacute: "\u00e1",
    atilde: "\u00e3", acirc: "\u00e2", abreve: "\u0103", egrave: "\u00e8",
    eacute: "\u00e9", ecirc: "\u00ea", igrave: "\u00ec", iacute: "\u00ed",
    ograve: "\u00f2", oacute: "\u00f3", ocirc: "\u00f4", otilde: "\u00f5",
    ohorn: "\u01a1", ugrave: "\u00f9", uacute: "\u00fa", uhorn: "\u01b0",
    yacute: "\u00fd", dstrok: "\u0111", Agrave: "\u00c0", Aacute: "\u00c1",
    Atilde: "\u00c3", Acirc: "\u00c2", Abreve: "\u0102", Egrave: "\u00c8",
    Eacute: "\u00c9", Ecirc: "\u00ca", Igrave: "\u00cc", Iacute: "\u00cd",
    Ograve: "\u00d2", Oacute: "\u00d3", Ocirc: "\u00d4", Otilde: "\u00d5",
    Ohorn: "\u01a0", Ugrave: "\u00d9", Uacute: "\u00da", Uhorn: "\u01af",
    Yacute: "\u00dd", Dstrok: "\u0110"
};

function KH_trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

function KH_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function KH_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) { return KH_char(parseInt(hex, 16)); });
        out = out.replace(/&#(\d+);?/g, function (all, dec) { return KH_char(parseInt(dec, 10)); });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var v = KH_ENTITIES[name];
            return v == null ? all : v;
        });
    }
    return out;
}

function KH_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return KH_HOST + u;
    return KH_HOST + "/" + u;
}

function KH_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function KH_text(html) {
    var s = KH_stripTags(html);
    s = KH_decode(s);
    s = s.replace(/\s+/g, " ");
    return KH_trim(s);
}

function KH_match(s, re) {
    var m = re.exec(String(s == null ? "" : s));
    return m ? m : null;
}

/* ---------- Source ---------- */

var KH_CATEGORIES = [
    { name: "Khám phá khoa học", pageUrl: KH_HOST + "/kham-pha-khoa-hoc" },
    { name: "Sinh vật học", pageUrl: KH_HOST + "/sinh-vat-hoc" },
    { name: "Khảo cổ học", pageUrl: KH_HOST + "/khao-co-hoc" },
    { name: "Đại dương học", pageUrl: KH_HOST + "/dai-duong-hoc" },
    { name: "Thế giới động vật", pageUrl: KH_HOST + "/the-gioi-dong-vat" },
    { name: "Vũ trụ", pageUrl: KH_HOST + "/vu-tru" },
    { name: "Danh nhân thế giới", pageUrl: KH_HOST + "/danh-nhan-the-gioi" },
    { name: "Ngày tận thế", pageUrl: KH_HOST + "/ngay-tan-the" },
    { name: "1001 bí ẩn", pageUrl: KH_HOST + "/1001-bi-an" },
    { name: "Chinh phục sao Hoả", pageUrl: KH_HOST + "/chinh-phuc-sao-hoa" },
    { name: "Di sản thế giới", pageUrl: KH_HOST + "/di-san-the-gioi" },
    { name: "Người ngoài hành tinh", pageUrl: KH_HOST + "/nguoi-ngoai-hanh-tinh" },
    { name: "Trắc nghiệm khoa học", pageUrl: KH_HOST + "/trac-nghiem-khoa-hoc" },
    { name: "Khoa học quân sự", pageUrl: KH_HOST + "/khoa-hoc-quan-su" },
    { name: "Lịch sử", pageUrl: KH_HOST + "/lich-su" },
    { name: "Tại sao", pageUrl: KH_HOST + "/tai-sao" },
    { name: "Địa danh nổi tiếng", pageUrl: KH_HOST + "/dia-danh-noi-tieng" },
    { name: "Bạn đọc khoa học", pageUrl: KH_HOST + "/ban-doc-khoa-hoc" },
    { name: "Công nghệ mới", pageUrl: KH_HOST + "/cong-nghe-moi" },
    { name: "Máy tính", pageUrl: KH_HOST + "/may-tinh" },
    { name: "Phát minh", pageUrl: KH_HOST + "/phat-minh" },
    { name: "AI - Trí tuệ nhân tạo", pageUrl: KH_HOST + "/ai-tri-tue-nhan-tao" },
    { name: "Y học", pageUrl: KH_HOST + "/yhoc" },
    { name: "Môi trường", pageUrl: KH_HOST + "/moi-truong" },
    { name: "Bệnh ung thư", pageUrl: KH_HOST + "/benh-ung-thu" },
    { name: "Ứng dụng", pageUrl: KH_HOST + "/ung-dung" },
    { name: "Câu chuyện", pageUrl: KH_HOST + "/cau-chuyen" },
    { name: "Công trình", pageUrl: KH_HOST + "/cong-trinh" },
    { name: "Công nghệ", pageUrl: KH_HOST + "/cong-nghe" },
    { name: "Khoa học", pageUrl: KH_HOST + "/khoa-hoc" },
    { name: "Vũ trụ", pageUrl: KH_HOST + "/vu-tru" },
    { name: "Thế giới động vật", pageUrl: KH_HOST + "/the-gioi-dong-vat" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "khoahoctv",
        name: "KhoaHoc.tv",
        faviconUrl: "https://www.google.com/s2/favicons?domain=khoahoc.tv&sz=64",
        categories: KH_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("khoahoc.tv") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": KH_UA,
        "Referer": KH_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });
}

/* ---------- List ---------- */

function parseNewsList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<li class="listitem/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('<li class="listitem');
        if (cut > 0) chunk = chunk.substring(0, cut);

        // link + title: ưu tiên <a class="title">
        var linkM = /<a class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) {
            linkM = /<a[^>]+href="(\/[a-z0-9-]+-\d+)"[^>]*>([\s\S]{0,120}?)<\/a>/i.exec(chunk);
        }
        if (!linkM) continue;
        var link = KH_abs(linkM[1]);
        if (seen[link]) continue;
        seen[link] = 1;

        var title = KH_text(linkM[2]);
        if (!title) continue;

        // image: ưu tiên data-src
        var imgM = /<img[^>]+data-src="([^"]+)"/i.exec(chunk);
        if (!imgM) imgM = /<img[^>]+src="([^"]+)"[^>]*>/i.exec(chunk);
        var imageUrl = null;
        if (imgM) {
            var u = imgM[1];
            if (u.indexOf("holder.png") === -1) imageUrl = KH_abs(u);
        }

        // excerpt
        var exM = /<div class="desc"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
        var excerpt = exM ? KH_text(exM[1]) : null;
        if (excerpt === "") excerpt = null;

        out.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: imageUrl,
            pubDate: null,
            pubDateMs: null,
            sourceName: "KhoaHoc.tv"
        });
    }
    return JSON.stringify(out);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    var m = /<a[^>]+href="([^"]+)"[^>]*rel="next"/i.exec(s);
    if (m) return KH_abs(m[1]);
    // fallback: rel="next" có thể đứng trước href
    m = /rel="next"[^>]*href="([^"]+)"/i.exec(s);
    if (m) return KH_abs(m[1]);
    return null;
}

function getNewsSearchUrl(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return KH_HOST + "/s?q=" + encodeURIComponent(String(query == null ? "" : query));
    return KH_HOST + "/s/" + encodeURIComponent(String(query == null ? "" : query)) + "?p=" + page;
}

/* ---------- Article ---------- */

function parseNewsArticle(html, url) {
    var s = String(html == null ? "" : html);
    var titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? KH_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = KH_decode(og[1]);
    }

    // body region: từ <p> đầu đến "Bài viết liên quan"
    var start = s.indexOf("<p");
    var endMarker = s.indexOf("Bài viết liên quan");
    var body = (endMarker > 0 && endMarker > start) ? s.substring(start, endMarker) : s.substring(start);

    // remove ad blocks
    body = body.replace(/<div class="adbox[\s\S]*?<\/div>/gi, " ");
    body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");

    var blocks = [];
    // split by </p>
    var chunks = body.split(/<\/p>/i);
    for (var i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        if (!chunk) continue;
        if (/<img/i.test(chunk)) {
            var imgM = /<img[^>]+(?:data-src|src)="([^"]+)"/i.exec(chunk);
            if (imgM) {
                var src = imgM[1];
                if (src.indexOf("holder.png") === -1) {
                    var capM = /alt="([^"]*)"/i.exec(chunk);
                    var cap = capM ? KH_decode(capM[1]) : "";
                    // caption in <span>
                    var spanM = /<span[^>]*>([\s\S]*?)<\/span>/i.exec(chunk);
                    if (spanM) {
                        var st = KH_text(spanM[1]);
                        if (st) cap = st;
                    }
                    blocks.push({ isImage: true, text: cap || "", imageUrl: KH_abs(src) });
                }
            }
            // text before image in same chunk
            var txt = KH_text(chunk.replace(/<img[^>]*>/gi, " "));
            // remove caption already handled; only push if substantial and not duplicate of image
            // skip to avoid duplicate short captions
        } else {
            var t = KH_text(chunk);
            if (t) blocks.push({ isImage: false, text: t });
        }
    }

    // related
    var related = [];
    var seenR = {};
    var relIdx = s.indexOf("Bài viết liên quan");
    if (relIdx >= 0) {
        var relRegion = s.substring(relIdx);
        var liRe = /<li class="list-item"[^>]*>([\s\S]*?)<\/li>/g;
        var lm;
        while ((lm = liRe.exec(relRegion)) !== null) {
            var block = lm[1];
            var aM = /<a[^>]+href="([^"]+)"/.exec(block);
            if (!aM) continue;
            var rlink = KH_abs(aM[1]);
            if (seenR[rlink]) continue;
            seenR[rlink] = 1;
            var h3M = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(block);
            var rtitle = h3M ? KH_text(h3M[1]) : "";
            var imgM = /<img[^>]+(?:data-src|src)="([^"]+)"/i.exec(block);
            var rimg = imgM ? imgM[1] : null;
            if (rimg && rimg.indexOf("holder.png") !== -1) rimg = null;
            if (rtitle) related.push({ title: rtitle, link: rlink, imageUrl: rimg ? KH_abs(rimg) : null });
            if (related.length >= 8) break;
        }
    }

    if (!title && blocks.length === 0) return null;
    return JSON.stringify({ title: title, blocks: blocks, related: related });
}
