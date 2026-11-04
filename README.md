# qx-scripts

Quantumult X 用的参数提取脚本。原脚本来自 [Tzbfire/cloud](https://github.com/Tzbfire/cloud) 的 `3-in-1.js`，这里放的是修过联通分支的版本。

## 文件

| 文件 | 说明 |
|---|---|
| `3-in-1-fixed.js` | 修正版脚本，顺丰 / 联通 / WPS 三合一 |
| `unicom-ck.snippet` | 联通专用的 QX 引用资源（QX 原生语法） |
| `all-in-one.snippet` | 三合一引用资源（顺丰 + 联通 + WPS） |

## 原脚本联通分支为什么没反应

原版钩的是**短信登录接口的请求体**，却要取 `token_online`：

```js
const tokenOnline = body.match(/token_online=([^&]+)/)?.[1];
if (appId && tokenOnline) { ... }   // 恒为假
```

`token_online` 是**登录成功之后**服务端下发的，登录请求发出的那一刻 App 手里还没有它。所以条件永远不成立，不弹通知也不打日志 —— 表现就是「没反应」。

另外原版收尾是 `$done({ body })`，当 QX 没抓到正文时 `body` 是空串，等于把请求体清空回写给 App，可能直接导致登录失败。

修正版：
1. 请求 / 响应双兼容；
2. 规则一命中就必弹自检通知，能区分「规则没命中」和「命中了但没提取到」；
3. 回写前判空，没内容就原样放行；
4. 参数名多别名匹配，form 和 JSON 正文都能取。

## 快速开始

QX → 配置 → 引用资源 → `+` → 类型「重写」→ 填：

```
https://cdn.jsdelivr.net/gh/mtguowang/qx-scripts@main/unicom-ck.snippet
```

然后「全部更新」，确认资源不再标红。

再打开联通 App 走一次短信登录，应收到：

```
[联通] ✅ 参数提取成功
响应
eyJhbGciOiJIUzI1NiJ9.xxxx#你的appId
```

如果收到的是 `[联通] 已命中，但没取到 token`，看通知里列的「现有字段」，那就是该接口真实带的参数名，照着改 `3-in-1-fixed.js` 里 `pick()` 的候选数组即可。

## 「N 个问题存在于子资源」怎么排

QX 对引用资源做逐行校验，一行不合法就算一个问题。常见原因：

1. **用了 Surge 语法**：`http-request <url> script-path=xxx, requires-body=1, tag=xxx`
   → QX 要的是 `<正则> url script-response-body <脚本URL>`，整行会被拒。
2. **段名写成 `[Script]`**：那是 Surge 的，QX 只认 `[rewrite_local]`。
3. **hostname 没写 `%APPEND%`**：会覆盖而不是追加。
4. **正则里的转义丢失**：`https:\/\/` 少了反斜杠、或 `?` 没转义成 `\?`。
5. **行尾有全角空格 / 中文标点**：肉眼看不见，QX 直接判非法。

把资源内容贴进任意文本编辑器，开「显示不可见字符」对一遍最快。
