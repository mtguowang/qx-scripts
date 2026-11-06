/*
 * 联通凭证提取 v5 —— 去重 + 单条通知
 *
 * 相对 v4 的改动：
 *   1. 去重：同一个 token_online#appId 在 20 秒内只弹一次
 *      解决「规则/资源重复加载导致脚本跑两遍、弹 6 条」的问题
 *   2. 单条通知：整条 897 字符塞进一条
 *      ⚠️ iOS 通知正文只能显示约 4 行（200 字符左右），超出的部分会被打 … 截断。
 *         完整值始终在 QX 日志里，那里不受长度限制。
 *   3. 想恢复分段：把 PART 改小（如 180），每条都能完整显示，但条数会变多
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
  var PART = 2000;        // 2000 = 整条塞一条通知；想分段就改小（如 180）
  var SEP = "#";
  var DEDUP_MS = 20000;   // 相同值在这个时间窗内只弹一次

  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId", K_DEVID = "unicom_deviceId", K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck", K_JSON = "unicom_ck_json", K_LINE = "unicom_line", K_SEEN = "unicom_seen";

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

  // ---------- 请求阶段 ----------
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
    var line = o.token_online + SEP + appId;

    // 完整凭证存起来（通知只弹拼接值）
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

    // ---- 去重：同一值 20 秒内只处理一次 ----
    var seen = sRead(K_SEEN) || "";
    var now = Date.now();
    var seenTs = 0, seenLine = "";
    var bar = seen.indexOf("|");
    if (bar > 0) {
      seenTs = parseInt(seen.slice(0, bar), 10) || 0;
      seenLine = seen.slice(bar + 1);
    }
    if (seenLine === line && (now - seenTs) < DEDUP_MS) {
      log("[联通] 重复触发，已跳过（" + (now - seenTs) + "ms 内同值）");
      return $done({});
    }
    sWrite(now + "|" + line, K_SEEN);

    // ---- 日志：完整值，不受通知长度限制 ----
    log("[联通] ===== token_online#appId（" + line.length + " 字符）=====");
    log(line);
    log("[联通] 过期: " + (o.invalidat || "?") + " | t3_token: " + (o.t3_token || "?"));

    // ---- 通知 ----
    var sub = line.length + " 字符 · 过期 " + (o.invalidat || "?");
    if (line.length <= PART) {
      notify("[联通] ✅ 已获取", sub, line);
    } else {
      var n = Math.ceil(line.length / PART);
      for (var i = 0; i < n; i++) {
        notify("[联通] token#appId " + (i + 1) + "/" + n,
               "第 " + (i * PART + 1) + "-" + Math.min((i + 1) * PART, line.length) + " 字符 / 共 " + line.length,
               line.substr(i * PART, PART));
      }
    }
    return $done({});
  }

  // ---------- 没有 token 的响应 ----------
  var code = o ? String(o.code || "") : "";
  var dsc = o ? (o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "") : "";

  if (code === "0" || code === "0000") {
    log("[联通] 接口成功(code=" + code + ")但不含 token_online：" + url.split("?")[0].split("/").pop());
    return $done({});
  }

  // 失败也去重，避免重复规则弹两条一样的
  var fkey = "fail|" + code + "|" + dsc;
  var seen2 = sRead(K_SEEN) || "";
  var b2 = seen2.indexOf("|");
  if (b2 > 0 && seen2.slice(b2 + 1) === fkey && (Date.now() - (parseInt(seen2.slice(0, b2), 10) || 0)) < DEDUP_MS) {
    log("[联通] 重复失败，已跳过");
    return $done({});
  }
  sWrite(Date.now() + "|" + fkey, K_SEEN);

  notify("[联通] 失败", "code=" + (code || "?") + " · " + url.split("?")[0].split("/").pop(),
    dsc || "(服务端没给原因)");
  log("[联通] 失败 code=" + code + " dsc=" + dsc + "\n原始响应: " + respBody.slice(0, 400));

  return $done({});
})();
