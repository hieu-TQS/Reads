/**
 * Báo Lao Động (laodong.vn) — nguồn báo dạng JS.
 *
 * Chống bot: site trả trang challenge 177 byte đặt cookie `D1N` bằng JS rồi reload
 * (OkHttp không chạy JS nên phải tự gửi cookie trong header). Cookie hiện là hằng
 * số dùng chung: `D1N=c9358bb34f16e2b49076c85cffdb2edc`. Nếu site đổi cookie,
 * mọi request sẽ nhận lại trang challenge → danh sách rỗng, cần cập nhật hằng này.
 *
 * Chọn UA desktop Windows vì bản đó trả layout nhẹ (~95KB) có phân trang `?page=N`;
 * UA mobile trả layout ~432KB dạng lazy-load không có pager.
 *
 *  - Danh sách: mỗi tin là `<article class="v4 ...">`; tiêu đề
 *    `<a class="link-title" href><h2 class="title">`, ảnh `img.img-art`
 *    (ưu tiên `data-src` vì `src` có khi chỉ là ảnh 22px), mô tả `div.chapeau`,
 *    giờ đăng `div.info > span.time` ("dd/MM/yyyy HH:mm"). Trang chủ không in giờ.
 *  - Link bài: `/…/<slug>-<id>.ldo`; loại `/tags/…`.
 *  - Phân trang: `?page=N` (block `div.pagination-md-1`), trang chủ không phân trang.
 *  - Tìm kiếm: site dùng Google CSE, không có trang tìm kiếm nội bộ → searchable: false.
 *  - Đọc bài: `h1.title`, sapo `div.chappeau`, thân `div#gallery-ctt.art-body`
 *    (bài infographic: `div.art-body`; bài video: `div.video-content` có
 *    `<video><source src="…m3u8">`). Hết bài ở `div.tin-lien-quan`,
 *    `div.blk-tin-lien-quan`, `div.art-footer` hoặc khối bình luận.
 *    Đoạn văn của site viết `<p>` KHÔNG đóng thẻ → tách đoạn theo thẻ mở.
 *
 * Toàn bộ hàm trả JSON string, ES5 thuần (Rhino).
 */

var LD_HOST = "https://laodong.vn";
var LD_SOURCE_NAME = "Lao Động";
var LD_MAX_PAGE = 100;
var LD_MIN_TEXT = 20;
var LD_COOKIE = "D1N=c9358bb34f16e2b49076c85cffdb2edc";
var LD_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

