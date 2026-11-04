/*
 * MITM 链路探针 —— 不依赖通知，用「页面内容变化」证明链路通没通
 *
 * 原理：把响应体替换成一个醒目的标记。
 *   Safari 打开目标地址后：
 *     看到 QX-MITM-OK…  → MITM + 证书 + 规则 + 脚本 四层全通
 *     看到 {"code":"0001"...} → 没被拦截，链路断在 MITM/证书/规则
 *     看到证书警告/白屏   → MITM 证书没信任
 *
 * 这个测试和通知权限完全无关，所以能排除「脚本跑了但弹不出通知」的干扰。
 */

(function () {
  var url = (typeof $request !== "undefined" && $request.url) || "";
  var isResp = typeof $response !== "undefined";

  var mark = "QX-MITM-OK\n\n"
    + "阶段: " + (isResp ? "响应" : "请求") + "\n"
    + "URL: " + url + "\n"
    + "时间: " + new Date().toString();

  try { console.log("[probe] " + mark.replace(/\n/g, " | ")); } catch (e) { }

  if (isResp) {
    // 用标记覆盖响应体，Safari 会直接显示这段文字
    return $done({ body: mark });
  }
  return $done({});
})();
