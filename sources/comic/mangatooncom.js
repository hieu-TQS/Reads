/* MangaToon (mangatooncom.vn) - server-rendered HTML + JSON mục lục nhúng sẵn.
   - Site tra 503/404 voi query co dau tieng Viet nen phai bo dau truoc khi tim.
   - Muc luc day du nam trong bien "data" (JSON.parse) o trang chi tiet.
   - Trang chương: ảnh lazy-load qua data-src, prev/next dùng chung class
     page-icons-next nên phải phân biệt bằng chữ "Chương trước"/"Chương sau". */
var MT_HOST = "https://mangatooncom.vn";

function MT_abs(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return MT_HOST + u;
    return MT_HOST + "/" + u;
}

function MT_clean(s) {
    s = String(s == null ? "" : s);
    s = s.replace(/<[^>]*>/g, " ");
    s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
         .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

/* Bỏ dấu tiếng Việt (site trả 503 nếu query có ký tự có dấu). */
function MT_ascii(s) {
    var from = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
    var to   = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";
    var out = "";
    s = String(s || "").toLowerCase();
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        var j = from.indexOf(c);
        out += (j >= 0 ? to.charAt(j) : c);
    }
    return out;
}

function MT_slugTitle(link) {
    var s = String(link || "").replace(/\?.*$/, "").replace(/\/+$/, "").split("/");
    var slug = s.length ? s[s.length - 1] : "";
    return slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function getComicSource() {
    return JSON.stringify({
        id: "mangatooncom",
        name: "MangaToon",
        faviconUrl: "https://www.google.com/s2/favicons?domain=mangatooncom.vn&sz=64",
        baseUrl: MT_HOST,
        searchable: true
    });
}

/* /vi/genre/comic = toàn bộ truyện, 18 truyện/trang; ?page=N đánh số từ 0
   (trang đầu không có tham số). */
function getComicHomeUrl(page) {
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    return MT_HOST + "/vi/genre/comic" + (page > 1 ? "?page=" + (page - 1) : "");
}

function getComicSearchRequest(q, page) {
    return JSON.stringify({
        url: MT_HOST + "/vi/search?word=" + encodeURIComponent(MT_ascii(q)),
        method: "GET",
        body: null,
        headers: {}
    });
}

function parseComicList(html, url) {
    var h = String(html || "");
    /* Trang tìm kiếm không có kết quả chỉ hiện "Đề xuất liên quan" — bỏ qua. */
    if (h.indexOf("class=\"no-result\"") >= 0 && h.indexOf("class=\"comics-result\"") < 0) return "[]";
    var out = [];
    var seen = {};
    var re = /href="((?:https:\/\/mangatooncom\.vn)?\/vi\/[a-z0-9-]+\?content_id=(\d+))"/g;
    var m;
    while ((m = re.exec(h)) !== null) {
        var link = MT_abs(m[1]);
        var id = m[2];
        if (seen[id]) continue;
        seen[id] = 1;

        var win = h.substr(re.lastIndex, 1600);

        var title = "";
        var t1 = /class="content-title"[^>]*>\s*(?:<span[^>]*>)?([^<]+)/.exec(win);
        if (t1) title = MT_clean(t1[1]);
        if (!title) {
            var t2 = /class="recommend-comics-title"[^>]*>\s*<span[^>]*>([^<]+)/.exec(win);
            if (t2) title = MT_clean(t2[1]);
        }
        if (!title) {
            var alt = /alt="([^"]+)"/.exec(win);
            if (alt) title = MT_clean(alt[1]);
        }

        var cover = null;
        var img = /<img[^>]*data-src="([^"]+)"/.exec(win);
        if (img) cover = MT_abs(img[1]);

        var latest = null;
        var chap = /(?:Cập nhật đến|Cập nhật tới)\s*(?:chap|chương)\s*(\d+)/i.exec(win);
        if (chap) latest = "Chap " + chap[1];

        out.push({
            title: title || MT_slugTitle(link),
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
    var cur = String(currentUrl || "");
    /* Trang tìm kiếm không phân trang (page=N trả lại đúng trang đầu). */
    if (cur.indexOf("word=") >= 0) return "";

    var h = String(html || "");
    var nextRe = /<a[^>]*href="([^"]+)"[^>]*>\s*<span[^>]*class="[^"]*\bnext\b[^"]*"/g;
    var m;
    while ((m = nextRe.exec(h)) !== null) {
        var link = MT_abs(m[1]);
        if (link !== cur) return link;
    }
    return "";
}

function MT_episodes(h, contentId) {
    var arr = [];
    var re = /data\s*=\s*JSON\.parse\('(\[[\s\S]*?\])'\)/g;
    var m;
    while ((m = re.exec(h)) !== null) {
        var raw = m[1].replace(/\\"/g, "\"").replace(/\\'/g, "'");
        if (raw.indexOf("\"weight\"") < 0 && raw.indexOf("\"id\"") < 0) continue;
        try {
            var list = JSON.parse(raw);
            if (list && list.length) { arr = list; break; }
        } catch (e) { }
    }

    var chapters = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
        var ep = arr[i];
        if (!ep || ep.id == null) continue;
        var key = String(ep.id);
        if (seen[key]) continue;
        seen[key] = 1;
        var num = ep.weight != null ? ep.weight : ep.id;
        chapters.push({
            title: ep.title ? String(ep.title) : "Chương " + num,
            link: MT_HOST + "/vi/watch/" + contentId + "/" + ep.id,
            date: ep.open_at ? String(ep.open_at) : null,
            _w: parseInt(num, 10) || 0
        });
    }
    chapters.sort(function (a, b) { return a._w - b._w; });
    for (var j = 0; j < chapters.length; j++) delete chapters[j]._w;
    return chapters;
}

