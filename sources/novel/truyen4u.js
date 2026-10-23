/*
 * Truyen4U — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *  - getNovelCategories()                -> [{ title, url }]
 *
 * Lưu ý của site:
 *  - Truyện: /<slug>-<id>/; chương: /<slug>-<id>/chuong-<n>-<slug>-<id-chuong>/.
 *  - Trang chủ (/) chỉ có 24 truyện, KHÔNG phân trang; muốn xem tiếp phải vào thể loại.
 *  - Danh sách thể loại /the-loai/<slug>/ và tìm kiếm /tim-kiem/<từ khoá> chia 20 truyện/trang,
 *    phân trang bằng ?page=N (nút nằm trong .pagination-control).
 *  - Trang truyện có 2 khối ul.chapters: "Chương mới nhất" (vài chương cuối) và
 *    "Danh sách chương" (toàn bộ) → chỉ lấy khối sau marker "Danh sách chương".
 *  - Nội dung chương nằm trong div.chapter-content, các đoạn là <p>; khối nội dung
 *    kết thúc ngay trước div.chapter-button (chứa nút Trước / Sau).
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var T4_HOST = "https://truyen4u.com";
var T4_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

/* ---------- Helpers ---------- */

var T4_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    laquo: "\u00ab", raquo: "\u00bb", hellip: "\u2026", mdash: "\u2014",
    ndash: "\u2013", bull: "\u2022", middot: "\u00b7", times: "\u00d7",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0"
};

function T4_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function T4_decode(s) {
    if (!s) return "";
    var out = String(s);
    out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
        return T4_char(parseInt(hex, 16));
    });
    out = out.replace(/&#(\d+);?/g, function (all, dec) {
        return T4_char(parseInt(dec, 10));
    });
    out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (all, name) {
        return T4_ENTITIES.hasOwnProperty(name) ? T4_ENTITIES[name] : all;
    });
    return out;
}

function T4_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function T4_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = T4_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return T4_trim(s);
}

function T4_abs(u) {
    u = T4_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return T4_HOST + u;
    return T4_HOST + "/" + u;
}

function T4_chapterNo(s) {
    var m = /(?:chuong|ch\u01b0\u01a1ng)[-\s]*(\d+)/i.exec(String(s == null ? "" : s));
    if (m) return parseInt(m[1], 10);
    return 0;
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "truyen4u",
        name: "Truyen4U",
        faviconUrl: "https://www.google.com/s2/favicons?domain=truyen4u.com&sz=64",
        baseUrl: T4_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    /* Trang chủ chỉ có 24 truyện và không phân trang. */
    return T4_HOST + "/";
}

function getNovelSearchRequest(query, page) {
    /* Site dùng dấu "+" cho khoảng trắng ngay trong path: /tim-kiem/trong+sinh. */
    var q = encodeURIComponent(T4_trim(query)).replace(/%20/g, "+");
    return JSON.stringify({
        url: T4_HOST + "/tim-kiem/" + q,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": T4_UA,
            "Referer": T4_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi,en;q=0.8"
        }
    });
}

/* ---------- List ---------- */

/*
 * Mỗi thẻ truyện: <div class="col-sm-12 col-md-6 story"> ... </div>
 * Tách theo thẻ mở, sau đó lấy phần tử đầu tiên trong mỗi khối.
 */
