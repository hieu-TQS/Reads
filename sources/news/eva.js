/**
 * Eva (eva.vn) — nguồn báo dạng JS.
 *
 * Đặc điểm site (kiểm tra 10/2026):
 *  - Chuyên mục là URL dạng /<slug>-c<id>.html (vd /tin-tuc-c73.html).
 *    Các URL kiểu /tin-tuc/ , /suc-khoe/ đều 404.
 *  - Mỗi bài trên trang danh sách có 2 anchor cùng URL: anchor ảnh (rỗng, chỉ có
 *    <img alt="tiêu đề">) đứng trước, anchor tiêu đề (<h3><a>…</a></h3>) đứng sau
 *    → phải gom theo URL, không được "đánh dấu đã gặp" trước khi có tiêu đề.
 *  - Phân trang: ?page=N trả lại đúng trang 1 (site không phân trang server-side),
 *    nút "Xem thêm" gọi AJAX POST /ajax/box_gen_and_process_html/… nên app
 *    (chỉ fetch GET) không lấy được → không trả next page.
 *  - Tìm kiếm: eva.vn không có trang tìm kiếm nội bộ (ô search đẩy sang Google).
 *  - Bài viết: <h1> tiêu đề, thân bài trong <div id="div_news_content"> gồm sapo
 *    (.eva-cont-art__sum) + các <p> rời + ảnh lazy trong #container-24h-banner-in-image,
 *    kết thúc ở .eva-source-art; album ảnh dùng .eva-cont-art__img + p.eva-alb-art__cap-img.
 */
var EVA_HOST = "https://eva.vn";
var EVA_SOURCE_NAME = "Eva";
var EVA_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
var EVA_ARTICLE_RE = /-c\d+a\d+\.html/i;

var EVA_CATEGORIES = [
    { name: "Trang chủ", pageUrl: EVA_HOST + "/" },
    { name: "Tin tức", pageUrl: EVA_HOST + "/tin-tuc-c73.html" },
    { name: "Giải trí", pageUrl: EVA_HOST + "/lang-sao-c20.html" },
    { name: "Sức khỏe", pageUrl: EVA_HOST + "/suc-khoe-c131.html" },
    { name: "Đẹp", pageUrl: EVA_HOST + "/lam-dep-c58.html" },
    { name: "Yêu con", pageUrl: EVA_HOST + "/lam-me-c10.html" },
    { name: "Bà bầu", pageUrl: EVA_HOST + "/ba-bau-c85.html" },
    { name: "Yêu", pageUrl: EVA_HOST + "/tinh-yeu-gioi-tinh-c3.html" },
    { name: "Eva tám", pageUrl: EVA_HOST + "/eva-tam-c66.html" },
    { name: "Nuôi con IQ EQ", pageUrl: EVA_HOST + "/nuoi-con-khoe-day-con-khon-c429.html" },
    { name: "Bếp Eva", pageUrl: EVA_HOST + "/bep-eva-c162.html" },
    { name: "Lifestyle", pageUrl: EVA_HOST + "/di-dau-xem-gi-c40.html" },
    { name: "Sao Việt", pageUrl: EVA_HOST + "/sao-viet-c337.html" },
    { name: "Thời trang", pageUrl: EVA_HOST + "/thoi-trang-c36.html" },
    { name: "Nhà đẹp", pageUrl: EVA_HOST + "/nha-dep-c169.html" },
    { name: "Du lịch", pageUrl: EVA_HOST + "/du-lich-c287.html" },
    { name: "Tiêu dùng", pageUrl: EVA_HOST + "/tieu-dung-c2.html" },
    { name: "Giáo dục", pageUrl: EVA_HOST + "/giao-duc-c252.html" },
    { name: "Chuyện lạ", pageUrl: EVA_HOST + "/chuyen-la-c115.html" },
    { name: "Video chọn lọc", pageUrl: EVA_HOST + "/clip-eva-c157.html" }
];

/* ------------------------------------------------------------------ */
/* Tiện ích chuỗi                                                      */
/* ------------------------------------------------------------------ */

