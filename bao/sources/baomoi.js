/**
 * Báo Mới (baomoi.com) — nguồn báo dạng JS, tải từ catalog GitHub.
 *
 * Trang danh sách là Next.js: dữ liệu nằm trong `<script id="__NEXT_DATA__">`
 * → `props.pageProps.resp.data`:
 *  - "Tin mới"/"Video": `content.items`
 *  - Trang chủ/chuyên mục: `content.sections[*].items`
 *
 * Phân trang: mỗi khối list có `options.more.params`
 * (`/content/get/list-by-type` — listType/listId/page). API thật ở
 * `w-api.baomoi.com` và đòi chữ ký:
 *   sig = HMAC-SHA256(path + "key=value" đã sắp xếp, secret)
 * Response API là JSON thô `{"data":{"items":[…]}}`.
 *
 * Tìm kiếm: `/tim-kiem.epi?q=…` render sẵn 1 trang, không có trang kế.
 *
 * Đọc bài: `resp.data.content` có `title`/`description`/`bodys`; mỗi body là
 * text (có thể là HTML), image (`contentOrigin`), video (MP4 + `poster`);
 * `adBanner` bỏ qua, caption (`subType=media-caption`) gắn vào ảnh trước.
 *
 * Toàn bộ hàm trả JSON string, viết ES5 thuần.
 */

var BM_HOST = "https://baomoi.com";
var BM_SOURCE_NAME = "Báo Mới";

var BM_API_HOST = "https://w-api.baomoi.com";
var BM_API_LIST_PATH = "/api/v1/content/get/list-by-type";
var BM_API_SECRET = "882QcNXV4tUZbvAsjmFOHqNC1LpcBRKW";
var BM_API_KEY = "kI44ARvPwaqL7v0KuDSM0rGORtdY1nnw";
var BM_API_VERSION = "0.11.24";
var BM_MAX_PAGE = 500;

var BM_MIN_TEXT = 30;

var BM_SIGNED_KEYS = {
    ctime: 1, id: 1, type: 1, listType: 1, listId: 1, page: 1, size: 1, version: 1
};
var BM_OWN_KEYS = { ctime: 1, version: 1, sig: 1, apiKey: 1 };

var BM_CATEGORIES = [
    { name: "Trang chủ", pageUrl: BM_HOST + "/" },
    { name: "Tin mới", pageUrl: BM_HOST + "/tin-moi.epi" },
    { name: "Thời sự", pageUrl: BM_HOST + "/thoi-su.epi" },
    { name: "Thế giới", pageUrl: BM_HOST + "/the-gioi.epi" },
    { name: "Kinh tế", pageUrl: BM_HOST + "/kinh-te.epi" },
    { name: "Tài chính", pageUrl: BM_HOST + "/tai-chinh.epi" },
    { name: "Chứng khoán", pageUrl: BM_HOST + "/chung-khoan.epi" },
    { name: "Khoa học công nghệ", pageUrl: BM_HOST + "/khoa-hoc-cong-nghe.epi" },
    { name: "Khoa học", pageUrl: BM_HOST + "/khoa-hoc.epi" },
    { name: "Thể thao", pageUrl: BM_HOST + "/the-thao.epi" },
    { name: "Bóng đá", pageUrl: BM_HOST + "/bong-da.epi" },
    { name: "Giải trí", pageUrl: BM_HOST + "/giai-tri.epi" },
    { name: "Pháp luật", pageUrl: BM_HOST + "/phap-luat.epi" },
    { name: "Giáo dục", pageUrl: BM_HOST + "/giao-duc.epi" },
    { name: "Đời sống", pageUrl: BM_HOST + "/doi-song.epi" },
    { name: "Ô tô - Xe máy", pageUrl: BM_HOST + "/xe-co.epi" },
    { name: "Nhà đất", pageUrl: BM_HOST + "/nha-dat.epi" },
    { name: "Ẩm thực", pageUrl: BM_HOST + "/am-thuc.epi" },
    { name: "Du lịch", pageUrl: BM_HOST + "/du-lich.epi" },
    { name: "Video", pageUrl: BM_HOST + "/tin-video.epi" },
    { name: "Hà Nội", pageUrl: BM_HOST + "/tin-dia-phuong/ha-noi.epi" }
];

