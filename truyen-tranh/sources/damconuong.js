/*
 * Nguồn truyện tranh Dâm Cô Nương (damconuong.win) — 18+ — chạy trong Rhino (ES5).
 *
 * ĐẶC THÙ SITE (quan trọng):
 *  - Ảnh chương KHÔNG nằm trong HTML. Trang chương chỉ có
 *    div#chapter-content[data-cipher-path="<slug>/<segment>"]; trình duyệt tải
 *    decoder /js/bookmark.js rồi gọi GET /_c/mangas/<slug>/chapters/<segment>/pages?_=TOKEN
 *    → response {"e":"<base64url>"} là AES-256-GCM (key dẫn từ token, AAD = cipher path).
 *  - Plugin không fetch được nên "link chương" trong parseComicDetail trỏ THẲNG
 *    tới endpoint /_c kèm token tự sinh; parseComicChapter nhận JSON mã hoá,
 *    tự giải mã (SHA-256/HMAC/AES-256-CTR thuần JS bên dưới) → imageUrls.
 *  - Token = base64url(0x01 || HMAC-SHA256(HMAC(K1,"tok"), path)[0:16]).
 *    AES key = HMAC-SHA256(HMAC(K1,"enc"), <chuỗi token>); IV = 12 byte đầu payload,
 *    16 byte cuối là GCM tag (bỏ qua, không xác thực), dữ liệu còn lại giải bằng CTR
 *    với counter khởi động ở IV||0x00000002 (GCM dành J0=...01 cho mask tag).
 *  - Endpoint /_c bắt buộc header X-Requested-With: XMLHttpRequest (getComicHeaders).
 *  - CDN ảnh (dcnvn2.mbpro.vip, zs.wtcdn.xyz) chặn hotlink nếu thiếu Referer.
 *  - K1 là hằng số nhúng trong /js/bookmark.js; site đổi key → cập nhật DCN_KEY1.
 *
 * Hợp đồng (tất cả trả JSON string):
 *  - getComicSource() / getComicHomeUrl(page) / getComicSearchRequest(query,page)
 *  - parseComicList(html,url) / getComicNextPageUrl(currentUrl,page,html)
 *  - parseComicDetail(html,url) / parseComicChapter(html,url)
 *  - getComicHeaders(url) / getComicCategories()
 *
 * Cấu trúc site (Laravel + Alpine):
 *  - Truyện /truyen/<slug>/; chương /truyen/<slug>/<segment> với segment tuỳ ý
 *    ("chapter-12", "chap-1"...). API dùng đúng segment đó: /_c/mangas/<slug>/chapters/<segment>/pages
 *  - Danh sách /danh-sach?page=N; thể loại /the-loai/<slug>?page=N;
 *    tìm kiếm /tim-kiem?filter[name]=<q>&page=N (param q= thường bị bỏ qua!).
 *  - Thẻ truyện: div...manga-vertical — bìa div.cover-frame img, tên h3 > a,
 *    chương mới h4 > a. Trang chi tiết: h1.md-title, badge a.md-badge-* (trạng thái),
 *    thể loại sau chữ "Thể loại", mô tả div.md-synopsis p, mục lục a.md-ch
 *    (span.md-ch-title + thờii gian), MỚI NHẤT TRƯỚC → sort tăng dần.
 */

var DCN_HOST = "https://damconuong.win";
var DCN_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var DCN_KEY1_HEX = "615746b93f118c35a47908edeecee6bf9dec98ca4badc281b8632cf1eae0f01b";
var DCN_PAGE_MIN = 30; /* dưới số thẻ này coi như hết trang khi không có link phân trang */

/* ================================================================== */
/* Crypto: SHA-256 / HMAC / base64url / AES-256-CTR (thuần JS, ES5)    */
/* ================================================================== */

var DCN_SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function DCN_rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