function evaAttr(tag, name) {
    if (!tag) return "";
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
    var m = re.exec(tag);
    if (!m) return "";
    if (m[2] !== undefined) return m[2];
    if (m[3] !== undefined) return m[3];
    return m[4] || "";
}

function evaDecode(s) {
    if (!s) return "";
    var out = String(s);
    out = out.replace(/&nbsp;/gi, " ")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&hellip;/gi, "...")
        .replace(/&laquo;/gi, "\"")
        .replace(/&raquo;/gi, "\"")
        .replace(/&ldquo;/gi, "\"")
        .replace(/&rdquo;/gi, "\"")
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "-")
        .replace(/&amp;/gi, "&");
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 16));
    });
    out = out.replace(/&#(\d+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 10));
    });
    // Lỗi gõ của eva: "&amp; #34;" (có dấu cách) → & #34; → "
    out = out.replace(/&\s+#x([0-9a-fA-F]+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 16));
    });
    out = out.replace(/&\s+#(\d+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 10));
    });
    return out;
}

function evaStripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, " ");
}

function evaText(s) {
    // Một số tiêu đề/alt bị encode 2 lần (&amp;#34; → &#34; → ")
    return evaDecode(evaDecode(evaStripTags(s))).replace(/\s+/g, " ").trim();
}

function evaAbs(u) {
    if (!u) return "";
    var s = String(u).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.charAt(0) === "/") return EVA_HOST + s;
    return EVA_HOST + "/" + s;
}