function getNewsSource() {
    return JSON.stringify({
        id: "baomoi",
        name: BM_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=baomoi.com&sz=64",
        categories: BM_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("baomoi.com") !== -1;
}

function getNewsHeaders(url) {
    if (!url) return JSON.stringify({});
    if (String(url).toLowerCase().indexOf("w-api.baomoi.com") !== -1) {
        // Endpoint JSON: client mặc định gửi Accept: text/html của trang đọc báo
        return JSON.stringify({
            "Accept": "application/json, text/plain, */*",
            "Referer": BM_HOST + "/"
        });
    }
    return JSON.stringify({});
}

// ----------------------------------------------------------------------
// HTML helpers
// ----------------------------------------------------------------------

var BM_ENTITIES = {
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

function bmDecode(value) {
    if (value === null || value === undefined) return "";
    var s = String(value);
    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
        var code = parseInt(hex, 16);
        try { return String.fromCharCode(code); } catch (e) { return m; }
    });
    s = s.replace(/&#(\d+);/g, function (m, dec) {
        try { return String.fromCharCode(parseInt(dec, 10)); } catch (e) { return m; }
    });
    s = s.replace(/&([a-zA-Z]+);/g, function (m, name) {
        var out = BM_ENTITIES[name];
        return out === undefined ? m : out;
    });
    return s;
}

function bmStrip(html) {
    if (!html) return "";
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
}

function bmCollapse(text) {
    return String(text === null || text === undefined ? "" : text)
        .replace(/\s+/g, " ")
        .trim();
}

function bmText(html) {
    return bmCollapse(bmDecode(bmStrip(html)));
}

/** Ảnh lazy: đổi URL của báo về dạng tuyệt đối + bỏ tiền tố resize nếu có. */
function bmNormImg(raw) {
    if (!raw) return null;
    var url = bmDecode(String(raw)).trim();
    if (!url) return null;
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function bmAbs(raw) {
    if (!raw) return null;
    var url = String(raw).trim();
    if (!url) return null;
    if (url.indexOf("http") === 0) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.indexOf("/") === 0) return BM_HOST + url;
    return null;
}

// ----------------------------------------------------------------------
// Dữ liệu Next.js → JSON
// ----------------------------------------------------------------------

var BM_NEXT_DATA = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;

