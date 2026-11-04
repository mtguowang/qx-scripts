/*
 * 联通接口嗅探 —— 找出 App 真实使用的登录接口
 *
 * 背景：Safari 访问 m.client.10010.com/mobileService/radomLogin.htm 能拦到，
 *       但 App 里登录时什么都拦不到 → App 走的不是这个地址。
 *
 * 做法：把 *.10010.com 全部纳入 MITM，只把「疑似登录相关」的请求弹出来，
 *       从通知里就能读出真实接口路径和参数名。
 *
 * ⚠️ 诊断用，找到接口后立刻删掉这个 snippet。
 */

(function () {
  var isResp = typeof $response !== "undefined";
  if (isResp) return $done({});

  var url = (typeof $request !== "undefined" && $request.url) || "";
  var method = String((typeof $request !== "undefined" && $request.method) || "GET").toUpperCase();
  var hdrs = (typeof $request !== "undefined" && $request.headers) || {};

  var path = url.replace(/^https?:\/\//, "").split("?")[0];

  // 只报「看起来像登录」的请求，避免刷屏
  var hit = /login|Login|radom|vcode|Vcode|smsCode|sendSms|token|auth|Auth|passport|member|\.htm$/i.test(path);
  if (!hit) return $done({});

  // 把 query 里的字段名提取出来（不含值，避免泄露手机号等）
  var q = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?") + 1) : "";
  var names = [];
  q.replace(/(?:^|&)([A-Za-z0-9_]+)=/g, function (_, n) { if (names.indexOf(n) < 0) names.push(n); return _; });

  var bodyLen = (typeof $request.body === "string") ? $request.body.length : 0;
  var ua = hdrs["User-Agent"] || hdrs["user-agent"] || "";

  var msg = "路径: " + path
    + "\n方法: " + method
    + "\nquery 字段: " + (names.length ? names.join(", ") : "(无)")
    + "\nbody 长度: " + bodyLen
    + "\nUA: " + String(ua).slice(0, 50);

  try { $notify("[联通嗅探] " + method, path.split("/").pop() || path, msg); } catch (e) { }
  try { console.log("[嗅探] " + method + " " + url + " bodyLen=" + bodyLen); } catch (e) { }

  return $done({});
})();
