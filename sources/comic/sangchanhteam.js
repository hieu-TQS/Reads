/* Sang Chanh Team (sangchanhteam.com) - basic regex source */
var SCT_HOST = "https://sangchanhteam.com";
function SCT_abs(u){ if(!u) return ""; u=String(u).replace(/^\s+|\s+$/g,""); if(u.indexOf("//")===0) return "https:"+u; if(u.indexOf("http://")===0||u.indexOf("https://")===0) return u; if(u.charAt(0)==="/") return SCT_HOST+u; return SCT_HOST+"/"+u; }
function getComicSource(){ return JSON.stringify({id:"sangchanhteam",name:"Sang Chảnh Team",faviconUrl:"https://www.google.com/s2/favicons?domain=sangchanhteam.com&sz=64",baseUrl:SCT_HOST,searchable:true}); }
function getComicHomeUrl(page){ page=parseInt(page,10); if(isNaN(page)||page<1) page=1; return SCT_HOST+"/moi-cap-nhat/"+(page>1?page+"/":""); }
function getComicSearchRequest(q,page){ return JSON.stringify({url:SCT_HOST+"/?s="+encodeURIComponent(q),method:"GET",body:null,headers:{}}); }
function parseComicList(html,url){ var out=[]; var re=/href="(https:\/\/sangchanhteam\.com\/truyen\/[a-z0-9-]+\/)"/g; var m; var seen={}; while((m=re.exec(String(html||"")))!==null){ if(!seen[m[1]]){ seen[m[1]]=1; out.push({title:m[1].split("/").slice(-2,-1)[0],link:m[1],coverUrl:null,author:null,latestChapter:null}); } if(out.length>=40) break;} return JSON.stringify(out); }
function getComicNextPageUrl(c,p,h){ return ""; }
function parseComicDetail(html,url){ var ch=[]; var re=/href="(https:\/\/sangchanhteam\.com\/truyen\/[^"']+\/chap-\d+\/?)"/g; var m; var seen={}; while((m=re.exec(String(html||"")))!==null){ if(!seen[m[1]]){ seen[m[1]]=1; ch.push({title:m[1],link:m[1]}); } } if(ch.length===0) ch=[{title:"Đọc",link:url}]; return JSON.stringify({title:"Truyện",coverUrl:null,author:null,description:null,chapters:ch}); }
function parseComicChapter(html,url){ var imgs=[]; var re=/src="(https:\/\/sangchanhteam\.com\/wp-content\/uploads\/[^"]+\.(?:webp|jpg|jpeg|png))"/g; var m; var seen={}; while((m=re.exec(String(html||"")))!==null){ if(!seen[m[1]]){ seen[m[1]]=1; imgs.push(m[1]); } } return JSON.stringify({title:"",imageUrls:imgs,prevLink:"",nextLink:""}); }
function getComicHeaders(url){ return JSON.stringify({"User-Agent":"Mozilla/5.0","Referer":SCT_HOST+"/"}); }
function getComicCategories(){ return JSON.stringify([]); }