function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<div class="col-sm-12 col-md-6 story"/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var gt = chunk.indexOf(">");
        if (gt >= 0) chunk = chunk.substring(gt + 1);

        var href = "";
        var hm = /<a\b[^>]*class="[^"]*thumbnail[^"]*"[^>]*>/i.exec(chunk);
        if (hm) {
            var hrefM = /href="([^"]+)"/i.exec(hm[0]);
            if (hrefM) href = T4_abs(hrefM[1]);
        }
        if (!href) {
            var am = /<h2\b[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"/i.exec(chunk);
            if (am) href = T4_abs(am[1]);
        }
        if (!href || href.indexOf("/truyen/") >= 0 || seen[href]) continue;

        var titleM = /<h2\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        var title = titleM ? T4_text(titleM[1]) : "";
        if (!title && hm) {
            var tm = /title="([^"]*)"/i.exec(hm[0]);
            if (tm) title = T4_decode(tm[1]);
        }
        if (!title) continue;

        var coverM = /<img\b[^>]*src="([^"]+)"/i.exec(chunk);
        var authorM = /<a\b[^>]*rel="author"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
        if (!authorM) authorM = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);

        seen[href] = 1;
        out.push({
            title: title,
            link: href,
            coverUrl: coverM ? T4_abs(coverM[1]) : null,
            author: authorM ? (T4_text(authorM[1]) || null) : null,
            latestChapter: null
        });
    }

    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;

    var s = String(html == null ? "" : html);
    /* Chỉ xét cụm phân trang, không quét toàn trang (tránh link lạ). */
    var pi = s.indexOf("pagination-control");
    if (pi < 0) return "";
    var pe = s.indexOf("</ul>", pi);
    var block = s.substring(pi, pe > pi ? pe : pi + 4000);

    var best = "";
    var bestNum = 999999;
    var re = /<a\b[^>]*href="([^"]*\?page=(\d+)[^"]*)"[^>]*>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > page && num < bestNum) {
            bestNum = num;
            best = T4_abs(m[1]);
        }
    }
    return best;
}

/* ---------- Detail ---------- */

