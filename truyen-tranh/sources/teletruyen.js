/*
 * Nguồn truyện tranh TeleTruyen (teletruyen.com) — chạy trong Rhino (ES5).
 *
 * Hợp đồng (tất cả trả JSON string):
 *  - getComicSource()                       -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getComicHomeUrl(page)                  -> string
 *  - getComicSearchRequest(query, page)     -> { url, method, body, headers }
 *  - parseComicList(html, url)              -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getComicNextPageUrl(currentUrl, page, html) -> string ("" nếu hết trang)
 *  - parseComicDetail(html, url)            -> { title, coverUrl, author, description, chapters:[{title,link}] }
 *  - parseComicChapter(html, url)           -> { title, imageUrls:[...], prevLink, nextLink }
 *  - getComicHeaders(url)                   -> { Referer: "..." }
 *  - getComicCategories()                   -> [{ title, url }]  danh mục (thể loại)
 */

var TT_BASE = "https://teletruyen.com";

function getComicSource() {
    return JSON.stringify({
        id: "teletruyen",
        name: "TeleTruyen",
        faviconUrl: "https://www.google.com/s2/favicons?domain=teletruyen.com&sz=64",
        baseUrl: TT_BASE,
        searchable: true
    });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function absUrl(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return TT_BASE + u;
    return TT_BASE + "/" + u;
}

var TT_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
    copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0"
};

function entityChar(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function decodeEntities(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (all, hex) {
            return entityChar(parseInt(hex, 16));
        });
        out = out.replace(/&#(\d+);?/g, function (all, dec) {
            return entityChar(parseInt(dec, 10));
        });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);?/g, function (all, name) {
            var value = TT_ENTITIES[name];
            return value == null ? all : value;
        });
    }
    return out;
}

