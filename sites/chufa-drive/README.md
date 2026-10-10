# 出发网盘 · chufa-drive

## 统一身份接入（待切换候选）

配置服务端 `DRIVE_IDENTITY_CONFIG` 后，网盘改用出发网统一账号及根路径
`chufa_session`，不再验证本地密码或续期独立会话。配置文件包含固定回环服务 URL
和仅限网盘的服务器令牌，必须放在仓库外且仅服务用户可读。登录、退出和改密入口
连接 `/account/`；中央验证失败时拒绝访问，不回退旧密码。公开分享保留原语义。
未设置此选项时仍保留旧模式，供隔离测试与受控回滚使用；线上切换同时停用旧账号文件。
整个共享文件库仅授权给归并后的 preview，未把网盘开放给所有旅行规划用户。

私人临时网盘：在无法使用 USB / Google Drive / OneDrive 的电脑上，通过浏览器登录 `https://chufa.wang/drive/` 上传、浏览、预览和下载自己的文件。

- 目标用户：站点所有者本人（少量手动创建的账号，不开放注册）
- 核心任务：跨设备中转文件；类 Windows 资源管理器的管理体验

## 功能

- 登录：用户名 + 密码（scrypt 哈希），HttpOnly / Secure / SameSite=Strict Cookie，仅作用于 `/drive`；默认保持登录 7 天（滑动续期）；按 IP 与用户名做失败次数锁定
- 视图：超大图标 / 大图标 / 中等图标 / 小图标 / 列表 / 详细信息 / 平铺 / 内容；Ctrl+滚轮缩放；图片与视频缩略图
- 排序：名称（自然排序，中文按拼音）、修改日期、类型、大小、创建日期；递增 / 递减；详细信息视图列宽可拖动
- 选择：单击、Ctrl / Shift 多选、Ctrl+A、空白处拖动框选（详细信息视图中也可从行的空白列开始拖）、项目复选框、方向键 / Home / End / 键入名称定位
- 右键菜单：打开 / 预览、下载 / 打包下载（zip）、剪切 / 复制 / 粘贴、重命名、移动到、复制到、删除、永久删除、复制路径、属性；空白处：查看、排序、刷新、粘贴、新建文件夹、上传、全选、反向选择
- 上传：按钮、拖放文件或整个文件夹；8 MB 分片、断点续传、失败自动重试、并发 3；同名时可选择替换 / 跳过 / 保留两者；保留原始修改时间
- 预览：图片（缩放 / 平移 / 旋转）、视频、音频、PDF、文本与源代码（自动识别 UTF-8 / GBK / Shift_JIS 等编码）、Markdown、CSV / TSV 表格、JSON；左右方向键切换
- 回收站：删除先进入回收站（默认保留 30 天），可撤销 / 还原 / 永久删除 / 清空
- 分享下载链接：右键“生成下载链接…”（也可在命令栏“分享”），有效期可选 1 小时 / 1 天 / 7 天 / 30 天 / 永久；对方无需登录，打开 `/drive/s/<令牌>` 即可下载，图片 / 视频 / 音频 / PDF 可在分享页直接预览；多选或文件夹以 ZIP 下载。侧栏“分享链接”可查看下载次数、修改有效期、复制、取消。文件被重命名或移动后链接自动跟随；删除后链接失效（从回收站还原后恢复）；过期链接保留一天用于提示“已过期”，之后自动清除
- 其他：内部拖放移动（按住 Ctrl 复制）、拖放到面包屑或目录树、从 Chrome 拖单个文件到桌面即下载、搜索（当前文件夹递归）、详细信息窗格（Alt+P）、浅色 / 深色主题、手机布局

## 技术栈与结构

- 前端：React 19 + TypeScript + Vite（`app/`，base `/drive/`），图标 lucide-react
- 服务端：Node.js 内置模块，零运行时依赖（`server/`）
  - `app.mjs` 路由、静态文件、下载（Range / ETag）
  - `fsops.mjs` 路径校验、文件操作、回收站、分片上传
  - `thumbs.mjs` 缩略图缓存，`auth.mjs` 账号与会话，`shares.mjs` 公开分享链接（`state/shares.json`），`zip.mjs` 流式 ZIP（store + 按需 ZIP64），`passwd.mjs` 账号管理 CLI
