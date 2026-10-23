/**
 * Tuổi Trẻ (tuoitre.vn) — nguồn báo dạng JS.
 *
 * Đặc điểm site (kiểm tra 10/2026):
 *  - Trang chuyên mục chỉ in ~9 tin trong HTML, phần còn lại do JS tải qua API
 *    (nút "Xem thêm" gọi loadNewsByCate → s5.tuoitre.vn) nên app (chỉ GET) không lấy được.
 *    Vì vậy danh sách dùng RSS của chính báo: https://tuoitre.vn/rss/<slug>.rss
 *    → 50 tin/nguồn, có sẵn tiêu đề, link, mô tả, ảnh (enclosure), giờ đăng.
 *  - Không có phân trang server-side cho danh mục (?page=N trả lại trang 1;
 *    /thoi-su/trang-2.htm bị 301 về trang chủ) → nextPageUrl = null.
 *  - Không có trang tìm kiếm server-side: /tim-kiem.htm chỉ là khung JS, mọi biến thể
 *    ?q= / ?keyword= đều không trả kết quả, /tim-kiem/<q>.htm bị đá về trang chủ
 *    → searchable: false.
 *  - Bài viết: <h1 class="detail-title"> + sapo <p data-role="sapo">, thân bài trong
 *    <div data-role="content" ...> … kết thúc ở <div data-check-position="body_end">.
 *    Ảnh là <figure class="VCSortableInPreviewMode" type="Photo"> (ảnh thật ở
 *    data-original, chú thích ở figcaption.PhotoCMS_Caption).
 *  - Bài video (/video/...-203xxx.htm): thân bài rỗng, mp4 nằm trong JSON-LD
 *    VideoObject "contentUrl"; tiêu đề dùng class "detail-title titlelive".
 */
var TT_HOST = "https://tuoitre.vn";
var TT_SOURCE_NAME = "Tuổi Trẻ";
var TT_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var TT_CATEGORIES = [
    { name: "Trang chủ", pageUrl: TT_HOST + "/rss/home.rss" },
    { name: "Mới nhất", pageUrl: TT_HOST + "/rss/tin-moi-nhat.rss" },
    { name: "Thời sự", pageUrl: TT_HOST + "/rss/thoi-su.rss" },
    { name: "Thế giới", pageUrl: TT_HOST + "/rss/the-gioi.rss" },
    { name: "Pháp luật", pageUrl: TT_HOST + "/rss/phap-luat.rss" },
    { name: "Kinh doanh", pageUrl: TT_HOST + "/rss/kinh-doanh.rss" },
    { name: "Công nghệ", pageUrl: TT_HOST + "/rss/cong-nghe.rss" },
    { name: "Xe", pageUrl: TT_HOST + "/rss/xe.rss" },
    { name: "Du lịch", pageUrl: TT_HOST + "/rss/du-lich.rss" },
    { name: "Văn hóa", pageUrl: TT_HOST + "/rss/van-hoa.rss" },
    { name: "Giải trí", pageUrl: TT_HOST + "/rss/giai-tri.rss" },
    { name: "Thể thao", pageUrl: TT_HOST + "/rss/the-thao.rss" },
    { name: "Giáo dục", pageUrl: TT_HOST + "/rss/giao-duc.rss" },
    { name: "Nhà đất", pageUrl: TT_HOST + "/rss/nha-dat.rss" },
    { name: "Sức khỏe", pageUrl: TT_HOST + "/rss/suc-khoe.rss" },
    { name: "Nhịp sống trẻ", pageUrl: TT_HOST + "/rss/nhip-song-tre.rss" },
    { name: "Khoa học", pageUrl: TT_HOST + "/rss/khoa-hoc.rss" },
    { name: "Bạn đọc", pageUrl: TT_HOST + "/rss/ban-doc.rss" },
    { name: "Video", pageUrl: TT_HOST + "/rss/video.rss" }
];

/* ------------------------------------------------------------------ */
/* Tiện ích chuỗi                                                      */
/* ------------------------------------------------------------------ */

function ttAttr(tag, name) {
    if (!tag) return "";
    var re = new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
    var m = re.exec(tag);
    if (!m) return "";
    if (m[2] !== undefined) return m[2];
    if (m[3] !== undefined) return m[3];
    return m[4] || "";
}