var LD_CATEGORIES = [
    { name: "Trang chủ", pageUrl: LD_HOST + "/" },
    { name: "Tin mới", pageUrl: LD_HOST + "/tin-moi" },
    { name: "Thời sự", pageUrl: LD_HOST + "/thoi-su" },
    { name: "Xã hội", pageUrl: LD_HOST + "/xa-hoi" },
    { name: "Môi trường", pageUrl: LD_HOST + "/moi-truong" },
    { name: "Giao thông", pageUrl: LD_HOST + "/giao-thong" },
    { name: "Pháp luật", pageUrl: LD_HOST + "/phap-luat" },
    { name: "Tư vấn pháp luật", pageUrl: LD_HOST + "/tu-van-phap-luat" },
    { name: "An ninh hình sự", pageUrl: LD_HOST + "/an-ninh-hinh-su" },
    { name: "Sự kiện bình luận", pageUrl: LD_HOST + "/su-kien-binh-luan" },
    { name: "Kinh doanh", pageUrl: LD_HOST + "/kinh-doanh" },
    { name: "Tiền tệ & Đầu tư", pageUrl: LD_HOST + "/tien-te-dau-tu" },
    { name: "Thị trường", pageUrl: LD_HOST + "/thi-truong" },
    { name: "Doanh nghiệp - Doanh nhân", pageUrl: LD_HOST + "/doanh-nghiep-doanh-nhan" },
    { name: "Công đoàn", pageUrl: LD_HOST + "/cong-doan" },
    { name: "Dân tộc - Tôn giáo", pageUrl: LD_HOST + "/dttg" },
    { name: "Mặt trận", pageUrl: LD_HOST + "/mat-tran" },
    { name: "Bạn đọc", pageUrl: LD_HOST + "/ban-doc" },
    { name: "Thể thao", pageUrl: LD_HOST + "/the-thao" },
    { name: "Bóng đá Việt Nam", pageUrl: LD_HOST + "/bong-da" },
    { name: "Bóng đá quốc tế", pageUrl: LD_HOST + "/bong-da-quoc-te" },
    { name: "Bóng chuyền", pageUrl: LD_HOST + "/bong-chuyen" },
    { name: "Tennis", pageUrl: LD_HOST + "/tennis" },
    { name: "Golf", pageUrl: LD_HOST + "/golf" },
    { name: "Văn hóa", pageUrl: LD_HOST + "/van-hoa" },
    { name: "Giải trí", pageUrl: LD_HOST + "/giai-tri" },
    { name: "Thời trang", pageUrl: LD_HOST + "/thoi-trang" },
    { name: "Sách hay", pageUrl: LD_HOST + "/sach-hay" },
    { name: "Thế giới", pageUrl: LD_HOST + "/the-gioi" },
    { name: "Giáo dục", pageUrl: LD_HOST + "/giao-duc" },
    { name: "Sức khỏe", pageUrl: LD_HOST + "/suc-khoe" },
    { name: "Y tế", pageUrl: LD_HOST + "/y-te" },
    { name: "Làm đẹp", pageUrl: LD_HOST + "/lam-dep" },
    { name: "Công nghệ", pageUrl: LD_HOST + "/cong-nghe" },
    { name: "Thế giới số", pageUrl: LD_HOST + "/the-gioi-so" },
    { name: "Xe", pageUrl: LD_HOST + "/xe" },
    { name: "Bất động sản", pageUrl: LD_HOST + "/bat-dong-san" },
    { name: "Việc làm", pageUrl: LD_HOST + "/viec-lam" },
    { name: "Media", pageUrl: LD_HOST + "/media" },
    { name: "Lao Động TV", pageUrl: LD_HOST + "/video" },
    { name: "Photo", pageUrl: LD_HOST + "/photo" },
    { name: "Infographic", pageUrl: LD_HOST + "/infographic" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "laodong",
        name: LD_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=laodong.vn&sz=64",
        categories: LD_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("laodong.vn") !== -1;
}

function getNewsHeaders(url) {
    var headers = {
        "User-Agent": LD_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        "Referer": LD_HOST + "/"
    };
    if (!url || String(url).toLowerCase().indexOf("laodong.vn") !== -1) {
        headers["Cookie"] = LD_COOKIE;
    }
    return JSON.stringify(headers);
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var LD_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
    copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", deg: "°",
    agrave: "à", aacute: "á", atilde: "ã", acirc: "â", abreve: "ă",
    egrave: "è", eacute: "é", ecirc: "ê",
    igrave: "ì", iacute: "í",
    ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ohorn: "ơ",
    ugrave: "ù", uacute: "ú", uhorn: "ư",
    yacute: "ý", ygrave: "ỳ",
    dstrok: "đ",
    Agrave: "À", Aacute: "Á", Atilde: "Ã", Acirc: "Â", Abreve: "Ă",
    Egrave: "È", Eacute: "É", Ecirc: "Ê",
    Igrave: "Ì", Iacute: "Í",
    Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ohorn: "Ơ",
    Ugrave: "Ù", Uacute: "Ú", Uhorn: "Ư",
    Yacute: "Ý", Ygrave: "Ỳ",
    Dstrok: "Đ"
};

function ldDecode(value) {
    if (value === null || value === undefined) return "";
    var s = String(value);
    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
        var code = parseInt(hex, 16);
        return isNaN(code) ? m : String.fromCharCode(code);
    });
    s = s.replace(/&#(\d+);/g, function (m, dec) {
        var code = parseInt(dec, 10);
        return isNaN(code) ? m : String.fromCharCode(code);
    });
    s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, function (m, name) {
        return LD_ENTITIES.hasOwnProperty(name) ? LD_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function ldStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|figure|figcaption|tr)>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = ldDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function ldClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "");
}

