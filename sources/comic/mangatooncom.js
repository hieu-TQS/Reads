var MT_HOST = "https://mangatooncom.vn";
function getComicSource(){ return JSON.stringify({id:"mangatooncom",name:"MangaToon",faviconUrl:"https://www.google.com/s2/favicons?domain=mangatooncom.vn&sz=64",baseUrl:MT_HOST,searchable:true}); }
function getComicHomeUrl(page){ return MT_HOST; }
function getComicSearchRequest(q,page){ return JSON.stringify({url:MT_HOST+"/search?q="+encodeURIComponent(q),method:"GET",body:null,headers:{}}); }
function parseComicList(html,url){ return JSON.stringify([]); }
function getComicNextPageUrl(c,p,h){ return ""; }
function parseComicDetail(html,url){ return JSON.stringify({title:"",coverUrl:null,author:null,description:null,chapters:[]}); }
function parseComicChapter(html,url){ return JSON.stringify({title:"",imageUrls:[],prevLink:"",nextLink:""}); }
function getComicHeaders(url){ return JSON.stringify({"User-Agent":"Mozilla/5.0","Referer":MT_HOST+"/"}); }
function getComicCategories(){ return JSON.stringify([]); }
