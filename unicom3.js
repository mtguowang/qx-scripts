/*
 * 联通凭证提取 v3
 *
 * 相对 v2 的改动：
 *   1. 修掉「code=0000 被误报成失败」的 bug —— 0000 是成功，0/0000 都算成功
 *   2. 通知按【字段】分条，标题直接写字段名，不再出现「从中间截断的裸 hex」
 *      每条都会标明「第 i/n 段 / 共 X 字符」，一眼能看出是片段还是完整值
 *   3. 顶部 WANT 数组决定弹哪些字段，不需要的删掉即可，通知条数立刻减少
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
  // ======== 想弹哪些字段，就留哪些（顺序即通知顺序）========
  var WANT = ["token_online", "ecs_token", "t3_token"];
  // 其余短字段合并成一条，不想看就设成 false
  var SHOW_EXTRA = true;

  var PART = 400; // 单条通知最多多少字符，超过就分段

  var isResp = typeof $response !== "undefined";
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var reqBody = (typeof $request !== "undefined" && typeof $request.body === "string") ? $request.body : "";
  var respBody = (isResp && typeof $response.body === "string") ? $response.body : "";

  var K_APPID = "unicom_appId", K_DEVID = "unicom_deviceId", K_DEVCODE = "unicom_deviceCode";
  var K_CK = "unicom_ck", K_JSON = "unicom_ck_json";

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

  // ---------- 请求阶段 ----------
  if (!isResp) {
    sWrite(formVal(reqBody, "appId"), K_APPID);
    sWrite(formVal(reqBody, "deviceId"), K_DEVID);
    sWrite(formVal(reqBody, "deviceCode"), K_DEVCODE);
    return $done(reqBody ? { body: reqBody } : {});
  }

  // ---------- 响应阶段 ----------
  var o = tryJson(respBody);

  // 有 token_online：成功路径
  if (o && o.token_online) {
    var vals = {
      token_online: o.token_online,
      ecs_token: o.ecs_token || "",
      private_token: o.private_token || "",
      t3_token: o.t3_token || "",
      appId: o.appId || sRead(K_APPID) || "",
      deviceId: sRead(K_DEVID) || "",
      deviceCode: sRead(K_DEVCODE) || "",
      desmobile: o.desmobile || "",
      invalidat: o.invalidat || "",
      code: String(o.code || "")
    };

    // 完整凭证存持久化
    var cred = "";
    for (var kk in vals) { if (vals[kk]) cred += kk + "=" + vals[kk] + "\n"; }
    sWrite(cred, K_CK);
    sWrite(respBody, K_JSON);

    log("[联通] ===== 完整凭证 =====");
    log(cred);

    // 每个字段单独弹，标题就是字段名
    WANT.forEach(function (f) {
      var v = vals[f];
      if (!v) return;
      if (v.length <= PART) {
        notify("[联通] " + f, "完整 · " + v.length + " 字符", v);
      } else {
        var n = Math.ceil(v.length / PART);
        for (var i = 0; i < n; i++) {
          notify("[联通] " + f + " (" + (i + 1) + "/" + n + ")",
                 "第 " + (i * PART + 1) + "-" + Math.min((i + 1) * PART, v.length) + " 字符 / 共 " + v.length,
                 v.substr(i * PART, PART));
        }
      }
    });

    // 其余短字段合并一条
    if (SHOW_EXTRA) {
      var extra = [];
      ["t3_token", "appId", "deviceId", "deviceCode", "desmobile", "invalidat", "code"].forEach(function (f) {
        if (WANT.indexOf(f) >= 0) return; // 已经单独弹过
        if (vals[f]) extra.push(f + "=" + vals[f]);
      });
      if (extra.length) notify("[联通] 其余字段", "code=" + vals.code + " 过期=" + vals.invalidat, extra.join("\n"));
    }
    return $done({});
  }

  // ---------- 没有 token 的响应 ----------
  var code = o ? String(o.code || "") : "";
  var isSuccessCode = (code === "0" || code === "0000");
  var dsc = o ? (o.dsc || o.mainTitle || o.msg || o.message || o.desc || o.resultMsg || o.mainDesc || "") : "";

  if (isSuccessCode) {
    // 成功但本接口不带 token（比如成员列表接口）—— 只记日志，不弹「失败」
    log("[联通] 接口成功(code=" + code + ")但不含 token_online：" + url.split("?")[0].split("/").pop());
    log("[联通] 响应摘要: " + respBody.slice(0, 300));
    return $done({});
  }

  // 真正的失败
  notify("[联通] 失败", "code=" + (code || "?") + " · " + url.split("?")[0].split("/").pop(),
    dsc || "(服务端没给原因)");
  log("[联通] 失败 code=" + code + " dsc=" + dsc + "\n原始响应: " + respBody.slice(0, 400));

  return $done({});
})();
