/*
 * Webnovel.vn — nguồn truyện chữ dạng JS, tải từ catalog GitHub.
 *
 * Hợp đồng với app (xem JsNovelSite.kt):
 *  - getNovelSource()                    -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)               -> URL trang danh sách (1-based)
 *  - getNovelSearchRequest(query, page)  -> { url, method, body, headers }
 *  - parseNovelList(html, url)           -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> URL trang kế tiếp ("" = hết)
 *  - parseNovelDetail(html, url)         -> { title, coverUrl, author, description, status,
 *                                             genres, chapters:[{title,link}], chapterPages:[url] }
 *  - parseNovelChapters(html)            -> [{ title, link }]  (trang mục lục phụ /<N>/)
 *  - parseNovelChapter(html, url)        -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                -> { Referer: "..." }
 *  - getNovelCategories()                -> [{ title, url }]
 *
 * Lưu ý của site:
 *  - Mục lục chia 20 chương/trang, trang N = "<truyện>/<N>/" (trang 1 là chính URL truyện).
 *  - Chương 1..20 đọc miễn phí; từ chương 21 nội dung thay bằng nút "Click để xem"
 *    (trả xu) → script trả 1 đoạn thông báo thay vì nội dung.
 *  - Nội dung chương ngăn cách bằng <br><br>, có banner .bastorypush chèn giữa.
 *
 * Mọi hàm trả JSON string (Rhino không tự chuyển object sang Java).
 * ES5 thuần: không optional chaining, nullish coalescing, template literal, arrow function.
 */

var WN_HOST = "https://webnovel.vn";
var WN_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
var WN_FREE_LIMIT = 20;
var WN_LOCKED_NOTICE = "Chương này thuộc phần trả phí của Webnovel.vn (cần mở khoá bằng xu trên website), nên app không đọc được nội dung.";

/* ---------- Helpers ---------- */

function WN_trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function WN_decode(s) {
    var out = String(s == null ? "" : s);
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (all, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    });
    out = out.replace(/&#(\d+);/g, function (all, dec) {
        return String.fromCharCode(parseInt(dec, 10));
    });
    out = out.replace(/&nbsp;/gi, " ")
        .replace(/&ndash;/gi, "\u2013").replace(/&mdash;/gi, "\u2014")
        .replace(/&hellip;/gi, "\u2026").replace(/&ldquo;/gi, "\u201c")
        .replace(/&rdquo;/gi, "\u201d").replace(/&laquo;/gi, "\u00ab")
        .replace(/&raquo;/gi, "\u00bb").replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"").replace(/&#39;/g, "'");
    return out;
}

function WN_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = WN_decode(s);
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/\n{3,}/g, "\n\n");
    return WN_trim(s);
}

function WN_abs(u) {
    if (!u) return "";
    u = WN_trim(u);
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return WN_HOST + u;
    return WN_HOST + "/" + u;
}

function WN_num(s) {
    var m = /(\d+)/.exec(String(s == null ? "" : s));
    return m ? parseInt(m[1], 10) : 0;
}

/* Chương > 20 bị khoá (chỉ đọc được 20 chương đầu) → ghi rõ trong tiêu đề. */
function WN_chapterTitle(title, link) {
    var t = WN_trim(title);
    var urlNum = WN_num((/\/chuong-(\d+)\//.exec(String(link)) || [])[1]);
    var n = urlNum || WN_num(t);
    if (t && n > WN_FREE_LIMIT) return t + " (khoá)";
    return t;
}

function WN_pushChapter(out, seen, href, titleHtml) {
    var link = WN_abs(href);
    if (!link || seen[link]) return;
    var title = WN_text(titleHtml);
    if (!title) return;
    seen[link] = 1;
    out.push({ title: WN_chapterTitle(title, link), link: link });
}

function WN_parseChapterAnchors(html, out, seen) {
    var re = /<a[^>]+href="([^"]*\/chuong-\d+\/)"[^>]*class="chapter-item__link"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var titleM = /<span class="chapter-item__title"[^>]*>([\s\S]*?)<\/span>/i.exec(m[2]);
        WN_pushChapter(out, seen, m[1], titleM ? titleM[1] : m[2]);
    }
}

/* ---------- Source ---------- */

function getNovelSource() {
    return JSON.stringify({
        id: "webnovelvn",
        name: "Webnovel.vn",
        faviconUrl: "https://www.google.com/s2/favicons?domain=webnovel.vn&sz=64",
        baseUrl: WN_HOST,
        searchable: true
    });
}

function getNovelHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page <= 1) return WN_HOST + "/truyen-moi-dang/";
    return WN_HOST + "/truyen-moi-dang/" + page + "/";
}