/** Bỏ script/style/noscript/comment — tránh nuốt JS vào nội dung bài. */
function evaClean(html) {
    return String(html || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

/** URL ảnh thật của 1 thẻ <img> (ưu tiên lazy-load). */
function evaImgSrc(tag) {
    var keys = ["data-original", "data-src", "data-lazy-src", "data-echo", "src"];
    for (var i = 0; i < keys.length; i++) {
        var v = evaAttr(tag, keys[i]).trim();
        if (v && v.indexOf("data:") !== 0) return v;
    }
    var ss = evaAttr(tag, "srcset");
    if (ss) {
        var first = ss.split(",")[0];
        first = first ? first.replace(/\s+\d+(\.\d+)?[wx]$/i, "").trim() : "";
        if (first && first.indexOf("data:") !== 0) return first;
    }
    return "";
}

/* ------------------------------------------------------------------ */
/* Metadata nguồn                                                      */
/* ------------------------------------------------------------------ */

function getNewsSource() {
    return JSON.stringify({
        id: "eva",
        name: EVA_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=eva.vn&sz=64",
        categories: EVA_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    if (!link) return false;
    return /^https?:\/\/(www\.|m\.)?eva\.vn(\/|$)/i.test(String(link));
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": EVA_MOBILE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.6",
        "Referer": "https://eva.vn/"
    });
}

/* ------------------------------------------------------------------ */
/* Danh sách tin                                                       */
/* ------------------------------------------------------------------ */

/**
 * Gom anchor bài viết theo URL (1 bài có thể có 2 anchor: ảnh + tiêu đề).
 * Tiêu đề lấy từ text anchor, fallback sang alt của <img> hoặc title của <a>.
 */
function evaCards(html, limit) {
    var src = evaClean(html);
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var order = [];
    var map = {};
    var m;
    while ((m = re.exec(src)) !== null) {
        var attrs = m[1] || "";
        var href = evaAttr(attrs, "href");
        if (!href || href.indexOf("javascript:") === 0) continue;
        if (!EVA_ARTICLE_RE.test(href)) continue;
        var link = evaAbs(evaDecode(href));
        if (!link) continue;

        var item = map[link];
        if (!item) {
            item = { title: "", link: link, imageUrl: "", excerpt: "" };
            map[link] = item;
            order.push(link);
        }

        var inner = m[2] || "";
        if (!item.imageUrl && /<img\b/i.test(inner)) {
            var im = /<img\b[^>]*>/i.exec(inner);
            if (im) {
                var u = evaImgSrc(im[0]);
                if (u) item.imageUrl = evaAbs(evaDecode(u));
            }
        }
        var t = evaText(inner);
        if (t.length >= 8 && t.length > item.title.length) item.title = t;
        if (item.title.length < 8) {
            var alt = evaAttr(attrs, "title");
            if (!alt) {
                var im2 = /<img\b[^>]*>/i.exec(inner);
                if (im2) alt = evaAttr(im2[0], "alt");
            }
            alt = evaText(alt);
            if (alt.length >= 8) item.title = alt;
        }
    }

    var out = [];
    for (var i = 0; i < order.length; i++) {
        var it = map[order[i]];
        if (!it || it.title.length < 8) continue;
        out.push({
            title: it.title,
            link: it.link,
            excerpt: it.excerpt ? it.excerpt : null,
            imageUrl: it.imageUrl ? it.imageUrl : null,
            pubDateMs: 0
        });
        if (limit > 0 && out.length >= limit) break;
    }
    return out;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    return JSON.stringify(evaCards(html, 60));
}

function getNewsNextPageUrl(currentUrl, page, html) {
    // eva.vn không có phân trang server-side (?page=N trả lại trang 1);
    // "Xem thêm" là AJAX POST nên không dựng được URL GET.
    return null;
}

function getNewsSearchUrl(query, page) {
    return null;
}

/* ------------------------------------------------------------------ */
/* Đọc bài                                                             */
/* ------------------------------------------------------------------ */

/** Ảnh rác: icon, logo, nút đóng banner trong ảnh, ảnh placeholder. */
function evaIsContentImage(u) {
    var s = String(u || "").toLowerCase();
    if (!s || s.indexOf("data:") === 0) return false;
    if (s.indexOf("in-image-close") >= 0) return false;
    if (s.indexOf("/images/responsive/") >= 0) return false;
    if (s.indexOf("logo") >= 0) return false;
    if (s.indexOf("favicon") >= 0) return false;
    if (s.indexOf("/ads/") >= 0) return false;
    return true;
}

function evaIsJunkText(t) {
    if (!t || t.length < 2) return true;
    if (/^(Advertisement|Quảng cáo|Chia sẻ|Bình luận|Xem thêm|Bấm xem >>|Nguồn:)$/i.test(t)) return true;
    if (t.indexOf("banner_tostring") >= 0) return true;
    if (t.indexOf("document.getElementById") >= 0) return true;
    if (t.indexOf("window.addEventListener") >= 0) return true;
    if (t.indexOf("$(") >= 0 && t.indexOf("function") >= 0) return true;
    return false;
}

/** Cắt phần thân bài giữa #div_news_content và mốc kết thúc (nguồn / tin liên quan). */
function evaBodyHtml(src) {
    var start = -1;
    var idm = src.indexOf('id="div_news_content"');
    if (idm >= 0) start = src.indexOf(">", idm) + 1;
    if (start <= 0) {
        var sum = src.search(/<div[^>]*class="[^"]*eva-cont-art__sum[^"]*"/i);
        if (sum >= 0) start = sum;
    }
    if (start <= 0) {
        var info = src.search(/<div[^>]*class="[^"]*eva-cont-art__info[^"]*"/i);
        if (info >= 0) start = src.indexOf(">", info) + 1;
    }
    if (start <= 0) return "";

    var rest = src.slice(start);
    var marks = [
        'class="evtBox evtBoxPrBt"',
        'class="eva-source-art',
        'class="author color-main',
        'id="authorNews"',
        '<section class="reNsAve',
        'id="div_box_bai_viet_cung_su_kien"',
        'class="eva-split-more-art',
        'class="boxRelatedNewsBtt'
    ];
    var end = -1;
    for (var i = 0; i < marks.length; i++) {
        var p = rest.indexOf(marks[i]);
        if (p > 0 && (end < 0 || p < end)) end = p;
    }
    return end > 0 ? rest.slice(0, end) : rest;
}

/** URL video từ JSON-LD VideoObject (bài video của eva không có thẻ <video> trong HTML). */
function evaLdVideo(html) {
    if (!html) return "";
    if (!/"@type"\s*:\s*"VideoObject"/i.test(html)) return "";
    var re = /"contentUrl"\s*:\s*"([^"]+)"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var u = m[1].replace(/\\\//g, "/");
        if (/\.(mp4|m3u8|webm)(\?|$)/i.test(u)) return evaAbs(evaDecode(u));
    }
    return "";
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var src = evaClean(html);

    var title = "";
    var h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(src);
    if (h1) title = evaText(h1[1]);
    if (!title) {
        var og = /<meta[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(src);
        if (og) title = evaText(og[1]);
    }

    var body = evaBodyHtml(src);
    if (!body) return null;

    // Ảnh → placeholder để giữ đúng thứ tự với đoạn văn.
    var images = [];
    var work = body.replace(/<img\b[^>]*>/gi, function (tag) {
        var u = evaImgSrc(tag);
        if (!u) return " ";
        u = evaAbs(evaDecode(u));
        if (!evaIsContentImage(u)) return " ";
        images.push(u);
        return "\n\u0001I" + (images.length - 1) + "\u0001\n";
    });

    // Video trực tiếp (mp4/m3u8) → block video.
    var videos = [];
    if (!/<video\b/i.test(work)) {
        var ld = evaLdVideo(html);
        if (ld) {
            videos.push(ld);
            work = "\n\u0001V0\u0001\n" + work;
        }
    }
    work = work.replace(/<video\b[\s\S]*?<\/video>/gi, function (tag) {
        var s = /<source\b[^>]*src=["']([^"']+)["']/i.exec(tag);
        if (!s) s = /<video\b[^>]*src=["']([^"']+)["']/i.exec(tag);
        if (!s) return " ";
        var u = evaAbs(evaDecode(s[1]));
        if (!u) return " ";
        videos.push(u);
        return "\n\u0001V" + (videos.length - 1) + "\u0001\n";
    });

    // Xuống dòng theo cấu trúc khối rồi bỏ hết tag còn lại.
    work = work
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|section|article|figcaption|tr|td)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/<[a-zA-Z\/][^>]*$/, " ");   // thẻ bị cắt cụt ở cuối vùng thân bài

    var text = evaDecode(work);
    var parts = text.split(/(\u0001[IV]\d+\u0001)/);
    var blocks = [];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) continue;

        var ip = /^\u0001I(\d+)\u0001$/.exec(part);
        if (ip) {
            blocks.push({ isImage: true, text: null, imageUrl: images[parseInt(ip[1], 10)] });
            continue;
        }
        var vp = /^\u0001V(\d+)\u0001$/.exec(part);
        if (vp) {
            blocks.push({ isImage: false, isVideo: true, videoUrl: videos[parseInt(vp[1], 10)] });
            continue;
        }
        var lines = part.split("\n");
        for (var j = 0; j < lines.length; j++) {
            var line = lines[j].replace(/\s+/g, " ").trim();
            if (evaIsJunkText(line)) continue;
            blocks.push({ isImage: false, text: line });
        }
    }

    // Tin liên quan (cuối bài) — bóc từ chính HTML, không cần request thêm.
    var related = [];
    var relHtml = "";
    var rs = src.indexOf('<section class="reNsAve');
    if (rs >= 0) {
        relHtml = src.slice(rs, rs + 30000);
    } else {
        var rb = src.indexOf('id="div_box_bai_viet_cung_su_kien"');
        if (rb >= 0) relHtml = src.slice(rb, rb + 20000);
    }
    if (relHtml) {
        var cands = evaCards(relHtml, 16);
        var cur = evaAbs(url || "");
        for (var k = 0; k < cands.length && related.length < 12; k++) {
            if (cur && cands[k].link === cur) continue;
            related.push(cands[k]);
        }
    }

    var hasText = false;
    for (var b = 0; b < blocks.length; b++) {
        if (!blocks[b].isImage && !blocks[b].isVideo && blocks[b].text && blocks[b].text.length > 1) {
            hasText = true;
            break;
        }
    }
    if (!hasText) return null;

    return JSON.stringify({ title: title, blocks: blocks, related: related });
}