/* Mục lục đầy đủ: khối ul.chapters ngay sau tiêu đề "Danh sách chương". */
function T4_readChapters(s) {
    var marker = s.indexOf("Danh s\u00e1ch ch\u01b0\u01a1ng");
    var start = marker >= 0 ? s.indexOf('<ul class="chapters">', marker) : -1;
    if (start < 0) start = s.lastIndexOf('<ul class="chapters">');
    if (start < 0) return [];

    var end = s.indexOf("</ul>", start);
    var block = s.substring(start, end > start ? end : s.length);

    var out = [];
    var seen = {};
    var order = {};
    /* Chương đánh số + phiên ngoại; bỏ link tin tức/fanfic trong cùng khối. */
    var re = /<a\b[^>]*href="([^"]*\/(?:chuong|phien-ngoai)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var link = T4_abs(m[1]);
        if (!link || seen[link]) continue;
        var title = T4_text(m[2]);
        if (!title) {
            var tm = /title="([^"]*)"/i.exec(m[0]);
            if (tm) title = T4_decode(tm[1]);
        }
        if (!title) continue;
        seen[link] = 1;
        order[link] = out.length;
        out.push({ title: title, link: link });
    }

    out.sort(function (a, b) {
        var na = T4_chapterNo(a.link);
        var nb = T4_chapterNo(b.link);
        if (na > 0 && nb > 0) return na - nb;
        if (na > 0) return -1;
        if (nb > 0) return 1;
        return order[a.link] - order[b.link];
    });
    return out;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h1\b[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (!tm) tm = /<h1\b[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (tm) title = T4_text(tm[1]);
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = T4_decode(og[1]);
    }

    var coverUrl = null;
    var cm = /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(s);
    if (cm) coverUrl = T4_abs(cm[1]);
    if (!coverUrl) {
        var im = /<img\b[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i.exec(s);
        if (!im) im = /<img\b[^>]*src="([^"]+)"[^>]*class="[^"]*cover[^"]*"/i.exec(s);
        if (im) coverUrl = T4_abs(im[1]);
    }

    var author = "";
    var am = /<a\b[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (!am) am = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (am) author = T4_text(am[1]);

    var status = "";
    var stm = /<p\b[^>]*class="[^"]*story_completed[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(s);
    if (stm) status = T4_text(stm[1]);

    var genres = [];
    var gseen = {};
    var gre = /<a\b[^>]*itemprop="genre"[^>]*>([\s\S]*?)<\/a>/gi;
    var gm;
    while ((gm = gre.exec(s)) !== null) {
        var g = T4_text(gm[1]).replace(/,\s*$/, "");
        if (!g || gseen[g]) continue;
        gseen[g] = 1;
        genres.push(g);
    }
    if (!genres.length) {
        var gb = s.indexOf('class="story_categories"');
        if (gb >= 0) {
            var gend = s.indexOf("</p>", gb);
            var gblock = s.substring(gb, gend > gb ? gend : gb + 3000);
            var gre2 = /<a\b[^>]*href="[^"]*\/the-loai\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((gm = gre2.exec(gblock)) !== null) {
                var g2 = T4_text(gm[1]).replace(/,\s*$/, "");
                if (!g2 || gseen[g2]) continue;
                gseen[g2] = 1;
                genres.push(g2);
            }
        }
    }

    /* Khối tag-meta (#dammei, #trongsinh…) bổ sung thêm thể loại/từ khoá. */
    var tre = /<a\b[^>]*class="[^"]*tag-item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    var tmn;
    while ((tmn = tre.exec(s)) !== null) {
        var tag = T4_text(tmn[1]).replace(/^#+\s*/, "");
        if (!tag || gseen[tag]) continue;
        gseen[tag] = 1;
        genres.push(tag);
    }

    var description = "";
    var di = s.indexOf('itemprop="description"');
    if (di >= 0) {
        /* di nằm giữa thẻ mở → bỏ phần thuộc tính còn lại, cắt trước tag-meta. */
        var dgt = s.indexOf(">", di);
        var dend = s.indexOf('<div class="tag-meta"', di);
        if (dend < 0) dend = s.indexOf("</div>", di);
        var descBlock = s.substring(dgt >= 0 ? dgt + 1 : di, dend > di ? dend : di + 20000);
        var dtext = T4_text(descBlock);
        var lines = dtext.split(/\n+/);
        var kept = [];
        for (var i = 0; i < lines.length; i++) {
            var line = T4_trim(lines[i]);
            if (!line) continue;
            if (/^t\u00e1c gi\u1ea3\s*:/i.test(line) || /^th\u1ec3 lo\u1ea1i\s*:/i.test(line)) continue;
            if (!kept.length && title && line === title) continue;
            kept.push(line);
        }
        description = kept.join("\n");
    }
    if (!description) {
        var dm = /<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i.exec(s);
        if (dm) description = T4_decode(dm[1]);
    }

    return JSON.stringify({
        title: title || (url || ""),
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: T4_readChapters(s),
        chapterPages: []
    });
}

function parseNovelChapters(html) {
    return JSON.stringify(T4_readChapters(String(html == null ? "" : html)));
}

/* ---------- Chapter ---------- */