function bmJson(html) {
    if (!html) return null;
    var raw = null;
    var m = BM_NEXT_DATA.exec(html);
    if (m) {
        raw = m[1];
    } else {
        var trimmed = String(html).replace(/^\s+|\s+$/g, "");
        if (trimmed.charAt(0) === "{") raw = trimmed;
    }
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function bmPageData(json) {
    if (!json) return null;
    var props = json.props;
    var pageProps = props ? props.pageProps : null;
    var resp = pageProps ? pageProps.resp : null;
    return resp ? (resp.data || null) : null;
}

function bmContentOf(json) {
    if (!json) return null;
    var data = bmPageData(json);
    if (data && data.content) return data.content;
    return json.data || null;
}

// ----------------------------------------------------------------------
// Danh sách tin
// ----------------------------------------------------------------------

function bmParseItem(o) {
    if (!o) return null;
    var rawUrl = String(o.url === null || o.url === undefined ? "" : o.url).trim();
    // Bỏ link tag/chuyên trang báo (không phải bài) — chỉ nhận bài `.epi`
    if (rawUrl.toLowerCase().indexOf(".epi") === -1) return null;
    if (rawUrl.toLowerCase().indexOf("/tag/") !== -1) return null;
    var link = bmAbs(rawUrl);
    if (!link) return null;

    var title = bmCollapse(bmDecode(o.title));
    if (!title) return null;

    var excerpt = null;
    if (o.description) {
        var desc = bmText(o.description);
        if (desc.length >= BM_MIN_TEXT) excerpt = desc;
    }

    var thumb = String(o.thumb === null || o.thumb === undefined ? "" : o.thumb).trim();
    var imageUrl = thumb.indexOf("http") === 0 ? bmNormImg(thumb) : null;

    var publisher = o.publisher && o.publisher.name ? String(o.publisher.name).trim() : "";
    var date = o.date === null || o.date === undefined ? 0 : parseInt(o.date, 10);
    if (isNaN(date)) date = 0;

    return {
        title: title,
        link: link,
        excerpt: excerpt,
        imageUrl: imageUrl,
        pubDateMs: date * 1000,
        sourceName: publisher ? publisher : BM_SOURCE_NAME
    };
}

function bmAddItems(array, items, seen) {
    if (!array) return;
    for (var i = 0; i < array.length; i++) {
        var article = null;
        try {
            article = bmParseItem(array[i]);
        } catch (e) {
            article = null;
        }
        if (!article) continue;
        if (seen[article.link]) continue;
        seen[article.link] = 1;
        items.push(article);
    }
}

function parseNewsList(html, url) {
    if (!html) return JSON.stringify([]);
    var json = bmJson(html);
    if (!json) return JSON.stringify([]);
    var content = bmContentOf(json);
    if (!content) return JSON.stringify([]);

    var items = [];
    var seen = {};

    // "Tin mới"/"Video" để list ở items; trang chủ/chuyên mục chia theo sections
    bmAddItems(content.items, items, seen);
    var sections = content.sections;
    if (sections) {
        for (var i = 0; i < sections.length; i++) {
            bmAddItems(sections[i] ? sections[i].items : null, items, seen);
        }
    }
    return JSON.stringify(items);
}

// ----------------------------------------------------------------------
// Phân trang: API list-by-type có chữ ký
// ----------------------------------------------------------------------

/**
 * Params của khối list có "Tải thêm" (`options.more` hoặc chính `options`).
 * Trang chủ/chuyên mục đặt options trong section; "Tin mới"/"Video" ở content.
 */
function bmMoreParams(options) {
    if (!options) return null;
    var more = options.more ? options.more : options;
    var moreUrl = String(more.url === null || more.url === undefined ? "" : more.url);
    if (moreUrl.toLowerCase().indexOf("list-by-type") === -1) return null;
    var params = more.params;
    if (!params) return null;

    var out = [];
    for (var key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        var value = params[key];
        if (value === null || value === undefined) continue;
        value = String(value);
        if (!value || value === "null") continue;
        out.push([key, value]);
    }
    return out.length ? out : null;
}

function bmFindMoreParams(content) {
    if (!content) return null;
    var direct = bmMoreParams(content.options);
    if (direct) return direct;
    var sections = content.sections;
    if (!sections) return null;
    for (var i = 0; i < sections.length; i++) {
        var found = bmMoreParams(sections[i] ? sections[i].options : null);
        if (found) return found;
    }
    return null;
}

function bmPairsToMap(pairs) {
    var map = {};
    for (var i = 0; i < pairs.length; i++) map[pairs[i][0]] = pairs[i][1];
    return map;
}

function bmQueryParams(url) {
    var pairs = [];
    var query = String(url).indexOf("?") === -1 ? "" : String(url).substring(String(url).indexOf("?") + 1);
    if (!query) return pairs;
    var parts = query.split("&");
    for (var i = 0; i < parts.length; i++) {
        var pair = parts[i];
        var idx = pair.indexOf("=");
        if (idx <= 0) continue;
        var key = bmUrlDecode(pair.substring(0, idx));
        if (BM_OWN_KEYS[key]) continue;
        pairs.push([key, bmUrlDecode(pair.substring(idx + 1))]);
    }
    return pairs;
}

function bmUrlEncode(value) {
    return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function bmUrlDecode(value) {
    try {
        return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (e) {
        return String(value);
    }
}

/** URL API kèm ctime/version/sig/apiKey — công thức bóc từ chunk `_app` của baomoi.com. */
function bmApiUrl(pairs) {
    var signed = [];
    for (var i = 0; i < pairs.length; i++) signed.push([pairs[i][0], pairs[i][1]]);
    signed.push(["ctime", String(Math.floor(new Date().getTime() / 1000))]);
    signed.push(["version", BM_API_VERSION]);
    signed.push(["sig", bmSign(signed)]);
    signed.push(["apiKey", BM_API_KEY]);

    var query = "";
    for (var j = 0; j < signed.length; j++) {
        if (j > 0) query += "&";
        query += bmUrlEncode(signed[j][0]) + "=" + bmUrlEncode(signed[j][1]);
    }
    return BM_API_HOST + BM_API_LIST_PATH + "?" + query;
}

function bmSign(pairs) {
    // Chỉ key trong BM_SIGNED_KEYS, sắp xếp alphabet, nối "key=value" KHÔNG dấu &
    var signed = [];
    for (var i = 0; i < pairs.length; i++) {
        var key = pairs[i][0];
        var value = pairs[i][1];
        if (!BM_SIGNED_KEYS[key] || !value) continue;
        signed.push([key, bmUrlEncode(value)]);
    }
    signed.sort(function (a, b) {
        return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
    });
    var serialized = "";
    for (var j = 0; j < signed.length; j++) {
        serialized += signed[j][0] + "=" + signed[j][1];
    }
    return bmHmacHex(BM_API_LIST_PATH + serialized, BM_API_SECRET);
}

/** HMAC-SHA256 hex — viết thuần ES5 để không phụ thuộc Java bridge của Rhino. */
function bmHmacHex(message, secret) {
    var key = bmUtf8(secret);
    if (key.length > 64) key = bmSha256(key);
    while (key.length < 64) key.push(0);

    var inner = [];
    var outer = [];
    for (var i = 0; i < 64; i++) {
        inner.push(key[i] ^ 0x36);
        outer.push(key[i] ^ 0x5c);
    }
    var msg = bmUtf8(message);
    for (var j = 0; j < msg.length; j++) inner.push(msg[j]);

    var innerHash = bmSha256(inner);
    for (var k = 0; k < innerHash.length; k++) outer.push(innerHash[k]);
    var digest = bmSha256(outer);

    var hex = "";
    for (var d = 0; d < digest.length; d++) {
        var b = digest[d] & 0xff;
        hex += (b < 16 ? "0" : "") + b.toString(16);
    }
    return hex;
}

function bmUtf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xc0 | (c >> 6));
            out.push(0x80 | (c & 63));
        } else {
            out.push(0xe0 | (c >> 12));
            out.push(0x80 | ((c >> 6) & 63));
            out.push(0x80 | (c & 63));
        }
    }
    return out;
}