/* bytes: mảng số 0..255 → mảng 32 word (big-endian) */
function DCN_sha256(bytes) {
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    var bitLenHi = Math.floor(bytes.length / 0x20000000);
    var bitLenLo = (bytes.length << 3) >>> 0;
    var msg = bytes.slice();
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    for (var i = 7; i >= 0; i--) msg.push((i >= 4 ? bitLenHi : bitLenLo) >>> ((i % 4) * 8) & 0xff);

    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
        var j, t1, t2, a, b, c, d, e, f, g, h;
        for (j = 0; j < 16; j++) {
            w[j] = ((msg[off + j * 4] << 24) | (msg[off + j * 4 + 1] << 16) |
                    (msg[off + j * 4 + 2] << 8) | msg[off + j * 4 + 3]) >>> 0;
        }
        for (j = 16; j < 64; j++) {
            var s0 = DCN_rotr(w[j - 15], 7) ^ DCN_rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            var s1 = DCN_rotr(w[j - 2], 17) ^ DCN_rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }
        a = h0; b = h1; c = h2; d = h3; e = h4; f = h5; g = h6; h = h7;
        for (j = 0; j < 64; j++) {
            var S1 = DCN_rotr(e, 6) ^ DCN_rotr(e, 11) ^ DCN_rotr(e, 25);
            var ch = (e & f) ^ (~e & g);
            t1 = (h + S1 + ch + DCN_SHA_K[j] + w[j]) >>> 0;
            var S0 = DCN_rotr(a, 2) ^ DCN_rotr(a, 13) ^ DCN_rotr(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7];
}

/* words → bytes (big-endian) */
function DCN_wordsToBytes(words) {
    var out = [], i;
    for (i = 0; i < words.length; i++) {
        out.push((words[i] >>> 24) & 0xff, (words[i] >>> 16) & 0xff,
                 (words[i] >>> 8) & 0xff, words[i] & 0xff);
    }
    return out;
}

function DCN_hmac256(keyBytes, msgBytes) {
    var key = keyBytes.slice();
    if (key.length > 64) key = DCN_wordsToBytes(DCN_sha256(key));
    while (key.length < 64) key.push(0);
    var ipad = [], opad = [], i;
    for (i = 0; i < 64; i++) {
        ipad.push(key[i] ^ 0x36);
        opad.push(key[i] ^ 0x5c);
    }
    return DCN_wordsToBytes(DCN_sha256(opad.concat(DCN_wordsToBytes(DCN_sha256(ipad.concat(msgBytes))))));
}

/* Chuỗi ASCII → bytes (slug/segment/token đều ASCII) */
function DCN_ascii(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
}

function DCN_hexToBytes(hex) {
    var out = [];
    for (var i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}

var DCN_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var DCN_B64_MAP = null;
function DCN_b64map() {
    if (DCN_B64_MAP) return DCN_B64_MAP;
    DCN_B64_MAP = {};
    for (var i = 0; i < 64; i++) DCN_B64_MAP[DCN_B64.charAt(i)] = i;
    DCN_B64_MAP["+"] = 62; DCN_B64_MAP["/"] = 63;
    return DCN_B64_MAP;
}

function DCN_b64urlEncode(bytes) {
    var out = "", i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
        out += DCN_B64.charAt((bytes[i] >> 2) & 63);
        out += DCN_B64.charAt(((bytes[i] << 4) | (bytes[i + 1] >> 4)) & 63);
        out += DCN_B64.charAt(((bytes[i + 1] << 2) | (bytes[i + 2] >> 6)) & 63);
        out += DCN_B64.charAt(bytes[i + 2] & 63);
    }
    var rem = bytes.length - i;
    if (rem === 1) {
        out += DCN_B64.charAt((bytes[i] >> 2) & 63);
        out += DCN_B64.charAt((bytes[i] << 4) & 63);
    } else if (rem === 2) {
        out += DCN_B64.charAt((bytes[i] >> 2) & 63);
        out += DCN_B64.charAt(((bytes[i] << 4) | (bytes[i + 1] >> 4)) & 63);
        out += DCN_B64.charAt((bytes[i + 1] << 2) & 63);
    }
    return out;
}

function DCN_b64urlDecode(s) {
    var map = DCN_b64map();
    var clean = String(s).replace(/=+$/g, "");
    var out = [], buf = 0, bits = 0, i, v;
    for (i = 0; i < clean.length; i++) {
        v = map[clean.charAt(i)];
        if (v == null) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buf >> bits) & 0xff);
        }
    }
    return out;
}

/* ---------- AES-256 (encrypt block, dùng cho CTR) ---------- */

var DCN_SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];

var DCN_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d];

