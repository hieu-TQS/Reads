/**
 * Báo Sài Gòn Giải Phóng (sggp.org.vn) — nguồn báo dạng JS.
 *
 * Nền tảng EpicDN, HTML tĩnh, không Cloudflare/challenge.
 *  - Danh sách: mỗi tin là `<article class="story" data-id>`; tiêu đề
 *    `<h2 class="story__heading"><a class="cms-link" href title>`, thumbnail
 *    `img.lazyload[data-src]` (ảnh thật), mô tả `div.story__summary`, giờ đăng
 *    `<time class="time" data-time="<epoch>">`.
 *  - KHÔNG có phân trang HTML. Nút "Xem thêm" `button.control__loadmore` mang
 *    `data-page`, `data-zone`, `data-type` ("zone" | "search"), `data-phrase`
 *    → gọi JSON API `https://api.sggp.org.vn/api/morenews-<type>-<zone>-<page>.html`
 *    (20 tin/trang, `data.contents[]`, `data.load_more`).
 *  - Danh sách chính nằm trong `data-source="zone-timeline-<zone>"` (chuyên mục)
 *    hoặc `data-source="home-timeline"` (trang chủ); các box phụ
 *    (`zone-box-*`, `zone-highlight-*`) nằm ngoài và phải cắt bỏ.
 *  - Tìm kiếm: `/tim-kiem/?q=<q>`; trang kế qua `morenews-search-0-<page>.html?phrase=`.
 *  - Đọc bài: `h1.article__title`, sapo `div.article__sapo`, thân
 *    `div.article__body.cms-body` (dừng ở `div.related-news` / `div.article__author`),
 *    tin liên quan `div.related-news article.story`.
 *
 * Toàn bộ hàm trả JSON string, ES5 thuần.
 */

