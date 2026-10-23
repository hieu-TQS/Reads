/**
 * Báo Soha (soha.vn) — nguồn báo dạng JS.
 *
 * Nền tảng VCCorp, không Cloudflare/challenge. Có 2 layout:
 *  - Desktop (soha.vn): chuyên mục 28 tin/trang, tìm kiếm trả tối đa 40 kết quả.
 *  - Mobile (m.soha.vn): trang chủ render sẵn 38 tin; bài viết gọn hơn.
 * Cùng một loại thẻ tin:
 *   `<article class="box-category-item">` (hoặc `div.box-category-item.video-item`)
 *   tiêu đề `a.box-category-link-title`, ảnh `img.box-category-avatar`
 *   (video dùng `video.box-category-avatar[poster]`), mô tả `p.box-category-sapo`,
 *   giờ đăng `span.box-category-time[title="yyyy-MM-ddTHH:mm:ss"]`.
 *
 * Phân trang KHÔNG có link HTML; nút cuộn gọi AJAX:
 *   `/timelinelist/<hdZoneId>/<page>.htm`  (chuyên mục, 10 tin/trang)
 *   `/timelinesearch/<keyword-slug>/<page>.htm` (tìm kiếm, khoá KHÔNG dấu)
 * Trang chủ và `/tin-moi-nhat.htm` (zone 0) không phân trang.
 * Lưu ý: trang tìm kiếm có dấu chỉ trả kết quả ở trang 1; trang 2 phải dùng slug
 * không dấu nên sẽ ra tập kết quả khác → chỉ phân trang khi từ khoá là ASCII.
 *
 * Đọc bài: h1 `detail-title` (mobile) / `news-title` (desktop) / `vdbw-title` (video),
 * sapo `detail-sapo` | `news-sapo` | `vdbw-sapo`, thân `div[itemprop=articleBody]`
 * (kết thúc ở `body_end`), khối ảnh `figure.VCSortableInPreviewMode[type=Photo]`,
 * video `VCSortableInPreviewMode[type=VideoStream][data-vid]`.
 *
 * Toàn bộ hàm trả JSON string, ES5 thuần.
 */

