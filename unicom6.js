/*
 * 联通凭证提取 v6 —— 静默捕获 + 按需查看
 *
 * 设计思路：
 *   token_online 是滚动令牌，每次刷新 App 都会变，而且 5 分钟过期。
 *   所以「弹通知」这种推送模式没意义 —— 只会刷屏。
 *   改成：平时静默写入本地，需要时用 Safari 打开一个地址把值显示出来复制。
 *
 * ── 怎么取值 ─────────────────────────────────────────
 *   Safari 打开：
 *     https://loginxx.10010.com/mobileService/onLine.htm?__ck__
 *   页面会直接显示完整的 token_online#appId，可以全选复制。
 *
 *   （?__ck__ 是暗号，脚本看到就吐出存好的值；真实请求不受影响）
 *
 * ── 想恢复弹通知 ─────────────────────────────────────
 *   把下面 NOTIFY_ON_CAPTURE 改成 true
 *
 * 真实接口（2026-11-04 抓包实测）：
 *   POST https://loginxx.10010.com/mobileService/onLine.htm
 *   POST https://loginxx.10010.com/mobileService/login_vcode_member.htm
 * ⚠️ host 是 loginxx，不是 loginxhm
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
  // ======== 开关 ========
  var NOTIFY_ON_CAPTURE = false;   // 捕获成功时弹通知（默认关，避免刷屏）
  var NOTIFY_ON_FAIL = false;      // 捕获失败时弹通知（默认关）
  var DUMP_TOKEN = "__ck__";       // 取值暗号

  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId", K_DEVID = "unicom_deviceId", K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck", K_JSON = "unicom_ck_json", K_LINE = "unicom_line", K_TS = "unicom_ts";

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
    if (v === undefined || v === null) return;
    try { if (typeof $prefs !== "undefined" && $prefs.setValueForKey) { $prefs.setValueForKey(v, k); return; } } catch (e) { }
    try { if (typeof $persistentStore !== "undefined") { $persistentStore.write(v, k); return; } } catch (e) { }
  }
  function tryJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function formVal(src, name) {
    var m = src.match(new RegExp("(?:^|[?&])" + name + "=([^&#\\s]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  var isDump = url.indexOf(DUMP_TOKEN) >= 0;

  // ---------- 取值：把存好的值当作响应正文吐出来 ----------
  if (isDump && isResp) {
    var saved = sRead(K_LINE) || "";
    var ts = sRead(K_TS) || "";
    if (!saved) {
      return $done({ body: "还没有捕获到凭证。\n\n先打开联通 App 让它刷新一次，再回来刷新本页。" });
    }
    // 纯值，方便全选复制
    return $done({ body: saved });
  }

  // ---------- 请求阶段 ----------
  if (!isResp) {
    if (isDump) return $done({});
    sWrite(formVal(reqBody, "appId"), K_APPID);
    sWrite(formVal(reqBody, "deviceId"), K_DEVID);
    sWrite(formVal(reqBody, "deviceCode"), K_DEVCODE);
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 响应阶段：静默捕获 ----------
  if (isDump) return $done({});

  var o = tryJson(respBody);

  if (o && o.token_online) {
    var appId = o.appId || sRead(K_APPID) || "";
    var line = o.token_online + "#" + appId;

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
    sWrite(new Date().toISOString(), K_TS);

    log("[联通] 已捕获 " + line.length + " 字符，过期 " + (o.invalidat || "?"));
    log(line);

    if (NOTIFY_ON_CAPTURE) {
      notify("[联通] 已捕获", line.length + " 字符 · 过期 " + (o.invalidat || "?"), line);
    }
    return $done({});
  }

  // ---------- 没有 token ----------
  var code = o ? String(o.code || "") : "";
  var dsc = o ? (o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "") : "";

  if (code === "0" || code === "0000") {
    log("[联通] 接口成功(code=" + code + ")但不含 token：" + url.split("?")[0].split("/").pop());
    return $done({});
  }

  log("[联通] 失败 code=" + code + " dsc=" + dsc);
  if (NOTIFY_ON_FAIL) {
    notify("[联通] 失败", "code=" + (code || "?"), dsc || "(无原因)");
  }
  return $done({});
})();