var SG_HOST = "https://www.sggp.org.vn";
var SG_API = "https://api.sggp.org.vn/api";
var SG_SOURCE_NAME = "Sài Gòn Giải Phóng";
var SG_MAX_PAGE = 120;
var SG_MAX_SEARCH_PAGE = 20;
var SG_MIN_TEXT = 20;
var SG_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var SG_CATEGORIES = [
    { name: "Trang chủ", pageUrl: SG_HOST + "/" },
    { name: "Chính trị", pageUrl: SG_HOST + "/chinh-tri/" },
    { name: "Quốc phòng - an ninh", pageUrl: SG_HOST + "/quoc-phong-an-ninh/" },
    { name: "Nhân sự", pageUrl: SG_HOST + "/nhan-su-moi/" },
    { name: "Xây dựng Đảng", pageUrl: SG_HOST + "/xay-dung-dang/" },
    { name: "Đối ngoại", pageUrl: SG_HOST + "/doi-ngoai/" },
    { name: "Xã hội", pageUrl: SG_HOST + "/xa-hoi/" },
    { name: "Sự kiện & Bình luận", pageUrl: SG_HOST + "/su-kien-binh-luan/" },
    { name: "Cải cách hành chính", pageUrl: SG_HOST + "/sapxepcacdonvihanhchinh/" },
    { name: "Đô thị", pageUrl: SG_HOST + "/do-thi/" },
    { name: "Giao thông", pageUrl: SG_HOST + "/giao-thong/" },
    { name: "Tuổi trẻ cuộc sống", pageUrl: SG_HOST + "/tuoi-tre-cuoc-song/" },
    { name: "Bút Sài Gòn", pageUrl: SG_HOST + "/but-sai-gon/" },
    { name: "Tin buồn", pageUrl: SG_HOST + "/tin-buon/" },
    { name: "Môi trường", pageUrl: SG_HOST + "/moi-truong/" },
    { name: "Pháp luật", pageUrl: SG_HOST + "/phap-luat/" },
    { name: "An ninh - trật tự", pageUrl: SG_HOST + "/an-ninh-trat-tu/" },
    { name: "Câu chuyện Pháp luật", pageUrl: SG_HOST + "/cau-chuyen-phap-luat/" },
    { name: "Kinh tế", pageUrl: SG_HOST + "/kinh-te/" },
    { name: "Thị trường", pageUrl: SG_HOST + "/thi-truong/" },
    { name: "Địa ốc", pageUrl: SG_HOST + "/dia-oc/" },
    { name: "Tài chính - Chứng khoán", pageUrl: SG_HOST + "/tai-chinh-chung-khoan/" },
    { name: "Du lịch", pageUrl: SG_HOST + "/du-lich/" },
    { name: "Đầu tư", pageUrl: SG_HOST + "/dau-tu/" },
    { name: "Doanh nghiệp - Doanh nhân", pageUrl: SG_HOST + "/doanh-nghiep-doanh-nhan/" },
    { name: "Chuyển động kinh tế & Đời sống 24H", pageUrl: SG_HOST + "/kinhtedoisong24h/" },
    { name: "Đa phương tiện", pageUrl: SG_HOST + "/daphuongtien/" },
    { name: "Thế giới", pageUrl: SG_HOST + "/the-gioi/" },
    { name: "Chính trường thế giới", pageUrl: SG_HOST + "/chinh-truong-the-gioi/" },
    { name: "Hồ sơ - Tư liệu", pageUrl: SG_HOST + "/ho-so-tu-lieu/" },
    { name: "Chuyện đó đây", pageUrl: SG_HOST + "/chuyen-do-day/" },
    { name: "Giáo dục", pageUrl: SG_HOST + "/giao-duc/" },
    { name: "Giáo dục - Đào tạo TPHCM", pageUrl: SG_HOST + "/giao-duc-dao-tao-tphcm/" },
    { name: "Hướng nghiệp - Tuyển sinh", pageUrl: SG_HOST + "/huong-nghiep-tuyen-sinh/" },
    { name: "Chuyện học đường", pageUrl: SG_HOST + "/chuyen-hoc-duong/" },
    { name: "Giáo dục - Hội nhập", pageUrl: SG_HOST + "/giao-duc-hoi-nhap/" },
    { name: "Sống khỏe", pageUrl: SG_HOST + "/song-khoe/" },
    { name: "An toàn thực phẩm", pageUrl: SG_HOST + "/an-toan-thuc-pham/" },
    { name: "Sức khỏe cộng đồng", pageUrl: SG_HOST + "/suc-khoe-cong-dong/" },
    { name: "Văn hóa", pageUrl: SG_HOST + "/van-hoa/" },
    { name: "Nhịp sống", pageUrl: SG_HOST + "/nhip-song/" },
    { name: "Nhân vật", pageUrl: SG_HOST + "/nhan-vat/" },
    { name: "Giải trí", pageUrl: SG_HOST + "/giai-tri/" },
    { name: "Sách", pageUrl: SG_HOST + "/sach/" },
    { name: "Bạn đọc", pageUrl: SG_HOST + "/ban-doc/" },
    { name: "Ý kiến bạn đọc", pageUrl: SG_HOST + "/y-kien-ban-doc/" },
    { name: "Diễn đàn - Thảo luận", pageUrl: SG_HOST + "/dien-dan-thao-luan/" },
    { name: "Cơ quan trả lời", pageUrl: SG_HOST + "/co-quan-tra-loi/" },
    { name: "Lao động - An sinh", pageUrl: SG_HOST + "/lao-dong-an-sinh/" },
    { name: "An sinh xã hội", pageUrl: SG_HOST + "/an-sinh-xa-hoi/" },
    { name: "Công đoàn - Công nhân", pageUrl: SG_HOST + "/cong-doan-cong-nhan/" },
    { name: "Nguồn nhân lực", pageUrl: SG_HOST + "/nguon-nhan-luc/" },
    { name: "Lao động - Việc làm", pageUrl: SG_HOST + "/lao-dong-an-sinh-viec-lam/" },
    { name: "Phụ nữ", pageUrl: SG_HOST + "/phu-nu/" },
    { name: "Nhịp sống hội", pageUrl: SG_HOST + "/nhip-song-hoi/" },
    { name: "Tình và Lý", pageUrl: SG_HOST + "/tinh-va-ly/" },
    { name: "Dòng chảy cuộc sống", pageUrl: SG_HOST + "/dong-chay-cuoc-song/" },
    { name: "Mái ấm", pageUrl: SG_HOST + "/mai-am/" },
    { name: "Khoa học công nghệ", pageUrl: SG_HOST + "/khoahoc-congnghe/" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "sggp",
        name: SG_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=sggp.org.vn&sz=64",
        categories: SG_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("sggp.org.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": SG_UA,
        "Referer": SG_HOST + "/",
        "Accept-Language": "vi-VN,vi;q=0.9"
    });
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var SG_ENTITIES = {
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

function sgDecode(value) {
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
        return SG_ENTITIES.hasOwnProperty(name) ? SG_ENTITIES[name] : m;
    });
    return s.replace(/\u00a0/g, " ");
}