var SH_HOST = "https://soha.vn";
var SH_MOBILE = "https://m.soha.vn";
var SH_SOURCE_NAME = "Soha";
var SH_MAX_PAGE = 100;
var SH_MAX_SEARCH_PAGE = 40;
var SH_MIN_TEXT = 10;
var SH_UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var SH_UA_MOBILE = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var SH_CATEGORIES = [
    { name: "Trang chủ", pageUrl: SH_MOBILE + "/" },
    { name: "Mới nhất", pageUrl: SH_MOBILE + "/tin-moi-nhat.htm" },
    { name: "Thời sự - Xã hội", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi.htm" },
    { name: "Kinh doanh", pageUrl: SH_MOBILE + "/kinh-doanh.htm" },
    { name: "Bất động sản", pageUrl: SH_MOBILE + "/kinh-doanh/bat-dong-san.htm" },
    { name: "Quốc tế", pageUrl: SH_MOBILE + "/quoc-te.htm" },
    { name: "Thể thao", pageUrl: SH_MOBILE + "/the-thao.htm" },
    { name: "Bình luận bóng đá", pageUrl: SH_MOBILE + "/the-thao/binh-luan.htm" },
    { name: "Nhịp sống mới", pageUrl: SH_MOBILE + "/nhip-song-moi.htm" },
    { name: "Giải trí", pageUrl: SH_MOBILE + "/giai-tri.htm" },
    { name: "Pháp luật", pageUrl: SH_MOBILE + "/phap-luat.htm" },
    { name: "Sống khỏe", pageUrl: SH_MOBILE + "/song-khoe.htm" },
    { name: "Xe", pageUrl: SH_MOBILE + "/xe.htm" },
    { name: "Công nghệ", pageUrl: SH_MOBILE + "/cong-nghe.htm" },
    { name: "Đời sống", pageUrl: SH_MOBILE + "/doi-song.htm" },
    { name: "Bài học cuộc sống", pageUrl: SH_MOBILE + "/doi-song/bai-hoc-cuoc-song.htm" },
    { name: "Giáo dục", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi/giao-duc.htm" },
    { name: "Y tế", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi/y-te.htm" },
    { name: "Đô thị", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi/do-thi.htm" },
    { name: "Phóng sự - Ký sự", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi/phong-su-ky-su.htm" },
    { name: "Tấm lòng thiện", pageUrl: SH_MOBILE + "/thoi-su-xa-hoi/tam-long-thien.htm" },
    { name: "Video", pageUrl: SH_MOBILE + "/video.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "soha",
        name: SH_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=soha.vn&sz=64",
        categories: SH_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("soha.vn") !== -1;
}

function getNewsHeaders(url) {
    var mobile = /^https?:\/\/m\.soha\.vn/i.test(String(url || ""));
    return JSON.stringify({
        "User-Agent": mobile ? SH_UA_MOBILE : SH_UA_DESKTOP,
        "Referer": (mobile ? SH_MOBILE : SH_HOST) + "/",
        "Accept-Language": "vi-VN,vi;q=0.9"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var SH_ENTITIES = {
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

function shDecode(value) {
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
        return SH_ENTITIES.hasOwnProperty(name) ? SH_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function shStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = shDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function shClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

function shHostOf(url) {
    var m = /^(https?:\/\/[^\/?#]+)/i.exec(String(url || ""));
    return m ? m[1] : SH_HOST;
}

function shAbs(raw, baseUrl) {
    if (!raw) return null;
    var link = shDecode(raw).replace(/&amp;/g, "&").trim();
    if (!link) return null;
    if (/^https?:\/\//i.test(link)) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    var host = shHostOf(baseUrl);
    if (link.charAt(0) === "/") return host + link;
    if (link.charAt(0) === "#" || link.indexOf("javascript:") === 0) return null;
    return host + "/" + link.replace(/^\.\//, "");
}

function shImgSrc(tag) {
    if (!tag) return null;
    var m = /data-src="([^"]+)"/i.exec(tag)
        || /data-original="([^"]+)"/i.exec(tag)
        || /data-srcset="([^"]+)"/i.exec(tag)
        || /srcset="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = shDecode(m[1]).replace(/&amp;/g, "&").trim().split(",")[0].trim().split(" ")[0];
    if (!url || url.indexOf("data:") === 0 || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function shAttr(tag, name) {
    if (!tag) return null;
    var m = new RegExp("\\b" + name + "=\"([^\"]*)\"", "i").exec(tag);
    return m ? shDecode(m[1]) : null;
}

function shVideoUrl(tag) {
    if (!tag) return null;
    var vid = shAttr(tag, "data-vid");
    if (vid) {
        vid = vid.replace(/&amp;/g, "&").trim();
        if (vid.indexOf("http") !== 0) vid = "https://" + vid.replace(/^\/+/, "");
        return vid;
    }
    var m = /<(?:video|source)\b[^>]*src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = shDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    return /^https?:\/\//i.test(url) ? url : null;
}

/** Giờ đăng ISO (mặc định GMT+7) → ms. */
function shIsoMs(value) {
    var s = String(value || "").trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (!m) return 0;
    var ms = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6] || "0", 10));
    var off = 7;
    var om = /([+-])(\d{2}):?(\d{2})\s*$/.exec(s);
    if (om) {
        off = (parseInt(om[2], 10) + parseInt(om[3], 10) / 60) * (om[1] === "-" ? -1 : 1);
    }
    return ms - off * 3600000;
}

function shLabel(ms) {
    var n = parseInt(ms, 10);
    if (!n || isNaN(n)) return null;
    var d = new Date(n + 7 * 3600 * 1000);
    var dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
    var hh = d.getUTCHours(), mi = d.getUTCMinutes();
    return (dd < 10 ? "0" + dd : "" + dd) + "/" + (mm < 10 ? "0" + mm : "" + mm) + "/" + yy +
        " " + (hh < 10 ? "0" + hh : "" + hh) + ":" + (mi < 10 ? "0" + mi : "" + mi);
}

function shUrlDecode(value) {
    try {
        return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (e) {
        return String(value || "");
    }
}

function shQuery(url, name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)", "i").exec(String(url || ""));
    return m ? m[1] : null;
}

var SH_MARKS = {
    "à": "a", "á": "a", "ạ": "a", "ả": "a", "ã": "a",
    "â": "a", "ầ": "a", "ấ": "a", "ậ": "a", "ẩ": "a", "ẫ": "a",
    "ă": "a", "ằ": "a", "ắ": "a", "ặ": "a", "ẳ": "a", "ẵ": "a",
    "è": "e", "é": "e", "ẹ": "e", "ẻ": "e", "ẽ": "e",
    "ê": "e", "ề": "e", "ế": "e", "ệ": "e", "ể": "e", "ễ": "e",
    "ì": "i", "í": "i", "ị": "i", "ỉ": "i", "ĩ": "i",
    "ò": "o", "ó": "o", "ọ": "o", "ỏ": "o", "õ": "o",
    "ô": "o", "ồ": "o", "ố": "o", "ộ": "o", "ổ": "o", "ỗ": "o",
    "ơ": "o", "ờ": "o", "ớ": "o", "ợ": "o", "ở": "o", "ỡ": "o",
    "ù": "u", "ú": "u", "ụ": "u", "ủ": "u", "ũ": "u",
    "ư": "u", "ừ": "u", "ứ": "u", "ự": "u", "ử": "u", "ữ": "u",
    "ỳ": "y", "ý": "y", "ỵ": "y", "ỷ": "y", "ỹ": "y",
    "đ": "d"
};

function shSlug(value) {
    var s = String(value || "").toLowerCase();
    var out = "";
    for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        out += SH_MARKS.hasOwnProperty(ch) ? SH_MARKS[ch] : ch;
    }
    return out.replace(/[^a-z0-9\s\-]/g, " ").replace(/\s+/g, " ").trim().replace(/\s/g, "-");
}

function shIsAscii(value) {
    return /^[\x00-\x7F]*$/.test(String(value || ""));
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

function shParseCard(chunk, baseUrl, seen) {
    // Tiêu đề + link: <a class="box-category-link-title" ... href title>
    var anchorM = /<a\b[^>]*class="[^"]*box-category-link-title[^"]*"[^>]*>/i.exec(chunk);
    var link = anchorM ? shAbs(shAttr(anchorM[0], "href"), baseUrl) : null;
    var title = anchorM ? (shAttr(anchorM[0], "title") || "") : "";
    if (!link) {
        var aM = /<a\b[^>]*(?:href)="([^"]+)"[^>]*>/i.exec(chunk);
        if (!aM) return null;
        link = shAbs(aM[1], baseUrl);
        title = shAttr(aM[0], "title") || "";
    }
    if (!link) return null;
    link = link.replace(/[?#].*$/, "");
    if (!/[-\/]\d+\.htm$/i.test(link)) return null;
    if (seen[link]) return null;

    if (!title) {
        var tM = anchorM ? /<a\b[^>]*class="[^"]*box-category-link-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk) : null;
        title = tM ? shStrip(tM[1]) : "";
    }
    title = title.replace(/\s+/g, " ").trim();
    if (title.length < 5) return null;

    var imageUrl = null;
    var videoM = /<video\b[^>]*class="[^"]*box-category-avatar[^"]*"[^>]*>/i.exec(chunk);
    if (videoM) {
        imageUrl = shAttr(videoM[0], "poster");
    }
    if (!imageUrl) {
        var imgM = /<img\b[^>]*class="[^"]*box-category-avatar[^"]*"[^>]*>/i.exec(chunk)
            || /<img\b[^>]*>/i.exec(chunk);
        if (imgM) imageUrl = shImgSrc(imgM[0]);
    }
    if (imageUrl && imageUrl.indexOf("data:") === 0) imageUrl = null;

    var excerpt = null;
    var sm = /<p\b[^>]*class="[^"]*box-category-sapo[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    if (!sm) sm = /<p\b[^>]*data-type="sapo"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    if (sm) {
        var txt = shStrip(sm[1]).replace(/\s+/g, " ").trim();
        if (txt.length >= 20) excerpt = txt;
    }

    var pubDate = null;
    var pubDateMs = 0;
    var timeM = /<span\b[^>]*class="[^"]*box-category-time[^"]*"[^>]*>/i.exec(chunk)
        || /<time\b[^>]*>/i.exec(chunk);
    if (timeM) {
        var iso = shAttr(timeM[0], "title") || shAttr(timeM[0], "datetime");
        if (iso) {
            pubDateMs = shIsoMs(iso);
            if (pubDateMs) pubDate = shLabel(pubDateMs);
        }
    }

    seen[link] = true;
    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDate: pubDate,
        pubDateMs: pubDateMs,
        sourceName: SH_SOURCE_NAME
    };
}

/** Tách các thẻ tin bằng vị trí thẻ mở (thẻ video là div, không đóng ngay). */
function shParseCards(source, baseUrl) {
    var s = String(source || "");
    var re = /<(?:article|div)\b[^>]*class="[^"]*\bbox-category-item\b[^"]*"[^>]*>/gi;
    var starts = [];
    var m;
    while ((m = re.exec(s)) !== null) starts.push(m.index);
    var items = [];
    var seen = {};
    for (var i = 0; i < starts.length; i++) {
        var end = i + 1 < starts.length ? starts[i + 1] : s.length;
        var chunk = s.substring(starts[i], Math.min(end, starts[i] + 9000));
        var item = shParseCard(chunk, baseUrl, seen);
        if (item) items.push(item);
    }
    return items;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    try {
        return JSON.stringify(shParseCards(shClean(html), url));
    } catch (e) {
        return "[]";
    }
}

function shNextPage(currentUrl, page, html) {
    if (!currentUrl || !page || page < 2) return null;
    var url = String(currentUrl);
    var source = String(html || "");
    if (!source.replace(/\s+/g, "")) return null;
    var target = Math.floor(page);

    // Đang đọc fragment tìm kiếm
    var sf = /\/timelinesearch\/([^\/?#]+)\//i.exec(url);
    if (sf) {
        if (target > SH_MAX_SEARCH_PAGE) return null;
        return SH_HOST + "/timelinesearch/" + sf[1] + "/" + target + ".htm";
    }

    // Trang tìm kiếm gốc
    if (/\/tim-kiem\.htm/i.test(url)) {
        var raw = shQuery(url, "keywords");
        if (!raw) return null;
        var keyword = shUrlDecode(raw).trim();
        if (!keyword || !shIsAscii(keyword)) return null;
        var slug = shSlug(keyword);
        if (!slug || target > SH_MAX_SEARCH_PAGE) return null;
        return SH_HOST + "/timelinesearch/" + slug + "/" + target + ".htm";
    }

    // Đang đọc fragment chuyên mục
    var lf = /\/timelinelist\/(\d+)\//i.exec(url);
    if (lf) {
        if (lf[1] === "0" || target > SH_MAX_PAGE) return null;
        return SH_MOBILE + "/timelinelist/" + lf[1] + "/" + target + ".htm";
    }

    // Trang chuyên mục: zone nằm trong input#hdZoneId
    var zoneM = /id="hdZoneId"[^>]*value="(\d+)"/i.exec(source);
    if (!zoneM) return null;
    var zone = zoneM[1];
    if (zone === "0" || target > SH_MAX_PAGE) return null;
    return SH_MOBILE + "/timelinelist/" + zone + "/" + target + ".htm";
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        return shNextPage(currentUrl, page, html);
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    var p = page && page > 0 ? Math.floor(page) : 1;
    if (p > 1) return null;
    return SH_HOST + "/tim-kiem.htm?keywords=" + encodeURIComponent(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var SH_TITLE_RES = [
    /<h1[^>]*class="[^"]*\bdetail-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*class="[^"]*\bnews-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*class="[^"]*\bvdbw-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*itemprop="headline"[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
    /<title>([\s\S]*?)<\/title>/i
];

function shTitle(source) {
    for (var i = 0; i < SH_TITLE_RES.length; i++) {
        var m = SH_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = shStrip(m[1]).replace(/\s+/g, " ").trim();
        t = t.replace(/\s*[|\-–]\s*soha\.vn.*$/i, "").trim();
        if (t.length >= 5) return t;
    }
    return "";
}

function shSapo(source) {
    var m = /<p\b[^>]*class="[^"]*\b(?:detail-sapo|news-sapo)\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(source);
    if (!m) m = /<div\b[^>]*class="[^"]*\bvdbw-sapo\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!m) m = /<p\b[^>]*data-role="sapo"[^>]*>([\s\S]*?)<\/p>/i.exec(source);
    if (!m) return "";
    var txt = shStrip(m[1]).replace(/\s+/g, " ").trim();
    return txt.length >= SH_MIN_TEXT ? txt : "";
}

function shBodyHtml(source) {
    var s = String(source || "");
    var m = /<div\b[^>]*itemprop="articleBody"[^>]*>/i.exec(s);
    if (!m) m = /<div\b[^>]*class="[^"]*\bdetail-content\b[^"]*"[^>]*>/i.exec(s);
    if (!m) m = /<div\b[^>]*class="[^"]*\bvdbw-left\b[^"]*"[^>]*>/i.exec(s);
    if (!m) return "";
    var start = m.index + m[0].length;
    var end = s.length;
    var markers = [
        'data-check-position="body_end"',
        '<div class="link-source',
        '<h1 class="vdbw-title"',
        '<div class="vdbw-meta',
        '<div class="vdbw-sapo"',
        '<div class="vdbw-tag"',
        '<div class="post-tags-container"',
        '</article>'
    ];
    for (var i = 0; i < markers.length; i++) {
        var p = s.indexOf(markers[i], start);
        if (p >= 0 && p < end) end = p;
    }
    return s.substring(start, end);
}

function shBodyImg(tag) {
    var src = shImgSrc(tag);
    if (!src) return null;
    var w = parseInt(shAttr(tag, "width") || "0", 10);
    var h = parseInt(shAttr(tag, "height") || "0", 10);
    if ((w && w < 80) || (h && h < 50)) return null;
    if (/logo|icon|avatar|pixel|tracking/i.test(src)) return null;
    return src;
}

function shIsJunkLine(text) {
    if (!text) return true;
    if (/^(Tags?|TAGS?)\s*:/.test(text)) return true;
    if (/^(Chia sẻ|Báo lỗi|Link copy|Lấy link|Link bài gốc|Copy link|Theo dõi)/i.test(text)) return true;
    return false;
}

function shBlocks(body) {
    var s = shClean(body);
    var media = [];
    var blocks = [];

    // Tin liên quan / box nhúng trong thân bài: bỏ để không lẫn tiêu đề lạ
    s = s.replace(/<article\b[\s\S]*?<\/article>/gi, " ");
    s = s.replace(/<div\b[^>]*type="RelatedNewsBox"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, " ");
    s = s.replace(/<div\b[^>]*class="[^"]*\brelationnews\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ");
    // Poster nền của player video: trùng ảnh, bỏ trước khi quét khối
    s = s.replace(/<div\b[^>]*class="[^"]*\bd-bg-short\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ");

    // figure: ảnh + chú thích, hoặc video
    s = s.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, function (tag) {
        var vurl = shVideoUrl(tag);
        if (vurl) {
            media.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vurl });
            return "\n@@SHM" + (media.length - 1) + "@@\n";
        }
        var img = /<img\b[^>]*>/i.exec(tag);
        var src = img ? shBodyImg(img[0]) : null;
        if (!src) return " ";
        var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
        var caption = capM ? shStrip(capM[1]).replace(/\s+/g, " ").trim() : "";
        media.push({
            isImage: true,
            text: caption || null,
            imageUrl: src,
            isVideo: false,
            videoUrl: null
        });
        return "\n@@SHM" + (media.length - 1) + "@@\n";
    });

    // video kiểu VCSortableInPreviewMode (data-vid) và thẻ <video>
    s = s.replace(/<div\b[^>]*VCSortableInPreviewMode[^>]*type="VideoStream"[^>]*>/gi, function (tag) {
        var vurl = shVideoUrl(tag);
        if (!vurl) return " ";
        media.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vurl });
        return "\n@@SHM" + (media.length - 1) + "@@\n";
    });
    s = s.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, function (tag) {
        var vurl = shVideoUrl(tag);
        if (!vurl) return " ";
        media.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vurl });
        return "\n@@SHM" + (media.length - 1) + "@@\n";
    });

    // ảnh lẻ trong đoạn văn
    s = s.replace(/<img\b[^>]*>/gi, function (tag) {
        var src = shBodyImg(tag);
        if (!src) return " ";
        media.push({ isImage: true, text: null, imageUrl: src, isVideo: false, videoUrl: null });
        return "\n@@SHM" + (media.length - 1) + "@@\n";
    });

    // Còn lại chuyển thành text theo dòng
    s = s.replace(/<\/(p|div|h[1-6]|li|blockquote|section|tr|td)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = shDecode(s);

    var lines = s.split(/\n+/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\s+/g, " ").trim();
        if (!line) continue;
        var mm = /^@@SHM(\d+)@@$/.exec(line);
        if (mm) {
            var block = media[parseInt(mm[1], 10)];
            if (!block) continue;
            var prev = blocks.length ? blocks[blocks.length - 1] : null;
            if (prev && block.isImage && prev.isImage && prev.imageUrl === block.imageUrl) continue;
            blocks.push(block);
            continue;
        }
        if (line.length < SH_MIN_TEXT) continue;
        if (shIsJunkLine(line)) continue;
        var last = blocks.length ? blocks[blocks.length - 1] : null;
        if (last && !last.isImage && !last.isVideo && last.text === line) continue;
        blocks.push({ isImage: false, text: line, imageUrl: null, isVideo: false, videoUrl: null });
    }
    return blocks;
}