var BM_SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function bmRor(x, n) {
    return (x >>> n) | (x << (32 - n));
}

function bmSha256(bytes) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var data = bytes.slice(0);
    var bitLen = bytes.length * 8;
    data.push(0x80);
    while (data.length % 64 !== 56) data.push(0);
    var hi = Math.floor(bitLen / 0x100000000);
    var lo = bitLen >>> 0;
    data.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    data.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    var w = new Array(64);
    for (var i = 0; i < data.length; i += 64) {
        for (var t = 0; t < 16; t++) {
            w[t] = (data[i + t * 4] << 24) | (data[i + t * 4 + 1] << 16) |
                   (data[i + t * 4 + 2] << 8) | data[i + t * 4 + 3];
        }
        for (t = 16; t < 64; t++) {
            var s0 = bmRor(w[t - 15], 7) ^ bmRor(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            var s1 = bmRor(w[t - 2], 17) ^ bmRor(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }

        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (t = 0; t < 64; t++) {
            var S1 = bmRor(e, 6) ^ bmRor(e, 11) ^ bmRor(e, 25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (hh + S1 + ch + BM_SHA_K[t] + w[t]) | 0;
            var S0 = bmRor(a, 2) ^ bmRor(a, 13) ^ bmRor(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var t2 = (S0 + maj) | 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0;
        h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0;
        h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0;
        h[5] = (h[5] + f) | 0;
        h[6] = (h[6] + g) | 0;
        h[7] = (h[7] + hh) | 0;
    }

    var out = [];
    for (var k = 0; k < 8; k++) {
        out.push((h[k] >>> 24) & 255, (h[k] >>> 16) & 255, (h[k] >>> 8) & 255, h[k] & 255);
    }
    return out;
}

function getNewsNextPageUrl(currentUrl, page, html) {
    var url = String(currentUrl === null || currentUrl === undefined ? "" : currentUrl);
    var currentPage = parseInt(page, 10);
    if (isNaN(currentPage)) return null;

    // Tìm kiếm không có trang kế
    if (url.toLowerCase().indexOf("/tim-kiem.epi") !== -1) return null;

    if (url.toLowerCase().indexOf(BM_API_LIST_PATH) !== -1) {
        var params = bmQueryParams(url);
        var map = bmPairsToMap(params);
        var current = parseInt(map["page"], 10);
        if (isNaN(current) || current >= BM_MAX_PAGE) return null;

        var json = bmJson(html);
        var data = json ? json.data : null;
        var items = data ? data.items : null;
        if (!items || !items.length) return null;

        var next = [];
        for (var i = 0; i < params.length; i++) next.push([params[i][0], params[i][1]]);
        if (map["page"] === undefined) {
            next.push(["page", String(current + 1)]);
        } else {
            for (var j = 0; j < next.length; j++) {
                if (next[j][0] === "page") next[j][1] = String(current + 1);
            }
        }
        return bmApiUrl(next);
    }

    if (currentPage <= 1) return null;
    var pageJson = bmJson(html);
    if (!pageJson) return null;
    var content = bmContentOf(pageJson);
    if (!content) return null;
    // params.page là trang API kế tiếp — trang HTML đầu đã gộp nhiều trang API
    var moreParams = bmFindMoreParams(content);
    if (!moreParams) return null;
    return bmApiUrl(moreParams);
}

function getNewsSearchUrl(query, page) {
    var keyword = String(query === null || query === undefined ? "" : query).replace(/^\s+|\s+$/g, "");
    if (!keyword) return null;
    if (parseInt(page, 10) > 1) return null;   // trang tìm kiếm render sẵn 1 lần
    return BM_HOST + "/tim-kiem.epi?q=" + bmUrlEncode(keyword);
}

// ----------------------------------------------------------------------
// Đọc bài
// ----------------------------------------------------------------------

var BM_OG_TITLE = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i;

function bmArticleContent(html) {
    var json = bmJson(html);
    if (!json) return null;
    var data = bmPageData(json);
    if (!data || !data.content) return null;
    return data.content;
}

function bmAddTextBlock(blocks, body) {
    var raw = body.content;
    if (!raw) return;
    var text = bmText(raw);
    if (!text) return;

    var last = blocks.length ? blocks[blocks.length - 1] : null;
    if (body.subType === "media-caption" && last && last.isImage && !last.text) {
        last.text = text;
        return;
    }
    // body-author (chân bài) ngắn hơn ngưỡng đoạn văn nhưng vẫn cần giữ
    if (text.length >= BM_MIN_TEXT || body.subType === "body-author") {
        blocks.push({ isImage: false, text: text });
    }
}

function bmAddImageBlock(blocks, body) {
    var raw = body.contentOrigin ? body.contentOrigin : body.content;
    if (!raw) return;
    var url = bmNormImg(raw);
    if (!url) return;
    blocks.push({ isImage: true, imageUrl: url });
}

function bmAddVideoBlock(blocks, body) {
    var url = String(body.content === null || body.content === undefined ? "" : body.content).replace(/^\s+|\s+$/g, "");
    if (!url) return;
    var poster = String(body.poster === null || body.poster === undefined ? "" : body.poster).replace(/^\s+|\s+$/g, "");
    if (poster.indexOf("http") !== 0) poster = null;
    else poster = bmNormImg(poster);
    blocks.push({
        isImage: false,
        imageUrl: poster,
        isVideo: true,
        videoUrl: url
    });
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var content = bmArticleContent(html);
    if (!content) return null;

    var title = bmCollapse(bmDecode(content.title));
    if (!title) {
        var og = BM_OG_TITLE.exec(html);
        if (og) title = bmText(og[1]);
    }

    var blocks = [];
    // Sapo in đậm đầu bài
    if (content.description) {
        var sapo = bmText(content.description);
        if (sapo.length >= BM_MIN_TEXT) blocks.push({ isImage: false, text: sapo });
    }

    var bodys = content.bodys;
    if (bodys) {
        for (var i = 0; i < bodys.length; i++) {
            var body = bodys[i];
            if (!body) continue;
            var type = body.type;
            if (type === "text") bmAddTextBlock(blocks, body);
            else if (type === "image") bmAddImageBlock(blocks, body);
            else if (type === "video") bmAddVideoBlock(blocks, body);
            // adBanner / adNative / audio: bỏ khỏi nội dung đọc
        }
    }

    if (!blocks.length) return null;
    return JSON.stringify({
        title: title,
        blocks: blocks,
        // Tin liên quan không render sẵn trong HTML
        related: []
    });
}
