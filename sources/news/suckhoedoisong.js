/**
 * Báo Sức khỏe & Đời sống (suckhoedoisong.vn) — nguồn báo dạng JS, chạy trong Rhino (ES5).
 *
 * Nền tảng VCCorp (mediacdn), HTML tĩnh minified (thuộc tính nhiều khi KHÔNG có dấu
 * nhắc), không Cloudflare — UA mobile hay desktop đều tải được (site đổi template theo
 * UA nhưng cùng markup thẻ tin). URL bài dạng `/<slug>-<id số>.htm`.
 *  - Danh sách: mỗi tin là `<article class=box-category-item>` (khối thường) hoặc
 *    `<div class=box-category-item>` (fragment AJAX/tìm kiếm) hoặc
 *    `<article class=box-home-focus-item>` (box nổi bật trang chủ), bài liên quan ở
 *    template desktop là `<article class=detail-related-item>` + `a.box-stream-link-title`.
 *    Tiêu đề `a.box-category-link-title`, ảnh `img.box-category-avatar` (`src` +
 *    `data-original`), mô tả `box-category-sapo`, giờ
 *    `span.time-ago[title="M/D/YYYY HH:mm:ss"]` (fragment tìm kiếm không có giờ).
 *  - KHÔNG có link phân trang trong HTML. Trang chuyên mục có `nav.loadmore` và
 *    `<input id=hdZoneId value=<zoneId>>` → "Xem thêm" gọi
 *    `/timelinelist/<zoneId>/<page>.htm` (24 tin/trang; trang 1 render sẵn ~19 tin:
 *    khối nổi bật + timeline_list). Trang chủ không có hdZoneId → không phân trang.
 *  - Tìm kiếm: `timeline/search.htm?keywords=<từ khoá>&page=<n>` (24 kết quả/trang).
 *    Gửi nguyên văn từ khoá CÓ dấu (kể cả `%20` cho khoảng trắng) — endpoint trả
 *    kết quả lặp/lệch nếu tự bỏ dấu.
 *  - Đọc bài: `h1.detail-title`, sapo `div.detail-sapo`, thân
 *    `div.detail-content.afcbc-body[data-role=content]` (đoạn `<p>`/`<tr>`/`<li>` đều
 *    KHÔNG đóng thẻ), kết thúc ở `ul.detail-tag` / `data-role=author` / `div.cmbl`
 *    (khung bình luận) / `data-role=related-news` / `<footer>`.
 *    Ảnh `figure[type=Photo] > img` (`data-original` > `srcset` > `src`), chú thích
 *    `figcaption`. Bài video (multimedia) không có thân: chỉ có
 *    `div[type=VideoStream][data-vid]` + og:title.
 *  - Tin liên quan: `section[data-role=related-news]` — cùng markup thẻ tin nên parse
 *    bằng chính hàm parse thẻ.
 *
 * Toàn bộ hàm trả JSON string, ES5 thuần.
 */