function ldAbs(raw) {
    if (!raw) return null;
    var link = ldDecode(raw).trim();
    if (!link) return null;
    var low = link.toLowerCase();
    if (low.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return LD_HOST + link;
    return null;
}

/** Chỉ nhận link bài viết laodong.vn: …-<id>.ldo, bỏ trang tag. */
function ldArticleLink(raw) {
    var link = ldAbs(raw);
    if (!link) return null;
    link = link.replace(/[?#].*$/, "");
    var low = link.toLowerCase();
    if (low.indexOf("//laodong.vn/") === -1) return null;
    if (low.indexOf("//laodong.vn/tags/") !== -1) return null;
    if (!/-\d+\.ldo$/i.test(link)) return null;
    return link;
}

function ldImg(tag) {
    if (!tag) return null;
    var m = /data-src="([^"]+)"/i.exec(tag)
        || /data-original="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = ldDecode(m[1]).trim();
    if (!url || url.indexOf("data:") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

/** "23/10/2026 06:10" (giờ VN, GMT+7) → epoch ms. */
function ldDateMs(raw) {
    if (!raw) return 0;
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(raw));
    if (!m) return 0;
    var ms = Date.UTC(
        parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
        m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0, 0
    ) - 7 * 3600 * 1000;
    return isNaN(ms) ? 0 : ms;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

/** Cắt phần sidebar/footer để không lẫn tin ngoài danh sách chính. */
var LD_TAIL_MARKS = [
    '<div class="pagination-md-1"',
    '<div class="right-category"',
    '<div class="blk-tin-lien-quan"',
    '<div class="box-binh-luan"',
    '<div class="form-binh-luan',
    '<footer'
];

function ldCutTail(html) {
    var end = html.length;
    for (var i = 0; i < LD_TAIL_MARKS.length; i++) {
        var idx = html.indexOf(LD_TAIL_MARKS[i]);
        if (idx >= 0 && idx < end) end = idx;
    }
    return html.substring(0, end);
}

function ldParseCard(part) {
    if (!part) return null;

    var href = null;
    var title = null;

    var am = /<a\b([^>]*class="[^"]*link-title[^"]*"[^>]*)>([\s\S]*?)<\/a>/i.exec(part);
    if (am) {
        var hm = /href="([^"]+)"/i.exec(am[1]);
        if (hm) href = hm[1];
        var tm = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(am[2]);
        title = ldStrip(tm ? tm[1] : am[2]);
        if (!title) {
            var at = /title="([^"]+)"/i.exec(am[1]);
            if (at) title = ldStrip(at[1]);
        }
    }
    if (!href) {
        var any = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
        if (any) {
            href = any[1];
            title = ldStrip(any[2]);
        }
    }

    var link = ldArticleLink(href);
    if (!link) return null;

    if (!title) {
        var h2 = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(part);
        if (h2) title = ldStrip(h2[1]);
    }
    if (!title) return null;
    title = title.replace(/\s+/g, " ").trim();
    if (title.length < 5) return null;

    var imgTag = /<img\b[^>]*class="[^"]*img-art[^"]*"[^>]*>/i.exec(part)
        || /<img\b[^>]*>/i.exec(part);
    var imageUrl = imgTag ? ldImg(imgTag[0]) : null;

    var excerpt = null;
    var em = /<div[^>]*class="[^"]*chapeau[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(part);
    if (em) {
        var txt = ldStrip(em[1]).replace(/\s+/g, " ").trim();
        if (txt.length >= LD_MIN_TEXT) excerpt = txt;
    }

    var pubDate = null;
    var pubDateMs = 0;
    var timeM = /<span[^>]*class="[^"]*time[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(part);
    if (timeM) {
        var raw = ldStrip(timeM[1]).replace(/\s+/g, " ").trim();
        if (raw) {
            pubDate = raw;
            pubDateMs = ldDateMs(raw);
        }
    }

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDate: pubDate,
        pubDateMs: pubDateMs,
        sourceName: LD_SOURCE_NAME
    };
}

