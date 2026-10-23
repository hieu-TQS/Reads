/* Sang Chanh Team (sangchanhteam.com) - WordPress theme "init-manga".
   LUU Y: HTML cua site bi minify, thuoc tinh KHONG co ngoac kep
   (href=https://... , src=...) => moi regex phai dung "? truoc gia tri. */
var SCT_HOST = "https://sangchanhteam.com";

function SCT_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return SCT_HOST + u;
    return SCT_HOST + "/" + u;
}

function SCT_clean(s) {
    s = String(s == null ? "" : s);
    s = s.replace(/<[^>]*>/g, " ");
    s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
         .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function SCT_titleFromSlug(link) {
    var s = String(link || "").replace(/\/+$/, "").split("/");
    var slug = s.length ? s[s.length - 1] : "";
    return slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function getComicSource() {
    return JSON.stringify({
        id: "sangchanhteam",
        name: "Sang Chảnh Team",
        faviconUrl: "https://www.google.com/s2/favicons?domain=sangchanhteam.com&sz=64",
        baseUrl: SCT_HOST,
        searchable: true
    });
}

function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    return page > 1 ? SCT_HOST + "/moi-cap-nhat/page/" + page + "/" : SCT_HOST + "/moi-cap-nhat/";
}

function getComicSearchRequest(q, page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    var url = SCT_HOST + (page > 1 ? "/page/" + page + "/" : "/") + "?s=" + encodeURIComponent(q);
    return JSON.stringify({ url: url, method: "GET", body: null, headers: {} });
}

function parseComicList(html, url) {
    var h = String(html || "");

    /* Tên truyện: thẻ <a> có text ngay sau href (tiêu đề card).
       alt của ảnh bìa chỉ là "Ảnh bìa của ..." nên chỉ dùng làm fallback. */
    var names = {};
    var nameRe = /href="?(https:\/\/sangchanhteam\.com\/truyen\/[a-z0-9-]+\/)"?\s*>\s*([^<]{2,160})/g;
    var nm;
    while ((nm = nameRe.exec(h)) !== null) {
        var t = SCT_clean(nm[2]);
        if (t && !names[nm[1]]) names[nm[1]] = t;
    }

    var out = [];
    var seen = {};
    var re = /href="?(https:\/\/sangchanhteam\.com\/truyen\/[a-z0-9-]+\/)(?!chap)/g;
    var m;
    while ((m = re.exec(h)) !== null) {
        var link = m[1];
        if (seen[link]) continue;
        seen[link] = 1;

        var tail = h.substr(re.lastIndex, 1200);
        var title = names[link] || "";
        if (!title) {
            var alt = /alt="([^"]+)"/.exec(tail);
            if (alt) title = SCT_clean(alt[1]).replace(/^Ảnh bìa của\s+/i, "").replace(/^Ảnh minh họa:\s*/i, "");
        }

        var cover = null;
        var img = /<img[^>]*?src="?([^" >]+\.(?:webp|jpg|jpeg|png))/.exec(tail);
        if (img) cover = SCT_abs(img[1]);

        var latest = null;
        var chap = /chap-(\d+)\//.exec(tail);
        if (chap) latest = "Chap " + chap[1];

        out.push({
            title: title || SCT_titleFromSlug(link),
            link: link,
            coverUrl: cover,
            author: null,
            latestChapter: latest
        });
        if (out.length >= 40) break;
    }
    return JSON.stringify(out);
}

function getComicNextPageUrl(currentUrl, page, html) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    /* Trang tìm kiếm (?s=) của site không hỗ trợ phân trang (mọi /page/N/ đều 404). */
    if (String(currentUrl || "").indexOf("?s=") >= 0) return "";
    var h = String(html || "");
    var max = 1;
    var re = /\/page\/(\d+)\//g;
    var m;
    while ((m = re.exec(h)) !== null) {
        var n = parseInt(m[1], 10);
        if (n > max) max = n;
    }
    if (max <= page) return "";
    var base = String(currentUrl || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (base.indexOf("/page/") >= 0) {
        return base.replace(/\/page\/\d+$/, "/page/" + (page + 1));
    }
    return base + "/page/" + (page + 1) + "/";
}

