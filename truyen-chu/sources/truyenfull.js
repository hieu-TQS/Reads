/*
 * TruyenFull (truyenfull.live) — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách (1-based)
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]  (trang mục lục phụ ?page=N / trang-N)
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *  - getNovelCategories()                -> [{ title, url }]  danh mục (thể loại)
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var TF_HOST = "https://truyenfull.live";
var TF_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

/* ---------- Entity map ---------- */
var TF_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    sbquo: "\u201a", bdquo: "\u201e", laquo: "\u00ab", raquo: "\u00bb",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", minus: "\u2212",
    bull: "\u2022", middot: "\u00b7", times: "\u00d7", divide: "\u00f7",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0",
    plusmn: "\u00b1", frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be",
    sup2: "\u00b2", sup3: "\u00b3", euro: "\u20ac", pound: "\u00a3",
    yen: "\u00a5", cent: "\u00a2", ensp: " ", emsp: " ", thinsp: " ",
    shy: "", zwnj: "", zwj: "", lrm: "", rlm: "",
    aacute: "\u00e1", agrave: "\u00e0", acirc: "\u00e2", atilde: "\u00e3", auml: "\u00e4", aring: "\u00e5",
    eacute: "\u00e9", egrave: "\u00e8", ecirc: "\u00ea", euml: "\u00eb",
    iacute: "\u00ed", igrave: "\u00ec", icirc: "\u00ee", iuml: "\u00ef",
    oacute: "\u00f3", ograve: "\u00f2", ocirc: "\u00f4", otilde: "\u00f5", ouml: "\u00f6",
    uacute: "\u00fa", ugrave: "\u00f9", ucirc: "\u00fb", uuml: "\u00fc",
    yacute: "\u00fd", yuml: "\u00ff", eth: "\u0111", dstrok: "\u0111",
    Aacute: "\u00c1", Agrave: "\u00c0", Acirc: "\u00c2", Atilde: "\u00c3", Auml: "\u00c4", Aring: "\u00c5",
    Eacute: "\u00c9", Egrave: "\u00c8", Ecirc: "\u00ca", Euml: "\u00cb",
    Iacute: "\u00cd", Igrave: "\u00cc", Icirc: "\u00ce", Iuml: "\u00cf",
    Oacute: "\u00d3", Ograve: "\u00d2", Ocirc: "\u00d4", Otilde: "\u00d5", Ouml: "\u00d6",
    Uacute: "\u00da", Ugrave: "\u00d9", Ucirc: "\u00db", Uuml: "\u00dc",
    Yacute: "\u00dd", ETH: "\u00d0", Dstrok: "\u0110"
};

function TF_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function TF_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function TF_decode(s) {
    var out = String(s == null ? "" : s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return TF_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return TF_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var value = TF_ENTITIES[name];
            return value == null ? all : value;
        });
    }
    return out;
}

function TF_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return TF_HOST + u;
    return TF_HOST + "/" + u;
}

function TF_stripTags(s) {
    return String(s == null ? "" : s)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
}

function TF_text(html) {
    var s = TF_stripTags(html);
    s = TF_decode(s);
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/\n{3,}/g, "\n\n");
    return TF_trim(s);
}

function TF_match(s, re) {
    var m = re.exec(String(s == null ? "" : s));
    return m ? m : null;
}

/* Trang Cloudflare "Just a moment..." (403) — app không chạy JS nên không vượt được. */
function TF_isChallenge(s) {
    return s.indexOf("challenge-platform") >= 0 || /<title>\s*Just a moment/i.test(s);
}

