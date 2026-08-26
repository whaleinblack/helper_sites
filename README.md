# Helper Sites

用于并行保存和维护多个独立 helper site 的仓库。每个站点拥有自己的依赖、构建配置与说明，互不耦合。

## 目录结构

```text
helper_sites/
├─ docs/                  # 所有站点共通的技术与视觉规范
├─ sites/                 # 可运行站点；一个目录对应一个站点
│  └─ osaka-east-home-guide/
│  └─ osaka-mountain-picker/
├─ templates/             # 新站点可复用的约定与模板
├─ sites.json             # 站点机器可读索引
└─ README.md
```

## 共通规范

所有新站点和显著改动都应遵循 [Helper Sites 通用技术与视觉规范](docs/helper-site-standards.md)。该文档统一规定目录、工程、安全、数据来源、可访问性、离线交付、Git 工作流和默认视觉语言。

## 现有站点

| 站点 | 说明 | 技术栈 | 目录 |
|---|---|---|---|
| 大阪东线置业研究所 | 门真市通勤购房区域研究 | React / vinext | [sites/osaka-east-home-guide](sites/osaka-east-home-guide) |
| 下一座山 · 大阪発 | 大阪出发的四季登山目的地与路线规划 | React / vinext / D1 | [sites/osaka-mountain-picker](sites/osaka-mountain-picker) |

## 添加新站点

1. 在 `sites/<site-id>/` 创建独立项目，`site-id` 使用小写英文与连字符。
2. 站点自己的依赖、README、环境变量示例和构建配置全部保留在该目录。
3. 不提交密钥、私有项目 ID、`.env` 或构建产物。
4. 在根目录 `sites.json` 登记标题、路径、技术栈与状态。
5. 在功能分支验证构建后，通过 PR 合并。

> 仓库目前未指定开源许可证；使用或分发前请由仓库所有者补充合适的 LICENSE。