/* Mở rộng khoá AES-256 → 60 word */
function DCN_aesExpandKey(keyBytes) {
    var w = [], i;
    for (i = 0; i < 8; i++) {
        w.push(((keyBytes[i * 4] << 24) | (keyBytes[i * 4 + 1] << 16) |
                (keyBytes[i * 4 + 2] << 8) | keyBytes[i * 4 + 3]) >>> 0);
    }
    for (i = 8; i < 60; i++) {
        var t = w[i - 1];
        if (i % 8 === 0) {
            t = ((DCN_SBOX[(t >>> 16) & 0xff] << 24) | (DCN_SBOX[(t >>> 8) & 0xff] << 16) |
                 (DCN_SBOX[t & 0xff] << 8) | DCN_SBOX[(t >>> 24) & 0xff]) >>> 0;
            t = (t ^ (DCN_RCON[i / 8 - 1] << 24)) >>> 0;
        } else if (i % 8 === 4) {
            t = ((DCN_SBOX[(t >>> 24) & 0xff] << 24) | (DCN_SBOX[(t >>> 16) & 0xff] << 16) |
                 (DCN_SBOX[(t >>> 8) & 0xff] << 8) | DCN_SBOX[t & 0xff]) >>> 0;
        }
        w.push((w[i - 8] ^ t) >>> 0);
    }
    return w;
}

function DCN_xt(a) {
    return ((a << 1) ^ ((a & 0x80) ? 0x11b : 0)) & 0xff;
}

/* Mã hoá 1 block (16 bytes) với round keys → 16 bytes */
function DCN_aesEncryptBlock(w, input) {
    var s = input.slice(0, 64).slice(0, 16), r, c, i, t, round;
    /* AddRoundKey */
    for (i = 0; i < 16; i++) s[i] ^= (w[i >> 2] >>> ((3 - (i & 3)) * 8)) & 0xff;

    for (round = 1; round <= 14; round++) {
        /* SubBytes */
        for (i = 0; i < 16; i++) s[i] = DCN_SBOX[s[i]];
        /* ShiftRows: state cột-major: hàng r dịch trái r ô */
        for (r = 1; r < 4; r++) {
            var row = [s[r], s[r + 4], s[r + 8], s[r + 12]];
            for (c = 0; c < 4; c++) s[r + c * 4] = row[(c + r) % 4];
        }
        /* MixColumns (trừ vòng cuối) */
        if (round < 14) {
            for (c = 0; c < 4; c++) {
                i = c * 4;
                var a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
                var x = a0 ^ a1 ^ a2 ^ a3;
                s[i]     = (a0 ^ DCN_xt(a0 ^ a1) ^ x) & 0xff;
                s[i + 1] = (a1 ^ DCN_xt(a1 ^ a2) ^ x) & 0xff;
                s[i + 2] = (a2 ^ DCN_xt(a2 ^ a3) ^ x) & 0xff;
                s[i + 3] = (a3 ^ DCN_xt(a3 ^ a0) ^ x) & 0xff;
            }
        }
        /* AddRoundKey */
        var base = round * 4;
        for (i = 0; i < 16; i++) s[i] ^= (w[base + (i >> 2)] >>> ((3 - (i & 3)) * 8)) & 0xff;
    }
    return s;
}

/*
 * AES-256-CTR dùng để giải payload AES-GCM của site: GCM mã hoá dữ liệu bắt
 * đầu từ J0+1 (J0 = iv||0x00000001 chỉ dùng mask tag), nên counter khởi động
 * ở iv||0x00000002. Bỏ qua tag 16 byte (không cần xác thực để đọc ảnh).
 */
function DCN_aesCtr(aesKeyBytes, data) {
    var w = DCN_aesExpandKey(aesKeyBytes);
    var iv = data.iv, i;
    var counter = [];
    for (i = 0; i < 12; i++) counter.push(iv[i]);
    counter.push(0, 0, 0, 2);
    var out = [];
    for (var off = 0; off < data.ct.length; off += 16) {
        var ks = DCN_aesEncryptBlock(w, counter);
        var n = Math.min(16, data.ct.length - off);
        for (i = 0; i < n; i++) out.push(data.ct[off + i] ^ ks[i]);
        /* inc32: tăng 4 byte cuối (big-endian) */
        for (i = 15; i >= 12; i--) {
            counter[i] = (counter[i] + 1) & 0xff;
            if (counter[i] !== 0) break;
        }
    }
    return out;
}