/* Bỏ phần tử ẩn — site nhồi keyword SEO bằng <p style="display:none">. */
function TF_dropHidden(s) {
    return String(s == null ? "" : s).replace(
        /<(\w+)[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/\1>/gi, " ");
}

function TF_isSeoJunk(t) {
    return /^[\s,.\-|]*(?:truyen\s*full(?:vn|live)?[\s,.\-|]*)+$/i.test(t);
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "truyenfull",
        name: "TruyenFull",
        faviconUrl: "https://www.google.com/s2/favicons?domain=truyenfull.live&sz=64",
        baseUrl: TF_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return TF_HOST + "/danh-sach/truyen-moi/";
    return TF_HOST + "/danh-sach/truyen-moi/trang-" + page + "/";
}

function getNovelSearchRequest(query, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var url = TF_HOST + "/tim-kiem/?tukhoa=" + encodeURIComponent(String(query == null ? "" : query)) + "&page=" + page;
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": TF_UA,
            "Referer": TF_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<div class="row"/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        // chỉ xử lý hàng truyện (có truyen-title), bỏ hàng khác
        if (chunk.indexOf('truyen-title') < 0) continue;
        var cut = chunk.indexOf('<div class="row"');
        if (cut > 0) chunk = chunk.substring(0, cut);
        var cut2 = chunk.indexOf('<div class="text-center pagination');
        if (cut2 > 0) chunk = chunk.substring(0, cut2);

        var linkM = /<h3 class="truyen-title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!linkM) {
            linkM = /<h3 class="truyen-title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        }
        if (!linkM) continue;
        var link = TF_abs(linkM[1]);
        if (seen[link]) continue;
        // Truyện "AI free" (slug ...-free) bị Cloudflare chặn 403 với mọi request
        // không chạy JS → app không bao giờ mở được, ẩn khỏi danh sách.
        if (/-free\/?$/i.test(link)) continue;
        seen[link] = 1;

        var title = "";
        if (linkM.length >= 4 && linkM[2] && linkM[2].trim()) title = TF_decode(linkM[2]);
        if (!title) title = TF_text(linkM[linkM.length - 1]);
        if (!title) continue;

        var coverM = /data-image="([^"]+)"/i.exec(chunk);
        var coverUrl = coverM ? TF_abs(coverM[1]) : null;

        var authorM = /<span class="author"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
        var author = authorM ? TF_text(authorM[1]) : "";

        var latestM = /class="chapter-text"[\s\S]*?(\d+)\s*<\/a>/i.exec(chunk);
        var latestChapter = latestM ? ("Chương " + latestM[1]) : "";

        out.push({
            title: title,
            link: link,
            coverUrl: coverUrl,
            author: author || null,
            latestChapter: latestChapter || null
        });
    }
    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var s = String(html == null ? "" : html);
    var re = /href="([^"]*trang-(\d+)\/?[^"]*)"/g;
    var m;
    var best = "";
    var bestNum = 999999;
    while ((m = re.exec(s)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > page && num < bestNum) {
            bestNum = num;
            best = TF_abs(m[1]);
        }
    }
    return best;
}

/* ---------- Detail ---------- */

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);
    if (TF_isChallenge(s)) {
        return JSON.stringify({
            title: "", coverUrl: null, author: null, description: null,
            status: null, genres: null, chapters: [], chapterPages: []
        });
    }
    var titleM = /<h3 class="title"[^>]*>([\s\S]*?)<\/h3>/i.exec(s);
    var title = titleM ? TF_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = TF_decode(og[1]);
    }

    var coverM = /<img[^>]+itemprop="image"[^>]+src="([^"]+)"/i.exec(s);
    if (!coverM) coverM = /<img[^>]+src="([^"]+)"[^>]+itemprop="image"/i.exec(s);
    var coverUrl = coverM ? TF_abs(coverM[1]) : null;

    var authorM = /Tác giả:[\s\S]{0,200}?<a[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    var author = authorM ? TF_text(authorM[1]) : "";

    var statusM = /Trạng thái:[\s\S]{0,120}?<span[^>]*>([\s\S]*?)<\/span>/i.exec(s);
    var status = statusM ? TF_text(statusM[1]) : "";

    var genres = [];
    var gseen = {};
    var gre = /<a itemprop="genre"[^>]*>([\s\S]*?)<\/a>/gi;
    var gm;
    while ((gm = gre.exec(s)) !== null) {
        var g = TF_text(gm[1]);
        if (g && !gseen[g]) { gseen[g] = 1; genres.push(g); }
    }

    // description
    var descM = /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i.exec(s);
    var description = "";
    if (descM) {
        var pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        var pm;
        var parts = [];
        while ((pm = pRe.exec(descM[1])) !== null) {
            var t = TF_text(pm[1]);
            if (t) parts.push(t);
        }
        description = parts.length ? parts.join("\n\n") : TF_text(descM[1]);
    }

    // chapters
    var chapters = [];
    var seenCh = {};
    var chRe = /<ul class="list-chapter">([\s\S]*?)<\/ul>/i.exec(s);
    if (chRe) {
        var aRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        var am;
        while ((am = aRe.exec(chRe[1])) !== null) {
            var clink = TF_abs(am[1]);
            if (seenCh[clink]) continue;
            seenCh[clink] = 1;
            var ctitle = TF_text(am[2]);
            if (!ctitle) continue;
            chapters.push({ title: ctitle, link: clink });
        }
    }

    // chapter pages
    var chapterPages = [];
    var seenP = {};
    var pageRe = /href="(https:\/\/truyenfull\.live\/[^"]*trang-\d+[^"]*)"/g;
    var pm2;
    while ((pm2 = pageRe.exec(s)) !== null) {
        var pu = TF_abs(pm2[1]);
        // strip hash
        pu = pu.split("#")[0];
        if (seenP[pu]) continue;
        seenP[pu] = 1;
        chapterPages.push(pu);
    }

    return JSON.stringify({
        title: title || (url || ""),
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters,
        chapterPages: chapterPages
    });
}

