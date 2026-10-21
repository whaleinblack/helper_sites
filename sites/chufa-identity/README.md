# 出发网统一账户

统一浏览器登录、改密、会话撤销和各站点授权。Node.js 24.21+，使用内置
`node:sqlite`，无 npm 运行依赖。`npm test` 运行隔离临时数据库与本地 HTTP 测试；
`npm start` 运行服务。HTML/CSS/JS 为原生界面，无构建步骤。

`CHUFA_IDENTITY_CONFIG` 指向服务端私有 JSON，包含绝对 `database` 路径和
`clients` 数组。客户端项包含仅服务器保存的随机 `token`、允许查询的 `services`，
Nginx 客户端还设置 `requireOriginalMethod: true`。不得把此配置、公钥以外的凭据、
真实数据库或用户资料加入 Git、浏览器资源或发布包。

## 接入契约

### 项目邀请资格（2026-10-22 JST 独立修复）

`GET /internal/user?service=agents&purpose=project-invite&username=...`
或单独 `id=...` 仅供已验证项目管理权限的协调平台调用。中央客户端必须同时
持有 `agents`、`userLookup: true`、`inviteLookup: true`；不增加任何用户授权。
查询仅匹配真实登录用户名（大小写不敏感）或稳定 ID（精确），不匹配昵称、邮箱，
拒绝批量、重复、混合及未知查询字段。成功只返回 `id/username/role`。

错误明确区分 `USER_NOT_FOUND` (404)、`APP_ACCESS_REQUIRED`、
`ACCOUNT_DISABLED`、`PASSWORD_CHANGE_REQUIRED` (403)。客户端范围不符为
`CLIENT_SCOPE_REQUIRED` (403)，不能解释成目标用户没有授权。调用方将配置鉴权、
超时和服务故障反馈为身份服务不可用。普通不带 `purpose` 的精确查找维持原行为，
Drive 元数据仍仅有 ID 和用户名，登录、Agent 赞助与强制改密规则保持不变。
资格查询不写数据库，也不缓存账号状态；没有替任何现有用户改名、改密或授予权限。

### 本人资料接口（2026-10-22 JST 已上线）

`GET /account/api/profile` 返回当前根会话本人的
`{user:{id,username,email,displayName,emailVerified,updatedAt}}`。
`PATCH /account/api/profile` 仅接受 `displayName`、`email`、
`expectedUpdatedAt` 和可选 `currentPassword`；修改邮箱必须确认当前密码，
邮箱变更后保持未验证。显示名称为 1–80 个 Unicode 码点，不含控制字符。
用户名、稳定用户 ID、角色与服务授权都不能由该接口修改。
会话及版本在事务内重新校验，增量 `identity_profile_events` 只记字段名与时间，
失败整体回滚；基础身份版本仍为 1，不合并或重置业务数据。

本接口已在 `registration-20261021T152425Z-452652c6d0f8` 上线，17 项合同测试与
2 项 Linux 配置权限测试通过。根 `/` 可作为任何有效账号的主页返回目标，不要求
旅行授权；服务路径仍验证对应授权。Dev `/travel_dev/` 已实际启用；正式 `/travel/`
已实际启用，根主页替换也已获用户明确批准并完成。后续客户端视觉更新独立发布。

- `/account/`：统一账户页面，登录、注册、退出和改密；注册只需用户名、邮箱和密码，
  暂不验证邮箱。新账号为普通成员，默认只开通正式旅行规划；其他服务由 Status 授权。
- `POST /account/api/register`：仅接受 username/email/password，成功为 201 并建立根会话。
  重名或重复邮箱返回 ACCOUNT_EXISTS；跨站写入、角色/权限注入和弱密码均拒绝。
- `chufa_session`：根路径 HttpOnly/Secure/SameSite=Lax Cookie。所有服务共享同一
  中央会话记录，退出、停用、改密、降权即时影响各站点，按各操作的撤销策略执行。
- `/internal/session?service=drive`：专用服务器客户端读取已授权的会话。
- `/internal/user?service=drive&username=...` 或 `id=...`：专用客户端需开启
  `userLookup: true`，只返回已开通网盘的有效账号 `{id, username}`，不列举用户，
  不授予文件权限。Agent 平台的独立客户端保留原有最小元数据契约。
- `/internal/check?service=...`：Nginx 内部子请求，成功为 204。
  必须清除客户端 Authorization 并由私有 Nginx 配置设置专用令牌；写请求传入真实
  原始 Method 和 Origin，跨站或缺失来源的管理写请求拒绝。
- 网盘、运维、摄影管理、直播管理分别显式授权；管理员身份本身不等于全服务权限。
  直播房间口令和推流凭据不是个人登录账号，保持原有隔离。
- 不提供自动降级到旧密码。数据库、验证服务或客户端配置异常时拒绝访问。

账号库由经过审查的离线迁移工具创建，不能启动时猜测用户对应关系。Travel 应用通过
`TRAVEL_PLANNER_IDENTITY_DB_PATH` 接入同一账号存储，业务数据和加密密钥仍按环境分离。
旧账号只作为停用的审计来源保留，原 admin 的内容和权限归入 preview。

## 部署与回滚

服务仅监听 127.0.0.1:4193。`deploy/` 提供 systemd 单元、每日私有备份和只生成候选
文件的 Nginx 配置转换器。Nginx 转换要求原认证位置和数量准确匹配，否则停止。
共享身份、注册、授权审计扩展和最小网盘查询已在
`registration-20261021T113232Z-23f24cf3ef1e` 启用；Status 的添加账号和服务授权
已在独立 Dev/Status 发布 `e7ae552` 启用，正式旅行站只移植账号入口补丁 `1b9a8bd`。
`identity_account_events` 为增量审计表，基础身份版本保持 1；部署中央服务后再启用
新版 Status 写接口。失败回滚发布链接，不得用旧身份快照覆盖上线后的新用户写入。

部署前应冻结写入，备份两个业务数据库、旧认证配置、网盘状态和当前发布链接；
重新生成迁移候选并校验，再同步启用主站、Dev、网盘和管理入口。维护期间失败可
完整恢复该快照；重新开放写入后不得直接用旧业务库覆盖新数据。

账户库与私有配置单独每日备份，现有项目备份不能替代此备份。每日备份位于服务器
私有目录，不提供公开下载。此项目没有离线可分发的账户数据版本。

替换私有配置必须保留原 UID、GID 和 mode，使用 `deploy/private_config.py` 的原子
替换方法；私有备份的 root/0600 元数据不得直接套回运行配置。发布与回滚均须以
`chufa-identity` 服务用户验证配置可读、候选源码可遍历、数据库可用后再重启，随后
检查真实 HTTP 健康。Linux 回归：在 deploy 目录运行
`python3 -m unittest test_private_config.py`。不允许仅用 root 可读或 systemd active
作为就绪证明。
