/*
 * 联通凭证提取 v2 —— 基于真实抓包（2026-11-04 iPhone 联通 App 12.0900）
 *
 * 【关键修正】
 *   真实 host = loginxx.10010.com
 *   原脚本写的是 loginxhm.10010.com —— 一个字母之差，所以永远不命中。
 *
 * 【真实接口】（抓包实测）
 *   POST https://loginxx.10010.com/mobileService/onLine.htm
 *        响应 code:"0" 时返回全套凭证：
 *          token_online / ecs_token / private_token / t3_token / appId / desmobile / invalidat
 *   POST https://loginxx.10010.com/mobileService/login_vcode_member.htm
 *        请求体带 token_online + appId；失败时响应 {"code":"0001","dsc":"..."}
 *
 * 【两段式原因】
 *   appId / deviceId / deviceCode 在【请求体】，
 *   token_online / ecs_token 在【响应体】，
 *   QX 一次执行只能看到一边，所以请求阶段先存，响应阶段再读回来拼。
 *
 * [rewrite_local]
 * ^https:\/\/loginxx\.10010\.com\/mobileService\/onLine\.htm url script-request-body 本脚本
 * ^https:\/\/loginxx\.10010\.com\/mobileService\/onLine\.htm url script-response-body 本脚本
 * ^https:\/\/loginxx\.10010\.com\/mobileService\/login_vcode_member\.htm url script-response-body 本脚本
 *
 * [mitm]
 * hostname = %APPEND% loginxx.10010.com
 */

(function () {
  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId";
  var K_DEVID = "unicom_deviceId";
  var K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck";
  var K_JSON = "unicom_ck_json";

  function notify(t, s, c) {
    try { $notify(t, s, c); return; } catch (e) { }
    try { $notification.post(t, s, c); return; } catch (e) { }
    try { console.log(t + " | " + s + " | " + c); } catch (e) { }
  }
  function log(s) { try { console.log(s); } catch (e) { } }
  function sRead(k) {
    try { if (typeof $prefs !== "undefined" && $prefs.valueForKey) return $prefs.valueForKey(k); } catch (e) { }
    try { if (typeof $persistentStore !== "undefined") return $persistentStore.read(k); } catch (e) { }
    return null;
  }
  function sWrite(v, k) {
    if (!v) return;
    try { if (typeof $prefs !== "undefined" && $prefs.setValueForKey) { $prefs.setValueForKey(v, k); return; } } catch (e) { }
    try { if (typeof $persistentStore !== "undefined") { $persistentStore.write(v, k); return; } } catch (e) { }
  }
  function tryJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function formVal(src, name) {
    var m = src.match(new RegExp("(?:^|[?&])" + name + "=([^&#\\s]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  // ---------- 请求阶段：抓 appId / deviceId / deviceCode ----------
  if (!isResp) {
    sWrite(formVal(reqBody, "appId"), K_APPID);
    sWrite(formVal(reqBody, "deviceId"), K_DEVID);
    sWrite(formVal(reqBody, "deviceCode"), K_DEVCODE);
    log("[联通] 请求命中 " + url.split("?")[0].split("/").pop() +
        " appId=" + (formVal(reqBody, "appId") ? "已捕获" : "无"));
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 响应阶段 ----------
  var o = tryJson(respBody);

  // 情况 A：拿到 token_online
  if (o && o.token_online) {
    var appId = o.appId || sRead(K_APPID) || "";
    var deviceId = sRead(K_DEVID) || "";
    var deviceCode = sRead(K_DEVCODE) || "";

    var cred = [
      "token_online=" + o.token_online,
      "ecs_token=" + (o.ecs_token || ""),
      "private_token=" + (o.private_token || ""),
      "t3_token=" + (o.t3_token || ""),
      "appId=" + appId,
      "deviceId=" + deviceId,
      "deviceCode=" + deviceCode,
      "desmobile=" + (o.desmobile || ""),
      "invalidat=" + (o.invalidat || "")
    ].join("\n");

    sWrite(cred, K_CK);
    sWrite(respBody, K_JSON);

    log("[联通] ===== 完整凭证 =====");
    log(cred);
    log("[联通] 兼容旧格式: " + o.token_online + "#" + appId);

    // 单条通知会被 iOS 截断，按 240 字符分片
    var head = "code=" + (o.code || "?") + " 过期=" + (o.invalidat || "?");
    var MAX = 240;
    var parts = [];
    for (var i = 0; i < cred.length; i += MAX) parts.push(cred.substr(i, MAX));
    if (parts.length > 10) parts = parts.slice(0, 10);

    notify("[联通] ✅ 凭证已获取（共 " + parts.length + " 条）", head, parts[0]);
    for (var k = 1; k < parts.length; k++) {
      notify("[联通] 凭证 " + (k + 1) + "/" + parts.length, "", parts[k]);
    }
    return $done({});
  }

  // 情况 B：命中但没 token
  var code = o ? (o.code || "") : "";
  var dsc = o ? (o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "") : "";

  notify("[联通] 命中接口但无 token", "code=" + (code || "?"),
    (dsc || "(响应无 dsc)") + "\n" + url.split("?")[0].split("/").pop());
  log("[联通] 失败 code=" + code + " dsc=" + dsc + "\n原始响应: " + respBody.slice(0, 400));

  return $done({});
})();
