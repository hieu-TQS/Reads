/**
 * VnEconomy (vneconomy.vn) — nguồn báo dạng JS.
 *
 * Trang danh sách: mỗi tin là một <article> (new-item_vertical / new-item_horizontal /
 * featured-row_item / general-wapper_item / ai-news_item), tiêu đề nằm trong <h3><a>.
 * Phân trang server-side bằng "?page=N" (khối div.pagination, trang cuối không có mũi tên
 * "Trang sau"); trang chủ không phân trang.
 * Bài viết: h1.article-header__title + <main id="article-editor"> (sapo h4.article-content__lead,
 * figure + figcaption, p.text-justify). Tin liên quan: div.block-readmore-news.
 */
var VE_HOST = "https://vneconomy.vn";
var VE_SOURCE_NAME = "VnEconomy";
var VE_MAX_PAGE = 30;
var VE_MOBILE_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var VE_CATEGORIES = [
    { name: "Trang chủ", pageUrl: VE_HOST + "/" },
    { name: "Tiêu điểm", pageUrl: VE_HOST + "/tieu-diem.htm" },
    { name: "Chứng khoán", pageUrl: VE_HOST + "/chung-khoan.htm" },
    { name: "Đầu tư", pageUrl: VE_HOST + "/dau-tu.htm" },
    { name: "Tài chính", pageUrl: VE_HOST + "/tai-chinh.htm" },
    { name: "Kinh tế số", pageUrl: VE_HOST + "/kinh-te-so.htm" },
    { name: "Kinh tế xanh", pageUrl: VE_HOST + "/kinh-te-xanh.htm" },
    { name: "Thị trường", pageUrl: VE_HOST + "/thi-truong.htm" },
    { name: "Nhịp cầu doanh nghiệp", pageUrl: VE_HOST + "/nhip-cau-doanh-nghiep.htm" },
    { name: "Địa ốc", pageUrl: VE_HOST + "/dia-oc.htm" },
    { name: "Kinh tế thế giới", pageUrl: VE_HOST + "/kinh-te-the-gioi.htm" },
    { name: "Dân sinh", pageUrl: VE_HOST + "/dan-sinh.htm" },
    { name: "Tiêu dùng", pageUrl: VE_HOST + "/tieu-dung.htm" }
];

/** Đường dẫn chuyên mục (không phải bài viết) — dùng để lọc link trong danh sách. */
var VE_NON_ARTICLE = {
    "chung-khoan.htm": 1, "tieu-diem.htm": 1, "dau-tu.htm": 1, "tai-chinh.htm": 1,
    "kinh-te-so.htm": 1, "kinh-te-xanh.htm": 1, "thi-truong.htm": 1,
    "nhip-cau-doanh-nghiep.htm": 1, "dia-oc.htm": 1, "kinh-te-the-gioi.htm": 1,
    "dan-sinh.htm": 1, "tieu-dung.htm": 1, "video.htm": 1, "emagazine.htm": 1,
    "podcast.htm": 1, "tim-kiem.html": 1, "tim-kiem.htm": 1, "tag.htm": 1
};

function getNewsSource() {
    return JSON.stringify({
        id: "vneconomy",
        name: VE_SOURCE_NAME,
        faviconUrl: "https://www.google.com/s2/favicons?domain=vneconomy.vn&sz=64",
        categories: VE_CATEGORIES,
        searchable: true
    });
}

function matchesNewsSource(link) {
    return !!link && String(link).toLowerCase().indexOf("vneconomy.vn") !== -1;
}

function getNewsHeaders(url) {
    return JSON.stringify({ "User-Agent": VE_MOBILE_UA, "Referer": VE_HOST + "/" });
}

function veStripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function veDecode(s) {
    if (s == null) return "";
    var out = String(s);
    var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    out = out.replace(/&([a-zA-Z]+);/g, function (m, n) {
        if (named[n.toLowerCase()]) return named[n.toLowerCase()];
        return m;
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
    out = out.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
    return out;
}

/** Link tuyệt đối hoá theo host (dùng cho danh sách: link có thể thiếu dấu "/"). */
function veAbs(u) {
    if (!u) return null;
    u = String(u).trim().replace(/&amp;/g, "&");
    if (!u) return null;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return VE_HOST + u;
    return VE_HOST + "/" + u;
}

/** Link tuyệt đối hoá theo URL hiện tại (dùng cho phân trang: href có thể là "?page=6"). */
function veResolve(base, href) {
    href = String(href || "").trim().replace(/&amp;/g, "&");
    if (!href) return null;
    if (href.indexOf("http") === 0) return href;
    if (href.indexOf("//") === 0) return "https:" + href;
    if (href.charAt(0) === "/") return VE_HOST + href;
    var b = String(base || VE_HOST + "/").split("#")[0];
    var q = b.indexOf("?");
    if (q >= 0) b = b.substring(0, q);
    if (href.charAt(0) === "?") return b + href;
    var slash = b.lastIndexOf("/");
    if (slash > 8) b = b.substring(0, slash + 1);
    return b + href;
}

function veImgSrc(tag) {
    var m = tag.match(/data-original="([^"]+)"/i)
        || tag.match(/data-src="([^"]+)"/i)
        || tag.match(/data-srcset="([^"]+)"/i)
        || tag.match(/srcset="([^"]+)"/i);
    if (m) return m[1].split(",")[0].trim().split(" ")[0];
    m = tag.match(/src="([^"]+)"/i);
    if (m && m[1].indexOf("data:image") !== 0) return m[1];
    return null;
}