/* ---------- Mức site: token + giải mã trang ---------- */

var DCN_K1 = null, DCN_KTOK = null, DCN_KENC = null;

function DCN_keys() {
    if (!DCN_K1) {
        DCN_K1 = DCN_hexToBytes(DCN_KEY1_HEX);
        DCN_KTOK = DCN_hmac256(DCN_K1, DCN_ascii("tok"));
        DCN_KENC = DCN_hmac256(DCN_K1, DCN_ascii("enc"));
    }
}

/* cipherPath "<slug>/<segment>" → token string */
function DCN_token(cipherPath) {
    DCN_keys();
    var mac = DCN_hmac256(DCN_KTOK, DCN_ascii(cipherPath));
    var body = [1];
    for (var i = 0; i < 16; i++) body.push(mac[i]);
    return DCN_b64urlEncode(body);
}

function DCN_apiUrl(cipherPath) {
    var i = cipherPath.indexOf("/");
    var slug = cipherPath.substring(0, i);
    var seg = cipherPath.substring(i + 1);
    return DCN_HOST + "/_c/mangas/" + slug + "/chapters/" + seg + "/pages?_=" + DCN_token(cipherPath);
}

/* html = body của /_c (JSON {"e": "..."}) → mảng URL ảnh; lỗi → null */
function DCN_decryptPages(html, cipherPath, token) {
    DCN_keys();
    var obj;
    try { obj = JSON.parse(String(html)); } catch (e) { return null; }
    if (!obj || !obj.e) return null;
    var raw = DCN_b64urlDecode(obj.e);
    if (raw.length < 29) return null;
    var iv = raw.slice(0, 12);
    var ct = raw.slice(12, raw.length - 16); /* bỏ 16 byte GCM tag ở cuối */
    var aesKey = DCN_hmac256(DCN_KENC, DCN_ascii(token));
    var pt = DCN_aesCtr(aesKey, { iv: iv, ct: ct });
    var text = "";
    for (var i = 0; i < pt.length; i += 4000) {
        text += String.fromCharCode.apply(null, pt.slice(i, i + 4000));
    }
    var pages;
    try { pages = JSON.parse(text); } catch (e) { return null; }
    if (!pages || !pages.p) return null;
    var out = [];
    for (var j = 0; j < pages.p.length; j++) {
        if (typeof pages.p[j] === "string" && pages.p[j]) out.push(pages.p[j]);
    }
    return out;
}

/* ================================================================== */
/* Helpers HTML chung                                                 */
/* ================================================================== */

function DCN_trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

var DCN_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
    middot: "\u00b7", times: "\u00d7", copy: "\u00a9", reg: "\u00ae", trade: "\u2122"
};

function DCN_char(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return "";
    if (code <= 0xFFFF) return String.fromCharCode(code);
    var c = code - 0x10000;
    return String.fromCharCode(0xD800 + Math.floor(c / 1024), 0xDC00 + (c % 1024));
}

