/*
 * 三合一参数提取脚本（修正版） 顺丰 + 联通 + WPS
 *
 * 相对原版 3-in-1.js 的改动：
 *   1) 联通分支：原版钩的是「短信验证码登录」接口 login_vcode_member.htm 的请求体，
 *      却要取 token_online —— 登录这一刻 App 手里还没有 token，它是登录成功后才下发的，
 *      所以 if (appId && tokenOnline) 恒为假，既不弹窗也不打日志 = 你看到的「没反应」。
 *      本版：请求 / 响应双兼容，并强制输出自检信息。
 *   2) 自检通知：规则一命中就必弹一条，能立刻区分「规则没命中」和「命中了但没提取到」。
 *   3) $done 回写前判空：原版 $done({body: ""}) 会把请求体清空回写给 App，可能直接导致登录失败。
 *   4) 参数名多别名匹配，form 表单和 JSON 两种正文都能取。
 *
 * [rewrite_local]
 * # 联通 —— 登录响应（token 真正在这里，推荐）
 * ^https:\/\/loginxhm\.10010\.com\/mobileService\/login_vcode_member\.htm url script-response-body 本脚本URL
 * # 联通 —— 登录请求（兜底，部分版本 token 会随请求带上）
 * ^https:\/\/loginxhm\.10010\.com\/mobileService\/login_vcode_member\.htm url script-request-body 本脚本URL
 * # 顺丰
 * ^https:\/\/mcs-mimp-web\.sf-express\.com\/mcs-mimp\/integralPlanet\/getCxAdvertiseList url script-request-header 本脚本URL
 * # WPS
 * ^https:\/\/personal-act\.wps\.cn\/activity-rubik\/activity\/component_action url script-request-header 本脚本URL
 *
 * [mitm]
 * hostname = %APPEND% loginxhm.10010.com, mcs-mimp-web.sf-express.com, personal-act.wps.cn
 */

(function () {
  var isResponse = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var headers = (typeof $request !== "undefined" && $request.headers) || {};
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResponse && typeof $response.body === "string") ? $response.body : "";

  function notify(title, subtitle, content) {
    try {
      if (typeof $notify === "function") { $notify(title, subtitle, content); return; }
      if (typeof $notification !== "undefined" && $notification.post) { $notification.post(title, subtitle, content); return; }
      console.log(title + " | " + subtitle + " | " + content);
    } catch (e) { }
  }
  function log(s) { try { console.log(s); } catch (e) { } }

  // form(k=v&) 与 json("k":"v") 通用取值
  function pick(src, names) {
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var m = src.match(new RegExp("(?:^|[?&])" + n + "=([^&#\\s\"']+)"));
      if (m) return m[1];
      m = src.match(new RegExp('"' + n + '"\\s*:\\s*"([^"]+)"'));
      if (m) return m[1];
    }
    return null;
  }
  function keyList(src) {
    var out = [], seen = {}, m;
    var re1 = /(?:^|[?&])([A-Za-z0-9_]+)=/g;
    while ((m = re1.exec(src))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
    var re2 = /"([A-Za-z0-9_]+)"\s*:/g;
    while ((m = re2.exec(src))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
    return out.slice(0, 40).join(", ") || "(没解析出字段)";
  }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  // ---------- 联通 ----------
  if (/10010\.com/.test(url)) {
    var src = isResponse ? respBody : reqBody;
    var where = isResponse ? "响应" : "请求";
    var appId = pick(src, ["appId", "app_id", "appid", "clientId"]);
    var token = pick(src, ["token_online", "tokenOnline", "token", "access_token", "usertoken"]);

    if (!src) {
      notify("[联通] 规则已命中，但没拿到正文", where, "URL: " + url);
    } else if (!token) {
      notify("[联通] 已命中，但没取到 token", where + "，正文长度 " + src.length, "现有字段: " + keyList(src));
    } else {
      var result = dec(token) + "#" + dec(appId || "");
      notify("[联通] ✅ 参数提取成功", where, result);
      log("[联通] " + result);
    }

    // 回写：请求体只在真有内容时还原，避免清空导致 App 登录失败
    if (isResponse) return $done({});
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 顺丰 ----------
  if (/sf-express\.com/.test(url)) {
    var ck = headers["Cookie"] || headers["cookie"] || "";
    var sessionId = (ck.match(/sessionId=([^;]+)/) || [])[1];
    var loginMobile = (ck.match(/_login_mobile_=([^;]+)/) || [])[1];
    var loginUserId = (ck.match(/_login_user_id_=([^;]+)/) || [])[1];
    if (sessionId && loginMobile && loginUserId) {
      var msg = "sessionId=" + sessionId + ";_login_mobile_=" + loginMobile + ";_login_user_id_=" + loginUserId;
      notify("[顺丰] ✅ 参数获取成功", "", msg);
      log("[顺丰] " + msg);
    } else {
      notify("[顺丰] 已命中但 Cookie 不全", "Cookie 长度 " + ck.length, ck ? ck.slice(0, 200) : "(空)");
    }
    return $done({});
  }

  // ---------- WPS ----------
  if (/wps\.cn/.test(url)) {
    var ck2 = headers["Cookie"] || headers["cookie"] || "";
    if (ck2) {
      notify("[WPS] 🍪 Cookie 已获取", "", ck2);
      log("[WPS] " + ck2);
    } else {
      notify("[WPS] 已命中但无 Cookie", "", url);
    }
    return $done({});
  }

  // ---------- 命中规则但没匹配到任何 App ----------
  notify("[脚本] 规则命中但未匹配任何 App", "", url);
  $done({});
})();
