# qx-scripts

Quantumult X 用的联通登录凭证提取脚本。

**当前版本：`unicom4.snippet` + `unicom4.js`** —— 只弹 `token_online#appId`。

```
https://gh-proxy.com/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom4.snippet
```

---

## 根因：host 差一个字母

原脚本 `3-in-1.js` 钩的是：

```
loginxhm.10010.com/mobileService/login_vcode_member.htm
```

真实抓包（2026-11-04，iPhone 联通 App `iphone_c@12.0900`）显示实际是：

```
loginxx.10010.com/mobileService/login_vcode_member.htm
```

**`loginxhm` → `loginxx`，路径完全正确，只有 host 写错。** 所以规则永远不命中 —— 前面折腾 MITM、证书、脚本逻辑，全都是在修一个地址写错的问题。

## 真实接口（抓包实测）

| 用途 | 接口 | 说明 |
|---|---|---|
| **凭证源头** | `POST https://loginxx.10010.com/mobileService/onLine.htm` | `code:"0"` / `"0000"` 时返回全套凭证 |
| 短信登录 | `POST https://loginxx.10010.com/mobileService/login_vcode_member.htm` | 成功返回 `code:"0000"` + member 列表（不含 token） |

`onLine.htm` 成功响应字段：

```
token_online / ecs_token / private_token / t3_token /
appId / desmobile / invalidat
```

`appId` / `deviceId` / `deviceCode` 在**请求体**，`token_online` 等在**响应体** —— 所以脚本分请求/响应两段，用 `$prefs` 中转。

### 为什么钩 onLine.htm 而不是登录接口

`onLine.htm` 在 App 启动 / 恢复会话时就会调用，**打开 App 就能拿到凭证，不需要退出登录重来**。

---

## v4 输出

只弹 `token_online#appId`，共 929 字符，按 400 字符分 3 条通知：

```
[联通] token#appId 1/3   第 1-400 字符 / 共 929
[联通] token#appId 2/3   第 401-800 字符 / 共 929
[联通] token#appId 3/3   第 801-929 字符 / 共 929
```

已做往返验证：三条拼回后与原始值**逐字一致**。

分段大小可调，编辑 `unicom4.js` 顶部：

```js
var PART = 400;
```

其余字段（`ecs_token` / `private_token` / `t3_token` / `deviceId` / `deviceCode` / `desmobile` / `invalidat`）不弹窗，只写日志 + 存持久化：

| key | 内容 |
|---|---|
| `unicom_line` | `token_online#appId` |
| `unicom_ck` | 完整凭证文本 |
| `unicom_ck_json` | 原始响应 JSON |

---

## 用法

1. QX → 配置 → 引用资源 → `+` → 类型「重写」→ 填上面的 gh-proxy 地址
2. 「全部更新」，确认无红色「N 个问题」
3. 确认 `[mitm]` 里有 `loginxx.10010.com`（不放心就手动加进主配置）
4. 完全关掉联通 App（后台划掉），重新打开

备用镜像：

```
https://ghproxy.net/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom4.snippet
https://ghfast.top/https://raw.githubusercontent.com/mtguowang/qx-scripts/main/unicom4.snippet
```

### 前置条件（缺一不可）

1. QX → 设置 → MitM → 总开关打开
2. 证书已生成并**安装**
3. iOS 设置 → 通用 → 关于本机 → **证书信任设置** → 打开 QX 证书「完全信任」

第 3 步最容易漏：**装描述文件 ≠ 信任证书**。漏了会静默直通、不报任何错，是最难查的一层。

---

## ⚠️ 凭证有效期问题

抓包里 `invalidat` 比请求时间正好晚 **5 分钟**：

```
请求时间   14:43:48
invalidat  14:48:48
```

如果这确实是服务端有效期，那抓来的 ck 不适合直接喂给每日签到脚本 —— 只能做到「抓一次、马上用」。

这种情况需要：脚本侧自己刷新 token，或改用直接登录方案（`login-plugin-framework` 里的 `unicom.login` 插件，它直接调 API 登录，不依赖抓包）。

---

## 文件

| 文件 | 说明 |
|---|---|
| `unicom4.snippet` / `unicom4.js` | **当前版本，用这个** |
| `unicom3.snippet` / `unicom3.js` | 按字段分条弹通知（诊断用） |
| `unicom2.snippet` / `unicom2.js` | 首次修正 host，弹完整凭证 |
| `unicom.snippet` / `unicom.js` | v1，接口是 `m.client.10010.com`（真实但不是凭证源头） |
| `probe.snippet` / `probe.js` | MITM 链路探针，排查「没反应」 |
| `sniff.snippet` / `sniff.js` | 接口嗅探 |
| `qx-local.conf` | 本地配置版，绕过引用资源 |
| `3-in-1-fixed.js` / `all-in-one.snippet` | **接口错的，勿用** |

诊断用的 `probe` / `sniff` / `debug` 用完请删掉：`probe` 会把响应体替换成标记，留着会**把联通 App 弄坏**。

---

## 踩过的四层坑

| 层 | 问题 | 表现 |
|---|---|---|
| ① 接口 | host 写成 `loginxhm` | 规则永不命中 |
| ② 语法 | Surge 写法混进 QX | 红色「N 个问题存在于子资源」 |
| ③ 证书 | MITM 证书未信任 | 请求端到端直通，**不报任何错** |
| ④ 通知 | 长值分段不当 | 弹出半截 hex，看着像乱码 |

第 ④ 层是 v2 的问题：整条凭证按固定长度切，切点落在 `token_online` 中间，弹出来就是没头没尾的片段。v4 改成整条拼接值分段并标注 `(i/n)` 与字符区间。

---

## 仓库为什么是 public

QX 拉私有仓库的 raw 需要带 token，拉不到。脚本本身是通用提取器，不含任何凭据。**不要把提取出来的 token / ck 明文提交到这个仓库。**