/** Ảnh đầu tiên trong một khối HTML (ảnh thật, bỏ placeholder data:image). */
function veFirstImage(html) {
    var im = /<img\b[^>]*>/i.exec(html);
    if (im) {
        var s = veImgSrc(im[0]);
        if (s) return s;
    }
    var sm = /<(?:source|img)\b[^>]*(?:data-srcset|srcset|data-src|data-original)="([^"]+)"/i.exec(html);
    if (sm) return sm[1].split(",")[0].trim().split(" ")[0];
    return null;
}

/** Chỉ nhận link bài viết: "/<slug>.htm", bỏ chuyên mục, trang sự kiện "-e123.htm", bản tiếng Anh. */
function veIsArticle(link) {
    if (!link) return false;
    var low = String(link).toLowerCase();
    if (low.indexOf(VE_HOST + "/") !== 0) return false;
    var path = low.substring(VE_HOST.length);
    if (path.indexOf("?") >= 0) return false;
    if (!/^\/[a-z0-9][a-z0-9-]*\.htm$/.test(path)) return false;
    if (VE_NON_ARTICLE[path.substring(1)]) return false;
    // "-e123.htm": trang sự kiện; "-s123.htm": trang "Điểm tin"/podcast (không có bài để đọc)
    if (/-e\d+\.htm$/.test(path)) return false;
    if (/-s\d+\.htm$/.test(path)) return false;
    return true;
}

function parseNewsList(html, url) {
    if (!html) return "[]";
    var source = String(html);

    // Trang 2 trở đi: khối "spotlight" ở đầu trang lặp lại y nguyên mọi trang
    // (11 tin) → chỉ đọc danh sách chính div.layout-article-feed để không lặp tin.
    var activeM = /class="[^"]*pagination__item is-active[^"]*"[^>]*>\s*(\d+)\s*</i.exec(source);
    var activePage = activeM ? parseInt(activeM[1], 10) : 1;
    if (activePage > 1) {
        var feedM = /<div class="layout-article-feed">([\s\S]*?)<div class="pagination">/i.exec(source);
        if (feedM) source = feedM[1];
    }

    var items = [];
    var seen = {};
    var re = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
    var m;
    while ((m = re.exec(source)) !== null) {
        var attrs = m[1] || "";
        var body = m[2] || "";
        var cls = (attrs.match(/class="([^"]*)"/i) || [])[1] || "";
        if (/order-now_item|story--event/i.test(cls)) continue;

        var hm = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(body);
        if (!hm) continue;
        var am = /<a\b[^>]*href="([^"]+)"/i.exec(hm[1]);
        if (!am) continue;

        var link = veAbs(am[1]);
        if (!link || seen[link] || !veIsArticle(link)) continue;
        var title = veStripTags(veDecode(hm[1]));
        if (title.length < 5) continue;
        seen[link] = true;

        var imgSrc = veFirstImage(body);
        var imageUrl = imgSrc ? veAbs(imgSrc) : null;
        if (imageUrl && imageUrl.indexOf("data:image") === 0) imageUrl = null;

        var excerpt = null;
        var em = /<p[^>]*class="[^"]*(?:text-description|sapo)[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(body)
            || /<div[^>]*class="[^"]*(?:text-description|new-item__sapo)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(body);
        if (em) {
            var txt = veStripTags(veDecode(em[1]));
            if (txt.length >= 10) excerpt = txt;
        }

        items.push({
            title: title,
            link: link,
            excerpt: excerpt,
            imageUrl: imageUrl,
            pubDate: null,
            pubDateMs: 0,
            sourceName: VE_SOURCE_NAME
        });
    }
    return JSON.stringify(items);
}

