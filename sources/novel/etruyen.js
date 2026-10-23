/*
 * Etruyen.online — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> "" (site không phân trang danh sách)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]  (trang mục lục ?page=N)
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *  - getNovelCategories()                -> [{ title, url }]
 *
 * Lưu ý của site:
 *  - Truyện: /truyen/<slug>; chương: /truyen/<slug>/chuong-<n>.
 *  - Danh sách (/danh-sach/new, /the-loai/<slug>, /tim-kiem?key_word=) trả 1 trang
 *    duy nhất, KHÔNG phân trang (đã thử ?page=, ?p=, /2 đều trùng nội dung).
 *  - Mục lục ở trang truyện chia 50 chương/trang bằng ?page=N; tổng số trang suy từ
 *    "Số chương đã ra" → trả về chapterPages để app tải tiếp.
 *  - Truyện trả phí: mục lục trang 1 chỉ có chương đọc thử, chương khoá hiện
 *    "Nội dung bị khoá" → script trả 1 đoạn thông báo thay vì nội dung.
 *  - Nội dung nằm trong div.chapter-content > .content-chapter > article, các đoạn là <p>.
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var ET_HOST = "https://etruyen.online";
var ET_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
var ET_PAGE_SIZE = 50;
var ET_MAX_PAGES = 40;
var ET_LOCK_NOTICE = "Chương này đang bị khoá trên Etruyen.online (truyện trả phí), nên app không đọc được nội dung. Bạn có thể mở website để mua/mở khoá.";

/* ---------- Helpers ---------- */

var ET_ENTITIES = {
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

function ET_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function ET_decode(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return ET_char(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return ET_char(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (all, name) {
            return ET_ENTITIES.hasOwnProperty(name) ? ET_ENTITIES[name] : all;
        });
    }
    return out;
}

function ET_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function ET_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = ET_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return ET_trim(s);
}

function ET_abs(u) {
    u = ET_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return ET_HOST + u;
    return ET_HOST + "/" + u;
}

function ET_attr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return m[2] != null ? m[2] : m[3];
}

/* Lấy giá trị href của thẻ <a> đầu tiên có class chứa `cls`. */
function ET_linkByClass(s, cls) {
    var re = /<a\b[^>]*>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var tag = m[0];
        if (!new RegExp("\\b" + cls + "\\b", "i").test(ET_attr(tag, "class"))) continue;
        var href = ET_attr(tag, "href");
        if (!href) continue;
        var abs = ET_abs(href);
        if (abs.indexOf("/dang-nhap") >= 0 || abs.indexOf("/dang-ky") >= 0) continue;
        return abs;
    }
    return "";
}

function ET_chapterNo(url) {
    var m = /chuong-(\d+(?:\.\d+)?)/i.exec(String(url == null ? "" : url));
    return m ? parseFloat(m[1]) : 0;
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "etruyen",
        name: "Etruyen",
        faviconUrl: "https://www.google.com/s2/favicons?domain=etruyen.online&sz=64",
        baseUrl: ET_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    return ET_HOST + "/danh-sach/new";
}

function getNovelSearchRequest(query, page) {
    var url = ET_HOST + "/tim-kiem?key_word=" + encodeURIComponent(ET_trim(query));
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": ET_UA,
            "Referer": ET_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi,en;q=0.8"
        }
    });
}

/* ---------- List ---------- */

/*
 * Hai kiểu thẻ trên site đều mở đầu bằng <div class="story-item…">:
 *  - story-item      (lưới: danh sách / thể loại) — không có tác giả
 *  - story-item-list (hàng ngang: kết quả tìm kiếm) — có tác giả
 * Tách theo thẻ mở rồi lấy phần tử đầu tiên trong mỗi khối. Lookahead loại
 * `story-item__image` (thẻ con) để không cắt vụn mỗi thẻ truyện.
 */
