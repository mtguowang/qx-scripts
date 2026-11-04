# qx-scripts

Quantumult X 用的联通登录凭证提取脚本。

## 根因：host 差一个字母

原脚本 `3-in-1.js` 钩的是：

```
loginxhm.10010.com/mobileService/login_vcode_member.htm
```

真实抓包（2026-11-04，iPhone 联通 App `iphone_c@12.0900`）显示实际是：

```
loginxx.10010.com/mobileService/login_vcode_member.htm
```

**`loginxhm` → `loginxx`，路径完全正确，只有 host 写错。** 所以规则永远不命中。

## 真实接口（抓包实测）

| 用途 | 接口 | 说明 |
|---|---|---|
| 会话/凭证源头 | `POST https://loginxx.10010.com/mobileService/onLine.htm` | `code:"0"` 时返回全套凭证 |
| 短信登录 | `POST https://loginxx.10010.com/mobileService/login_vcode_member.htm` | 请求体带 `token_online` + `appId` |

`onLine.htm` 的成功响应示例字段：

```json
{
  "code": "0",
  "token_online": "841c0cf9194b312d...",
  "ecs_token": "eyJkYXRhIjoi...",
  "private_token": "eyJkYXRhIjoi...",
  "t3_token": "4c15f5acd9b1bd30006cd194751a8fce",
  "appId": "44fd964cef7a8ced...",
  "desmobile": "enc_ab66af00843e1628cb8028468c7a02d5",
  "invalidat": "2026-11-04 14:21:10"
}
```

`appId` / `deviceId` / `deviceCode` 在**请求体**里，`token_online` 等在**响应体**里 —— 所以脚本分请求/响应两段，用 `$prefs` 中转。

## 为什么钩 onLine.htm 而不是登录接口

`onLine.htm` 在 App 启动 / 恢复会话时就会调用，**打开 App 就能拿到凭证，不需要退出登录重来**。

## ⚠️ 凭证有效期问题

抓包里 `invalidat` = `2026-11-04 14:21:10`，而请求时间 `14:16:10` —— **相差正好 5 分钟**。

如果这确实是服务端有效期，那抓来的 ck 不适合直接喂给每日签到脚本。这种情况需要：

- 脚本侧自己刷新 token，或
- 改用直接登录的方案（`login-plugin-framework` 里的 `unicom.login` 插件）

## 文件

| 文件 | 说明 |
|---|---|
| `unicom2.snippet` / `unicom2.js` | **联通提取 v2，基于真实抓包，用这个** |
| `unicom.snippet` / `unicom.js` | v1，接口是 `m.client.10010.com`（也是真实接口，但不是凭证源头） |
| `probe.snippet` / `probe.js` | MITM 链路探针，排查「没反应」 |
| `sniff.snippet` / `sniff.js` | 接口嗅探，找 App 真实请求 |
| `qx-local.conf` | 本地配置版，绕过引用资源 |
| `3-in-1-fixed.js` / `all-in-one.snippet` | **接口错的，勿用** |

## 用法

```
https://gh-proxy.com/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom2.snippet
```

备用镜像：

```
https://ghproxy.net/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom2.snippet
https://ghfast.top/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom2.snippet
```

前置条件：

1. QX → 设置 → MitM → 总开关打开
2. 证书已生成并安装
3. iOS 设置 → 通用 → 关于本机 → **证书信任设置** → 打开 QX 证书「完全信任」
   （**装描述文件 ≠ 信任证书**，这步最容易漏，漏了会静默直通、不报任何错）

触发：打开联通 App 即可。

凭证较长（约 2100 字符）会分成多条通知，同时存进 QX 持久化：
`unicom_ck`（完整凭证）、`unicom_ck_json`（原始响应）。

## 踩过的三层坑

| 层 | 问题 | 表现 |
|---|---|---|
| ① 接口 | host 写成 `loginxhm` | 规则永不命中 |
| ② 语法 | Surge 写法混进 QX | 红色「N 个问题存在于子资源」 |
| ③ 证书 | MITM 证书未信任 | 请求端到端直通，**不报任何错** |

## 仓库为什么是 public

QX 拉私有仓库的 raw 需要带 token，拉不到。脚本本身是通用提取器，不含任何凭据。**不要把提取出来的 token / ck 明文提交到这个仓库。**