function sgStrip(html) {
    var s = String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, " ");
    s = sgDecode(s);
    return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Bỏ script/style/comment — HTML thô của báo rất nặng, lọc trước khi regex. */
function sgClean(html) {
    return String(html === null || html === undefined ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

function sgAbs(raw) {
    if (!raw) return null;
    var link = sgDecode(raw).replace(/&amp;/g, "&").trim();
    if (!link) return null;
    if (link.indexOf("http") === 0) return link;
    if (link.indexOf("//") === 0) return "https:" + link;
    if (link.indexOf("/") === 0) return SG_HOST + link;
    return null;
}

function sgImgSrc(tag) {
    if (!tag) return null;
    var m = /data-src="([^"]+)"/i.exec(tag)
        || /data-original="([^"]+)"/i.exec(tag)
        || /data-srcset="([^"]+)"/i.exec(tag)
        || /srcset="([^"]+)"/i.exec(tag)
        || /src="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = sgDecode(m[1]).replace(/&amp;/g, "&").trim().split(",")[0].trim().split(" ")[0];
    if (!url || url.indexOf("data:") === 0 || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function sgAttr(tag, name) {
    if (!tag) return null;
    var m = new RegExp("\\b" + name + "=\"([^\"]*)\"", "i").exec(tag);
    return m ? sgDecode(m[1]) : null;
}

/** epoch giây → "dd/MM/yyyy HH:mm" theo giờ VN (GMT+7). */
function sgDateLabel(epochSec) {
    var n = parseInt(epochSec, 10);
    if (!n || isNaN(n)) return null;
    var d = new Date(n * 1000 + 7 * 3600 * 1000);
    var dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
    var hh = d.getUTCHours(), mi = d.getUTCMinutes();
    return (dd < 10 ? "0" + dd : "" + dd) + "/" + (mm < 10 ? "0" + mm : "" + mm) + "/" + yy +
        " " + (hh < 10 ? "0" + hh : "" + hh) + ":" + (mi < 10 ? "0" + mi : "" + mi);
}

function sgTryJson(text) {
    var s = String(text === null || text === undefined ? "" : text).replace(/^\uFEFF/, "").replace(/^\s+/, "");
    if (s.charAt(0) !== "{") return null;
    try {
        return JSON.parse(s);
    } catch (e) {
        return null;
    }
}

function sgQuery(url, name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)", "i").exec(String(url || ""));
    return m ? m[1] : null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

/**
 * Mỗi tin là `<article class="story...">`; tách khối rồi bóc tiêu đề/ảnh/mô tả/giờ.
 * Dùng chung cho trang danh sách, kết quả tìm kiếm và box "Tin liên quan".
 */
function sgParseCards(chunk) {
    if (!chunk) return [];
    var items = [];
    var seen = {};
    var parts = String(chunk).split('<article class="story');
    for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part.length > 6000) part = part.substring(0, 6000);

        var headM = /<h2[^>]*class="[^"]*story__heading[^"]*"[\s\S]*?<\/h2>/i.exec(part);
        var anchor = headM ? /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(headM[0]) : null;
        if (!anchor) {
            anchor = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
        }
        if (!anchor) continue;

        var link = sgAbs(anchor[1]);
        if (!link) continue;
        // Chỉ nhận bài viết: slug kết thúc bằng -post<id>.html
        link = link.replace(/[?#].*$/, "");
        if (!/-post\d+\.html$/i.test(link)) continue;
        if (seen[link]) continue;

        var title = sgStrip(anchor[2]).replace(/\s+/g, " ").trim();
        if (!title) {
            var titleAttr = sgAttr(anchor[0], "title");
            title = titleAttr ? titleAttr.replace(/\s+/g, " ").trim() : "";
        }
        if (title.length < 5) continue;

        var imgTag = /<img\b[^>]*>/i.exec(part);
        var imageUrl = imgTag ? sgImgSrc(imgTag[0]) : null;

        var excerpt = null;
        var sm = /<div[^>]*class="[^"]*story__summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(part);
        if (sm) {
            var txt = sgStrip(sm[1]).replace(/\s+/g, " ").trim();
            if (txt.length >= SG_MIN_TEXT) excerpt = txt;
        }

        var pubDate = null;
        var pubDateMs = 0;
        var timeM = /<time\b[^>]*>/i.exec(part);
        if (timeM) {
            var epoch = sgAttr(timeM[0], "data-time");
            if (epoch) {
                pubDateMs = parseInt(epoch, 10) * 1000;
                pubDate = sgDateLabel(epoch);
            }
            if (!pubDateMs) {
                var dt = sgAttr(timeM[0], "datetime");
                var dm = dt ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\+(\d{2})(\d{2}))?/.exec(dt) : null;
                if (dm) {
                    var off = dm[7] ? (parseInt(dm[7], 10) * 60 + parseInt(dm[8], 10)) * 60000 : 0;
                    pubDateMs = Date.UTC(parseInt(dm[1], 10), parseInt(dm[2], 10) - 1, parseInt(dm[3], 10),
                        parseInt(dm[4], 10), parseInt(dm[5], 10), parseInt(dm[6], 10)) - off;
                    pubDate = sgDateLabel(Math.round(pubDateMs / 1000));
                }
            }
        }

        seen[link] = true;
        items.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: imageUrl,
            pubDate: pubDate,
            pubDateMs: pubDateMs,
            sourceName: SG_SOURCE_NAME
        });
    }
    return items;
}

