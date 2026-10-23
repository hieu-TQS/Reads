/*
 * Nguồn truyện chữ Nguyệt Mộng Thư (nguyetmongthu.com) — chạy trong Rhino (ES5).
 *
 * Hợp đồng (tất cả trả JSON string):
 *  - getNovelSource()                       -> { id, name, faviconUrl, baseUrl, searchable }
 *  - getNovelHomeUrl(page)                  -> string
 *  - getNovelSearchRequest(query, page)     -> null (không hỗ trợ tìm kiếm)
 *  - parseNovelList(html, url)              -> [{ title, link, coverUrl, author, latestChapter }]
 *  - getNovelNextPageUrl(currentUrl, page, html) -> string ("" = hết)
 *  - parseNovelDetail(html, url)            -> { title, coverUrl, author, description, status, genres, chapters, chapterPages }
 *  - parseNovelChapter(html, url)           -> { title, paragraphs:[...], prevLink, nextLink }
 *  - getNovelHeaders(url)                   -> map header
 *  - getNovelCategories()                   -> [{ title, url }]
 */

var NM_BASE = "https://nguyetmongthu.com";

function getNovelSource() {
    return JSON.stringify({
        id: "nguyetmongthu",
        name: "Nguyệt Mộng Thư",
        faviconUrl: "https://www.google.com/s2/favicons?domain=nguyetmongthu.com&sz=64",
        baseUrl: NM_BASE,
        searchable: false
    });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function absUrl(u) {
    if (!u) return "";
    u = String(u).replace(/^\s+|\s+$/g, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    if (u.charAt(0) === "/") return NM_BASE + u;
    return NM_BASE + "/" + u;
}

function parseInertia(html) {
    if (!html) return null;
    var m = /<script data-page="app" type="application\/json">(.*?)<\/script>/i.exec(html);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function getNovelsData(html) {
    var data = parseInertia(html);
    if (!data || !data.props) return null;
    var novels = data.props.novels;
    if (!novels) return null;
    return novels.data || null;
}

/* ------------------------------------------------------------------ */
/* Trang danh sách                                                     */
/* ------------------------------------------------------------------ */

function getNovelHomeUrl(page) {
    page = page ? parseInt(page, 10) : 1;
    if (!page || page <= 1) return NM_BASE + "/truyen";
    return NM_BASE + "/truyen?page=" + page;
}

function getNovelSearchRequest(query, page) {
    return "null";
}

function parseNovelList(html, url) {
    if (!html) return JSON.stringify([]);
    var list = getNovelsData(html);
    if (!list || !list.length) return JSON.stringify([]);
    var items = [];
    for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (!n || !n.slug) continue;
        var author = "";
        if (n.author && n.author.name) author = String(n.author.name);
        var latest = "";
        if (n.latest_chapter && n.latest_chapter.title) latest = String(n.latest_chapter.title);
        else if (n.total_chapters) latest = "Chương " + n.total_chapters;
        items.push({
            title: String(n.title || ""),
            link: absUrl("/truyen/" + n.slug),
            coverUrl: n.cover_url ? String(n.cover_url) : "",
            author: author,
            latestChapter: latest
        });
    }
    return JSON.stringify(items);
}

function getNovelNextPageUrl(currentUrl, page, html) {
    if (!html) return "";
    var data = parseInertia(html);
    if (!data || !data.props || !data.props.novels) return "";
    var links = data.props.novels.links;
    if (!links || !links.next) return "";
    return String(links.next);
}

/* ------------------------------------------------------------------ */
/* Chi tiết truyện                                                     */
/* ------------------------------------------------------------------ */

function parseNovelDetail(html, url) {
    if (!html) return "";
    var data = parseInertia(html);
    if (!data || !data.props || !data.props.novel) return "";
    var novel = data.props.novel;
    var chapters = data.props.chapters || [];
    var outChapters = [];
    for (var i = 0; i < chapters.length; i++) {
        var ch = chapters[i];
        if (!ch || !ch.slug) continue;
        outChapters.push({
            title: String(ch.title || ("Chương " + (i + 1))),
            link: absUrl("/truyen/" + novel.slug + "/" + ch.slug),
            date: ""
        });
    }
    var genres = "";
    if (novel.genres && novel.genres.length) {
        var gnames = [];
        for (var g = 0; g < novel.genres.length; g++) {
            if (novel.genres[g] && novel.genres[g].name) gnames.push(String(novel.genres[g].name));
        }
        genres = gnames.join(", ");
    }
    var author = "";
    if (novel.author && novel.author.name) author = String(novel.author.name);
    return JSON.stringify({
        title: String(novel.title || ""),
        coverUrl: novel.cover_url ? String(novel.cover_url) : "",
        author: author,
        description: novel.synopsis ? String(novel.synopsis) : "",
        status: novel.status ? String(novel.status) : "",
        genres: genres,
        chapters: outChapters,
        chapterPages: []
    });
}

/* ------------------------------------------------------------------ */
/* Trang đọc chương                                                    */
/* ------------------------------------------------------------------ */

function parseNovelChapter(html, url) {
    if (!html) return "";
    var data = parseInertia(html);
    if (!data || !data.props || !data.props.chapter) return "";
    var chapter = data.props.chapter;
    var novel = data.props.novel || {};
    var content = chapter.content ? String(chapter.content) : "";
    var paragraphs = [];
    var parts = content.split(/\n\s*\n/);
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].replace(/^\s+|\s+$/g, "");
        if (p) paragraphs.push(p);
    }
    if (paragraphs.length <= 1 && content.indexOf("\n") >= 0) {
        paragraphs = [];
        var lines = content.split("\n");
        for (var j = 0; j < lines.length; j++) {
            var ln = lines[j].replace(/^\s+|\s+$/g, "");
            if (ln) paragraphs.push(ln);
        }
    }
    if (paragraphs.length === 0 && content) paragraphs.push(content);

    var prevLink = "";
    var pc = data.props.previousChapter;
    if (pc && pc.slug && novel.slug) prevLink = absUrl("/truyen/" + novel.slug + "/" + pc.slug);
    var nextLink = "";
    var nc = data.props.nextChapter;
    if (nc && nc.slug && novel.slug) nextLink = absUrl("/truyen/" + novel.slug + "/" + nc.slug);

    return JSON.stringify({
        title: chapter.title ? String(chapter.title) : "",
        paragraphs: paragraphs,
        prevLink: prevLink,
        nextLink: nextLink
    });
}