/* ---------- Extra chapter pages ---------- */

function parseNovelChapters(html) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var ulM = /<ul class="list-chapter">([\s\S]*?)<\/ul>/i.exec(s);
    if (!ulM) return JSON.stringify(out);
    var aRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    var am;
    while ((am = aRe.exec(ulM[1])) !== null) {
        var link = TF_abs(am[1]);
        if (seen[link]) continue;
        seen[link] = 1;
        var title = TF_text(am[2]);
        if (!title) continue;
        out.push({ title: title, link: link });
    }
    return JSON.stringify(out);
}

/* ---------- Chapter content ---------- */

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);
    if (TF_isChallenge(s)) {
        return JSON.stringify({ title: "", paragraphs: [], prevLink: "", nextLink: "" });
    }

    var titleM = /<h2[^>]*class="truyen-title"[^>]*>([\s\S]*?)<\/h2>/i.exec(s);
    var title = titleM ? TF_text(titleM[1]) : "";
    if (!title) {
        // Trang chương chỉ có tên chương trong <title>: "Truyện : Chương N: … - Truyenfull.vn"
        var tM = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (tM) {
            title = TF_text(tM[1]).replace(/\s*[-|]\s*Truyenfull\.[a-z]+\s*$/i, "");
            var sep = title.lastIndexOf(" : ");
            if (sep >= 0) title = title.substring(sep + 3);
        }
    }
    if (!title) {
        var h1M = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
        if (h1M) title = TF_text(h1M[1]);
    }

    // content block
    var startIdx = s.indexOf('id="chapter-c"');
    var endIdx = s.indexOf('id="chapter-nav-bot"');
    var block = "";
    if (startIdx >= 0) {
        var from = s.indexOf(">", startIdx);
        if (from >= 0) {
            var to = (endIdx > startIdx) ? endIdx : (startIdx + 200000);
            block = s.substring(from + 1, to);
        }
    }
    block = TF_dropHidden(block);
    // Có 2 kiểu markup: <p>…</p> (truyện cũ) và ngăn cách bằng <br><br> (truyện mới).
    // TF_text đã đổi cả </p> lẫn <br> thành "\n" nên tách theo xuống dòng là đủ cho cả 2.
    var paragraphs = [];
    var raw = TF_text(block);
    var parts = raw.split(/\n+/);
    for (var i = 0; i < parts.length; i++) {
        var tt = TF_trim(parts[i]);
        if (tt && !TF_isSeoJunk(tt)) paragraphs.push(tt);
    }

    // prev / next
    var prevM = /href="([^"]*)"[^>]*id="prev_chap"/i.exec(s);
    var nextM = /href="([^"]*)"[^>]*id="next_chap"/i.exec(s);
    var prevLink = prevM ? TF_abs(prevM[1]) : "";
    var nextLink = nextM ? TF_abs(nextM[1]) : "";
    if (prevLink.indexOf("javascript:") >= 0) prevLink = "";
    if (nextLink.indexOf("javascript:") >= 0) nextLink = "";

    return JSON.stringify({
        title: title,
        paragraphs: paragraphs,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

/* ---------- Headers ---------- */

function getNovelHeaders(url) {
    return JSON.stringify({
        "User-Agent": TF_UA,
        "Referer": TF_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Truyện sáng tác","url":"https://truyenfull.live/the-loai/truyen-sang-tac/"},
        {"title":"Tiên Hiệp","url":"https://truyenfull.live/the-loai/tien-hiep/"},
        {"title":"Kiếm Hiệp","url":"https://truyenfull.live/the-loai/kiem-hiep/"},
        {"title":"Ngôn Tình","url":"https://truyenfull.live/the-loai/ngon-tinh/"},
        {"title":"Đam Mỹ","url":"https://truyenfull.live/the-loai/dam-my/"},
        {"title":"Quan Trường","url":"https://truyenfull.live/the-loai/quan-truong/"},
        {"title":"Chủ công","url":"https://truyenfull.live/the-loai/chu-cong/"},
        {"title":"Võng Du","url":"https://truyenfull.live/the-loai/vong-du/"},
        {"title":"Khoa Huyễn","url":"https://truyenfull.live/the-loai/khoa-huyen/"},
        {"title":"Hệ Thống","url":"https://truyenfull.live/the-loai/he-thong/"},
        {"title":"Huyền Huyễn","url":"https://truyenfull.live/the-loai/huyen-huyen/"},
        {"title":"Dị Giới","url":"https://truyenfull.live/the-loai/di-gioi/"},
        {"title":"Dị Năng","url":"https://truyenfull.live/the-loai/di-nang/"},
        {"title":"Quân Sự","url":"https://truyenfull.live/the-loai/quan-su/"},
        {"title":"Sắc","url":"https://truyenfull.live/the-loai/sac/"},
        {"title":"Lịch Sử","url":"https://truyenfull.live/the-loai/lich-su/"},
        {"title":"Xuyên Không","url":"https://truyenfull.live/the-loai/xuyen-khong/"},
        {"title":"Xuyên Sách","url":"https://truyenfull.live/the-loai/xuyen-sach/"},
        {"title":"Xuyên Nhanh","url":"https://truyenfull.live/the-loai/xuyen-nhanh/"},
        {"title":"Cận Đại","url":"https://truyenfull.live/the-loai/can-dai/"},
        {"title":"Trọng Sinh","url":"https://truyenfull.live/the-loai/trong-sinh/"},
        {"title":"Trinh Thám","url":"https://truyenfull.live/the-loai/trinh-tham/"},
        {"title":"Thám Hiểm","url":"https://truyenfull.live/the-loai/tham-hiem/"},
        {"title":"Linh Dị","url":"https://truyenfull.live/the-loai/linh-di/"},
        {"title":"Ngược","url":"https://truyenfull.live/the-loai/nguoc/"},
        {"title":"Sủng","url":"https://truyenfull.live/the-loai/sung/"},
        {"title":"Cung Đấu","url":"https://truyenfull.live/the-loai/cung-dau/"},
        {"title":"Nữ Cường","url":"https://truyenfull.live/the-loai/nu-cuong/"},
        {"title":"Gia Đấu","url":"https://truyenfull.live/the-loai/gia-dau/"},
        {"title":"Đông Phương","url":"https://truyenfull.live/the-loai/dong-phuong/"},
        {"title":"Đô Thị","url":"https://truyenfull.live/the-loai/do-thi/"},
        {"title":"Bách Hợp","url":"https://truyenfull.live/the-loai/bach-hop/"},
        {"title":"Hài Hước","url":"https://truyenfull.live/the-loai/hai-huoc/"},
        {"title":"Điền Văn","url":"https://truyenfull.live/the-loai/dien-van/"},
        {"title":"Cổ Đại","url":"https://truyenfull.live/the-loai/co-dai/"},
        {"title":"Mạt Thế","url":"https://truyenfull.live/the-loai/mat-the/"},
        {"title":"Truyện Teen","url":"https://truyenfull.live/the-loai/truyen-teen/"},
        {"title":"Phương Tây","url":"https://truyenfull.live/the-loai/phuong-tay/"},
        {"title":"Nữ Phụ","url":"https://truyenfull.live/the-loai/nu-phu/"},
        {"title":"Light Novel","url":"https://truyenfull.live/the-loai/light-novel/"},
        {"title":"Việt Nam","url":"https://truyenfull.live/the-loai/viet-nam/"},
        {"title":"Tương Lai","url":"https://truyenfull.live/the-loai/tuong-lai/"},
        {"title":"Giải Trí","url":"https://truyenfull.live/the-loai/giai-tri/"},
        {"title":"Đoản Văn","url":"https://truyenfull.live/the-loai/doan-van/"},
        {"title":"Review sách","url":"https://truyenfull.live/the-loai/review-sach/"},
        {"title":"Truyện Ngắn","url":"https://truyenfull.live/the-loai/truyen-ngan/"},
        {"title":"Khác","url":"https://truyenfull.live/the-loai/khac/"}
    ]);
}