function DCN_decode(s) {
    if (!s) return "";
    var out = String(s);
    for (var pass = 0; pass < 2; pass++) {
        out = out.replace(/&#x([0-9a-fA-F]+);?/g, function (a, h) { return DCN_char(parseInt(h, 16)); });
        out = out.replace(/&#(\d+);?/g, function (a, d) { return DCN_char(parseInt(d, 10)); });
        out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, function (a, n) {
            return DCN_ENTITIES.hasOwnProperty(n) ? DCN_ENTITIES[n] : a;
        });
    }
    return out;
}

function DCN_text(html) {
    var s = String(html == null ? "" : html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    s = DCN_decode(s);
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/[ \t\r\f\v]+/g, " ");
    s = s.replace(/ *\n */g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    return DCN_trim(s);
}

function DCN_abs(u) {
    u = DCN_trim(u);
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return DCN_HOST + u;
    return DCN_HOST + "/" + u;
}

function DCN_attr(tag, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
    var m = re.exec(String(tag == null ? "" : tag));
    if (!m) return "";
    return DCN_decode(m[2] != null ? m[2] : m[3]);
}

function DCN_img(chunk) {
    var m = /<img\b[^>]*>/i.exec(String(chunk == null ? "" : chunk));
    if (!m) return "";
    var u = DCN_attr(m[0], "data-src") || DCN_attr(m[0], "src");
    if (!u || u.indexOf("data:image") === 0) return "";
    return DCN_abs(u);
}

/* Số chương từ segment cuối URL ("chapter-12" → 12; không có → 0). */
function DCN_segNo(seg) {
    var m = /(\d+)(?!.*\d)/.exec(String(seg == null ? "" : seg));
    return m ? parseInt(m[1], 10) : 0;
}

/* ================================================================== */
/* Hợp đồng nguồn                                                     */
/* ================================================================== */

function getComicSource() {
    return JSON.stringify({
        id: "damconuong",
        name: "Dâm Cô Nương",
        faviconUrl: "https://www.google.com/s2/favicons?domain=damconuong.win&sz=64",
        baseUrl: DCN_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 2) return DCN_HOST + "/danh-sach";
    return DCN_HOST + "/danh-sach?page=" + p;
}

function getComicSearchRequest(query, page) {
    var url = DCN_HOST + "/tim-kiem?filter[name]=" + encodeURIComponent(String(query == null ? "" : query));
    var p = parseInt(page, 10);
    if (!isNaN(p) && p > 1) url += "&page=" + p;
    return JSON.stringify({
        url: url,
        method: "GET",
        body: "",
        headers: {
            "User-Agent": DCN_UA,
            "Referer": DCN_HOST + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"
        }
    });
}

/* ---------- Danh sách ---------- */

/* Mọi trang danh sách (danh-sach / the-loai / tim-kiem) dùng chung thẻ
 * div...manga-vertical: bìa + h3 > a (tên) + h4 > a (chương mới). */
function DCN_parseCards(s) {
    var out = [];
    var seen = {};
    var parts = String(s).split(/<div\b[^>]*class="[^"]*\bmanga-vertical\b[^"]*"[^>]*>/i);
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i];
        var cut = chunk.indexOf("manga-vertical");
        if (cut > 0 && cut < 4000) chunk = chunk.substring(0, cut); /* thẻ lồng hiếm, cắt cho chắc */

        /* Tên: thẻ <a> đầu tiên có chữ bên trong nằm trong h3 */
        var title = "", link = "";
        var h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
        if (h3) {
            var a = /<a\b[^>]*href="([^"]*\/truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(h3[1]);
            if (a) { link = DCN_abs(a[1]); title = DCN_text(a[2]); }
        }
        if (!link) {
            var a2 = /<a\b[^>]*href="([^"]*\/truyen\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
            if (a2) {
                link = DCN_abs(a2[1]);
                var at = DCN_attr(a2[0], "title");
                title = DCN_text(a2[2]) || DCN_decode(at);
            }
        }
        if (!link || !title || seen[link]) continue;
        seen[link] = 1;

        var cover = "";
        var cf = chunk.indexOf("cover-frame");
        if (cf >= 0) cover = DCN_img(chunk.substring(cf, cf + 1200));

        var latest = "";
        var h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(chunk);
        if (h4) latest = DCN_text(h4[1]);

        out.push({ title: title, link: link, coverUrl: cover || null, author: null, latestChapter: latest || null });
    }
    return out;
}

function parseComicList(html, url) {
    return JSON.stringify(DCN_parseCards(String(html == null ? "" : html)));
}

function getComicNextPageUrl(currentUrl, page, html) {
    var s = String(html == null ? "" : html);
    var cur = String(currentUrl == null ? "" : currentUrl);
    var p = parseInt(page, 10);
    if (isNaN(p) || p < 1) p = 1;

    /* Ưu tiên link phân trang có sẵn trong HTML (page nhỏ nhất > p). */
    var best = "", bestNum = 9999999;
    var re = /<a\b[^>]*href="([^"]*[?&]page=(\d+)[^"]*)"[^>]*>/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var num = parseInt(m[2], 10);
        if (!isNaN(num) && num > p && num < bestNum) { bestNum = num; best = DCN_abs(m[1]); }
    }
    if (best) return best;

    /* Không có link: trang đủ thẻ → tự ghép trang kế. Trang cuối sẽ < thẻ → dừng. */
    var cards = (s.match(/class="[^"]*\bmanga-vertical\b/g) || []).length;
    if (cards >= DCN_PAGE_MIN && /\/(danh-sach|tim-kiem)\b|\/the-loai\//.test(cur)) {
        if (/([?&])page=\d+/.test(cur)) return cur.replace(/([?&])page=\d+/, "$1page=" + (p + 1));
        return cur + (cur.indexOf("?") >= 0 ? "&" : "?") + "page=" + (p + 1);
    }
    return "";
}

