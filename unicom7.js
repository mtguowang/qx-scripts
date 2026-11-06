/*
 * 联通凭证提取 v7 —— 只弹「已获取」，不弹「失败」
 *
 * 相对 v6 的改动（就两行开关）：
 *   NOTIFY_ON_CAPTURE = true    保留 [联通] ✅ 已获取
 *   NOTIFY_ON_FAIL    = false   去掉 [联通] 失败 code=0001 列表为空
 *
 * 另外加了可选节流 NOTIFY_MIN_INTERVAL_MS：
 *   同一个 token 连续刷新时，间隔小于该值的通知会合并（默认 0 = 不节流）
 *   如果嫌刷得太勤，改成 60000（一分钟内只弹一次）
 *
 * 取值方式仍然保留：Safari 打开
 *   https://loginxx.10010.com/mobileService/onLine.htm?__ck__
 * 页面直接显示完整值，可全选复制（不受通知截断影响）
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
  var NOTIFY_ON_CAPTURE = true;    // ✅ 已获取 → 弹（你要保留的）
  var NOTIFY_ON_FAIL = false;      // ❌ 失败 code=0001 → 不弹（你要去掉的）
  var NOTIFY_MIN_INTERVAL_MS = 0;  // 通知节流，0 = 不节流；改成 60000 = 一分钟内只弹一次
  var DUMP_TOKEN = "__ck__";       // 取值暗号

  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId", K_DEVID = "unicom_deviceId", K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck", K_JSON = "unicom_ck_json", K_LINE = "unicom_line";
  var K_TS = "unicom_ts", K_LASTNOTIFY = "unicom_lastnotify";

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
    if (!saved) {
      return $done({ body: "还没有捕获到凭证。\n\n先打开联通 App 让它刷新一次，再回来刷新本页。" });
    }
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

  if (isDump) return $done({});

  // ---------- 响应阶段：捕获 ----------
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
      var now = Date.now();
      var lastN = parseInt(sRead(K_LASTNOTIFY) || "0", 10) || 0;
      if (NOTIFY_MIN_INTERVAL_MS <= 0 || (now - lastN) >= NOTIFY_MIN_INTERVAL_MS) {
        notify("[联通] ✅ 已获取",
               line.length + " 字符 · 过期 " + (o.invalidat || "?"),
               line);
        sWrite(String(now), K_LASTNOTIFY);
      } else {
        log("[联通] 距上次通知不足 " + NOTIFY_MIN_INTERVAL_MS + "ms，本次不弹");
      }
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

  // 失败：只记日志，不弹
  log("[联通] 失败 code=" + code + " dsc=" + dsc + "（已静默）");

  if (NOTIFY_ON_FAIL) {
    notify("[联通] 失败", "code=" + (code || "?") + " · " + url.split("?")[0].split("/").pop(),
           dsc || "(服务端没给原因)");
  }
  return $done({});
})();