var SK_HOST = "https://suckhoedoisong.vn";
var SK_SOURCE_NAME = "Sức khỏe & Đời sống";
var SK_MAX_PAGE = 40;
var SK_SEARCH_MAX_PAGE = 20;
var SK_MIN_TEXT = 20;
var SK_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var SK_CATEGORIES = [
    { name: "Trang chủ", pageUrl: SK_HOST + "/" },
    { name: "Thời sự", pageUrl: SK_HOST + "/thoi-su.htm" },
    { name: "Y tế", pageUrl: SK_HOST + "/y-te.htm" },
    { name: "Dược", pageUrl: SK_HOST + "/duoc.htm" },
    { name: "Y học cổ truyền", pageUrl: SK_HOST + "/y-hoc-co-truyen.htm" },
    { name: "Multimedia", pageUrl: SK_HOST + "/multimedia.htm" },
    { name: "Sức khỏe TV", pageUrl: SK_HOST + "/suc-khoe-tv.htm" },
    { name: "Y học 360", pageUrl: SK_HOST + "/y-hoc-360.htm" },
    { name: "Phòng mạch online", pageUrl: SK_HOST + "/phong-mach-online.htm" },
    { name: "Khỏe - Đẹp", pageUrl: SK_HOST + "/khoe-dep.htm" },
    { name: "Dinh dưỡng", pageUrl: SK_HOST + "/dinh-duong.htm" },
    { name: "Giới tính", pageUrl: SK_HOST + "/gioi-tinh.htm" },
    { name: "Thị trường", pageUrl: SK_HOST + "/thi-truong.htm" },
    { name: "Nhịp cầu Nhân ái", pageUrl: SK_HOST + "/nhip-cau-nhan-ai.htm" },
    { name: "Đời sống", pageUrl: SK_HOST + "/doi-song.htm" },
    { name: "Nên biết", pageUrl: SK_HOST + "/nen-biet.htm" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "suckhoedoisong",
        name: SK_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=suckhoedoisong.vn&sz=64",
        categories: SK_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("suckhoedoisong.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": SK_UA,
        "Referer": SK_HOST + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var SK_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
    copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", deg: "°",
    half: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³", para: "¶",
    sect: "§", dagger: "†", permil: "‰", prime: "′", Prime: "″",
    euro: "€", pound: "£", yen: "¥", dollar: "$", plusmn: "±", ne: "≠",
    le: "≤", ge: "≥", infin: "∞", alpha: "α", beta: "β", gamma: "γ",
    mu: "μ", omega: "ω", Delta: "Δ", pi: "π"
};

/** Giải entity số (&#x1EBF; / &#8217;) và bảng tên thông dụng, lặp 2 lượt (thuộc tính bị escape kép). */
function skDecode(value) {
    var s = String(value == null ? "" : value);
    for (var pass = 0; pass < 2; pass++) {
        s = s.replace(/&#x([0-9a-fA-F]{1,6});?/g, function (all, hex) {
            var code = parseInt(hex, 16);
            if (!code || code > 0x10ffff) return "";
            if (code < 0x10000) return String.fromCharCode(code);
            code -= 0x10000;
            return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        });
        s = s.replace(/&#(\d{1,7});?/g, function (all, dec) {
            var code = parseInt(dec, 10);
            if (!code || code > 0x10ffff) return "";
            if (code < 0x10000) return String.fromCharCode(code);
            code -= 0x10000;
            return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        });
        s = s.replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});?/g, function (all, name) {
            var v = SK_ENTITIES[name];
            return v === undefined ? all : v;
        });
    }
    return s;
}

