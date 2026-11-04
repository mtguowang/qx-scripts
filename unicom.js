/*
 * 联通 token_online / ecs_token 提取（Quantumult X）
 *
 * 接口依据：本机 login-plugin-framework/plugins/unicom.login/manifest.json
 *   （真机实测过的联通营业厅登录协议，非猜测）
 *
 *   发码 POST https://m.client.10010.com/mobileService/sendRadomNum.htm
 *   登录 POST https://m.client.10010.com/mobileService/radomLogin.htm
 *   响应 JSON: token_online / ecs_token / code / dsc
 *
 * 为什么分两段：
 *   appId 和 deviceId 在【请求体】里，token 在【响应体】里，
 *   QX 一次脚本执行只能看到其中一边，所以请求阶段先存起来，
 *   响应阶段再读回来拼成完整凭证。
 *
 * 输出（与你插件的「完整凭证」格式一致）：
 *   token_online=xxx
 *   ecs_token=xxx
 *   appId=xxx
 *   deviceId=xxx
 *
 * [rewrite_local]
 * ^https:\/\/m\.client\.10010\.com\/mobileService\/radomLogin\.htm url script-request-body 本脚本
 * ^https:\/\/m\.client\.10010\.com\/mobileService\/sendRadomNum\.htm url script-request-body 本脚本
 * ^https:\/\/m\.client\.10010\.com\/mobileService\/radomLogin\.htm url script-response-body 本脚本
 *
 * [mitm]
 * hostname = %APPEND% m.client.10010.com
 */

(function () {
  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId";
  var K_DEVID = "unicom_deviceId";

  // ---------- 工具 ----------
  function storeRead(k) {
    try { if (typeof $prefs !== "undefined" && $prefs.valueForKey) return $prefs.valueForKey(k); } catch (e) { }
    try { if (typeof $persistentStore !== "undefined") return $persistentStore.read(k); } catch (e) { }
    return null;
  }
  function storeWrite(v, k) {
    if (!v) return;
    try { if (typeof $prefs !== "undefined" && $prefs.setValueForKey) { $prefs.setValueForKey(v, k); return; } } catch (e) { }
    try { if (typeof $persistentStore !== "undefined") { $persistentStore.write(v, k); return; } } catch (e) { }
  }
  function notify(t, s, c) {
    try { $notify(t, s, c); return; } catch (e) { }
    try { $notification.post(t, s, c); return; } catch (e) { }
    try { console.log(t + " | " + s + " | " + c); } catch (e) { }
  }
  function log(s) { try { console.log(s); } catch (e) { } }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function formVal(src, name) {
    var m = src.match(new RegExp("(?:^|[?&])" + name + "=([^&#\\s]*)"));
    return m ? dec(m[1]) : "";
  }
  function tryJson(src) { try { return JSON.parse(src); } catch (e) { return null; } }

  // ---------- 阶段一：请求，抓 appId / deviceId ----------
  if (!isResp) {
    var appId = formVal(reqBody, "appId");
    var devId = formVal(reqBody, "deviceId");
    storeWrite(appId, K_APPID);
    storeWrite(devId, K_DEVID);
    log("[联通] 请求命中 " + url.split("?")[0] +
        " appId=" + (appId || "(无)") +
        " deviceId=" + (devId ? devId.slice(0, 10) + "…" : "(无)"));
    // 请求体原样放行，绝不改写
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 阶段二：响应，解析 token ----------
  var o = tryJson(respBody);
  var token = "", ecs = "", code = "", dsc = "";

  if (o) {
    token = o.token_online || "";
    ecs = o.ecs_token || "";
    code = o.code || "";
    dsc = o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "";
  } else {
    // 非 JSON 兜底
    var m1 = respBody.match(/"token_online"\s*:\s*"([^"]*)"/);
    var m2 = respBody.match(/"ecs_token"\s*:\s*"([^"]*)"/);
    token = m1 ? m1[1] : "";
    ecs = m2 ? m2[1] : "";
    dsc = respBody.slice(0, 160);
  }

  var appIdS = storeRead(K_APPID) || "";
  var devIdS = storeRead(K_DEVID) || "";

  if (token || ecs) {
    var full = "token_online=" + token +
               "\necs_token=" + ecs +
               "\nappId=" + appIdS +
               "\ndeviceId=" + devIdS;
    notify("[联通] ✅ 登录凭证已获取", token ? "token_online 已就绪" : "ecs_token 已就绪", full);
    log("[联通] ===== 完整凭证 =====");
    log(full);
    log("[联通] 兼容旧格式: " + token + "#" + appIdS);
  } else {
    notify("[联通] 已命中登录接口，但没拿到 token", "code=" + (code || "?"), dsc || "(响应为空)");
    log("[联通] 登录失败 code=" + code + " dsc=" + dsc + "\n原始响应: " + respBody.slice(0, 500));
  }

  // 响应体不改写
  return $done({});
})();