function ttDecode(s) {
    if (!s) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "...", ndash: "-", mdash: "-", laquo: "\"", raquo: "\"", ldquo: "\"", rdquo: "\"" };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) {
        var v = named[n.toLowerCase()];
        return v === undefined ? m : v;
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 16));
    });
    out = out.replace(/&#(\d+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 10));
    });
    return out;
}

function ttStripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, " ");
}

function ttText(s) {
    return ttDecode(ttDecode(ttStripTags(s))).replace(/\s+/g, " ").trim();
}

function ttAbs(u) {
    if (!u) return "";
    var s = String(u).replace(/&amp;/g, "&").trim();
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.charAt(0) === "/") return TT_HOST + s;
    return TT_HOST + "/" + s;
}

function ttClean(html) {
    return String(html || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

function ttCdata(s) {
    var v = String(s || "").replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    return v.trim();
}

function ttTag(xml, name) {
    var re = new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i");
    var m = re.exec(xml);
    return m ? m[1] : "";
}

/** URL bài viết: /<slug>-<id>.htm (bỏ trang tác giả /tac-gia/, trang chuyên mục). */
function ttIsArticleUrl(u) {
    if (!u) return false;
    var s = String(u);
    if (!/^https?:\/\/(?:[a-z0-9-]+\.)*tuoitre\.vn\//i.test(s)) return false;
    if (s.indexOf("/tac-gia/") >= 0) return false;
    if (/\.(rss|jpg|png|webp|gif|svg)(\?|$)/i.test(s)) return false;
    return /-\d{5,}\.html?(\?|$)/i.test(s);
}

function ttImgSrc(tag) {
    if (!tag) return "";
    var keys = ["data-original", "data-src", "src"];
    for (var i = 0; i < keys.length; i++) {
        var v = ttAttr(tag, keys[i]).trim();
        if (v && v.indexOf("data:") !== 0) return v;
    }
    var ss = ttAttr(tag, "srcset");
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
        id: "tuoitre",
        name: TT_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=tuoitre.vn&sz=64",
        categories: TT_CATEGORIES,
        searchable: false
    });
}

function matchesNewsSource(link) {
    if (!link) return false;
    return /^https?:\/\/(?:[a-z0-9-]+\.)*tuoitre\.vn(\/|$)/i.test(String(link));
}

function getNewsHeaders(url) {
    return JSON.stringify({
        "User-Agent": TT_MOBILE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.6",
        "Referer": TT_HOST + "/"
    });
}

/* ------------------------------------------------------------------ */
/* Danh sách tin                                                       */
/* ------------------------------------------------------------------ */

/** RSS (nguồn chính): 50 tin/nguồn, đủ tiêu đề – link – mô tả – ảnh – giờ đăng. */
function ttParseRss(xml) {
    var out = [];
    var seen = {};
    var re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    var m;
    while ((m = re.exec(xml)) !== null) {
        var it = m[1];
        var title = ttText(ttCdata(ttTag(it, "title")));
        var link = ttCdata(ttTag(it, "link"));
        if (!link || !/^https?:\/\//i.test(link)) continue;
        if (seen[link]) continue;
        if (!ttIsArticleUrl(link)) continue;
        seen[link] = 1;

        var desc = ttText(ttCdata(ttTag(it, "description")));
        var img = "";
        var en = /<enclosure\b[^>]*url\s*=\s*["']([^"']+)["']/i.exec(it);
        if (en) img = ttAbs(ttDecode(en[1]));
        if (!img) {
            var media = /<media:content\b[^>]*url\s*=\s*["']([^"']+)["']/i.exec(it);
            if (media) img = ttAbs(ttDecode(media[1]));
        }

        var dateMs = 0;
        var pd = ttCdata(ttTag(it, "pubDate"));
        if (!pd) pd = ttCdata(ttTag(it, "dc:date"));
        if (pd) {
            var t = Date.parse(pd);
            if (!isNaN(t) && t > 0) dateMs = t;
        }

        out.push({
            title: title,
            link: link,
            excerpt: desc ? desc : null,
            imageUrl: img ? img : null,
            pubDateMs: dateMs
        });
        if (out.length >= 60) break;
    }
    return out;
}

/** HTML (dự phòng): gom anchor bài viết theo URL, tiêu đề lấy từ text hoặc alt ảnh. */
function ttParseCards(html) {
    var src = ttClean(html);
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var order = [];
    var map = {};
    var m;
    while ((m = re.exec(src)) !== null) {
        var attrs = m[1] || "";
        var href = ttAttr(attrs, "href");
        if (!href || href.indexOf("javascript:") === 0) continue;
        var link = ttAbs(ttDecode(href));
        if (!ttIsArticleUrl(link)) continue;

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
                var u = ttImgSrc(im[0]);
                if (u) item.imageUrl = ttAbs(ttDecode(u));
            }
        }
        var t = ttText(inner);
        if (t.length >= 8 && t.length > item.title.length) item.title = t;
        if (item.title.length < 8) {
            var alt = ttAttr(attrs, "title");
            if (!alt) {
                var im2 = /<img\b[^>]*>/i.exec(inner);
                if (im2) alt = ttAttr(im2[0], "alt");
            }
            alt = ttText(alt);
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
        if (out.length >= 60) break;
    }
    return out;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var src = String(html);
    var list;
    if (/<rss\b|<feed\b|<item\b/i.test(src)) list = ttParseRss(src);
    else list = ttParseCards(src);
    return JSON.stringify(list);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    // Danh mục tuoitre.vn không phân trang server-side (?page=N trả lại trang 1,
    // "Xem thêm" là AJAX sang s5.tuoitre.vn) và RSS chỉ có 1 trang 50 tin.
    return null;
}

function getNewsSearchUrl(query, page) {
    // Site không có trang tìm kiếm server-side (chỉ là khung JS).
    return null;
}

/* ------------------------------------------------------------------ */
/* Đọc bài                                                             */
/* ------------------------------------------------------------------ */

/** Ảnh rác: icon, logo, avatar tác giả, ảnh placeholder. */
function ttIsContentImage(u) {
    var s = String(u || "").toLowerCase();
    if (!s || s.indexOf("data:") === 0) return false;
    if (s.indexOf("static-tuoitre.tuoitre.vn") >= 0) return false;   // icon/svg tĩnh
    if (s.indexOf("static.mediacdn.vn") >= 0) return false;
    if (s.indexOf("author_default") >= 0) return false;
    if (s.indexOf("/zoom/32_32/") >= 0 || s.indexOf("/zoom/100_100/") >= 0) return false;
    if (s.indexOf("favicon") >= 0 || s.indexOf("logo") >= 0) return false;
    return true;
}

function ttIsJunkText(t) {
    if (!t || t.length < 2) return true;
    if (/^(Đọc tiếp|Xem thêm|Bình luận|Chia sẻ|Lưu|In|Chủ đề:?|Tin liên quan|Quảng cáo)$/i.test(t)) return true;
    if (t.indexOf("Nguồn ưu tiên trên Google") >= 0) return true;
    if (t.indexOf("Ưu tiên Tuổi Trẻ trên Google Search") >= 0) return true;
    if (t.indexOf("Hiện chưa có bình luận") >= 0) return true;
    if (t.indexOf("Được quan tâm nhất") === 0) return true;
    if (t.indexOf("Xem thêm bình luận") >= 0) return true;
    if (t.indexOf("(adsbygoogle") >= 0) return true;
    return false;
}

/** Cắt vùng thân bài: từ data-role="content" tới mốc body_end / khối tin liên quan. */
function ttBodyHtml(clean) {
    var start = clean.indexOf('data-role="content"');
    if (start < 0) start = clean.indexOf('itemprop="articleBody"');
    if (start < 0) return "";
    start = clean.indexOf(">", start) + 1;
    if (start <= 0) return "";

    var rest = clean.slice(start);
    var marks = [
        'data-check-position="body_end"',
        'class="detail-tab"',
        'class="detail__related',
        'class="box-author-detail',
        'class="media__dvb-action',
        'class="box_list_comment',
        'class="detail-cms-relate'
    ];
    var end = -1;
    for (var i = 0; i < marks.length; i++) {
        var p = rest.indexOf(marks[i]);
        if (p > 0 && (end < 0 || p < end)) end = p;
    }
    return end > 0 ? rest.slice(0, end) : rest;
}

/** URL video từ JSON-LD VideoObject (bài video không có thẻ <video> trong HTML). */
function ttLdVideo(html) {
    if (!html) return "";
    var re = /"contentUrl"\s*:\s*"([^"]+)"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var u = m[1].replace(/\\\//g, "/");
        if (/\.(mp4|m3u8|webm)(\?|$)/i.test(u)) return ttAbs(ttDecode(u));
    }
    return "";
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var clean = ttClean(html);

    var title = "";
    var h1 = /<h1\b[^>]*class="[^"]*detail-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(clean);
    if (!h1) h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean);
    if (h1) title = ttText(h1[1]);
    if (!title) {
        var og = /<meta[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(clean);
        if (og) title = ttText(og[1]);
    }
    if (!title) {
        var tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
        if (tm) title = ttText(tm[1]).replace(/\s*-\s*Tu\u1ed5i Tr\u1ebb Online\s*$/i, "");
    }

    // Sapo (đoạn mở đầu) — luôn đứng trước vùng thân bài.
    var sapo = "";
    var sm = /<p\b[^>]*data-role="sapo"[^>]*>([\s\S]*?)<\/p>/i.exec(clean);
    if (!sm) sm = /<p\b[^>]*class="[^"]*detail-sapo[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(clean);
    if (sm) sapo = ttText(sm[1]);

    var body = ttBodyHtml(clean);

    var images = [];
    var videos = [];

    var work = body;

    // Hộp "Tin liên quan" chèn giữa bài → bỏ (nếu không sẽ đọc lẫn tiêu đề tin khác).
    work = work.replace(/<div\b[^>]*type="RelatedNewsBox"[\s\S]*?<\/ul>\s*(?:<\/div>\s*){1,3}/gi, " ");

    // Ảnh → placeholder để giữ đúng thứ tự với đoạn văn.
    work = work.replace(/<img\b[^>]*>/gi, function (tag) {
        var u = ttImgSrc(tag);
        if (!u) return " ";
        u = ttAbs(ttDecode(u));
        if (!ttIsContentImage(u)) return " ";
        images.push(u);
        return "\n\u0001I" + (images.length - 1) + "\u0001\n";
    });

    // Video nhúng trực tiếp.
    if (!/<video\b/i.test(work)) {
        var ld = ttLdVideo(html);
        if (ld) {
            videos.push(ld);
            work = "\n\u0001V0\u0001\n" + work;
        }
    }
    work = work.replace(/<video\b[\s\S]*?<\/video>/gi, function (tag) {
        var s = /<source\b[^>]*src=["']([^"']+)["']/i.exec(tag);
        if (!s) s = /<video\b[^>]*src=["']([^"']+)["']/i.exec(tag);
        if (!s) return " ";
        var u = ttAbs(ttDecode(s[1]));
        if (!u) return " ";
        videos.push(u);
        return "\n\u0001V" + (videos.length - 1) + "\u0001\n";
    });

    // Xuống dòng theo cấu trúc khối rồi bỏ hết tag còn lại.
    work = work
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|section|article|figcaption|tr|td)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/<[a-zA-Z\/][^>]*$/, " ");

    var blocks = [];
    if (sapo && !ttIsJunkText(sapo)) {
        blocks.push({ isImage: false, text: sapo, imageUrl: null, isVideo: false, videoUrl: null });
    }

    var text = ttDecode(work);
    var parts = text.split(/(\u0001[IV]\d+\u0001)/);
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) continue;

        var ip = /^\u0001I(\d+)\u0001$/.exec(part);
        if (ip) {
            blocks.push({ isImage: true, text: null, imageUrl: images[parseInt(ip[1], 10)], isVideo: false, videoUrl: null });
            continue;
        }
        var vp = /^\u0001V(\d+)\u0001$/.exec(part);
        if (vp) {
            blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: videos[parseInt(vp[1], 10)] });
            continue;
        }
        var lines = part.split("\n");
        for (var j = 0; j < lines.length; j++) {
            var line = lines[j].replace(/\s+/g, " ").trim();
            if (ttIsJunkText(line)) continue;
            blocks.push({ isImage: false, text: line, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }

    // Tin liên quan cuối bài (bóc từ chính HTML, không cần request thêm).
    var related = [];
    var ri = clean.indexOf('class="detail__related');
    if (ri < 0) ri = clean.indexOf("Tin liên quan");
    if (ri >= 0) {
        var cands = ttParseCards(clean.slice(ri, ri + 40000));
        var cur = ttAbs(url || "");
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