function skStrip(html) {
    var s = String(html == null ? "" : html);
    s = s.replace(/<style[\s\S]*?<\/style>/gi, " ")
         .replace(/<script[\s\S]*?<\/script>/gi, " ")
         .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr|figure)>/gi, "\n");
    s = s.replace(/<[^>]*>/g, " ");
    s = skDecode(s);
    return s.replace(/\s+/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

/** Bỏ script/style để không lẫn thẻ khi cắt khối. */
function skClean(html) {
    return String(html == null ? "" : html)
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

/** URL tuyệt đối + chỉ nhận link bài viết (`/<slug>-<id số>.htm`). */
function skArticleUrl(raw) {
    if (!raw) return "";
    var u = skDecode(String(raw)).trim();
    if (!u || u === "javascript:" || u.indexOf("javascript") === 0) return "";
    if (u.charAt(0) === "#") return "";
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (u.indexOf("http") !== 0) {
        if (u.charAt(0) !== "/") return "";
        u = SK_HOST + u;
    }
    var low = u.toLowerCase();
    if (low.indexOf("suckhoedoisong.vn") === -1) return "";
    if (low.indexOf("/tags/") !== -1 || low.indexOf("/chu-de/") !== -1) return "";
    if (low.indexOf("video.suckhoedoisong") !== -1) return "";
    if (!/\/[a-z0-9\-_]+-\d{6,}\.htm(?:[?#].*)?$/i.test(low)) return "";
    return u.replace(/[?#].*$/, "");
}

/** Ưu tiên ảnh gốc: data-original → srcset lớn nhất → src / data-src. */
function skImgSrc(imgTag) {
    var tag = String(imgTag || "");
    function attr(name) {
        var m = new RegExp(name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
        if (!m) return "";
        return skDecode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3] || ""));
    }
    var candidates = [attr("data-original"), attr("data-src"), attr("src")];
    var set = attr("srcset") || attr("data-srcset");
    if (set) {
        var best = "", bestW = -1;
        var parts = set.split(",");
        for (var i = 0; i < parts.length; i++) {
            var bits = parts[i].trim().split(/\s+/);
            if (bits.length < 2 || !bits[0]) continue;
            var wm = /(\d+)w$/i.exec(bits[1]);
            var w = wm ? parseInt(wm[1], 10) : 0;
            if (w > bestW) { bestW = w; best = bits[0]; }
        }
        if (best) candidates.unshift(best);
    }
    for (var j = 0; j < candidates.length; j++) {
        var u = candidates[j];
        if (!u || u.indexOf("data:") === 0) continue;
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (u.indexOf("http") !== 0) continue;
        if (/\/(logo|favicon|banner|avatar-default)\b/i.test(u)) continue;
        if (u.indexOf("static.mediacdn.vn") !== -1) continue; // icon/logo CMS
        return u;
    }
    return "";
}

var SK_MONTHS = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, "10": 9, "11": 10, "12": 11 };

/** "10/21/2026 08:00:00" (M/D/YYYY, GMT+7) hoặc "21-10-2026 08:00" → epoch ms. */
function skDateMs(raw) {
    var s = skDecode(String(raw || "")).trim();
    if (!s) return 0;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) m = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return 0;
    var month = parseInt(m[1], 10), day = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (month > 12) { var t = month; month = day; day = t; } // an toàn nếu là D/M
    var hh = m[4] ? parseInt(m[4], 10) : 0;
    var mm = m[5] ? parseInt(m[5], 10) : 0;
    var ss = m[6] ? parseInt(m[6], 10) : 0;
    if (!year || year < 2000 || year > 2100) return 0;
    var utc = Date.UTC(year, month - 1, day, hh, mm, ss);
    return utc - 7 * 3600 * 1000; // site phát hành theo GMT+7
}

function skDateText(raw) {
    var ms = skDateMs(raw);
    if (!ms) return "";
    var d = new Date(ms + 7 * 3600 * 1000);
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return pad(d.getUTCDate()) + "-" + pad(d.getUTCMonth() + 1) + "-" + d.getUTCFullYear() +
        " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

var SK_CARD_RE = /<(?:article|div)\s+class=[^>]*(?:box-(?:category|home-focus)-item|detail-related-item)[^>]*>/i;

function skAttr(anchorTag, name) {
    var m = new RegExp(name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(String(anchorTag || ""));
    if (!m) return "";
    return skDecode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3] || ""));
}

/** 1 khối thẻ tin → NewsArticle | null. */
function skParseCard(chunk) {
    var src = String(chunk || "");

    var link = "";
    var title = "";
    var titleM = /<a\b[^>]*class=[^>]*box-(?:category|home-focus|stream)-link-title[^>]*>([\s\S]*?)<\/a>/i.exec(src);
    if (titleM) {
        link = skArticleUrl(skAttr(/<a\b[^>]*>/i.exec(titleM[0])[0], "href"));
        title = skStrip(titleM[1]);
        if (!title) title = skStrip(skAttr(/<a\b[^>]*>/i.exec(titleM[0])[0], "title"));
    }
    if (!link) {
        var hRe = /<a\b[^>]*href=[^>]*>/gi, hm;
        while ((hm = hRe.exec(src)) !== null) {
            var cand = skArticleUrl(skAttr(hm[0], "href"));
            if (cand) {
                link = cand;
                if (!title) title = skStrip(src.substring(hm.index + hm[0].length, hm.index + hm[0].length + 400));
                break;
            }
        }
    }
    if (!link) return null;

    if (!title || title.length < 5) {
        var tAttr = /<a\b[^>]*title="([^"]{10,})"[^>]*>/i.exec(src);
        if (tAttr) title = skStrip(tAttr[1]);
    }
    if (!title || title.length < 5) return null;

    var imgM = /<img\b[^>]*>/i.exec(src);
    var image = imgM ? skImgSrc(imgM[0]) : "";

    var sapoM = /<(?:p|div)\b[^>]*class=[^>]*box-(?:category|home-focus)-sapo[^>]*>([\s\S]*?)<\/(?:p|div)>/i.exec(src);
    var excerpt = sapoM ? skStrip(sapoM[1]) : "";
    if (excerpt && excerpt.replace(/\s+/g, "").length < 12) excerpt = "";

    var timeM = /class=[^>]*(?:box-stream-time|box-category-time|box-home-focus-time)[^>]*>([^<]*)</i.exec(src);
    var titleTimeM = /time-ago"\s+title="([^"]+)"/i.exec(src);
    if (!titleTimeM) titleTimeM = /time-ago"[^>]*title=([^\s>]+)/i.exec(src);
    var rawTime = titleTimeM ? titleTimeM[1] : (timeM ? timeM[1] : "");
    var ms = skDateMs(rawTime);

    return {
        title: title,
        link: link,
        excerpt: excerpt || null,
        imageUrl: image || null,
        pubDate: ms ? skDateText(rawTime) : null,
        pubDateMs: ms,
        sourceName: SK_SOURCE_NAME
    };
}

/** Cắt thân trang chỉ giữ vùng danh sách (chuyên mục = khối nổi bật + timeline_list). */
function skListRegion(source) {
    var idx = source.indexOf("timeline_list");
    if (idx >= 0) {
        var end = source.indexOf("</section>", idx);
        if (end < 0) end = source.length;
        // Khối "list__listing" là cột chính của chuyên mục: tin nổi bật + timeline
        var start = source.indexOf("class=list__listing");
        var startTag = start < 0 ? -1 : source.lastIndexOf("<section", start);
        if (startTag < 0 || startTag > idx) startTag = source.lastIndexOf("<div", idx);
        if (startTag < 0) startTag = idx;
        return source.substring(startTag, end);
    }
    var nav = source.indexOf("nav class=loadmore");
    if (nav < 0) nav = source.indexOf('nav class="loadmore"');
    if (nav >= 0) {
        // Fragment AJAX / trang không có timeline_list: lấy toàn bộ trước nav
        return source;
    }
    return source;
}

function skItems(source, cap) {
    var region = skListRegion(source);
    var parts = region.split(SK_CARD_RE);
    var out = [];
    var seen = {};
    for (var i = 1; i < parts.length; i++) {
        var item = skParseCard(parts[i]);
        if (!item || !item.link || seen[item.link]) continue;
        seen[item.link] = 1;
        out.push(item);
        if (cap && out.length >= cap) break;
    }
    return out;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    try {
        var src = skClean(html);
        var items = skItems(src, 80);
        return JSON.stringify(items);
    } catch (e) {
        return "[]";
    }
}

// ----------------------------------------------------------------------
// Phân trang / tìm kiếm
// ----------------------------------------------------------------------

var SK_TIMELINE_RE = /\/timelinelist\/(\d+)\/(\d+)\.htm/i;
var SK_SEARCH_RE = /\/timeline\/search\.htm\?keywords=([^&#]*)(&page=(\d+))?/i;

function skZoneId(html) {
    var m = /id=hdZoneId\s+value=["']?(\d+)/i.exec(String(html || ""));
    if (!m) m = /value=["']?(\d+)["']?\s+id=hdZoneId/i.exec(String(html || ""));
    return m ? m[1] : "";
}

function skHasCards(html) {
    return /box-(?:category|home-focus)-item/i.test(String(html || ""));
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        var u = String(currentUrl || "");
        var p = parseInt(page, 10) || 1;

        // Trang AJAX kế tiếp: dừng khi fragment không còn thẻ tin
        if (!skHasCards(html)) return null;

        var tl = SK_TIMELINE_RE.exec(u);
        if (tl) {
            if (p > SK_MAX_PAGE) return null;
            return SK_HOST + "/timelinelist/" + tl[1] + "/" + p + ".htm";
        }

        var se = SK_SEARCH_RE.exec(u);
        if (se) {
            if (p > SK_SEARCH_MAX_PAGE) return null;
            return SK_HOST + "/timeline/search.htm?keywords=" + se[1] + "&page=" + p;
        }

        // Lần đầu: chỉ chuyên mục thật sự có nút "Xem thêm" + hdZoneId
        var src = String(html || "");
        if (src.indexOf("nav class=loadmore") < 0 && src.indexOf('nav class="loadmore"') < 0) return null;
        var zone = skZoneId(src);
        if (!zone) return null;
        if (p > SK_MAX_PAGE) return null;
        return SK_HOST + "/timelinelist/" + zone + "/" + p + ".htm";
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    // Endpoint search nhận cả từ khoá có dấu (đã kiểm tra desktop + mobile UA)
    var q = String(query || "").trim();
    if (!q) return null;
    var p = parseInt(page, 10) || 1;
    if (p > SK_SEARCH_MAX_PAGE) p = SK_SEARCH_MAX_PAGE;
    return SK_HOST + "/timeline/search.htm?keywords=" + encodeURIComponent(q) + "&page=" + p;
}

// ----------------------------------------------------------------------
// Bài viết
// ----------------------------------------------------------------------

var SK_TITLE_RES = [
    /<h1\b[^>]*class=[^>]*detail-title[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta\s+property=["']?og:title["']?\s+content=["']([^"']+)["']/i,
    /<meta\s+property=og:title\s+content="([^"]+)"/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
];

var SK_BODY_START = [
    'class="detail-content afcbc-body"',
    'data-role=content',
    'class="detail-content"',
    'class=detail-content'
];

var SK_BODY_END = [
    '<ul class=detail-tag',
    '<ul class="detail-tag',
    'data-role=tags',
    'data-role=author',
    '<section class=detail-like-fb',
    '<section class="detail-like-fb',
    '<div class=detail-like-fb',
    '<section class=box-category data-layout=2 data-role=related-news',
    '<section class="box-category" data-layout="2" data-role="related-news"',
    'data-role=related-news',
    '<div class=detail-note',
    '<div class=cmbl',
    '<div class="cmbl',
    'name=CheckMXH',
    'name="CheckMXH',
    'cmt-popup-container',
    '<section class=detail-censorship',
    '<footer'
];

function skTitle(source) {
    for (var i = 0; i < SK_TITLE_RES.length; i++) {
        var m = SK_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = skStrip(m[1]).replace(/\s+/g, " ").trim();
        t = t.replace(/\s*[-|]\s*(Sức khỏe &? Đời sống|SK&ĐS|Báo điện tử Sức khỏe và Đời sống)\s*$/i, "").trim();
        if (t) return t;
    }
    return "";
}

function skFindBodyStart(source) {
    for (var i = 0; i < SK_BODY_START.length; i++) {
        var idx = source.indexOf(SK_BODY_START[i]);
        if (idx < 0) continue;
        // Bỏ các lần xuất hiện trong CSS/JS: phải nằm trong 1 thẻ mở
        var lt = source.lastIndexOf("<", idx);
        var gt = source.indexOf(">", idx);
        if (lt < 0 || gt < 0) continue;
        var tagOpen = source.substring(lt, gt + 1).toLowerCase();
        if (tagOpen.indexOf("<div") !== 0 && tagOpen.indexOf("<section") !== 0) continue;
        return gt + 1;
    }
    return -1;
}

function skCutBody(source, start) {
    var end = source.length;
    for (var i = 0; i < SK_BODY_END.length; i++) {
        var idx = source.indexOf(SK_BODY_END[i], start);
        if (idx >= 0 && idx < end) end = idx;
    }
    return source.substring(start, end);
}

/** Bảng VCCorp: <tr>/<td> KHÔNG đóng thẻ → tách theo thẻ mở. */
function skTableText(tag) {
    var rows = tag.split(/<tr\b/i);
    var lines = [];
    for (var i = 1; i < rows.length; i++) {
        var cells = rows[i].split(/<t[dh]\b/i);
        var parts = [];
        for (var c = 1; c < cells.length; c++) {
            var txt = skStrip(cells[c].replace(/^[^>]*>/, ""));
            if (txt) parts.push(txt);
        }
        var line = parts.join(" | ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

/** Danh sách: <li> cũng không đóng thẻ. */
function skListText(tag) {
    var lis = tag.split(/<li\b/i);
    var lines = [];
    for (var i = 1; i < lis.length; i++) {
        var txt = skStrip(lis[i].replace(/^[^>]*>/, ""));
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function skVideoUrl(tag) {
    var t = String(tag || "");
    var m = /data-vid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(t);
    if (m) {
        var v = skDecode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3] || ""));
        if (v) {
            if (v.indexOf("//") === 0) v = "https:" + v;
            if (v.indexOf("http") === 0) return v;
            if (v.indexOf("/") === 0) return "https:" + v;
            return "https://" + v;
        }
    }
    var s = /<(?:video|source|iframe)\b[^>]*(?:data-src|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(t);
    if (!s) return "";
    var url = skDecode(s[1] !== undefined ? s[1] : (s[2] !== undefined ? s[2] : s[3] || "")).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("about:") === 0) return "";
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url.indexOf("http") === 0 ? url : "";
}

function skFigureBlock(tag, blocks) {
    var imgTag = /<img\b[^>]*>/i.exec(tag);
    var src = imgTag ? skImgSrc(imgTag[0]) : "";
    var capM = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
    var caption = capM ? skStrip(capM[1]) : "";
    if (caption && caption.length < 3) caption = "";
    if (src) {
        blocks.push({ isImage: true, text: caption || null, imageUrl: src, isVideo: false, videoUrl: null });
        return true;
    }
    var vid = skVideoUrl(tag);
    if (vid) {
        blocks.push({ isImage: false, text: caption || null, imageUrl: null, isVideo: true, videoUrl: vid });
        return true;
    }
    return false;
}

/**
 * Thân bài VCCorp: các `<p>` MỞ nhưng không đóng → không bắt cặp thẻ được.
 * Cách làm: thay khối đặc biệt (figure/table/list/heading/embed) bằng marker,
 * biến `<p>` thành xuống dòng, rồi tách đoạn theo marker/xuống dòng.
 */
function skScanBlocks(body) {
    var blocks = [];
    var src = String(body || "");

    /**
     * Thu các khối đặc biệt KÈM VỊ TRÍ THẬT của regex (m.index).
     * Không được dùng src.indexOf(html): khi khối lặp lại hoặc lồng nhau,
     * indexOf trả vị trí đầu tiên → cắt lệch, mảnh thẻ lọt ra thành text.
     */
    var chunks = [];
    function collect(re, kind, accept) {
        var m;
        while ((m = re.exec(src)) !== null) {
            if (m[0] === "") { re.lastIndex++; continue; }
            if (m[0].length > 40000) continue;              // regex nuốt tới cuối bài
            if (accept && !accept(m[0])) continue;
            chunks.push({ at: m.index, len: m[0].length, kind: kind, html: m[0] });
        }
    }

    collect(/<figure\b[\s\S]*?<\/figure>/gi, "figure");
    collect(/<table\b[\s\S]*?(?:<\/table>|$)/gi, "table");
    collect(/<(?:video|iframe|audio)\b[^>]*>(?:[\s\S]*?<\/(?:video|iframe|audio)>)?/gi, "embed");
    // Video nhúng dạng div (VCCorp): <div class=VCSortableInPreviewMode type=VideoStream data-vid=...>
    collect(/<div\b[^>]*type=["']?VideoStream["']?[^>]*>/gi, "embed");
    collect(/<img\b[^>]*>/gi, "img");
    // <li> không đóng thẻ → cắt tới </ul> hoặc tới <div>/<p> kế tiếp
    collect(/<(?:ul|ol)\b[\s\S]*?(?:<\/(?:ul|ol)>|(?=<div\b|<p\b|$))/gi, "list", function (h) {
        return !/toc-level|toc-list-headings/i.test(h);       // bỏ mục lục tự sinh
    });
    collect(/<h([2-6])\b[^>]*>[\s\S]*?<\/h\1>/gi, "heading");
    collect(/<div\b[^>]*VCSortableInPreviewMode[\s\S]*?(?=<div\b[^>]*VCSortableInPreviewMode|<p\b|<h[2-6]\b|$)/gi, "photo", function (h) {
        return /<img\b/i.test(h) && !/<table\b/i.test(h);     // bảng BoxTable để rule table lo
    });
    collect(/<blockquote\b[\s\S]*?(?:<\/blockquote>|(?=<p\b|$))/gi, "quote");

    // Khối bắt đầu sớm hơn thắng; khối lồng trong nó bị bỏ
    chunks.sort(function (a, b) { return a.at - b.at || b.len - a.len; });
    var masked = "", pos = 0, tokens = [];
    for (var i = 0; i < chunks.length; i++) {
        var piece = chunks[i];
        if (piece.at < pos) continue;
        tokens.push({ kind: piece.kind, html: piece.html });
        masked += src.substring(pos, piece.at) + "\u0001" + (tokens.length - 1) + "\u0001";
        pos = piece.at + piece.len;
    }
    masked += src.substring(pos);

    // Phần còn lại: <p>/<div>/<br> → xuống dòng (mỗi dòng một block)
    masked = masked
        .replace(/<(?:script|style|noscript|svg|form|select|button)[\s\S]*?(?:<\/(?:script|style|noscript|svg|form|select|button)>|$)/gi, " ")
        .replace(/<a\b[^>]*class=[^>]*seo-suggest-link[^>]*>/gi, "")
        .replace(/<p\b[^>]*>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<(?:div|span|strong|em|b|i|u|sup|sub|small|cite|code|font|label)\b[^>]*>/gi, " ")
        .replace(/<\/(?:div|span|strong|em|b|i|u|sup|sub|small|cite|code|font|label)>/gi, " ");

    function pushText(t) {
        if (t && t.length >= SK_MIN_TEXT) {
            blocks.push({ isImage: false, text: t, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    function flushText(raw) {
        var lines = String(raw || "").split("\n");
        for (var k = 0; k < lines.length; k++) pushText(skStrip(lines[k]));
    }
    function emitToken(info) {
        if (!info) return;
        if (info.kind === "figure" || info.kind === "photo" || info.kind === "img") {
            skFigureBlock(info.html, blocks);
        } else if (info.kind === "table") {
            pushText(skTableText(info.html));
        } else if (info.kind === "list") {
            pushText(skListText(info.html));
        } else if (info.kind === "embed") {
            var ev = skVideoUrl(info.html);
            if (ev) blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: ev });
        } else {
            var inner = info.html.replace(/^<[^>]*>/, "").replace(/<\/[^>]*>\s*$/, "");
            var imIn = /<img\b[^>]*>/gi, im2;
            while ((im2 = imIn.exec(inner)) !== null) {
                var is2 = skImgSrc(im2[0]);
                if (is2) blocks.push({ isImage: true, text: null, imageUrl: is2, isVideo: false, videoUrl: null });
            }
            var ht = skStrip(inner);
            if (ht && ht.length >= (info.kind === "heading" ? 6 : SK_MIN_TEXT)) pushText(ht);
        }
    }

    var parts = masked.split(/\u0001(\d+)\u0001/);
    for (var p = 0; p < parts.length; p++) {
        if (p % 2 === 1) emitToken(tokens[parseInt(parts[p], 10)]);
        else flushText(parts[p]);
    }

    // Ảnh lẻ chỉ khi toàn bài không trích được block nào
    if (blocks.length === 0) {
        var orphan = /<img\b[^>]*>/gi, om;
        while ((om = orphan.exec(src)) !== null) {
            var os = skImgSrc(om[0]);
            if (os) blocks.push({ isImage: true, text: null, imageUrl: os, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function skSapo(source) {
    var m = /<div\b[^>]*class=[^>]*detail-sapo[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (!m) return "";
    var t = skStrip(m[1]);
    if (t.length < SK_MIN_TEXT) return "";
    return t;
}

/** Bài video/short: không có thân text, chỉ có khối VideoStream. */
function skVideoArticle(source) {
    var holder = /<div\b[^>]*type=[^>]*VideoStream[\s\S]{0,1200}/i.exec(source);
    var vid = holder ? skVideoUrl(holder[0]) : "";
    if (!vid) {
        var any = skVideoUrl(source);
        if (!any) return null;
        vid = any;
    }
    var blocks = [{ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: vid }];
    var thumbM = /type=[^>]*VideoStream[\s\S]{0,900}?<img\b[^>]*>/i.exec(source);
    if (thumbM) {
        var tSrc = skImgSrc(/<img\b[^>]*>/i.exec(thumbM[0])[0]);
        if (tSrc) blocks.unshift({ isImage: true, text: null, imageUrl: tSrc, isVideo: false, videoUrl: null });
    }
    return blocks;
}

function skRelated(source) {
    var idx = source.indexOf("data-role=related-news");
    if (idx < 0) idx = source.indexOf('data-role="related-news"');
    if (idx < 0) return [];
    var end = source.indexOf("</section>", idx);
    if (end < 0) end = source.length;
    var items = skItems(source.substring(idx - 200 > 0 ? idx - 200 : 0, end), 12);
    return items;
}

function skArticle(html, url) {
    var source = skClean(html);
    var title = skTitle(source);
    var blocks = [];

    var start = skFindBodyStart(source);
    if (start > 0) {
        var body = skCutBody(source, start);
        body = body.replace(/<div\b[^>]*type=["']?toc["']?[\s\S]*?(?=<p\b|<h[2-6]\b|<figure\b|$)/gi, " ");
        blocks = skScanBlocks(body);
    }
    if (!blocks.length) blocks = skVideoArticle(source) || [];

    var sapo = skSapo(source);
    if (sapo) {
        var firstText = null;
        for (var i = 0; i < blocks.length; i++) {
            if (!blocks[i].isImage && !blocks[i].isVideo) { firstText = blocks[i].text; break; }
        }
        if (!firstText || firstText.replace(/\s+/g, " ").trim() !== sapo) {
            blocks.unshift({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    if (!title && !blocks.length) return null;
    return { title: title, blocks: blocks, related: skRelated(source) };
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    try {
        var data = skArticle(html, url);
        return data ? JSON.stringify(data) : null;
    } catch (e) {
        return null;
    }
}