- 数据：文件保存在 `DRIVE_DATA_DIR`；账号、会话、回收站、未完成上传在 `DRIVE_STATE_DIR`
- Node.js ≥ 22.13（本地开发 24.x，服务器使用系统 `/usr/bin/node` 22.x）；npm

## 命令

```bash
npm install
npm run dev        # API :4191 + Vite :5190（http://localhost:5190/drive/）
npm run build      # 类型检查 + 生产构建到 dist/
npm test           # 服务端集成测试（node:test）
npm run user -- <name> --generate .local/cred.local.txt   # 创建/重置账号并把随机密码写入文件
```

本地也可 `npm run build` 后 `DRIVE_COOKIE_SECURE=0 npm start`，访问 `http://localhost:4191/drive/`。

## 环境变量

均为非秘密配置，见 `.env.example`。账号数据只存在服务器的 `state/users.json`（scrypt 哈希），不进入 Git。

## 安全设计

- 所有路径逐段校验，拒绝 `..`、分隔符、控制字符；不跟随符号链接
- 写操作需要自定义请求头 `X-Drive-Request` + 同源 `Origin`，Cookie 为 SameSite=Strict
- 用户上传的文件以 `Content-Security-Policy: sandbox` 返回，HTML / SVG / JS 等永远不会在 `chufa.wang` 源中执行；文本一律按 `text/plain` 返回
- 分享令牌为 128 位随机值；公开接口只返回名称 / 大小 / 有效期，不暴露服务器路径，响应带 `Referrer-Policy: no-referrer` 与 `X-Robots-Tag: noindex`
- 上传前与每个分片都会检查磁盘剩余空间，至少保留 `DRIVE_MIN_FREE_MB`（默认 1.5 GB）给系统和其他站点
- systemd 以专用无登录用户 `chufa-drive` 运行，`ProtectSystem=strict`，仅服务目录可写

## 部署（chufa.wang）

```text
/srv/helper_sites/services/chufa-drive/
├─ releases/<时间戳>/   代码与 dist（root 所有，保留最近 3 个）
├─ current -> releases/…
├─ data/               网盘文件（chufa-drive:chufa-drive 750）
└─ state/              账号、会话、回收站、上传分片（700）
```

- systemd：`deploy/chufa-drive.service`，监听 `127.0.0.1:4191`
  （不用 4190：它在浏览器 / Node fetch 的“危险端口”名单里）
- nginx：`deploy/nginx-drive.conf` 安装为 `/etc/nginx/snippets/chufa-drive.conf`，并在 `chufa.wang` 的 HTTPS server 块中 `include`（已在 `photo.conf` 之后添加一次）
- 发布：`SSH_KEY=… KNOWN_HOSTS=… scripts/deploy.sh`（本地构建 + 测试 → 上传 → 切换 current → 重启 → 必要时更新 nginx 片段并 `nginx -t`）
- 服务器上管理账号：

```bash
cd /srv/helper_sites/services/chufa-drive/current
sudo -u chufa-drive env DRIVE_STATE_DIR=/srv/helper_sites/services/chufa-drive/state DRIVE_NEW_PASSWORD='新密码' /usr/bin/node server/passwd.mjs admin
```

## 已知限制

- Office 文档、HEIC、RAW 等无法在线预览（不把私人文件发送给第三方预览服务），可下载后打开
- 缩略图由浏览器在首次看到大图时生成（`createImageBitmap` 后台解码，缩至 320px WebP，约 20 KB）并上传到 `state/thumbs/` 缓存，之后所有设备直接加载小图；缓存上限 256 MB，按文件大小与修改时间自动失效。浏览器无法解码的格式（如 HEIC）显示文件图标
- 单用户 / 少量用户设计，所有账号共享同一文件空间与分享链接列表
- 未提供离线版本（需要服务器）

## 性能说明

- 框选：指针移动只记录坐标，每帧（requestAnimationFrame）最多计算一次命中；框选矩形直接改 DOM transform，不经过 React；选中集合真正变化时才通知上层；拖动期间关闭项目过渡动画
- 大列表：项目使用 `content-visibility: auto`，并为每种视图设置 `contain-intrinsic-block-size` 占位高度，避免屏幕外项目塌缩导致滚动时布局跳动
- 详细信息窗格对选择变化做 60–180 ms 延迟，快速扫过时不会逐个加载预览；侧栏与上传面板使用 memo，不随选择重绘