function shRelated(source, url) {
    var s = String(source || "");
    var i = s.indexOf('data-marked-zoneid="soha_detail_relatesnews"');
    if (i < 0) i = s.indexOf('id="relationnews"');
    if (i < 0) return [];
    var rest = s.substring(i, Math.min(s.length, i + 60000));
    var cut = rest.search(/itemprop="articleBody"|<\/main>|id="page-footer"/i);
    if (cut > 0) rest = rest.substring(0, cut);
    var items = shParseCards(rest, url);
    var current = String(url || "").replace(/[?#].*$/, "");
    var out = [];
    for (var k = 0; k < items.length && out.length < 12; k++) {
        if (items[k].link === current) continue;
        out.push(items[k]);
    }
    return out;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    try {
        var source = String(html);
        var title = shTitle(source);
        var blocks = shBlocks(shBodyHtml(source));
        var sapo = shSapo(source);
        if (sapo) {
            var firstText = null;
            for (var i = 0; i < blocks.length; i++) {
                if (!blocks[i].isImage && !blocks[i].isVideo) {
                    firstText = blocks[i].text;
                    break;
                }
            }
            if (!firstText || firstText.replace(/\s+/g, " ").trim() !== sapo) {
                blocks.unshift({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
            }
        }
        if (!title && blocks.length === 0) return null;
        return JSON.stringify({
            title: title,
            blocks: blocks,
            related: shRelated(source, url)
        });
    } catch (e) {
        return null;
    }
}