function parseComicDetail(html, url) {
    var h = String(html || "");
    var link = String(url || "");
    var contentId = "";
    var cid = /content_id=(\d+)/.exec(link) || /\/vi\/watch\/(\d+)\//.exec(h);
    if (cid) contentId = cid[1];

    var title = "";
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
    if (h1) title = MT_clean(h1[1]);
    if (!title) {
        var t = /<title>([\s\S]*?)<\/title>/i.exec(h);
        if (t) title = MT_clean(t[1]).replace(/\s*[-–|]\s*(?:MangaToon|Mangatoon)\s*$/i, "");
    }

    var cover = null;
    var og = /property="og:image"[^>]*content="([^"]+)"/.exec(h) || /content="([^"]+)"[^>]*property="og:image"/.exec(h);
    if (og) cover = MT_abs(og[1]);

    var desc = null;
    var meta = /name="description"\s+content="([^"]*)"/.exec(h);
    if (meta && MT_clean(meta[1])) desc = MT_clean(meta[1]);

    var chapters = contentId ? MT_episodes(h, contentId) : [];
    if (chapters.length === 0) {
        var seen = {};
        var re = /href="((?:https:\/\/mangatooncom\.vn)?\/vi\/watch\/(\d+)\/(\d+))"/g;
        var m;
        while ((m = re.exec(h)) !== null) {
            if (seen[m[3]]) continue;
            seen[m[3]] = 1;
            chapters.push({ title: "Chương", link: MT_abs(m[1]) });
        }
    }
    if (chapters.length === 0) chapters = [{ title: "Đọc", link: link }];

    return JSON.stringify({
        title: title || MT_slugTitle(link),
        coverUrl: cover,
        author: null,
        description: desc,
        chapters: chapters
    });
}

function parseComicChapter(html, url) {
    var h = String(html || "");
    var cur = String(url || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    var imgs = [];
    var seen = {};

    /* Ảnh trang: alt="<tên truyện> - Chapter N - <index>". */
    var reAlt = /<img[^>]*data-src="([^"]+)"[^>]*alt="[^"]*\s-\s\d+"/g;
    var m;
    while ((m = reAlt.exec(h)) !== null) {
        var u = MT_abs(m[1]);
        if (seen[u]) continue;
        seen[u] = 1;
        imgs.push(u);
    }
    if (imgs.length === 0) {
        var reCdn = /data-src="(https:\/\/[^"]*\/ps\/[^"]+\.(?:webp|jpg|jpeg|png))"/g;
        while ((m = reCdn.exec(h)) !== null) {
            var v = MT_abs(m[1]);
            if (seen[v]) continue;
            seen[v] = 1;
            imgs.push(v);
        }
    }

    function MT_nav(label) {
        var re = new RegExp("<a[^>]*href=\"([^\"]+)\"[^>]*>\\s*<span class=\"page-text\">" + label + "</span>");
        var x = re.exec(h);
        if (!x) return "";
        var u = MT_abs(x[1]).replace(/[?#].*$/, "").replace(/\/+$/, "");
        return u === cur ? "" : u;
    }

    var title = "";
    var t = /<h1 class="watch-page-heading"[^>]*>([\s\S]*?)<\/h1>/.exec(h);
    if (t) title = MT_clean(t[1]);

    return JSON.stringify({
        title: title,
        imageUrls: imgs,
        prevLink: MT_nav("Chương trước"),
        nextLink: MT_nav("Chương sau")
    });
}

function getComicHeaders(url) {
    return JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": MT_HOST + "/",
        "Accept-Language": "vi-VN,vi;q=0.9"
    });
}

function getComicCategories() {
    var cats = [
        ["Thanh niên", "/vi/genre/comic"],
        ["Mới nhất", "/vi/genre/new"],
        ["Đang hot", "/vi/genre/hot"],
        ["Đã Full", "/vi/genre/tags/32"],
        ["Tổng tài", "/vi/genre/tags/17"],
        ["Huyền huyễn", "/vi/genre/tags/10"],
        ["Nữ cường", "/vi/genre/tags/87"],
        ["Mạo hiểm", "/vi/genre/tags/29"],
        ["Trường học", "/vi/genre/tags/2"],
        ["Harem", "/vi/genre/tags/193"],
        ["Xuyên không", "/vi/genre/tags/12"]
    ];
    var out = [];
    for (var i = 0; i < cats.length; i++) {
        out.push({ title: cats[i][0], url: MT_HOST + cats[i][1] });
    }
    return JSON.stringify(out);
}