/* ---------- Chi tiết ---------- */

function DCN_slugFromUrl(u) {
    var m = /\/truyen\/([^/?#]+)/.exec(String(u == null ? "" : u));
    return m ? m[1] : "";
}

function parseComicDetail(html, url) {
    var s = String(html == null ? "" : html);
    var slug = DCN_slugFromUrl(url);

    var title = "";
    var h1 = /<h1\b[^>]*class="[^"]*\bmd-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (!h1) h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(s);
    if (h1) title = DCN_text(h1[1]);

    var cover = "";
    var og = /<meta\b[^>]*property="og:image"[^>]*content="([^"]*)"/i.exec(s);
    if (!og) og = /<meta\b[^>]*content="([^"]*)"[^>]*property="og:image"/i.exec(s);
    if (og) cover = DCN_abs(DCN_decode(og[1]));

    var author = "";
    var au = /<a\b[^>]*href="[^"]*\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (au) author = DCN_text(au[1]);

    var status = "";
    var st = /class="md-badge[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(s);
    if (st) status = DCN_text(st[1]);

    var genres = [];
    var gseen = {};
    var gi = s.indexOf("Th\u1ec3 lo\u1ea1i</p>");
    if (gi >= 0) {
        var gblock = s.substring(gi, gi + 4000);
        var gre = /<a\b[^>]*href="[^"]*\/the-loai\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var gm;
        while ((gm = gre.exec(gblock)) !== null) {
            var g = DCN_text(gm[1]);
            if (g && !gseen[g]) { gseen[g] = 1; genres.push(g); }
        }
    }

    var description = "";
    var db = /<div\b[^>]*class="[^"]*\bmd-synopsis\b[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(s);
    if (db) description = DCN_text(db[1]);

    /* Mục lục: a.md-ch (mới nhất trước) → sort tăng dần, link trỏ API /_c. */
    var chapters = [];
    var idx = 0;
    var cre = /<a\b[^>]*href="([^"]*\/truyen\/[^"]+\/[^"]+)"[^>]*class="md-ch"[^>]*>([\s\S]*?)<\/a>/gi;
    var cm;
    while ((cm = cre.exec(s)) !== null) {
        var href = DCN_abs(cm[1]);
        var seg = href.substring(href.lastIndexOf("/") + 1);
        if (!slug || href.indexOf("/truyen/" + slug + "/") < 0) continue;
        var t = "";
        var tm = /<span\b[^>]*class="[^"]*\bmd-ch-title\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(cm[2]);
        if (tm) t = DCN_text(tm[1]);
        if (!t) t = seg;
        var date = "";
        var dm = /class="md-ch-meta"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(cm[2]);
        if (dm) date = DCN_text(dm[1]);
        var cipherPath = slug + "/" + seg;
        chapters.push({ title: t, link: DCN_apiUrl(cipherPath), date: date, _no: DCN_segNo(seg), _ord: idx++ });
    }

    chapters.sort(function (a, b) {
        var na = a._no || 900000 + a._ord;
        var nb = b._no || 900000 + b._ord;
        if (na !== nb) return na - nb;
        return a._ord - b._ord;
    });
    var isLast = false;
    for (var i = 0; i < chapters.length; i++) {
        delete chapters[i]._no;
        delete chapters[i]._ord;
        if (i === chapters.length - 1) chapters[i].link += "#last";
        if (!isLast && i === chapters.length - 1) isLast = true;
    }

    return JSON.stringify({
        title: title,
        coverUrl: cover || null,
        author: author || null,
        description: description || null,
        status: status || null,
        genres: genres.length ? genres.join(", ") : null,
        chapters: chapters
    });
}

/* ---------- Chương ---------- */

