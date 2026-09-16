# UniArchive 开发路线图

## V1（当前实现）

- [x] Phase 0 项目脚手架（Electron + Vite + React + TS + Tailwind）
- [x] Phase 1 Vault 核心读写（vault.json、目录树、校验）
- [x] Phase 2 档案 CRUD（Markdown + YAML frontmatter）
- [x] Phase 3 附件管理（assets/YYYY/MM、sha256 去重）
- [x] Phase 4 SQLite 索引与检索（FTS5、中文可用、10 万条 < 0.5s）
- [x] Phase 5 标签系统（tags.json 与索引双向同步）
- [x] Phase 6 UEAP 导出（全库 / 分类 / 筛选 / 模板、AES-256-GCM 加密）
- [x] Phase 7 UEAP 导入（五模式、五冲突策略、导入前快照可回滚）
- [x] Phase 8 备份、回收站、日志
- [x] Phase 9 UI 页面（13 个页面、明暗主题、键盘导航）
- [x] Phase 10 插件 API 骨架

## V1.x

- [ ] 档案批量导入（拖拽文件夹 → 自动建档）
- [ ] OCR / 图片文字识别（可选依赖，离线）
- [ ] 模板自定义（用户可编辑 `.uniarchive/templates/`）
- [ ] 时间线导出 SVG

## V2（规划中）

- [ ] 档案版本历史（`.uniarchive/history/`，可回滚单篇）
- [ ] 自定义分类与字段
- [ ] 关系图谱（档案 ↔ 课程 ↔ 证书）
- [ ] 插件写 API（受控写入 + 权限声明）
- [ ] 多 Vault 工作区

## 不做的事

- ❌ 云端同步 / 账号体系
- ❌ 需要登录才能启动的依赖
- ❌ 私有数据库格式存储档案内容