function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/<div class="story-item(?:-list)?(?=[\s"])/i);

    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var gt = chunk.indexOf(">");
        if (gt >= 0) chunk = chunk.substring(gt + 1);

        var href = "";
        var re = /<a\b[^>]*>/gi;
        var m;
        while ((m = re.exec(chunk)) !== null) {
            var link = ET_attr(m[0], "href");
            if (!link || link.indexOf("/truyen/") < 0) continue;
            href = ET_abs(link);
            break;
        }
        if (!href || seen[href]) continue;

        var titleM = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
        var title = titleM ? ET_text(titleM[1]) : "";
        if (!title) {
            var altM = /<img\b[^>]*alt="([^"]*)"/i.exec(chunk);
            title = altM ? ET_decode(altM[1]) : "";
        }
        if (!title) continue;

        seen[href] = 1;
        var coverM = /<img\b[^>]*src="([^"]+)"/i.exec(chunk);
        var authorM = /<a\b[^>]*class="[^"]*author-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);

        out.push({
            title: title,
            link: href,
            coverUrl: coverM ? ET_abs(coverM[1]) : null,
            author: authorM ? ET_text(authorM[1]) : null,
            latestChapter: null
        });
    }

    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    /* Danh sách của site trả 1 trang duy nhất, không có phân trang. */
    return "";
}

/* ---------- Detail ---------- */

/* Mục lục trong .story-detail__list-chapter--list, tăng dần theo số chương. */
function ET_readChapters(s) {
    var start = s.indexOf("story-detail__list-chapter--list");
    if (start < 0) return [];
    var end = s.indexOf('class="pagination"', start);
    var block = s.substring(start, end > start ? end : s.length);

    var out = [];
    var seen = {};
    var re = /<a\b[^>]*href="([^"]*\/chuong-[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(block)) !== null) {
        var link = ET_abs(m[1]);
        if (!link || seen[link]) continue;
        var title = ET_text(m[2]);
        if (!title) continue;
        seen[link] = 1;
        out.push({ title: title, link: link });
    }

    out.sort(function (a, b) {
        return ET_chapterNo(a.link) - ET_chapterNo(b.link);
    });
    return out;
}