function T4_navLink(s, cls) {
    var re = /<a\b[^>]*>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var tag = m[0];
        var cm = /class="([^"]*)"/i.exec(tag);
        if (!cm || cm[1].indexOf(cls) < 0) continue;
        if (cm[1].indexOf("disabled") >= 0) return "";
        var hm = /href="([^"]+)"/i.exec(tag);
        if (!hm) continue;
        var href = T4_trim(hm[1]);
        if (!href || href === "#") return "";
        return T4_abs(href);
    }
    return "";
}

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h2\b[^>]*class="[^"]*chapter-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i.exec(s);
    if (!tm) tm = /<h2\b[^>]*id="chapter"[^>]*>([\s\S]*?)<\/h2>/i.exec(s);
    if (tm) title = T4_text(tm[1]);
    if (!title) {
        var tt = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (tt) title = T4_text(tt[1]).split(" - ")[0];
    }

    var prevLink = T4_navLink(s, "prevChapter");
    var nextLink = T4_navLink(s, "nextChapter");

    var start = s.indexOf('<div class="chapter-content">');
    var region = "";
    if (start >= 0) {
        var end = s.indexOf('<div class="chapter-button"', start);
        region = s.substring(start, end > start ? end : start + 500000);
        /* Dòng "Bạn đang đọc truyện trên: Truyen4U.Com" nằm sau nội dung. */
        region = region.replace(/<p\b[^>]*class="[^"]*chapter-end[^"]*"[^>]*>[\s\S]*?<\/p>/gi, "");
    }

    var paragraphs = [];
    var parts = region.split(/<p\b[^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var stop = parts[i].indexOf("</p>");
        var line = T4_text(stop >= 0 ? parts[i].substring(0, stop) : parts[i]);
        if (line) paragraphs.push(line);
    }
    if (!paragraphs.length) {
        paragraphs = ["Không tải được nội dung chương này từ Truyen4U. Thử lại sau hoặc đọc trên website."];
    }

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
        "User-Agent": T4_UA,
        "Referer": T4_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Truyện Teen","url":"https://truyen4u.com/the-loai/truyen-teen/"},
        {"title":"Fan Fiction","url":"https://truyen4u.com/the-loai/fanfiction/"},
        {"title":"Hư Cấu","url":"https://truyen4u.com/the-loai/hu-cau/"},
        {"title":"Thơ Ca","url":"https://truyen4u.com/the-loai/tho-ca/"},
        {"title":"Viễn Tưởng","url":"https://truyen4u.com/the-loai/vien-tuong/"},
        {"title":"Lãng Mạn","url":"https://truyen4u.com/the-loai/lang-man/"},
        {"title":"ChickLit","url":"https://truyen4u.com/the-loai/chicklit/"},
        {"title":"Hài Hước","url":"https://truyen4u.com/the-loai/hai-huoc/"},
        {"title":"Bí Ẩn","url":"https://truyen4u.com/the-loai/bi-an/"},
        {"title":"Kinh Dị","url":"https://truyen4u.com/the-loai/kinh-di/"},
        {"title":"Cổ Điển","url":"https://truyen4u.com/the-loai/co-dien/"},
        {"title":"Phiêu Lưu","url":"https://truyen4u.com/the-loai/phieu-luu/"},
        {"title":"Siêu Nhiên","url":"https://truyen4u.com/the-loai/sieu-nhien/"},
        {"title":"Tâm Linh","url":"https://truyen4u.com/the-loai/tam-linh/"},
        {"title":"Hành Động","url":"https://truyen4u.com/the-loai/hanh-dong/"},
        {"title":"Phi Tiểu Thuyết","url":"https://truyen4u.com/the-loai/phi-tieu-thuyet/"},
        {"title":"Truyện Ngắn","url":"https://truyen4u.com/the-loai/truyen-ngan/"},
        {"title":"Ma Cà Rồng","url":"https://truyen4u.com/the-loai/ma-ca-rong/"},
        {"title":"Ngẫu Nhiên","url":"https://truyen4u.com/the-loai/ngau-nhien/"},
        {"title":"Tiểu Thuyết","url":"https://truyen4u.com/the-loai/tieu-thuyet/"},
        {"title":"Người Sói","url":"https://truyen4u.com/the-loai/nguoi-soi/"},
        {"title":"Lịch Sử","url":"https://truyen4u.com/the-loai/lich-su/"},
        {"title":"LGBT","url":"https://truyen4u.com/the-loai/lgbt/"},
        {"title":"Thriller","url":"https://truyen4u.com/the-loai/thriller/"},
        {"title":"Đam Mỹ","url":"https://truyen4u.com/the-loai/dam-my/"},
        {"title":"Ngôn Tình","url":"https://truyen4u.com/the-loai/ngon-tinh/"},
        {"title":"Xuyên Không","url":"https://truyen4u.com/the-loai/xuyen-khong/"},
        {"title":"Đô Thị","url":"https://truyen4u.com/the-loai/do-thi/"}
    ]);
}