function stripTags(s) {
    return String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function cleanText(s) {
    return decodeEntities(stripTags(s)).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function firstMatch(s, re) {
    var m = re.exec(s);
    return m ? m : null;
}

function attrOf(tag, name) {
    var m = new RegExp(name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag);
    if (!m) m = new RegExp(name + "\\s*=\\s*'([^']*)'", "i").exec(tag);
    return m ? decodeEntities(m[1]) : "";
}

function chapNumber(url) {
    var m = /chap-([0-9]+(?:\.[0-9]+)?)/i.exec(String(url || ""));
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return isNaN(n) ? 0 : n;
}

function sortChaptersByNumber(list) {
    list.sort(function (a, b) {
        var na = chapNumber(a.link);
        var nb = chapNumber(b.link);
        if (na !== nb) return na - nb;
        return 0;
    });
    return list;
}

/* ------------------------------------------------------------------ */
/* Trang danh sách                                                     */
/* ------------------------------------------------------------------ */

function getComicHomeUrl(page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page <= 1) return TT_BASE + "/danh-sach/truyen-moi-cap-nhat";
    return TT_BASE + "/danh-sach/truyen-moi-cap-nhat?page=" + page;
}

function getComicSearchRequest(query, page) {
    var url = TT_BASE + "/tim-kiem-nang-cao?keyword=" + encodeURIComponent(String(query || ""));
    return JSON.stringify({
        url: url,
        method: "GET",
        headers: { "Referer": TT_BASE + "/" }
    });
}

function parseComicList(html, url) {
    if (!html) return JSON.stringify([]);
    var items = [];
    var parts = html.split(/<div\b[^>]*class\s*=\s*["']comic-item["'][^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];

        var link = "";
        var title = "";
        var aTitle = firstMatch(chunk, /<a\b([^>]*title\s*=\s*["'][^"']+["'][^>]*)>/i);
        // fallback: first anchor
        var firstA = firstMatch(chunk, /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i);
        if (firstA) link = firstA[1];

        var h3 = firstMatch(chunk, /<h3\b[^>]*class\s*=\s*["'][^"']*comic-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
        if (h3) title = cleanText(h3[1]);
        if (!title && firstA) {
            // try title attr of first anchor
            title = attrOf(firstA[0], "title");
        }

        var img = firstMatch(chunk, /<img\b[^>]*>/i);
        var coverUrl = "";
        if (img) {
            var src = attrOf(img[0], "data-src");
            if (!src) src = attrOf(img[0], "src");
            if (src && src.indexOf("thumb-default") < 0) coverUrl = absUrl(src);
            else if (src) coverUrl = absUrl(src);
        }

        var chapM = firstMatch(chunk, /<a\b[^>]*class\s*=\s*["'][^"']*comic-chapter[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
        var latestChapter = chapM ? cleanText(chapM[1]) : "";

        if (!link || !title) continue;
        link = absUrl(link);
        items.push({
            title: title,
            link: link,
            coverUrl: coverUrl,
            author: "",
            latestChapter: latestChapter
        });
    }

    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.link || !it.title) continue;
        if (seen[it.link]) continue;
        seen[it.link] = true;
        out.push(it);
    }
    return JSON.stringify(out);
}

function getComicNextPageUrl(currentUrl, page, html) {
    if (!html) return "";
    var m = firstMatch(html, /<li\b[^>]*class\s*=\s*["'][^"']*\bnext\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*["']([^"']+)["']/i);
    if (!m) return "";
    var next = absUrl(m[1]);
    return next === currentUrl ? "" : next;
}

/* ------------------------------------------------------------------ */
/* Chi tiết truyện                                                     */
/* ------------------------------------------------------------------ */

function parseComicDetail(html, url) {
    if (!html) return "";
    var title = "";
    var titleM = firstMatch(html, /<h2\b[^>]*class\s*=\s*["'][^"']*info-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
    if (titleM) title = cleanText(titleM[1]);

    var cover = "";
    var imgM = firstMatch(html, /<img\b[^>]*class\s*=\s*["'][^"']*img-thumbnail[^"']*["'][^>]*data-src\s*=\s*["']([^"']+)["']/i);
    if (imgM) cover = absUrl(imgM[1]);
    if (!cover) {
        var imgM2 = firstMatch(html, /<img\b[^>]*data-src\s*=\s*["']([^"']+)["'][^>]*alt\s*=\s*["'][^"']*info-title/i);
        if (imgM2) cover = absUrl(imgM2[1]);
    }
    if (!cover) {
        var ogImg = firstMatch(html, /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
        if (ogImg) cover = absUrl(ogImg[1]);
    }

    var author = "";
    var authorM = firstMatch(html, /Tác giả:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
    if (authorM) author = cleanText(authorM[1]);

    var description = "";

    var chapters = [];
    var seen = {};
    var re = /<a\b[^>]*href\s*=\s*["']([^"']*\/chuong-[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var body = m[2];
        if (!href || href.indexOf("/chuong-") < 0) continue;
        var spanM = firstMatch(body, /<span[^>]*>([\s\S]*?)<\/span>/i);
        var ctitle = spanM ? cleanText(spanM[1]) : cleanText(body);
        if (!ctitle) ctitle = link;
        if (ctitle === "Xem T\u1eeb \u0110\u1ea7u") continue;
        var link = absUrl(href);
        if (seen[link]) continue;
        seen[link] = true;
        chapters.push({ title: ctitle, link: link });
    }

    return JSON.stringify({
        title: title,
        coverUrl: cover,
        author: author,
        description: description,
        chapters: sortChaptersByNumber(chapters)
    });
}

/* ------------------------------------------------------------------ */
/* Trang đọc chương                                                    */
/* ------------------------------------------------------------------ */

function parseComicChapter(html, url) {
    if (!html) return "";
    var title = "";
    var titleM = firstMatch(html, /<h2\b[^>]*class\s*=\s*["'][^"']*single-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
    if (titleM) title = cleanText(titleM[1]);

    var imageUrls = [];
    var seen = {};
    var imgRe = /<img\b[^>]*data-src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    var im;
    while ((im = imgRe.exec(html)) !== null) {
        var u = im[1];
        if (!u) continue;
        if (u.indexOf("page_") < 0) continue;
        var abs = absUrl(u);
        if (seen[abs]) continue;
        seen[abs] = true;
        imageUrls.push(abs);
    }
    if (imageUrls.length === 0) {
        var imgRe2 = /<img\b[^>]*data-src\s*=\s*["']([^"']+)["'][^>]*>/gi;
        var im2;
        while ((im2 = imgRe2.exec(html)) !== null) {
            var u2 = im2[1];
            if (!u2) continue;
            var abs2 = absUrl(u2);
            if (seen[abs2]) continue;
            seen[abs2] = true;
            imageUrls.push(abs2);
        }
    }

    var prevLink = "";
    var nextLink = "";
    var prevM = firstMatch(html, /<a\b([^>]*\bid\s*=\s*["']prev-link["'][^>]*)>/i);
    if (prevM) {
        var h = attrOf("<a " + prevM[1] + ">", "href");
        if (h && h !== "#") prevLink = absUrl(h);
    }
    var nextM = firstMatch(html, /<a\b([^>]*\bid\s*=\s*["']next-link["'][^>]*)>/i);
    if (nextM) {
        var h2 = attrOf("<a " + nextM[1] + ">", "href");
        if (h2 && h2 !== "#") nextLink = absUrl(h2);
    }

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getComicHeaders(url) {
    return JSON.stringify({
        "Referer": TT_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
    });
}

function getComicCategories() {
    return JSON.stringify([
    { title: '18+', url: 'https://teletruyen.com/the-loai/18' },
    { title: 'Manhwa', url: 'https://teletruyen.com/the-loai/manhwa' },
    { title: 'Âu Cổ', url: 'https://teletruyen.com/the-loai/au-co' },
    { title: 'Drama', url: 'https://teletruyen.com/the-loai/drama' },
    { title: 'Giam Cầm', url: 'https://teletruyen.com/the-loai/giam-cam' },
    { title: 'Hoàng Gia', url: 'https://teletruyen.com/the-loai/hoang-gia' },
    { title: 'Tâm Lý', url: 'https://teletruyen.com/the-loai/tam-ly' },
    { title: '1x1', url: 'https://teletruyen.com/the-loai/1x1' },
    { title: 'Bi Kịch', url: 'https://teletruyen.com/the-loai/bi-kich' },
    { title: 'Horror', url: 'https://teletruyen.com/the-loai/horror' },
    { title: 'Kinh Dị', url: 'https://teletruyen.com/the-loai/kinh-di' },
    { title: 'Lãng Mạn', url: 'https://teletruyen.com/the-loai/lang-man' },
    { title: 'Ngôn Tình', url: 'https://teletruyen.com/the-loai/ngon-tinh' },
    { title: 'Romance', url: 'https://teletruyen.com/the-loai/romance' },
    { title: 'Tình Cảm', url: 'https://teletruyen.com/the-loai/tinh-cam' },
    { title: 'Yandere', url: 'https://teletruyen.com/the-loai/yandere' },
    { title: 'Chaebol', url: 'https://teletruyen.com/the-loai/chaebol' },
    { title: 'Cưới Trước Yêu Sau', url: 'https://teletruyen.com/the-loai/cuoi-truoc-yeu-sau' },
    { title: 'Gương Vỡ Lại Lành', url: 'https://teletruyen.com/the-loai/guong-vo-lai-lanh' },
    { title: 'Hiện Đại', url: 'https://teletruyen.com/the-loai/hien-dai' },
    { title: 'Ngọt', url: 'https://teletruyen.com/the-loai/ngot' },
    { title: 'Thanh Mai Trúc Mã', url: 'https://teletruyen.com/the-loai/thanh-mai-truc-ma' },
    { title: 'Thanh Xuân Vườn Trường', url: 'https://teletruyen.com/the-loai/thanh-xuan-vuon-truong' },
    { title: 'Trưởng Thành', url: 'https://teletruyen.com/the-loai/truong-thanh' },
    { title: 'Hài Lãng Mạn', url: 'https://teletruyen.com/the-loai/hai-lang-man' },
    { title: '15+', url: 'https://teletruyen.com/the-loai/15' },
    { title: '19+', url: 'https://teletruyen.com/the-loai/19' },
    { title: 'Novel', url: 'https://teletruyen.com/the-loai/novel' },
    { title: 'Quân Nhân', url: 'https://teletruyen.com/the-loai/quan-nhan' },
    { title: 'Chiếm Hữu', url: 'https://teletruyen.com/the-loai/chiem-huu' },
    { title: 'Báo Thù', url: 'https://teletruyen.com/the-loai/bao-thu' },
    { title: 'Thế Giới Ngầm', url: 'https://teletruyen.com/the-loai/the-gioi-ngam' },
    { title: 'Yêu Hận Tình Thù', url: 'https://teletruyen.com/the-loai/yeu-han-tinh-thu' },
    { title: 'Trả Thù', url: 'https://teletruyen.com/the-loai/tra-thu' },
    { title: 'Fantasy', url: 'https://teletruyen.com/the-loai/fantasy' },
    { title: 'Hài Hước', url: 'https://teletruyen.com/the-loai/hai-huoc' },
    { title: 'Xuyên Không', url: 'https://teletruyen.com/the-loai/xuyen-khong' },
    { title: 'Trọng Sinh', url: 'https://teletruyen.com/the-loai/trong-sinh' },
    { title: 'Nhân Thú', url: 'https://teletruyen.com/the-loai/nhan-thu' },
    { title: 'Chữa Lành', url: 'https://teletruyen.com/the-loai/chua-lanh' },
    { title: 'Hệ Thống', url: 'https://teletruyen.com/the-loai/he-thong' },
    { title: 'Bối Cảnh Phương Tây', url: 'https://teletruyen.com/the-loai/boi-canh-phuong-tay' },
    { title: 'Cổ Đại', url: 'https://teletruyen.com/the-loai/co-dai' },
    { title: 'Nữ Cường', url: 'https://teletruyen.com/the-loai/nu-cuong' },
    { title: 'Chuyển Thể Từ Novel', url: 'https://teletruyen.com/the-loai/chuyen-the-tu-novel' },
    { title: 'BDSM', url: 'https://teletruyen.com/the-loai/bdsm' },
    { title: 'NTR', url: 'https://teletruyen.com/the-loai/ntr' },
    { title: 'Mối Quan Hệ Tình Cảm Phức Tạp', url: 'https://teletruyen.com/the-loai/moi-quan-he-tinh-cam-phuc-tap' },
    { title: 'Truyện Ngắn', url: 'https://teletruyen.com/the-loai/truyen-ngan' },
    { title: 'Hôn Nhân Hợp Đồng', url: 'https://teletruyen.com/the-loai/hon-nhan-hop-dong' },
    { title: 'Mối Quan Hệ Hợp Đồng', url: 'https://teletruyen.com/the-loai/moi-quan-he-hop-dong' },
    { title: 'Harem', url: 'https://teletruyen.com/the-loai/harem' },
    { title: 'Đô Thị', url: 'https://teletruyen.com/the-loai/do-thi' },
    { title: 'Tái Sinh', url: 'https://teletruyen.com/the-loai/tai-sinh' },
    { title: 'Manhua', url: 'https://teletruyen.com/the-loai/manhua' },
    { title: 'Học Đường', url: 'https://teletruyen.com/the-loai/hoc-duong' },
    { title: 'Rùng Rợn', url: 'https://teletruyen.com/the-loai/rung-ron' },
    { title: 'Khoảng Cách Tuổi Tác', url: 'https://teletruyen.com/the-loai/khoang-cach-tuoi-tac' },
    { title: 'Công Sở', url: 'https://teletruyen.com/the-loai/cong-so' },
    { title: 'Romcom', url: 'https://teletruyen.com/the-loai/romcom' },
    { title: 'Dirty Talk', url: 'https://teletruyen.com/the-loai/dirty-talk' },
    { title: 'Cổ Trang', url: 'https://teletruyen.com/the-loai/co-trang' },
    { title: 'Mối Tình Đầu', url: 'https://teletruyen.com/the-loai/moi-tinh-dau' },
    { title: 'Hôn Nhân Chính Trị', url: 'https://teletruyen.com/the-loai/hon-nhan-chinh-tri' },
    { title: 'Ghen Tuông', url: 'https://teletruyen.com/the-loai/ghen-tuong' },
    { title: 'Yêu Đơn Phương', url: 'https://teletruyen.com/the-loai/yeu-don-phuong' },
    { title: 'Hiểu Lầm', url: 'https://teletruyen.com/the-loai/hieu-lam' },
    { title: 'Mất Trí Nhớ', url: 'https://teletruyen.com/the-loai/mat-tri-nho' },
    { title: 'Yêu Hận Đan Xen', url: 'https://teletruyen.com/the-loai/yeu-han-dan-xen' },
    { title: 'Ngược', url: 'https://teletruyen.com/the-loai/nguoc' },
    { title: 'Cứu Rỗi', url: 'https://teletruyen.com/the-loai/cuu-roi' },
    { title: 'Kịch Tính', url: 'https://teletruyen.com/the-loai/kich-tinh' },
    { title: 'Truy Thê', url: 'https://teletruyen.com/the-loai/truy-the' },
    { title: 'Trùng Sinh', url: 'https://teletruyen.com/the-loai/trung-sinh' },
    { title: 'Phép Thuật', url: 'https://teletruyen.com/the-loai/phep-thuat' },
    { title: 'Action', url: 'https://teletruyen.com/the-loai/action' },
    { title: 'Chuyển Sinh', url: 'https://teletruyen.com/the-loai/chuyen-sinh' },
    { title: 'Comedy', url: 'https://teletruyen.com/the-loai/comedy' },
    { title: 'Huyền Bí', url: 'https://teletruyen.com/the-loai/huyen-bi' },
    { title: 'Dark Romance', url: 'https://teletruyen.com/the-loai/dark-romance' },
    { title: 'Mối Tình Tay Ba', url: 'https://teletruyen.com/the-loai/moi-tinh-tay-ba' },
    { title: 'Sống Chung', url: 'https://teletruyen.com/the-loai/song-chung' },
    { title: 'Ghét Của Nào Trời Trao Của Nấy', url: 'https://teletruyen.com/the-loai/ghet-cua-nao-troi-trao-cua-nay' },
    { title: '3P', url: 'https://teletruyen.com/the-loai/3p' },
    { title: 'Phi Công Trẻ Lái Máy Bay Bà Già', url: 'https://teletruyen.com/the-loai/phi-cong-tre-lai-may-bay-ba-gia' },
    { title: 'Bạn Thời Thơ Ấu', url: 'https://teletruyen.com/the-loai/ban-thoi-tho-au' },
    { title: 'Bạn Bè &gt; Người Yêu', url: 'https://teletruyen.com/the-loai/ban-be-nguoi-yeu' },
    { title: 'Slice Of Life', url: 'https://teletruyen.com/the-loai/slice-of-life' },
    { title: 'Siêu Năng Lực', url: 'https://teletruyen.com/the-loai/sieu-nang-luc' },
    { title: 'Không Che', url: 'https://teletruyen.com/the-loai/khong-che' },
    { title: 'Ghét Trước Yêu Sau', url: 'https://teletruyen.com/the-loai/ghet-truoc-yeu-sau' },
    { title: 'Thể Thao', url: 'https://teletruyen.com/the-loai/the-thao' },
    { title: 'Manga', url: 'https://teletruyen.com/the-loai/manga' },
    { title: 'Sủng', url: 'https://teletruyen.com/the-loai/sung' },
    { title: 'Webtoon', url: 'https://teletruyen.com/the-loai/webtoon' },
    { title: 'Giả Tưởng', url: 'https://teletruyen.com/the-loai/gia-tuong' },
    { title: 'Shoujo', url: 'https://teletruyen.com/the-loai/shoujo' },
    { title: '21+', url: 'https://teletruyen.com/the-loai/21' },
    { title: 'Giật Gân', url: 'https://teletruyen.com/the-loai/giat-gan' },
    { title: 'Mafia', url: 'https://teletruyen.com/the-loai/mafia' },
    { title: 'Bad Boy', url: 'https://teletruyen.com/the-loai/bad-boy' },
    { title: 'Oneshot', url: 'https://teletruyen.com/the-loai/oneshot' },
    { title: 'Người Thú', url: 'https://teletruyen.com/the-loai/nguoi-thu' },
    { title: 'Động Vật', url: 'https://teletruyen.com/the-loai/dong-vat' },
    { title: 'Tài Phiệt', url: 'https://teletruyen.com/the-loai/tai-phiet' },
    { title: 'Light Novel', url: 'https://teletruyen.com/the-loai/light-novel' },
    { title: 'Trai Ngoan', url: 'https://teletruyen.com/the-loai/trai-ngoan' },
    { title: 'Hợp Đồng Hẹn Hò', url: 'https://teletruyen.com/the-loai/hop-dong-hen-ho' },
    { title: 'Giới Giải Trí', url: 'https://teletruyen.com/the-loai/gioi-giai-tri' },
    { title: 'Idol', url: 'https://teletruyen.com/the-loai/idol' },
    { title: 'Magic', url: 'https://teletruyen.com/the-loai/magic' },
    { title: 'Phù Thủy', url: 'https://teletruyen.com/the-loai/phu-thuy' },
    { title: 'Văn Phòng', url: 'https://teletruyen.com/the-loai/van-phong' },
    { title: 'Hàng Xóm', url: 'https://teletruyen.com/the-loai/hang-xom' },
    { title: 'Sâu Lắng', url: 'https://teletruyen.com/the-loai/sau-lang' },
    { title: 'Cảm Xúc', url: 'https://teletruyen.com/the-loai/cam-xuc' },
    { title: 'Nặng Đô', url: 'https://teletruyen.com/the-loai/nang-do' },
    { title: 'Vibe', url: 'https://teletruyen.com/the-loai/vibe' },
    { title: 'Ma Cà Rồng', url: 'https://teletruyen.com/the-loai/ma-ca-rong' },
    { title: 'Giết Người', url: 'https://teletruyen.com/the-loai/giet-nguoi' },
    { title: 'Cơ Thể &gt; Tim', url: 'https://teletruyen.com/the-loai/co-the-tim' },
    { title: 'Lọ Lem', url: 'https://teletruyen.com/the-loai/lo-lem' },
    { title: 'Zombie', url: 'https://teletruyen.com/the-loai/zombie' },
    { title: 'Gia Đình', url: 'https://teletruyen.com/the-loai/gia-dinh' },
    { title: 'Showbiz', url: 'https://teletruyen.com/the-loai/showbiz' },
    { title: 'Ngọt sủng', url: 'https://teletruyen.com/the-loai/ngot-sung' },
    { title: 'Theo đuổi', url: 'https://teletruyen.com/the-loai/theo-duoi' },
    { title: 'Cung đấu', url: 'https://teletruyen.com/the-loai/cung-dau' },
    { title: 'Dưỡng phu', url: 'https://teletruyen.com/the-loai/duong-phu' },
    { title: 'Phản Diện', url: 'https://teletruyen.com/the-loai/phan-dien' },
    { title: 'Manh bảo', url: 'https://teletruyen.com/the-loai/manh-bao' },
    { title: 'Xuyên Sách', url: 'https://teletruyen.com/the-loai/xuyen-sach' },
    { title: 'Tổng Tài', url: 'https://teletruyen.com/the-loai/tong-tai' },
    { title: 'Hoàng Cung', url: 'https://teletruyen.com/the-loai/hoang-cung' },
    { title: 'Sủng nịch', url: 'https://teletruyen.com/the-loai/sung-nich' },
    { title: 'Nam chính giả nghèo', url: 'https://teletruyen.com/the-loai/nam-chinh-gia-ngheo' },
    { title: 'Tỷ Phú', url: 'https://teletruyen.com/the-loai/ty-phu' },
    { title: 'Ở Rể', url: 'https://teletruyen.com/the-loai/o-re' },
    { title: 'Vả Mặt', url: 'https://teletruyen.com/the-loai/va-mat' },
    { title: 'Hành Tinh', url: 'https://teletruyen.com/the-loai/hanh-tinh' },
    { title: 'Sếp - Thư Ký', url: 'https://teletruyen.com/the-loai/sep-thu-ky' },
    { title: 'Nghèo Giả Giàu', url: 'https://teletruyen.com/the-loai/ngheo-gia-giau' },
    { title: 'HE', url: 'https://teletruyen.com/the-loai/he' },
    { title: 'Oan gia', url: 'https://teletruyen.com/the-loai/oan-gia' },
    { title: 'Bệnh Kiều', url: 'https://teletruyen.com/the-loai/benh-kieu' },
    { title: 'Si Mê Cực Đoan', url: 'https://teletruyen.com/the-loai/si-me-cuc-doan' },
    { title: 'Song sinh tráo thân', url: 'https://teletruyen.com/the-loai/song-sinh-trao-than' },
    { title: 'Adult', url: 'https://teletruyen.com/the-loai/adult' },
    { title: 'Smut', url: 'https://teletruyen.com/the-loai/smut' },
    { title: 'Truyện Màu', url: 'https://teletruyen.com/the-loai/truyen-mau' },
    { title: 'Ecchi', url: 'https://teletruyen.com/the-loai/ecchi' },
    { title: 'Gia đấu', url: 'https://teletruyen.com/the-loai/gia-dau' },
    { title: 'Ly Hôn - Tái Ngộ', url: 'https://teletruyen.com/the-loai/ly-hon-tai-ngo' },
    { title: 'Hào Môn', url: 'https://teletruyen.com/the-loai/hao-mon' },
    { title: 'Xung hỉ', url: 'https://teletruyen.com/the-loai/xung-hi' },
    { title: 'Ngược Trước Sủng Sau', url: 'https://teletruyen.com/the-loai/nguoc-truoc-sung-sau' },
    { title: 'hợp đồng hôn nhân', url: 'https://teletruyen.com/the-loai/hop-dong-hon-nhan' },
    { title: 'Đại Lão', url: 'https://teletruyen.com/the-loai/dai-lao' },
    { title: 'Cưng chiều', url: 'https://teletruyen.com/the-loai/cung-chieu' },
    { title: 'Áo giáp', url: 'https://teletruyen.com/the-loai/ao-giap' },
    { title: 'Công lược', url: 'https://teletruyen.com/the-loai/cong-luoc' },
    { title: 'Vườn trường', url: 'https://teletruyen.com/the-loai/vuon-truong' },
    { title: 'Thế thân', url: 'https://teletruyen.com/the-loai/the-than' },
    { title: 'Nghịch Tập', url: 'https://teletruyen.com/the-loai/nghich-tap' },
    { title: 'Sủng vợ', url: 'https://teletruyen.com/the-loai/sung-vo' },
    { title: 'Thiên kim giả', url: 'https://teletruyen.com/the-loai/thien-kim-gia' },
    { title: 'Thiên Kim Thật', url: 'https://teletruyen.com/the-loai/thien-kim-that' },
    { title: 'Áo choàng', url: 'https://teletruyen.com/the-loai/ao-choang' },
    { title: 'Josei', url: 'https://teletruyen.com/the-loai/josei' },
    { title: 'Mature', url: 'https://teletruyen.com/the-loai/mature' },
    { title: 'Supernatural', url: 'https://teletruyen.com/the-loai/supernatural' },
    { title: 'Mystery', url: 'https://teletruyen.com/the-loai/mystery' },
    { title: 'School Life', url: 'https://teletruyen.com/the-loai/school-life' },
    { title: 'One shot', url: 'https://teletruyen.com/the-loai/one-shot' },
    { title: 'Full Color', url: 'https://teletruyen.com/the-loai/full-color' },
    { title: 'Comic', url: 'https://teletruyen.com/the-loai/comic' },
    { title: 'Historical', url: 'https://teletruyen.com/the-loai/historical' },
    { title: '16+', url: 'https://teletruyen.com/the-loai/16' },
    { title: 'Romance Comedy', url: 'https://teletruyen.com/the-loai/romance-comedy' },
    { title: 'First Love', url: 'https://teletruyen.com/the-loai/first-love' },
    { title: 'Boy Tâm Cơ', url: 'https://teletruyen.com/the-loai/boy-tam-co' },
    { title: 'Betrayal', url: 'https://teletruyen.com/the-loai/betrayal' },
    { title: 'Dark', url: 'https://teletruyen.com/the-loai/dark' },
    { title: 'Love Triangle', url: 'https://teletruyen.com/the-loai/love-triangle' },
    { title: 'Psychological', url: 'https://teletruyen.com/the-loai/psychological' },
    { title: 'Baby', url: 'https://teletruyen.com/the-loai/baby' },
    { title: 'Tâm lí', url: 'https://teletruyen.com/the-loai/tam-li' },
    { title: 'Thriller', url: 'https://teletruyen.com/the-loai/thriller' },
    { title: 'Tình Yêu Kém Tuổi', url: 'https://teletruyen.com/the-loai/tinh-yeu-kem-tuoi' },
    { title: 'Josei(W)', url: 'https://teletruyen.com/the-loai/joseiw' },
    { title: 'Soft Yuri', url: 'https://teletruyen.com/the-loai/soft-yuri' },
    { title: 'Tình Yêu Công Sở', url: 'https://teletruyen.com/the-loai/tinh-yeu-cong-so' },
    { title: 'GL', url: 'https://teletruyen.com/the-loai/gl' },
    { title: 'Bách Hợp', url: 'https://teletruyen.com/the-loai/bach-hop' },
    { title: 'Yuri', url: 'https://teletruyen.com/the-loai/yuri' },
    { title: 'Đơn Phương', url: 'https://teletruyen.com/the-loai/don-phuong' },
    { title: 'Revenge', url: 'https://teletruyen.com/the-loai/revenge' },
    { title: 'Sci-fi', url: 'https://teletruyen.com/the-loai/sci-fi' },
    { title: 'Seinen', url: 'https://teletruyen.com/the-loai/seinen' },
    { title: 'Đam Mỹ', url: 'https://teletruyen.com/the-loai/dam-my' },
    { title: 'Bí ẩn', url: 'https://teletruyen.com/the-loai/bi-an' },
    { title: 'Ghosts', url: 'https://teletruyen.com/the-loai/ghosts' },
    { title: 'BL', url: 'https://teletruyen.com/the-loai/bl' },
    { title: 'Reincarnation', url: 'https://teletruyen.com/the-loai/reincarnation' },
    { title: 'isekai', url: 'https://teletruyen.com/the-loai/isekai' },
    { title: 'Adaptation', url: 'https://teletruyen.com/the-loai/adaptation' },
    { title: 'Time Travel', url: 'https://teletruyen.com/the-loai/time-travel' },
    { title: 'Prologue', url: 'https://teletruyen.com/the-loai/prologue' },
    { title: 'Thần tượng', url: 'https://teletruyen.com/the-loai/than-tuong' },
    { title: 'Hoán đổi thân xác', url: 'https://teletruyen.com/the-loai/hoan-doi-than-xac' },
    { title: 'Ảo Tưởng', url: 'https://teletruyen.com/the-loai/ao-tuong' },
    { title: 'Tình Đầu', url: 'https://teletruyen.com/the-loai/tinh-dau' },
    { title: 'Nam Hối Hận', url: 'https://teletruyen.com/the-loai/nam-hoi-han' },
    { title: 'Oan Gia Ngõ Hẹp', url: 'https://teletruyen.com/the-loai/oan-gia-ngo-hep' },
    { title: 'Yaoi', url: 'https://teletruyen.com/the-loai/yaoi' },
    { title: 'Cổ Xuyên', url: 'https://teletruyen.com/the-loai/co-xuyen' },
    { title: 'Animal', url: 'https://teletruyen.com/the-loai/animal' },
    { title: 'Thiếu Nhi', url: 'https://teletruyen.com/the-loai/thieu-nhi' },
    { title: 'Adventure', url: 'https://teletruyen.com/the-loai/adventure' },
    { title: 'Huyền Huyễn', url: 'https://teletruyen.com/the-loai/huyen-huyen' },
    { title: 'Diệt tra nam', url: 'https://teletruyen.com/the-loai/diet-tra-nam' },
    { title: 'Kingdom', url: 'https://teletruyen.com/the-loai/kingdom' },
    { title: 'Hành Động', url: 'https://teletruyen.com/the-loai/hanh-dong' },
    { title: 'Si Tình', url: 'https://teletruyen.com/the-loai/si-tinh' },
    { title: 'Gender Bender', url: 'https://teletruyen.com/the-loai/gender-bender' },
    { title: 'Shounen', url: 'https://teletruyen.com/the-loai/shounen' },
    { title: 'BLHĐ', url: 'https://teletruyen.com/the-loai/blhd' },
    { title: 'Tragedy', url: 'https://teletruyen.com/the-loai/tragedy' },
    { title: 'Game', url: 'https://teletruyen.com/the-loai/game' },
    { title: 'Nữ chủ', url: 'https://teletruyen.com/the-loai/nu-chu' },
    { title: 'Cooking', url: 'https://teletruyen.com/the-loai/cooking' },
    { title: 'FWB', url: 'https://teletruyen.com/the-loai/fwb' },
    { title: 'NSFW', url: 'https://teletruyen.com/the-loai/nsfw' },
    { title: 'Shounen Ai', url: 'https://teletruyen.com/the-loai/shounen-ai' },
    { title: 'Childcare', url: 'https://teletruyen.com/the-loai/childcare' },
    { title: 'Cao H', url: 'https://teletruyen.com/the-loai/cao-h' },
    { title: 'Hầu Gái', url: 'https://teletruyen.com/the-loai/hau-gai' },
    { title: 'Tình Yêu Chị Em', url: 'https://teletruyen.com/the-loai/tinh-yeu-chi-em' },
    { title: 'Cô Nàng Tài Giỏi', url: 'https://teletruyen.com/the-loai/co-nang-tai-gioi' },
    { title: 'Chàng Trai Hối Hận', url: 'https://teletruyen.com/the-loai/chang-trai-hoi-han' },
    { title: 'Nữ Từng Bị Tổn Thương', url: 'https://teletruyen.com/the-loai/nu-tung-bi-ton-thuong' },
    { title: 'Trinh Nữ', url: 'https://teletruyen.com/the-loai/trinh-nu' },
    { title: 'Nhiều thân phận', url: 'https://teletruyen.com/the-loai/nhieu-than-phan' },
    { title: 'TRUYỆN CHỮ', url: 'https://teletruyen.com/the-loai/truyen-chu' },
    { title: 'Ngược Tâm', url: 'https://teletruyen.com/the-loai/nguoc-tam' },
    { title: 'Thánh Nữ', url: 'https://teletruyen.com/the-loai/thanh-nu' },
    { title: 'Xung Đột', url: 'https://teletruyen.com/the-loai/xung-dot' },
    { title: 'Diệt tiểu tam', url: 'https://teletruyen.com/the-loai/diet-tieu-tam' },
    { title: 'Vampire', url: 'https://teletruyen.com/the-loai/vampire' },
    { title: 'Hoán Đổi Thân Phận', url: 'https://teletruyen.com/the-loai/hoan-doi-than-phan' },
    { title: 'Bí ẩn gia tộc', url: 'https://teletruyen.com/the-loai/bi-an-gia-toc' },
    { title: 'Tiên Cá', url: 'https://teletruyen.com/the-loai/tien-ca' },
    { title: 'Tsundere', url: 'https://teletruyen.com/the-loai/tsundere' },
    { title: 'Phi Đạo Đức', url: 'https://teletruyen.com/the-loai/phi-dao-duc' },
    { title: 'Kỵ Sĩ', url: 'https://teletruyen.com/the-loai/ky-si' },
    { title: 'Huyền Ảo', url: 'https://teletruyen.com/the-loai/huyen-ao' },
    { title: 'Đối Thủ', url: 'https://teletruyen.com/the-loai/doi-thu' },
    { title: 'Gangster', url: 'https://teletruyen.com/the-loai/gangster' },
    { title: 'Cưỡng Bức', url: 'https://teletruyen.com/the-loai/cuong-buc' },
    { title: 'Ác Ma', url: 'https://teletruyen.com/the-loai/ac-ma' },
    { title: 'Nam quỷ', url: 'https://teletruyen.com/the-loai/nam-quy' },
    { title: 'Thần thoại Hy Lạp', url: 'https://teletruyen.com/the-loai/than-thoai-hy-lap' },
    { title: 'Anime', url: 'https://teletruyen.com/the-loai/anime' },
    { title: 'Trinh Thám', url: 'https://teletruyen.com/the-loai/trinh-tham' },
    { title: 'Second Chance', url: 'https://teletruyen.com/the-loai/second-chance' },
    { title: 'Viễn Tưởng', url: 'https://teletruyen.com/the-loai/vien-tuong' },
    { title: 'Tình Yêu Cấm Đoán', url: 'https://teletruyen.com/the-loai/tinh-yeu-cam-doan' },
    { title: 'Cứu Drop', url: 'https://teletruyen.com/the-loai/cuu-drop' },
    { title: 'Reverse Harem', url: 'https://teletruyen.com/the-loai/reverse-harem' },
    { title: 'ABO', url: 'https://teletruyen.com/the-loai/abo' },
    { title: 'Hầm Ngục', url: 'https://teletruyen.com/the-loai/ham-nguc' },
    { title: 'Tranh sủng', url: 'https://teletruyen.com/the-loai/tranh-sung' },
    { title: 'Esper and Guide', url: 'https://teletruyen.com/the-loai/esper-and-guide' },
    { title: 'BE', url: 'https://teletruyen.com/the-loai/be' },
    { title: 'Nhiều vị diện', url: 'https://teletruyen.com/the-loai/nhieu-vi-dien' },
    { title: 'Shoujo Ai', url: 'https://teletruyen.com/the-loai/shoujo-ai' },
    { title: 'Nữ Phụ Nghịch Tập', url: 'https://teletruyen.com/the-loai/nu-phu-nghich-tap' },
    { title: 'Đoàn Sủng', url: 'https://teletruyen.com/the-loai/doan-sung' },
    { title: 'Tiểu Thuyết', url: 'https://teletruyen.com/the-loai/tieu-thuyet' },
    { title: 'Độc Chiếm', url: 'https://teletruyen.com/the-loai/doc-chiem' },
    { title: 'Tương Lai', url: 'https://teletruyen.com/the-loai/tuong-lai' },
    { title: 'Toàn Năng', url: 'https://teletruyen.com/the-loai/toan-nang' },
    { title: 'Mahou', url: 'https://teletruyen.com/the-loai/mahou' },
    { title: 'Soft Yaoi', url: 'https://teletruyen.com/the-loai/soft-yaoi' },
    { title: 'Chủ Thụ', url: 'https://teletruyen.com/the-loai/chu-thu' },
    { title: 'Việt Nam', url: 'https://teletruyen.com/the-loai/viet-nam' },
    { title: 'Phiêu Lưu', url: 'https://teletruyen.com/the-loai/phieu-luu' },
    { title: 'Hoàng Gia/Quý Tộc', url: 'https://teletruyen.com/the-loai/hoang-giaquy-toc' },
    { title: 'Otome Game', url: 'https://teletruyen.com/the-loai/otome-game' },
    { title: 'Ác Nữ', url: 'https://teletruyen.com/the-loai/ac-nu' },
    { title: 'Dưỡng Phu từ bé', url: 'https://teletruyen.com/the-loai/duong-phu-tu-be' },
    { title: 'Martial Arts', url: 'https://teletruyen.com/the-loai/martial-arts' },
    { title: 'Mẹ Kế Con Chồng', url: 'https://teletruyen.com/the-loai/me-ke-con-chong' },
    { title: 'Cẩu Huyết', url: 'https://teletruyen.com/the-loai/cau-huyet' },
    { title: 'Quyền Mưu', url: 'https://teletruyen.com/the-loai/quyen-muu' },
    { title: 'Vương Gia Chiều Vợ', url: 'https://teletruyen.com/the-loai/vuong-gia-chieu-vo' },
    { title: 'Nam Chính Hắc Hoá', url: 'https://teletruyen.com/the-loai/nam-chinh-hac-hoa' },
    { title: 'NamNu9 Cùng Xuyên', url: 'https://teletruyen.com/the-loai/namnu9-cung-xuyen' },
    { title: 'Tình Báo', url: 'https://teletruyen.com/the-loai/tinh-bao' }
    ]);
}