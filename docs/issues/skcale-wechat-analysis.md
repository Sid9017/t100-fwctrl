## 背景

KCALACK 微信小程序准备直连 `https://skcale-api.haivivi.cn/api/v1`，不经过 Netlify；Netlify 继续只负责 Web 控制页与固件 OTA。产品要求免注册、免手机号/密码输入，通过当前微信用户身份自动建立业务会话。

2026-10-15 核对默认分支 `dev`（`28b9473271f2252aba49c1cd34d5074d9181f013`）与线上 `/docs/json`：

- 现有登录支持手机号/邮箱，没有微信 code 登录入口。
- 餐次分析为异步任务，`POST /intake-records/:id/@analysis` 返回 202；结果主要通过 PowerSync 读取。
- 当前 C 端没有单餐 HTTP GET 查询接口，现有 REST 照片响应也未包含单菜四项营养字段。
- `/health`、`/api/v1/app-settings` 实测 200；未认证 `/api/v1/devices` 为 401。

小程序正在准备真实分析接入和页面展示。**本 issue 的新增接口需求仅为微信登录；分析请求与结果优先复用现有接口及 PowerSync，不要求新增轮询接口。**

## 1. 微信小程序静默登录

建议新增 `POST /api/v1/auth/@loginWechat`：

```json
{"code":"wx.login 返回的临时 code"}
```

服务端使用受控配置的 AppID/AppSecret 调用微信 `auth.code2Session`，验证后按 `(appid, openid)` 查找或自动创建内部用户。并发首次登录不能创建多个用户；不能信任客户端自行提交的 openid/userId，也不能把手机号或邮箱作为必填项。

成功响应复用现有 `loginResponse`：`accessToken`、`refreshToken`、`expiresIn`、`tokenType`、`sessionId`、`user`（含内部 id、isNewUser；phone/email 可以为 null）。令牌继续复用现有鉴权、刷新和会话撤销机制，与普通业务 API 及 PowerSync 兼容。

- code 无效/过期、微信上游不可用、用户被禁用、配置缺失需有稳定错误码。
- 不在响应或日志中暴露 AppSecret、session_key、access/refresh token 或完整登录 code。
- 配置缺失建议返回 `AUTH_WECHAT_NOT_CONFIGURED`，便于客户端区分未部署/未配置与用户身份验证失败。
- 当前小程序 AppID 为 `wx30eebce62206e490`。AppSecret 由运维通过现有 Secret 管理机制配置，不写入 issue、仓库或小程序包。
- 若需要关联现有 App 账号，应另行设计显式绑定流程，不能仅凭客户端参数自动合并账号。

## 2. 复用现有 PowerSync 分析结果（无需新增业务接口）

继续使用现有 `/powersync` 同步通路和登录签发的 accessToken：

- `intake_records`：`analysis_status`、`analysis_error`、`food_name`、`calories_recommended`、四项宏量字段、`suggestion`。
- `intake_photos`：`record_id`、`key`、`food_name`、`calories`、`carbs_g/protein_g/fat_g/fiber_g`、`intake_weight_g`、`items`。
- 单道菜描述使用 `items` 中的食材名称和克数，整餐文字使用 `suggestion`；不要求为展示而虚构独立文案字段。
- 小程序负责适配现有 PowerSync HTTP 同步协议，处理分块读取、完整 checkpoint、断线重连、令牌刷新和用户数据隔离。服务端只需确认部署的同步版本、入口可达性和上述字段已经下发。
- 数值按当前份量的 kcal/g 展示；未知值保持 null，不能将未完成/失败解释为 0。以已有摄入重量/weightQuality 区分称量与估算，不猜测每 100 g 换算的分母。
- 当前 agent 子集重算不更新整餐 suggestion，小程序第一版采用完整餐次重算以获取对应建议。

此前提议新增 `GET /intake-records/:id` 是简化客户端的备选，并非服务端缺少结果能力。**撤回将该 GET 作为本次接入前置条件的要求**；只有确认现有同步协议在小程序存在无法解决的兼容问题后，再单独讨论，不在本 issue 默认实施。

## 3. 联调顺序与部署要求

1. `wx.login` → `@loginWechat` → 缓存并刷新业务令牌。
2. `files/@signUpload` → 预签名 PUT 上传图片 → `files/@commit`。
3. `POST /intake-records/`，携带固定 `Idempotency-Key`；本地 UUID 与返回的服务端 UUID 分开保存。
4. `POST /intake-records/:id/@analysis` → PowerSync 接收结果 → 回填每道菜的热量、四项营养、食材描述及整餐建议。
5. 小程序后台配置合法 request 域名：API 域名和实际预签名上传域名。AppSecret 只在服务端。
6. 如果真实分析依赖完整用户营养档案，请说明所需最小字段或提供未完成档案时的缺省行为；小程序不会伪造生日等资料。

## 验收

- [ ] 新微信用户无需注册页面/手机号即可获得真实业务会话；重复登录得到同一内部用户。
- [ ] 并发建号、code 无效/过期、未配置、微信超时、禁用账号均有覆盖。
- [ ] refresh 后能继续请求，同步只返回当前用户有权访问的数据。
- [ ] 真实照片完成上传、202 受理、PowerSync DONE/FAILED 同步闭环；一餐 1–5 道菜均返回对应营养值。
- [ ] 断线/超时重试不重复建餐、不重复计费触发分析。
- [ ] 小程序能展示食材描述和整餐 suggestion，并明确区分 null/0/计算中/失败。
- [ ] 更新同源 OpenAPI 文档，提供部署环境、微信登录可用时间、PowerSync 入口及合法上传域名，完成小程序联调。

## 本次之外的兼容事项

当前小程序支持手动覆盖营养值、无照片容器以及本地/固件 UUID。现有服务器契约尚不能直接承接这些全部操作，本 issue 不要求顺带重构；请后续明确对应写入/映射方案。本次先打通微信身份和真实计算结果展示。