function parseComicChapter(html, url) {
    var u = String(url == null ? "" : url);
    var isLast = u.indexOf("#last") >= 0;
    var cleanUrl = u.replace(/#.*$/, "");

    /* URL: /_c/mangas/<slug>/chapters/<segment>/pages — cipherPath = "<slug>/<segment>" */
    var cipherPath = "";
    var m = /\/_c\/mangas\/([^/]+)\/chapters\/([^/?#]+)\/pages/.exec(cleanUrl);
    if (m) cipherPath = m[1] + "/" + m[2];

    var token = "";
    var tm = /[?&]_=([^&#]+)/.exec(cleanUrl);
    if (tm) token = tm[1];

    var imageUrls = [];
    if (cipherPath && token) {
        var pages = DCN_decryptPages(html, cipherPath, token);
        if (pages) imageUrls = pages;
    }

    /* prev/next: thay số trong segment cuối; segment không có số → "". */
    var seg = cipherPath.substring(cipherPath.indexOf("/") + 1);
    var no = DCN_segNo(seg);
    var prevLink = "", nextLink = "";
    if (no > 1) {
        var pseg = seg.replace(/(\d+)(?!.*\d)/, String(no - 1));
        prevLink = DCN_apiUrl(cipherPath.substring(0, cipherPath.indexOf("/")) + "/" + pseg);
    }
    if (!isLast && no > 0) {
        var nseg = seg.replace(/(\d+)(?!.*\d)/, String(no + 1));
        nextLink = DCN_apiUrl(cipherPath.substring(0, cipherPath.indexOf("/")) + "/" + nseg);
    }

    var title = seg ? seg.replace(/-/g, " ") : "";

    return JSON.stringify({
        title: title,
        imageUrls: imageUrls,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getComicHeaders(url) {
    /* X-Requested-With bắt buộc cho endpoint /_c; Referer cho CDN ảnh.
     * Sec-Fetch-Site BẮT BUỘC = same-origin: server /_c trả 403 {"code":"forbidden"}
     * với mọi giá trị khác (app mặc định gửi Sec-Fetch-Site: none + Referer → bị chặn).
     * Sec-Fetch-Dest/Mode đặt kiểu XHR cho khớp. */
    return JSON.stringify({
        "User-Agent": DCN_UA,
        "Referer": DCN_HOST + "/",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty"
    });
}

/* Danh mục chọn lọc từ ~201 thể loại của site (footer). */
function getComicCategories() {
    var base = DCN_HOST + "/the-loai/";
    var list = [
        ["3D Hentai", "3d-hentai"], ["Manhwa", "manhwa"], ["Manhua", "manhua"], ["Manga", "manga"],
        ["Không che", "khong-che"], ["Có che", "co-che"], ["Full Color", "full-color"],
        ["Truyện Màu", "truyen-mau"], ["Webtoon", "webtoon"], ["Doujinshi", "doujinshi"],
        ["One shot", "one-shot"], ["Oneshot", "oneshot"], ["Series", "series"],
        ["Truyện Việt", "truyen-viet"], ["Truyện chữ", "truyen-chu"], ["Hentai", "hentai"],
        ["HentaiVN", "hentaivn"], ["Adult", "adult"], ["Ecchi", "ecchi"], ["Smut", "smut"],
        ["Mature", "mature"], ["Milf", "milf"], ["NTR", "ntr"], ["không NTR", "khong-ntr"],
        ["Ngôn Tình", "ngon-tinh"], ["Tình Cảm", "tinh-cam"], ["Lãng Mạn", "lang-man"],
        ["Romance", "romance"], ["Hài hước", "hai-huoc"], ["Hiện đại", "hien-dai"],
        ["Isekai", "isekai"], ["Fantasy", "fantasy"], ["Historical", "historical"],
        ["Horror", "horror"], ["Supernatural", "supernatural"], ["Action", "action"],
        ["Adventure", "adventure"], ["Comedy", "comedy"], ["Drama", "drama"], ["Harem", "harem"],
        ["Incest", "incest"], ["Mind Break", "mind-break"], ["Mind Control", "mind-control"],
        ["Netori", "netori"], ["Vanilla", "vanilla"], ["Yuri", "yuri"], ["Yaoi", "yaoi"],
        ["Full", "\u0111a-full"], ["Short Hentai", "short-hentai"]
    ];
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ title: list[i][0], url: base + list[i][1] });
    return JSON.stringify(out);
}