/** Cắt đúng vùng danh sách chính (bỏ box highlight phía trên và box phụ phía dưới). */
function sgListChunk(html) {
    var s = sgClean(html);
    var start = s.search(/data-source="(?:zone|home)-timeline[^"]*"/i);
    if (start < 0) {
        start = s.indexOf('<article class="story');
        if (start < 0) return "";
    }
    var end = s.length;
    var btn = s.indexOf("control__loadmore", start);
    if (btn >= 0 && btn < end) end = btn;
    var box = s.indexOf('data-source="zone-box-', start);
    if (box >= 0 && box < end) end = box;
    var homeBox = s.indexOf('data-source="zone-box-home-', start);
    if (homeBox >= 0 && homeBox < end) end = homeBox;
    return s.substring(start, end);
}

function sgJsonItems(json) {
    if (!json || json.error_code !== 0 || !json.data || !json.data.contents) return [];
    var list = json.data.contents;
    var items = [];
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it) continue;
        var link = sgAbs(it.url);
        if (!link) continue;
        link = link.replace(/[?#].*$/, "");
        if (!/-post\d+\.html$/i.test(link)) continue;
        var title = sgStrip(it.title).replace(/\s+/g, " ").trim();
        if (title.length < 5) continue;
        var excerpt = sgStrip(it.description).replace(/\s+/g, " ").trim();
        if (excerpt && excerpt.length < SG_MIN_TEXT) excerpt = null;
        if (excerpt && excerpt.length > 400) excerpt = excerpt.substring(0, 400).replace(/\s+\S*$/, "") + "…";
        var imageUrl = it.avatar_url ? sgAbs(it.avatar_url) : null;
        var epoch = parseInt(it.date, 10);
        items.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: imageUrl,
            pubDate: epoch ? sgDateLabel(epoch) : null,
            pubDateMs: epoch ? epoch * 1000 : 0,
            sourceName: SG_SOURCE_NAME
        });
    }
    return items;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var json = sgTryJson(html);
    if (json) return JSON.stringify(sgJsonItems(json));
    // Trang chủ gom nhiều box chuyên mục (không phân trang) → lấy hết, khử trùng
    if (/^https?:\/\/(www\.)?sggp\.org\.vn\/?(?:[?#]|$)/i.test(String(url || ""))) {
        return JSON.stringify(sgParseCards(sgClean(html)));
    }
    return JSON.stringify(sgParseCards(sgListChunk(html)));
}

function sgApiUrl(type, zone, page, phraseEncoded) {
    return SG_API + "/morenews-" + type + "-" + zone + "-" + page + ".html?show_author=1&phrase=" + (phraseEncoded || "");
}

function sgNextPage(currentUrl, page, html) {
    if (!currentUrl || !page || page < 2) return null;
    var url = String(currentUrl);
    var source = String(html || "");

    // Đang ở trang JSON của API → đọc load_more rồi xin trang kế
    var apiM = /\/api\/morenews-([a-z]+)-(\d+)-(\d+)\.html/i.exec(url);
    if (apiM) {
        var json = sgTryJson(source);
        if (!json || json.error_code !== 0 || !json.data) return null;
        if (json.data.load_more === false) return null;
        var type = apiM[1];
        var cap = type === "search" ? SG_MAX_SEARCH_PAGE : SG_MAX_PAGE;
        if (page > cap) return null;
        var phraseRaw = sgQuery(url, "phrase");
        return sgApiUrl(type, apiM[2], page, phraseRaw);
    }

    // Trang tìm kiếm gốc
    if (/\/tim-kiem\//i.test(url)) {
        if (page > SG_MAX_SEARCH_PAGE) return null;
        var sBtn = /<button[^>]*class="[^"]*control__loadmore[^"]*"[^>]*>/i.exec(source);
        if (!sBtn) return null;
        var q = sgAttr(sBtn[0], "data-phrase");
        if (!q) {
            var qRaw = sgQuery(url, "q");
            q = qRaw ? qRaw : "";
        }
        if (!q) return null;
        return sgApiUrl("search", "0", page, encodeURIComponent(q));
    }

    // Trang chuyên mục: nút "Xem thêm" mang zone/type
    if (page > SG_MAX_PAGE) return null;
    var btn = /<button[^>]*class="[^"]*control__loadmore[^"]*"[^>]*>/i.exec(source);
    if (!btn) return null;
    var zone = sgAttr(btn[0], "data-zone");
    var type2 = sgAttr(btn[0], "data-type") || "zone";
    if (!zone) return null;
    return sgApiUrl(type2, zone, page, "");
}

function getNewsNextPageUrl(currentUrl, page, html) {
    try {
        return sgNextPage(currentUrl, page, html);
    } catch (e) {
        return null;
    }
}

function getNewsSearchUrl(query, page) {
    var keyword = query === null || query === undefined ? "" : String(query).trim();
    if (!keyword) return null;
    var p = page && page > 0 ? Math.floor(page) : 1;
    // Trang > 1 đi qua JSON API trong getNewsNextPageUrl
    if (p > 1) return null;
    return SG_HOST + "/tim-kiem/?q=" + encodeURIComponent(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var SG_TITLE_RES = [
    /<h1[^>]*class="[^"]*\barticle__title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
    /<title>([\s\S]*?)<\/title>/i
];

var SG_BODY_START = [
    'class="article__body',
    'itemprop="articleBody"',
    'class="detail-content',
    'class="cms-body'
];

var SG_BODY_END = [
    '<div class="related-news"',
    '<div class="article__author',
    '<div class="article__tag"',
    '<div class="wrap-comment',
    '<div class="multi-pack-3"',
    '<div class="social article__share"'
];

var SG_BLOCK_RE = /<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<table\b[^>]*>[\s\S]*?<\/table>|<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>|<(p|h2|h3|h4|blockquote)\b[^>]*>[\s\S]*?<\/\2>/gi;

function sgTitle(source) {
    for (var i = 0; i < SG_TITLE_RES.length; i++) {
        var m = SG_TITLE_RES[i].exec(source);
        if (!m) continue;
        var t = sgStrip(m[1]).replace(/\s+/g, " ").trim();
        t = t.replace(/\s*\|\s*BÁO SÀI GÒN GIẢI PHÓNG\s*$/i, "")
            .replace(/\s*-\s*BÁO SÀI GÒN GIẢI PHÓNG\s*$/i, "")
            .trim();
        if (t) return t;
    }
    return "";
}

/** Vị trí bắt đầu thân bài (sau dấu `>` của thẻ mở). */
function sgFindBodyStart(source) {
    for (var i = 0; i < SG_BODY_START.length; i++) {
        var idx = source.indexOf(SG_BODY_START[i]);
        if (idx < 0) continue;
        var gt = source.indexOf(">", idx);
        if (gt > 0) return gt + 1;
    }
    return -1;
}

function sgCutBody(source, start) {
    var end = source.length;
    for (var i = 0; i < SG_BODY_END.length; i++) {
        var idx = source.indexOf(SG_BODY_END[i], start);
        if (idx >= 0 && idx < end) end = idx;
    }
    return source.substring(start, end);
}

function sgTableText(tag) {
    var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
        var parts = [];
        for (var c = 0; c < cells.length; c++) parts.push(sgStrip(cells[c]).replace(/\s+/g, " "));
        var line = parts.join(" | ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
    }
    return lines.join("\n");
}

function sgListText(tag) {
    var lis = tag.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    var lines = [];
    for (var i = 0; i < lis.length; i++) {
        var txt = sgStrip(lis[i]).replace(/\s+/g, " ").trim();
        if (txt) lines.push("- " + txt);
    }
    return lines.join("\n");
}

function sgVideoSrc(tag) {
    var m = /<(?:video|source|iframe)\b[^>]*(?:data-src|src)="([^"]+)"/i.exec(tag);
    if (!m) return null;
    var url = sgDecode(m[1]).replace(/&amp;/g, "&").trim();
    if (!url || url.indexOf("about:blank") === 0) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function sgScanBlocks(body) {
    var blocks = [];
    var re = new RegExp(SG_BLOCK_RE.source, "gi");
    var m;
    while ((m = re.exec(body)) !== null) {
        var tag = m[0];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? sgImgSrc(imgTag[0]) : null;
            var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var caption = capM ? sgStrip(capM[1]).replace(/\s+/g, " ").trim() : null;
            if (caption && caption.length < 3) caption = null;
            if (src) {
                blocks.push({ isImage: true, text: caption, imageUrl: src, isVideo: false, videoUrl: null });
            } else {
                var vUrl = sgVideoSrc(tag);
                if (vUrl) blocks.push({ isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: vUrl });
            }
            continue;
        }

        if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var src2 = sgVideoSrc(tag);
            if (src2) blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: src2 });
            continue;
        }

        if (lower.indexOf("<table") === 0) {
            var tableText = sgTableText(tag);
            if (tableText.length >= SG_MIN_TEXT) {
                blocks.push({ isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        if (lower.indexOf("<ul") === 0 || lower.indexOf("<ol") === 0) {
            var listText = sgListText(tag);
            if (listText.length >= SG_MIN_TEXT) {
                blocks.push({ isImage: false, text: listText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        // <p>/<h2..h4>/<blockquote>
        var isHeading = lower.indexOf("<h2") === 0 || lower.indexOf("<h3") === 0 || lower.indexOf("<h4") === 0;
        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));

        // Ảnh lẻ nằm ngay trong <p> (không bọc <figure>)
        if (inner.indexOf("<img") !== -1) {
            var imgRe = /<img\b[^>]*>/gi;
            var im;
            while ((im = imgRe.exec(inner)) !== null) {
                var inlineSrc = sgImgSrc(im[0]);
                if (inlineSrc) {
                    blocks.push({ isImage: true, text: null, imageUrl: inlineSrc, isVideo: false, videoUrl: null });
                }
            }
        }

        var txt = sgStrip(inner).replace(/\s+/g, " ").trim();
        if (!txt) continue;
        if (txt.length < (isHeading ? 8 : SG_MIN_TEXT)) continue;
        blocks.push({ isImage: false, text: txt, imageUrl: null, isVideo: false, videoUrl: null });
    }
    return blocks;
}

function sgRelated(source) {
    var idx = source.indexOf('<div class="related-news"');
    if (idx < 0) return [];
    var end = source.length;
    var ends = ['<div class="article__author', '<div class="article__tag"', '<div class="multi-pack-3"', '<div class="wrap-comment'];
    for (var i = 0; i < ends.length; i++) {
        var p = source.indexOf(ends[i], idx);
        if (p >= 0 && p < end) end = p;
    }
    var items = sgParseCards(source.substring(idx, end));
    if (items.length > 12) items = items.slice(0, 12);
    return items;
}

function sgArticle(html) {
    var source = sgClean(html);
    var title = sgTitle(source);

    var start = sgFindBodyStart(source);
    if (start < 0) return null;
    var body = sgCutBody(source, start);
    var blocks = sgScanBlocks(body);

    var sapo = "";
    var sapoM = /<div[^>]*class="[^"]*article__sapo[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(source);
    if (sapoM) {
        sapo = sgStrip(sapoM[1]).replace(/\s+/g, " ").trim();
        if (sapo.length < SG_MIN_TEXT) sapo = "";
    }
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
    return {
        title: title,
        blocks: blocks,
        related: sgRelated(source)
    };
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    try {
        var data = sgArticle(html);
        return data ? JSON.stringify(data) : null;
    } catch (e) {
        return null;
    }
}
