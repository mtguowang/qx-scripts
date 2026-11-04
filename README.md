# qx-scripts

Quantumult X 用的联通登录凭证提取脚本。

## 最终结论：三层问题叠加

这套东西折腾了好几轮才通，因为「没反应」其实是**三个独立故障叠在一起**，每修一层才露出下一层：

| 层 | 问题 | 表现 |
|---|---|---|
| ① 接口 | 钩的是废弃的 `loginxhm.10010.com/.../login_vcode_member.htm` | 规则永不命中 |
| ② 语法 | Surge 写法混进 QX，引用资源逐行拒收 | 红色「N 个问题存在于子资源」 |
| ③ 证书 | **MITM 证书未信任** | 请求端到端直通，**不报任何错误** |

第三层最阴：证书没被信任时，QX 不做 TLS 终止，直接把加密流量透传给服务器，Safari 看到的是真实响应 —— 看起来「一切正常」，实际脚本一行都没跑。

**判据**：`probe.snippet` 把响应体替换成 `QX-MITM-OK` 标记，看 Safari 页面内容变不变，完全绕开通知权限。

## 真实接口

来自 `login-plugin-framework/plugins/unicom.login/manifest.json`（真机实测的联通营业厅协议）：

| 用途 | 接口 |
|---|---|
| 发码 | `POST https://m.client.10010.com/mobileService/sendRadomNum.htm` |
| 登录 | `POST https://m.client.10010.com/mobileService/radomLogin.htm` |

token 在**登录响应 JSON**：`$.token_online` / `$.ecs_token`。

`loginxhm.10010.com/mobileService/login_vcode_member.htm` 是废弃接口，实测返回：

```json
{"code":"1","dsc":"系统检测到您的账号绑定列表绑定关系失效，为保障您的正常使用，请使用短信验证码重新登录"}
```

## 文件

| 文件 | 说明 |
|---|---|
| `unicom.snippet` | **联通提取，主用**（QX 原生语法） |
| `unicom.js` | 上面的 snippet 引用的脚本 |
| `probe.snippet` / `probe.js` | MITM 链路探针，排查「没反应」时先跑这个 |
| `debug.snippet` / `debug.js` | 早期通知版调试，已被 probe 取代 |
| `qx-local.conf` | 本地配置版，绕过「引用资源」 |
| `3-in-1-fixed.js` / `all-in-one.snippet` | **联通部分接口是错的，勿用** |

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

### 前置条件（缺一不可）

1. QX → 设置 → MitM → 总开关打开
2. 证书已生成并**安装**
3. iOS 设置 → 通用 → 关于本机 → **证书信任设置** → 打开 QX 证书「完全信任」

第 3 步是最容易漏的：**装描述文件 ≠ 信任证书**。

### 触发

**必须退出登录，重新走一次短信验证码登录**。脚本只在登录那一刻触发。

成功时通知：

```
token_online=xxx
ecs_token=xxx
appId=xxx
deviceId=xxx
```

## 为什么 appId 要分两段抓

`appId`、`deviceId` 在**请求体**，`token_online`、`ecs_token` 在**响应体**。QX 一次脚本执行只能看到一边，所以 `unicom.js` 在请求阶段把两者存进 `$prefs`，响应阶段再读回来拼完整凭证。

## 仓库为什么是 public

QX 拉私有仓库的 raw 需要带 token，拉不到。脚本本身是通用提取器，不含任何凭据。**不要把提取出来的 token / ck 明文提交到这个仓库。**