function ldParseCards(html) {
    var source = ldClean(html).replace(/<!--[\s\S]*?-->/g, " ");
    var items = [];
    var seen = {};
    var parts = source.split('<article class="v4');
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 12000) part = part.substring(0, 12000);
        var item = null;
        try {
            item = ldParseCard(part);
        } catch (e) {
            item = null;
        }
        if (!item || seen[item.link]) continue;
        seen[item.link] = true;
        items.push(item);
    }
    return items;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    return JSON.stringify(ldParseCards(ldCutTail(String(html))));
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!currentUrl || !page || page < 2) return null;
    if (page > LD_MAX_PAGE) return null;

    var source = String(html || "");
    var pager = source.indexOf('class="pagination-md-1"');
    if (pager < 0) return null;
    if (source.indexOf('<article class="v4') < 0) return null;

    // `page` là trang ĐỊNH TẢI (app truyền nextPage + 1). Pager chỉ in vài số quanh
    // trang hiện tại nên chỉ cần kiểm tra trang đích còn nằm trong dải số của pager;
    // bỏ link "Last" (nhảy rất xa) để trang cuối dừng đúng.
    var curM = /[?&]page=(\d+)/i.exec(String(currentUrl));
    var cur = curM ? parseInt(curM[1], 10) : 1;
    var tail = source.substring(pager);
    var re = /[?&]page=(\d+)/gi;
    var maxPage = 0;
    var m;
    while ((m = re.exec(tail)) !== null) {
        var n = parseInt(m[1], 10);
        if (isNaN(n)) continue;
        if (n > cur + 100) continue; // link "Last"
        if (n > maxPage) maxPage = n;
    }
    if (!maxPage || page > maxPage) return null;

    var base = String(currentUrl).replace(/[?#].*$/, "");
    return base + "?page=" + page;
}

function getNewsSearchUrl(query, page) {
    return null;
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var LD_BODY_START = [
    'id="gallery-ctt"',
    'class="art-body"',
    'class="video-content"'
];

var LD_BODY_END = [
    'class="tin-lien-quan"',
    'class="blk-tin-lien-quan"',
    'class="art-footer"',
    'class="box-binh-luan"',
    'class="form-binh-luan',
    'class="lst-tags"'
];

function ldTitle(source) {
    var res = [
        /<h1[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
        /<h1[^>]*>([\s\S]*?)<\/h1>/i,
        /<title>([\s\S]*?)<\/title>/i
    ];
    for (var i = 0; i < res.length; i++) {
        var m = res[i].exec(source);
        if (!m) continue;
        var t = ldStrip(m[1]).replace(/\s+/g, " ").trim();
        if (t) return t.replace(/\s*-\s*LAODONG\.VN$/i, "");
    }
    return "";
}

function ldTableText(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(ldStrip(cells[c]).replace(/\s+/g, " "));
        var line = parts.join(" | ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function ldListText(tag) {
    var lis = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < lis.length; i++) {
        var txt = ldStrip(lis[i]).replace(/\s+/g, " ").trim();
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function ldVideoSrc(tag) {
    var m = /<source\b[^>]*src="([^"]+)"/i.exec(tag)
        || /<(?:video|iframe)\b[^>]*src="([^"]+)"/i.exec(tag)
        || /data-src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = ldDecode(m[1]).trim();
    if (!url || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function ldBlockFromTag(tag) {
    var lower = tag.toLowerCase();

    if (lower.indexOf("<figure") === 0) {
        var imgTag = /<img\b[^>]*>/i.exec(tag);
        var src = imgTag ? ldImg(imgTag[0]) : null;
        var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
        var caption = capM ? ldStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
        if (caption && caption.length < 3) caption = null;
        if (src) {
            return { isImage: true, text: caption, imageUrl: src, isVideo: false, videoUrl: null };
        }
        var fv = ldVideoSrc(tag);
        if (fv) {
            return { isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: fv };
        }
        return null;
    }

    if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
        var v = ldVideoSrc(tag);
        if (v) return { isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: v };
        return null;
    }

    if (lower.indexOf("<table") === 0) {
        var tableText = ldTableText(tag);
        if (tableText.length >= LD_MIN_TEXT) {
            return { isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null };
        }
        return null;
    }

    if (lower.indexOf("<ul") === 0 || lower.indexOf("<ol") === 0) {
        var listText = ldListText(tag);
        if (listText.length >= LD_MIN_TEXT) {
            return { isImage: false, text: listText, imageUrl: null, isVideo: false, videoUrl: null };
        }
        return null;
    }

    var text = ldStrip(tag).replace(/\s+/g, " ").trim();
    if (text.length >= LD_MIN_TEXT) {
        return { isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null };
    }
    return null;
}

var LD_BLOCK_RE = /<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<table\b[^>]*>[\s\S]*?<\/table>|<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>|<(h2|h3|h4)\b[^>]*>[\s\S]*?<\/\2>/gi;

function ldPushText(out, chunk) {
    var parts = String(chunk).split(/\n{2,}/);
    for (var i = 0; i < parts.length; i++) {
        var t = parts[i].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        if (!t || t.length < LD_MIN_TEXT) continue;
        if (/^\d+\s*\/\s*\d+$/.test(t)) continue;
        out.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
    }
}

/**
 * Đoạn văn của laodong.vn dùng `<p>` không đóng thẻ → không thể regex cặp thẻ.
 * Thay mỗi block (figure/video/bảng/list/heading) bằng marker, biến thẻ mở đoạn
 * thành xuống dòng, rồi ghép lại theo đúng thứ tự marker.
 */
function ldScanBlocks(body) {
    var blocks = [];
    var src = String(body).replace(LD_BLOCK_RE, function (tag) {
        var b = null;
        try {
            b = ldBlockFromTag(tag);
        } catch (e) {
            b = null;
        }
        if (!b) return " ";
        blocks.push(b);
        return "\u0001" + (blocks.length - 1) + "\u0002";
    });

    src = src.replace(/<br\s*\/?>/gi, "\n")
        .replace(/<p\b[^>]*>/gi, "\n\n")
        .replace(/<\/(p|div|blockquote)>/gi, "\n\n")
        .replace(/<div\b[^>]*>/gi, "\n\n")
        .replace(/<[^>]*>/g, " ");
    src = ldDecode(src)
        .replace(/[ \t\u00a0]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{2,}/g, "\n\n");

    var out = [];
    var re = /\u0001(\d+)\u0002/g;
    var last = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
        ldPushText(out, src.substring(last, m.index));
        var idx = parseInt(m[1], 10);
        if (!isNaN(idx) && blocks[idx]) out.push(blocks[idx]);
        last = re.lastIndex;
    }
    ldPushText(out, src.substring(last));
    return out;
}

function ldSapo(source) {
    var m = /<div[^>]*class="[^"]*chappeau[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!m) return null;
    var t = ldStrip(m[1]).replace(/\s+/g, " ").trim();
    return t.length >= LD_MIN_TEXT ? t : null;
}

