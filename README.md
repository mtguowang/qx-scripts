# qx-scripts

Quantumult X 用的联通登录凭证提取脚本。

## 根因：原脚本钩错了接口

原脚本来自 [Tzbfire/cloud](https://github.com/Tzbfire/cloud) 的 `3-in-1.js`，联通分支钩的是：

```
loginxhm.10010.com/mobileService/login_vcode_member.htm
```

实测这个地址返回：

```json
{"code":"1","dsc":"系统检测到您的账号绑定列表绑定关系失效，为保障您的正常使用，请使用短信验证码重新登录"}
```

**这是废弃的旧接口**，联通 App 根本不会请求它。所以规则永远不命中 —— MITM 开没开、脚本对不对，都不影响「没反应」这个结果。

真实接口（来自本机 `login-plugin-framework/plugins/unicom.login/manifest.json`，真机实测过的联通营业厅登录协议）：

| 用途 | 接口 |
|---|---|
| 发码 | `POST https://m.client.10010.com/mobileService/sendRadomNum.htm` |
| 登录 | `POST https://m.client.10010.com/mobileService/radomLogin.htm` |

token 在**登录响应 JSON** 里：`$.token_online` / `$.ecs_token`。

另外原脚本还有个独立 bug：它在**登录请求**里找 `token_online`，但那玩意儿是登录成功后才下发的，条件 `if (appId && tokenOnline)` 恒为假。

## 文件

| 文件 | 说明 |
|---|---|
| `unicom.snippet` | **联通提取，用这个**（QX 原生语法） |
| `unicom.js` | 上面的 snippet 引用的脚本 |
| `debug.snippet` / `debug.js` | 链路自测：证明 MITM + 规则 + 脚本是否生效 |
| `3-in-1-fixed.js` | 早期三合一修正版，**联通部分接口仍是错的，勿用** |
| `all-in-one.snippet` | 同上，**勿用** |

## 用法

QX → 配置 → 引用资源 → `+` → 类型「重写」→ 填：

```
https://gh-proxy.com/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom.snippet
```

备用镜像：

```
https://ghproxy.net/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom.snippet
https://ghfast.top/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom.snippet
```

前置条件：

1. QX → 设置 → MitM → 总开关打开
2. 证书已生成并安装
3. 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 QX 证书「完全信任」
   （**装描述文件 ≠ 信任证书**，这步最容易漏）

触发：**必须退出登录，重新走一次短信验证码登录**。脚本只在登录那一刻触发，已经在登录状态时不会跑。

成功时通知内容：

```
token_online=xxx
ecs_token=xxx
appId=xxx
deviceId=xxx
```

## 先跑自测，别直接试

如果还是没反应，先加 `debug.snippet`，然后用 Safari 访问：

```
https://m.client.10010.com/mobileService/radomLogin.htm
```

- **弹通知** → MITM/证书/规则/脚本四层全通，问题只可能在「你没重新登录」
- **不弹** → 断在 MITM 层，按上面前置条件逐条查

## 为什么 appId 要分两段抓

`appId`、`deviceId` 在**请求体**里，`token_online`、`ecs_token` 在**响应体**里。QX 一次脚本执行只能看到其中一边，所以 `unicom.js` 在请求阶段把 `appId`/`deviceId` 存进 `$prefs`，响应阶段再读回来拼成完整凭证。