function getNovelSearchRequest(query, page) {
    var url = WN_HOST + "/tim-kiem/?q=" + encodeURIComponent(String(query == null ? "" : query));
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": WN_UA,
            "Referer": WN_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });
}

/* ---------- List ---------- */

function parseNovelList(html, url) {
    var out = [];
    var seen = {};
    var s = String(html == null ? "" : html);
    var parts = s.split(/class="catx-card__wrapper"/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf('class="catx-card__wrapper"');
        if (cut > 0) chunk = chunk.substring(0, cut);

        var linkM = /<a[^>]+class="catx-card"[^>]*href="([^"]+)"/i.exec(chunk);
        if (!linkM) linkM = /<h3 class="catx-card__title"[^>]*>\s*<a[^>]+href="([^"]+)"/i.exec(chunk);
        if (!linkM) continue;
        var link = WN_abs(linkM[1]);
        if (seen[link]) continue;
        seen[link] = 1;

        var titleM = /<h3 class="catx-card__title"[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
        var title = titleM ? WN_text(titleM[1]) : "";
        if (!title) {
            title = WN_decode((/title="([^"]+)"/i.exec(linkM[0]) || [])[1] || "");
        }
        if (!title) continue;

        var coverM = /<img[^>]+src="([^"]+)"/i.exec(chunk);
        if (!coverM) coverM = /<meta itemprop="image" content="([^"]+)"/i.exec(chunk);

        var authorM = /data-att="author"[^>]*>([\s\S]*?)<\/span>/i.exec(chunk);
        var author = authorM ? WN_text(authorM[1]) : "";

        out.push({
            title: title,
            link: link,
            coverUrl: coverM ? WN_abs(coverM[1]) : null,
            author: author || null,
            latestChapter: null
        });
    }
    return JSON.stringify(out);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var s = String(html == null ? "" : html);
    var re = /<a\b[^>]*>/gi;
    var m;
    var best = "";
    var bestNum = 999999;
    while ((m = re.exec(s)) !== null) {
        var tag = m[0];
        var pageM = /data-page="(\d+)"/i.exec(tag);
        var hrefM = /href="([^"]+)"/i.exec(tag);
        if (!pageM || !hrefM) continue;
        var num = parseInt(pageM[1], 10);
        if (!isNaN(num) && num > page && num < bestNum) {
            bestNum = num;
            best = WN_abs(hrefM[1]);
        }
    }
    return best;
}

/* ---------- Detail ---------- */

function parseNovelDetail(html, url) {
    var s = String(html == null ? "" : html);

    var titleM = /<h1 id="book-detail-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    var title = titleM ? WN_text(titleM[1]) : "";
    if (!title) {
        var og = /<meta property="og:title" content="([^"]+)"/i.exec(s);
        if (og) title = WN_decode(og[1]);
    }

    var coverM = /<figure class="book-detail__cover">[\s\S]*?<img[^>]+src="([^"]+)"/i.exec(s);
    var coverUrl = coverM ? WN_abs(coverM[1]) : null;

    var authorM = /<a href="https:\/\/webnovel\.vn\/tac-gia\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    var author = authorM ? WN_text(authorM[1]) : "";

    var statusM = /<span class="status__text"[^>]*>([\s\S]*?)<\/span>/i.exec(s);
    var status = statusM ? WN_text(statusM[1]) : "";

    var genres = [];
    var gseen = {};
    var gre = /<a class="genre"[^>]*>([\s\S]*?)<\/a>/gi;
    var gm;
    while ((gm = gre.exec(s)) !== null) {
        var g = WN_text(gm[1]);
        if (g && !gseen[g]) { gseen[g] = 1; genres.push(g); }
    }

    var description = "";
    var descM = /<div class="book-detail__summary"[^>]*>([\s\S]*?)<\/div>/i.exec(s);
    if (descM) {
        description = WN_text(descM[1]);
    }

    var chapters = [];
    var seenCh = {};
    WN_parseChapterAnchors(s, chapters, seenCh);

    // Các trang mục lục phụ: "<truyện>/<N>/" — lấy số trang lớn nhất trong pagination.
    var bookUrl = String(url || "").replace(/\/\d+\/?#?.*$/, "/");
    var chapterPages = [];
    var maxPage = 0;
    var pre = /data-page="(\d+)"/gi;
    var pm;
    while ((pm = pre.exec(s)) !== null) {
        var num = parseInt(pm[1], 10);
        if (!isNaN(num) && num > maxPage) maxPage = num;
    }
    for (var p = 2; p <= maxPage; p++) chapterPages.push(bookUrl + p + "/");

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
    WN_parseChapterAnchors(String(html == null ? "" : html), out, seen);
    return JSON.stringify(out);
}

/* ---------- Chapter content ---------- */