function ldRelated(source, selfLink) {
    var items = [];
    var seen = {};
    var chunks = [];
    var marks = ['class="tin-lien-quan"', 'class="blk-tin-lien-quan"'];
    for (var i = 0; i < marks.length; i++) {
        var idx = source.indexOf(marks[i]);
        if (idx >= 0) chunks.push(source.substring(idx, idx + 60000));
    }
    var self = String(selfLink || "").replace(/[?#].*$/, "");
    for (var c = 0; c < chunks.length; c++) {
        var more = ldParseCards(chunks[c]);
        for (var j = 0; j < more.length; j++) {
            var it = more[j];
            if (it.link === self || seen[it.link]) continue;
            seen[it.link] = true;
            items.push(it);
            if (items.length >= 12) return items;
        }
    }
    return items;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    // Trang challenge không có nội dung
    if (source.length < 3000) return null;

    var start = -1;
    var startMark = "";
    for (var i = 0; i < LD_BODY_START.length; i++) {
        var idx = source.indexOf(LD_BODY_START[i]);
        if (idx >= 0 && (start < 0 || idx < start)) {
            start = idx;
            startMark = LD_BODY_START[i];
        }
    }
    if (start < 0) return null;
    var gt = source.indexOf(">", start);
    if (gt < 0) return null;

    var body = source.substring(gt + 1);
    var end = body.length;
    for (var e = 0; e < LD_BODY_END.length; e++) {
        var endIdx = body.indexOf(LD_BODY_END[e]);
        if (endIdx >= 0 && endIdx < end) end = endIdx;
    }
    body = body.substring(0, end);
    body = ldClean(body).replace(/<!--[\s\S]*?-->/g, " ");

    var blocks = ldScanBlocks(body);

    // Sapo nằm ngoài thân bài (trừ trang video, sapo nằm trong vùng video-content)
    if (startMark !== 'class="video-content"') {
        var sapo = ldSapo(source);
        if (sapo) blocks.unshift({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
    }

    var title = ldTitle(source);
    if (!title && blocks.length === 0) return null;
    if (blocks.length === 0) return null;

    return JSON.stringify({
        title: title,
        blocks: blocks,
        related: ldRelated(source, url)
    });
}
