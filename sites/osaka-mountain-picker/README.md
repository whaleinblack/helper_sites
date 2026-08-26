# 下一座山 · 大阪発

公开仓库中的 `.openai/hosting.json` 不保存实际 Sites 项目 ID。使用 Sites 发布时由站点所有者在本地或部署环境中填入对应项目 ID；GitHub Actions 的 `/outdoor` 发布流程不依赖该 ID。

以大阪站为统一起点的四季登山选择工具。它把山域、山峰、代表路线、交通、月度气候与 14 日天气放在同一张规划界面中，默认开启适合半年后恢复登山的低风险筛选。

## 当前范围

- 14 个山域、64 座山峰、48 条代表路线索引。
- 名称搜索支持简体中文、中文拼音、日文假名与假名罗马字。
- 山域卡使用 Wikimedia Commons 可再利用照片，并在展开区底部显示作者、许可和原始文件链接。
- 山峰与山域仅聚合代表路线的 `コース定数` 范围；难度不是山峰的固有属性。
- 路线线条是开发期规划示意，不可替代正式登山地图、离线轨迹、登山届或现场封路确认。
- 实时天气使用山域代表点而非大阪市区，并显示代表点海拔、更新时间与缓存状态。优先请求 One Call 4.0；订阅未启用时降级到官方 5 日／3 小时预报并按日规范化，两者都使用 24 小时 D1 缓存。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

Google Maps 浏览器 Key 应限制生产域名、API 与配额。`OPENWEATHER_API_KEY`、`EKISPERT_API_KEY` 和 `OPENROUTESERVICE_API_KEY` 只能作为服务端或开发脚本秘密保存，不能进入 Git。未配置 Google Maps 时界面会使用可交互的轮廓式降级地图；未配置 OpenWeather 时仍可查看静态月度气候档案。

## 数据与来源边界

地名、坐标和地形以国土地理院、OpenStreetMap、地方政府及公园管理机构资料为主要参考。月度档案按气象厅 1991–2020 平年值和代表观测站资料归纳。YAMAP 与ヤマレコ仅提供站内搜索外链，不复制其轨迹、地图或正文。所有路线都应在出发前通过官方管理机构与最新登山信息再次核验。

## 路线几何与 GPX

地图会明确区分 `示意路线`、`开放轨迹` 与 `官方 GPX`。现有未完成开放来源核验的路线只显示为示意线，不作为导航轨迹。可再发布的官方或 OSM/ODbL GPX 可用以下命令转为带来源、许可和导入日期的 GeoJSON；缺少来源网址或许可时脚本会拒绝导入。

```bash
npm run route:import-gpx -- input.gpx output.json --source-url https://example.jp/route.gpx --license "CC BY 4.0"
```

YAMAP、YamaHack 与ヤマレコ用于路线发现和人工核验，不批量抓取或重新发布其受保护轨迹。

## 检查

```bash
npm test
npm run lint
npm run build
```

部署采用 Sites 的 ChatGPT 登录保护和私有访问策略；D1 仅保存规范化天气缓存，不保存原始 OpenWeather 响应或个人位置。