function getNewsNextPageUrl(currentUrl, page, html) {
    if (!page || page < 1) page = 1;
    if (page >= VE_MAX_PAGE) return null;
    var source = String(html || "");
    var pagerM = /<div class="pagination">([\s\S]*?)<\/div>/i.exec(source);
    if (!pagerM) return null; // trang chủ: không phân trang

    var cur = page;
    var cm = /[?&]page=(\d+)/i.exec(String(currentUrl || ""));
    if (cm) cur = parseInt(cm[1], 10);
    var activeM = /class="[^"]*is-active[^"]*"[^>]*>\s*(\d+)\s*</i.exec(pagerM[1]);
    if (activeM) cur = parseInt(activeM[1], 10);

    var bestHref = null;
    var bestNum = 0;
    var re = /<a\b[^>]*href="([^"]+)"[^>]*>/gi;
    var m;
    while ((m = re.exec(pagerM[1])) !== null) {
        var href = m[1].replace(/&amp;/g, "&");
        var nm = /[?&]page=(\d+)/i.exec(href);
        if (!nm) continue;
        var n = parseInt(nm[1], 10);
        if (n > cur && (bestHref === null || n < bestNum)) {
            bestHref = href;
            bestNum = n;
        }
    }
    if (!bestHref) return null; // trang cuối
    return veResolve(currentUrl, bestHref);
}

function getNewsSearchUrl(query, page) {
    var q = encodeURIComponent(String(query || "").trim());
    if (!q) return null;
    var p = page || 1;
    var u = VE_HOST + "/tim-kiem.html?Text=" + q + "&SortBy=newest";
    if (p > 1) u += "&page=" + p;
    return u;
}

function veScanBlocks(html) {
    var blocks = [];
    var re = /<(figure|p|h2|h3|h4|blockquote|ul|ol|table|video|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
    var mm;
    while ((mm = re.exec(html)) !== null) {
        var tag = mm[0];
        var lower = tag.toLowerCase();

        if (lower.indexOf("<figure") === 0) {
            var imgTag = /<img\b[^>]*>/i.exec(tag);
            var src = imgTag ? veImgSrc(imgTag[0]) : null;
            var capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(tag);
            var caption = capM ? veStripTags(veDecode(capM[1])) : null;
            if (src) {
                blocks.push({ isImage: true, text: caption, imageUrl: veAbs(src), isVideo: false, videoUrl: null });
            } else {
                var vidM = /<(?:video|iframe)\b[^>]*src="([^"]+)"/i.exec(tag);
                if (vidM) {
                    blocks.push({ isImage: false, text: caption, imageUrl: null, isVideo: true, videoUrl: veAbs(vidM[1]) });
                }
            }
            continue;
        }

        if (lower.indexOf("<video") === 0 || lower.indexOf("<iframe") === 0) {
            var vM = /src="([^"]+)"/i.exec(tag);
            if (vM && vM[1].indexOf("about:blank") < 0) {
                blocks.push({ isImage: false, text: null, imageUrl: null, isVideo: true, videoUrl: veAbs(vM[1]) });
            }
            continue;
        }

        if (lower.indexOf("<table") === 0) {
            var rows = tag.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
            var lines = [];
            for (var r = 0; r < rows.length; r++) {
                var cells = rows[r].match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
                var parts = [];
                for (var c = 0; c < cells.length; c++) parts.push(veStripTags(veDecode(cells[c])));
                var line = parts.join(" | ").replace(/\s+/g, " ").trim();
                if (line) lines.push(line);
            }
            var tableText = lines.join("\n");
            if (tableText.length >= 20) {
                blocks.push({ isImage: false, text: tableText, imageUrl: null, isVideo: false, videoUrl: null });
            }
            continue;
        }

        var inner = tag.substring(tag.indexOf(">") + 1, tag.lastIndexOf("<"));
        var text = veStripTags(veDecode(inner)).replace(/\s+/g, " ").trim();
        if (text.length >= 20) {
            blocks.push({ isImage: false, text: text, imageUrl: null, isVideo: false, videoUrl: null });
        }
    }
    return blocks;
}

function parseNewsArticle(html, url) {
    if (!html) return null;
    var source = String(html);

    var title = "";
    var tM = /<h1[^>]*class="[^"]*article-header__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(source)
        || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source);
    if (tM) title = veStripTags(veDecode(tM[1])).trim();

    var blocks = [];
    var bodyM = /<main[^>]*id="article-editor"[^>]*>([\s\S]*?)<\/main>/i.exec(source);
    if (bodyM) {
        var scanned = veScanBlocks(bodyM[1]);
        for (var i = 0; i < scanned.length; i++) blocks.push(scanned[i]);
    }
    if (blocks.length === 0) return null;

    var related = [];
    var rIdx = source.indexOf('class="block-readmore-news"');
    if (rIdx >= 0) {
        var tail = source.substring(rIdx);
        var endM = /<\/main>/i.exec(tail);
        var relHtml = endM ? tail.substring(0, endM.index) : tail.substring(0, 60000);
        try {
            related = JSON.parse(parseNewsList(relHtml, ""));
        } catch (e) {
            related = [];
        }
        if (related.length > 12) related = related.slice(0, 12);
    }

    return JSON.stringify({ title: title, blocks: blocks, related: related });
}