function parseComicDetail(html, url) {
    var h = String(html || "");
    var link = String(url || "").replace(/[?#].*$/, "");

    var title = "";
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
    if (h1) title = SCT_clean(h1[1]);
    if (!title) {
        var t = /<title>([\s\S]*?)<\/title>/i.exec(h);
        if (t) title = SCT_clean(t[1]).replace(/\s*[–-]\s*Sang Chảnh Team\s*$/i, "");
    }

    var cover = null;
    var og = /property="og:image"\s+content="([^"]+)"/.exec(h) || /content="([^"]+)"\s+property="og:image"/.exec(h);
    if (og) cover = SCT_abs(og[1]);

    var desc = null;
    var meta = /name="description"\s+content="([^"]*)"/.exec(h);
    if (meta && SCT_clean(meta[1])) desc = SCT_clean(meta[1]);

    /* Mục lục chỉ hiện 25 chương/trang nhưng URL chương tuần tự 1..N và
       header ghi tổng số chương => sinh đủ danh sách. */
    var chapters = [];
    var seen = {};
    var total = 0;
    var cnt = /(\d+)\s*<span[^>]*>\s*Chương/i.exec(h);
    if (cnt) total = parseInt(cnt[1], 10) || 0;

    var base = link.replace(/\/+$/, "");
    if (total > 0) {
        for (var i = 1; i <= total; i++) {
            chapters.push({ title: "Chương " + i, link: base + "/chap-" + i + "/" });
        }
    } else {
        var re = /href="?(https:\/\/sangchanhteam\.com\/truyen\/[^\s">]+?\/chap-(\d+)\/)/g;
        var m;
        while ((m = re.exec(h)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = 1;
            chapters.push({ title: "Chương " + m[2], link: m[1], _n: parseInt(m[2], 10) });
        }
        chapters.sort(function (a, b) { return a._n - b._n; });
        for (var j = 0; j < chapters.length; j++) delete chapters[j]._n;
    }

    if (chapters.length === 0) chapters = [{ title: "Đọc", link: link }];
    return JSON.stringify({
        title: title || SCT_titleFromSlug(link),
        coverUrl: cover,
        author: null,
        description: desc,
        chapters: chapters
    });
}

function parseComicChapter(html, url) {
    var h = String(html || "");
    var imgs = [];
    var seen = {};

    /* Ảnh 1 nằm ở src=, các ảnh sau ở data-original-src= (lazy load).
       Lọc theo alt "Chapter N - Image M" để bỏ logo/banner/quảng cáo. */
    var imgRe = /<img[^>]*(?:data-original-src|src)="?([^" >]+\.(?:webp|jpg|jpeg|png))[^>]*alt="([^"]*Image \d+)"/gi;
    var m;
    while ((m = imgRe.exec(h)) !== null) {
        var u = SCT_abs(m[1]);
        if (seen[u]) continue;
        seen[u] = 1;
        imgs.push(u);
    }

    var prev = /id=prev-link\s+href="?([^\s">]+)/.exec(h);
    var next = /id=next-link\s+href="?([^\s">]+)/.exec(h);

    var title = "";
    var t = /Chapter\s+(\d+)\s*-\s*Image\s+1/i.exec(h);
    if (t) title = "Chương " + t[1];

    return JSON.stringify({
        title: title,
        imageUrls: imgs,
        prevLink: prev ? SCT_abs(prev[1]) : "",
        nextLink: next ? SCT_abs(next[1]) : ""
    });
}

function getComicHeaders(url) {
    return JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": SCT_HOST + "/"
    });
}

function getComicCategories() {
    var slugs = [
        ["Ngôn tình", "romance"],
        ["Tình cảm", "tinh-cam"],
        ["Drama", "drama"],
        ["Hiện đại", "hien-dai"],
        ["Cổ đại", "au-co"],
        ["Xuyên không", "xuyen-khong"],
        ["Chuyển sinh", "chuyen-sinh"],
        ["Fantasy", "fantasy"],
        ["Hành động", "hanh-dong"],
        ["Manhwa", "manhwa"],
        ["Manhua", "manhua"],
        ["Truyện màu", "truyen-mau"]
    ];
    var out = [];
    for (var i = 0; i < slugs.length; i++) {
        out.push({ title: slugs[i][0], url: SCT_HOST + "/the-loai/" + slugs[i][1] + "/" });
    }
    return JSON.stringify(out);
}