function getNovelHeaders(url) {
    return JSON.stringify({
        "Referer": NM_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });
}

function getNovelCategories() {
    return JSON.stringify([
    { title: 'Hiện đại', url: 'https://nguyetmongthu.com/the-loai/hien-dai' },
    { title: 'Ngôn tình', url: 'https://nguyetmongthu.com/the-loai/ngon-tinh' },
    { title: 'Nữ cường', url: 'https://nguyetmongthu.com/the-loai/nu-cuong' },
    { title: 'Đô thị', url: 'https://nguyetmongthu.com/the-loai/do-thi' },
    { title: 'Ngược', url: 'https://nguyetmongthu.com/the-loai/nguoc' },
    { title: 'Sảng văn', url: 'https://nguyetmongthu.com/the-loai/sang-van' },
    { title: 'Vả mặt', url: 'https://nguyetmongthu.com/the-loai/va-mat' },
    { title: 'Hào môn', url: 'https://nguyetmongthu.com/the-loai/hao-mon' },
    { title: 'Báo thù', url: 'https://nguyetmongthu.com/the-loai/bao-thu' },
    { title: 'Trọng sinh', url: 'https://nguyetmongthu.com/the-loai/trong-sinh' },
    { title: 'Sủng', url: 'https://nguyetmongthu.com/the-loai/sung' },
    { title: 'Gia đình', url: 'https://nguyetmongthu.com/the-loai/gia-dinh' }
    ]);
}