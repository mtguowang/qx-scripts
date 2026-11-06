/*
 * 联通凭证提取 v4 —— 只弹 token_online#appId
 *
 * 需求来源：用户明确要 `token_online#appId` 这个拼接格式
 *           （原版 3-in-1.js 输出的就是它，青龙联通脚本按这个解析）
 *
 * 输出：一条拼接值，约 929 字符（token_online 736 + # + appId 192），
 *       单条通知装不下，按 PART 字符分段，标题标 (i/n)。
 *
 * 真实接口（2026-11-04 iPhone 联通 App 12.0900 抓包实测）：
 *   POST https://loginxx.10010.com/mobileService/onLine.htm
 *        响应 code:"0"/"0000" → token_online / ecs_token / private_token /
 *        t3_token / appId / desmobile / invalidat
 *   POST https://loginxx.10010.com/mobileService/login_vcode_member.htm
 *        短信登录，成功返回 code:"0000" + member 列表（不含 token）
 *
 * ⚠️ host 是 loginxx，不是 loginxhm（原 3-in-1.js 写错的那个）
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
  var PART = 400;      // 单条通知最多多少字符（嫌条数多就调大，嫌被截断就调小）
  var SEP = "#";       // token 和 appId 之间的分隔符

  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId", K_DEVID = "unicom_deviceId", K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck", K_JSON = "unicom_ck_json", K_LINE = "unicom_line";

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
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 响应阶段 ----------
  var o = tryJson(respBody);

  if (o && o.token_online) {
    var appId = o.appId || sRead(K_APPID) || "";
    var line = o.token_online + SEP + appId;   // ← 你要的那条

    // 完整凭证全部存起来（通知只弹拼接值）
    var cred =
      "token_online=" + o.token_online + "\n" +
      "ecs_token=" + (o.ecs_token || "") + "\n" +
      "private_token=" + (o.private_token || "") + "\n" +
      "t3_token=" + (o.t3_token || "") + "\n" +
      "appId=" + appId + "\n" +
      "deviceId=" + (sRead(K_DEVID) || "") + "\n" +
      "deviceCode=" + (sRead(K_DEVCODE) || "") + "\n" +
      "desmobile=" + (o.desmobile || "") + "\n" +
      "invalidat=" + (o.invalidat || "") + "\n";
    sWrite(cred, K_CK);
    sWrite(respBody, K_JSON);
    sWrite(line, K_LINE);

    log("[联通] ===== token_online#appId =====");
    log(line);
    log("[联通] 过期: " + (o.invalidat || "?") + " | t3_token: " + (o.t3_token || "?"));

    // 分段弹
    var n = Math.ceil(line.length / PART);
    for (var i = 0; i < n; i++) {
      var seg = line.substr(i * PART, PART);
      notify("[联通] token#appId " + (i + 1) + "/" + n,
             "第 " + (i * PART + 1) + "-" + Math.min((i + 1) * PART, line.length) + " 字符 / 共 " + line.length,
             seg);
    }
    return $done({});
  }

  // ---------- 没有 token 的响应 ----------
  var code = o ? String(o.code || "") : "";
  var dsc = o ? (o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "") : "";

  if (code === "0" || code === "0000") {
    // 成功但本接口不带 token（如成员列表），只记日志，不弹失败
    log("[联通] 接口成功(code=" + code + ")但不含 token_online：" + url.split("?")[0].split("/").pop());
    return $done({});
  }

  notify("[联通] 失败", "code=" + (code || "?") + " · " + url.split("?")[0].split("/").pop(),
    dsc || "(服务端没给原因)");
  log("[联通] 失败 code=" + code + " dsc=" + dsc + "\n原始响应: " + respBody.slice(0, 400));

  return $done({});
})();