function parseNovelChapter(html, url) {
    var s = String(html == null ? "" : html);

    var chapterM = /<p class="reader__chapter"[^>]*>([\s\S]*?)<\/p>/i.exec(s);
    var title = chapterM ? WN_text(chapterM[1]) : "";
    if (!title) {
        var tM = /<title>([\s\S]*?)<\/title>/i.exec(s);
        if (tM) title = WN_trim(WN_text(tM[1]).split(" - ")[0]);
    }

    var startIdx = s.indexOf('id="chapter-c"');
    var endIdx = s.indexOf("</article>", startIdx);
    if (endIdx < 0) endIdx = s.indexOf('class="reader__actions"', startIdx);
    var block = "";
    if (startIdx >= 0) {
        var from = s.indexOf(">", startIdx);
        var to = (endIdx > startIdx) ? endIdx : (startIdx + 200000);
        if (from >= 0) block = s.substring(from + 1, to);
    }

    var prevM = /<a[^>]+href="([^"]+)"[^>]*rel="prev"/i.exec(s);
    if (!prevM) prevM = /<a[^>]+rel="prev"[^>]*href="([^"]+)"/i.exec(s);
    var nextM = /<a[^>]+href="([^"]+)"[^>]*rel="next"/i.exec(s);
    if (!nextM) nextM = /<a[^>]+rel="next"[^>]*href="([^"]+)"/i.exec(s);
    var prevLink = prevM ? WN_abs(prevM[1]) : "";
    var nextLink = nextM ? WN_abs(nextM[1]) : "";
    if (prevLink.indexOf("javascript:") >= 0) prevLink = "";
    if (nextLink.indexOf("javascript:") >= 0) nextLink = "";

    // Chương trả phí: nội dung thay bằng widget "Click để xem" (trả xu) → báo rõ.
    if (/unlock__full|click-to-show/i.test(block)) {
        return JSON.stringify({
            title: title, paragraphs: [WN_LOCKED_NOTICE],
            prevLink: prevLink, nextLink: nextLink
        });
    }

    block = block
        .replace(/<div class="bastorypush"[\s\S]*?<\/div>/gi, " ")
        .replace(/<div class="storypush"[\s\S]*?<\/div>/gi, " ")
        .replace(/<p class="storypush"[\s\S]*?<\/p>/gi, " ");

    var paragraphs = [];
    var parts = WN_text(block).split(/\n+/);
    for (var i = 0; i < parts.length; i++) {
        var t = WN_trim(parts[i]);
        if (t) paragraphs.push(t);
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
        "User-Agent": WN_UA,
        "Referer": WN_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });
}

/* ---------- Categories ---------- */

function getNovelCategories() {
    return JSON.stringify([
        {"title":"Mới cập nhật","url":"https://webnovel.vn/all/"},
        {"title":"Mới đăng","url":"https://webnovel.vn/truyen-moi-dang/"},
        {"title":"Yêu thích","url":"https://webnovel.vn/truyen-duoc-yeu-thich-nhat/"},
        {"title":"Xem nhiều","url":"https://webnovel.vn/truyen-duoc-xem-nhieu-nhat/"},
        {"title":"Truyện Full","url":"https://webnovel.vn/truyen-full/"},
        {"title":"Tiên Hiệp","url":"https://webnovel.vn/tien-hiep/"},
        {"title":"Kiếm Hiệp","url":"https://webnovel.vn/kiem-hiep/"},
        {"title":"Ngôn Tình","url":"https://webnovel.vn/ngon-tinh/"},
        {"title":"Xuyên Không","url":"https://webnovel.vn/xuyen-khong/"},
        {"title":"Trọng Sinh","url":"https://webnovel.vn/trong-sinh/"},
        {"title":"Điền Văn","url":"https://webnovel.vn/dien-van/"},
        {"title":"Huyền Huyễn","url":"https://webnovel.vn/huyen-huyen/"},
        {"title":"Cổ Đại","url":"https://webnovel.vn/co-dai/"},
        {"title":"Hiện Đại","url":"https://webnovel.vn/hien-dai/"},
        {"title":"Tổng Tài","url":"https://webnovel.vn/tong-tai/"},
        {"title":"Đô Thị","url":"https://webnovel.vn/do-thi/"},
        {"title":"Quan Trường","url":"https://webnovel.vn/quan-truong/"},
        {"title":"Lịch Sử","url":"https://webnovel.vn/lich-su/"},
        {"title":"Thập Niên 60 70 80","url":"https://webnovel.vn/thap-nien-60-70-80/"},
        {"title":"Hệ Thống","url":"https://webnovel.vn/he-thong/"},
        {"title":"Võng Du","url":"https://webnovel.vn/vong-du/"},
        {"title":"Tâm Linh","url":"https://webnovel.vn/tam-linh/"},
        {"title":"Kinh Doanh","url":"https://webnovel.vn/kinh-doanh/"}
    ]);
}