function ET_declaredChapters(s) {
    var m = /S\u1ed1 ch\u01b0\u01a1ng \u0111\u00e3 ra:<\/strong>\s*<span>(\d+)/i.exec(s);
    if (m) return parseInt(m[1], 10);
    var m2 = /<span>(\d+)<\/span>\s*<\/p>/i.exec(s);
    return m2 ? parseInt(m2[1], 10) : 0;
}

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h1\b[^>]*class="[^"]*story-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (!tm) tm = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (tm) title = ET_text(tm[1]);
    if (!title) {
        var og = /<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(s);
        if (og) title = ET_decode(og[1]);
    }

    var coverUrl = null;
    var cm = /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(s);
    if (cm && !/preview_share|logo/i.test(cm[1])) coverUrl = ET_abs(cm[1]);
    if (!coverUrl) {
        var im = /<img\b[^>]*src="([^"]*(?:trquyen\.8cache\.com|\/images\/story\/)[^"]*)"/i.exec(s);
        if (im) coverUrl = ET_abs(im[1]);
    }

    var author = "";
    var am = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (am) author = ET_text(am[1]);

    var status = "";
    var stm = /<strong>\s*Tr\u1ea1ng th\u00e1i:\s*<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/i.exec(s);
    if (stm) status = ET_text(stm[1]);

    var description = "";
    var di = s.indexOf("story-detail__top--desc");
    if (di >= 0) {
        var dj = s.indexOf("info-more", di);
        var descBlock = s.substring(di, dj > di ? dj : di + 60000);
        var parts = descBlock.split(/<p\b[^>]*>/i);
        var lines = [];
        for (var i = 1; i < parts.length; i++) {
            var stop = parts[i].indexOf("</p>");
            var line = ET_text(stop >= 0 ? parts[i].substring(0, stop) : parts[i]);
            if (line) lines.push(line);
        }
        description = lines.join("\n");
    }
    if (!description) {
        var dm = /<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i.exec(s);
        if (dm) description = ET_decode(dm[1]);
    }

    var genres = [];
    var gseen = {};
    var gi = s.indexOf("Th\u1ec3 lo\u1ea1i:");
    if (gi >= 0) {
        var gj = s.indexOf("S\u1ed1 ch\u01b0\u01a1ng \u0111\u00e3 ra", gi);
        var gblock = s.substring(gi, gj > gi ? gj : gi + 5000);
        var gre = /<a\b[^>]*href="[^"]*\/the-loai\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var gm;
        while ((gm = gre.exec(gblock)) !== null) {
            var g = ET_text(gm[1]).replace(/,\s*$/, "");
            if (!g || gseen[g]) continue;
            gseen[g] = 1;
            genres.push(g);
        }
    }

    var chapters = ET_readChapters(s);

    /* Mục lục 50 chương/trang: trang 2..N là "<truyện>?page=k". */
    var chapterPages = [];
    var declared = ET_declaredChapters(s);
    var total = Math.ceil((declared || chapters.length) / ET_PAGE_SIZE);
    if (total > ET_MAX_PAGES) total = ET_MAX_PAGES;
    var base = ET_trim(url).replace(/[?#].*$/, "");
    for (var p = 2; p <= total; p++) chapterPages.push(base + "?page=" + p);

    return JSON.stringify({
        title: title,
        coverUrl: coverUrl,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters,
        chapterPages: chapterPages
    });
}

function parseNovelChapters(html) {
    return JSON.stringify(ET_readChapters(String(html == null ? "" : html)));
}

/* ---------- Chapter ---------- */

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var title = "";
    var tm = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(s);
    if (tm) title = ET_text(tm[1]);
    if (!/^ch\u01b0\u01a1ng/i.test(title)) {
        var tt = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (tt) {
            var pageTitle = ET_text(tt[1]).replace(/\s*-\s*Etruyen\.online\s*$/i, "");
            var cm = /(Ch\u01b0\u01a1ng\s*\d+[^\-]*)/i.exec(pageTitle);
            title = cm ? ET_trim(cm[1]) : pageTitle;
        }
    }

    var prevLink = ET_linkByClass(s, "chapter-prev");
    var nextLink = ET_linkByClass(s, "chapter-next");

    var cap = 'class="chapter-content mb-3"';
    var start = s.indexOf(cap);
    var region = "";
    if (start >= 0) {
        var endTag = s.indexOf("</article>", start);
        region = s.substring(start, endTag > start ? endTag : start + 400000);
    }

    var paragraphs = [];
    if (/N\u1ed9i dung b\u1ecb kho\u00e1/i.test(region)) {
        paragraphs.push(ET_LOCK_NOTICE);
    } else {
        var parts = region.split(/<p\b[^>]*>/i);
        for (var i = 1; i < parts.length; i++) {
            var stop = parts[i].indexOf("</p>");
            var line = ET_text(stop >= 0 ? parts[i].substring(0, stop) : parts[i]);
            if (line) paragraphs.push(line);
        }
    }
    if (!paragraphs.length) {
        paragraphs = ["Không tải được nội dung chương này từ Etruyen.online. Thử lại sau hoặc đọc trên website."];
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
        "User-Agent": ET_UA,
        "Referer": ET_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Ngôn Tình","url":"https://etruyen.online/the-loai/ngon-tinh"},
        {"title":"Đô Thị","url":"https://etruyen.online/the-loai/do-thi"},
        {"title":"Hiện Đại","url":"https://etruyen.online/the-loai/hien-dai"},
        {"title":"Hào Môn","url":"https://etruyen.online/the-loai/hao-mon"},
        {"title":"Ngọt Sủng","url":"https://etruyen.online/the-loai/ngot-sung"},
        {"title":"Showbiz","url":"https://etruyen.online/the-loai/showbiz"},
        {"title":"Cổ Đại","url":"https://etruyen.online/the-loai/co-dai"},
        {"title":"Huyền Huyễn","url":"https://etruyen.online/the-loai/huyen-huyen"},
        {"title":"Xuyên Không","url":"https://etruyen.online/the-loai/xuyen-khong"},
        {"title":"Đam Mỹ","url":"https://etruyen.online/the-loai/dam-my"},
        {"title":"Linh Dị","url":"https://etruyen.online/the-loai/linh-di"},
        {"title":"Trọng Sinh","url":"https://etruyen.online/the-loai/trong-sinh"},
        {"title":"Gia Đấu","url":"https://etruyen.online/the-loai/gia-dau"},
        {"title":"HE","url":"https://etruyen.online/the-loai/he"},
        {"title":"Tình Cảm","url":"https://etruyen.online/the-loai/tinh-cam"},
        {"title":"Nhẹ Nhàng","url":"https://etruyen.online/the-loai/nhe-nhang"},
        {"title":"Cưới Trước Yêu Sau","url":"https://etruyen.online/the-loai/cuoi-truoc-yeu-sau"},
        {"title":"Khoa Huyễn","url":"https://etruyen.online/the-loai/khoa-huyen"},
        {"title":"Mạt Thế","url":"https://etruyen.online/the-loai/mat-the"},
        {"title":"Hỗ Công","url":"https://etruyen.online/the-loai/ho-cong"},
        {"title":"Tương Lai","url":"https://etruyen.online/the-loai/tuong-lai"},
        {"title":"Gương Vỡ Lại Lành","url":"https://etruyen.online/the-loai/guong-vo-lai-lanh"},
        {"title":"Điền Văn","url":"https://etruyen.online/the-loai/dien-van"},
        {"title":"Sủng","url":"https://etruyen.online/the-loai/sung"},
        {"title":"Sinh Tồn","url":"https://etruyen.online/the-loai/sinh-ton"},
        {"title":"Dị Năng","url":"https://etruyen.online/the-loai/di-nang"},
        {"title":"Sảng Văn","url":"https://etruyen.online/the-loai/sang-van"},
        {"title":"Kinh Dị","url":"https://etruyen.online/the-loai/kinh-di"},
        {"title":"Báo Thù","url":"https://etruyen.online/the-loai/bao-thu"},
        {"title":"Nữ Cường","url":"https://etruyen.online/the-loai/nu-cuong"},
        {"title":"Thanh Xuân Vườn Trường","url":"https://etruyen.online/the-loai/thanh-xuan-vuon-truong"},
        {"title":"Tiên Hiệp","url":"https://etruyen.online/the-loai/tien-hiep"},
        {"title":"Hoàng Cung","url":"https://etruyen.online/the-loai/hoang-cung"},
        {"title":"Hài Hước","url":"https://etruyen.online/the-loai/hai-huoc"},
        {"title":"Tổng Tài","url":"https://etruyen.online/the-loai/tong-tai"},
        {"title":"Ngược","url":"https://etruyen.online/the-loai/nguoc"},
        {"title":"Hệ Thống","url":"https://etruyen.online/the-loai/he-thong"},
        {"title":"Chữa Lành","url":"https://etruyen.online/the-loai/chua-lanh"},
        {"title":"Cung Đấu","url":"https://etruyen.online/the-loai/cung-dau"},
        {"title":"Xuyên Sách","url":"https://etruyen.online/the-loai/xuyen-sach"},
        {"title":"Dị Giới","url":"https://etruyen.online/the-loai/di-gioi"},
        {"title":"Nữ Phụ","url":"https://etruyen.online/the-loai/nu-phu"},
        {"title":"Vả Mặt","url":"https://etruyen.online/the-loai/va-mat"},
        {"title":"Cận Đại","url":"https://etruyen.online/the-loai/can-dai"},
        {"title":"Nhân Thú","url":"https://etruyen.online/the-loai/nhan-thu"},
        {"title":"Trinh Thám","url":"https://etruyen.online/the-loai/trinh-tham"},
        {"title":"Võ Hiệp","url":"https://etruyen.online/the-loai/vo-hiep"},
        {"title":"Tình Cảm Gia Đình","url":"https://etruyen.online/the-loai/tinh-cam-gia-dinh"},
        {"title":"Thiên Kim","url":"https://etruyen.online/the-loai/thien-kim"},
        {"title":"Xuyên Nhanh","url":"https://etruyen.online/the-loai/xuyen-nhanh"},
        {"title":"Truyện Ngắn","url":"https://etruyen.online/the-loai/truyen-ngan"},
        {"title":"Thế Thân","url":"https://etruyen.online/the-loai/the-than"},
        {"title":"Đoản Văn","url":"https://etruyen.online/the-loai/doan-van"},
        {"title":"Tiểu Thuyết","url":"https://etruyen.online/the-loai/tieu-thuyet"},
        {"title":"Võng Du","url":"https://etruyen.online/the-loai/vong-du"}
    ]);
}
