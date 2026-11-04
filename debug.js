/*
 * 联通链路 DEBUG —— 只为证明「规则命中 + 脚本执行」这条路通不通
 *
 * 特点：只要规则被命中，无论有没有 token，一律弹通知。
 *      所以「弹了」= 整条链路 OK；「不弹」= 链路断在 MITM / 资源加载。
 *
 * [rewrite_local]
 * ^https?:\/\/loginxhm\.10010\.com\/ url script-request-header 本脚本URL
 * ^https?:\/\/loginxhm\.10010\.com\/ url script-response-header 本脚本URL
 *
 * [mitm]
 * hostname = %APPEND% loginxhm.10010.com
 */

(function () {
  var isResp = typeof $response !== "undefined";
  var url = ($request && $request.url) || "(拿不到 url)";
  var hdrs = ($request && $request.headers) || {};
  var reqBody = ($request && typeof $request.body === "string") ? $request.body : "";
  var respBody = ($response && typeof $response.body === "string") ? $response.body : "";
  var body = isResp ? respBody : reqBody;

  var ua = hdrs["User-Agent"] || hdrs["user-agent"] || "";
  var ck = hdrs["Cookie"] || hdrs["cookie"] || "";

  function fields(src) {
    var out = [], seen = {}, m;
    var re1 = /(?:^|[?&])([A-Za-z0-9_]+)=/g;
    while ((m = re1.exec(src))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
    var re2 = /"([A-Za-z0-9_]+)"\s*:/g;
    while ((m = re2.exec(src))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
    return out.slice(0, 30).join(", ") || "(无字段)";
  }

  var msg = [
    "阶段: " + (isResp ? "响应" : "请求"),
    "url: " + url,
    "正文长度: " + (body ? body.length : 0),
    "字段: " + (body ? fields(body) : "(无正文)"),
    "UA: " + String(ua).slice(0, 36),
    "Cookie: " + (ck ? ck.slice(0, 50) + "…" : "(无)")
  ].join("\n");

  try { $notify("[联通DEBUG] 规则已命中", isResp ? "响应" : "请求", msg); } catch (e) { }
  try { console.log("[联通DEBUG]\n" + msg); } catch (e) { }

  // 只观察，不改写任何东西
  if (isResp) return $done({});
  return $done({});
})();
