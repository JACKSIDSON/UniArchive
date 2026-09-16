# 格式规范：Vault 与 UEAP

> 本文件是 UniArchive 的数据格式契约。任何实现都必须遵守。

## 1. Vault（档案库）

Vault 是一个**本地文件夹**，是系统的最小数据单元。

```
<vault>/
├── vault.json
├── README.md
├── archives/
│   └── <一级分类>/<二级分类>/【二级分类】-YYYY.MM-标题-标签1,标签2.md
├── assets/
│   └── <YYYY>/<MM>/<uuid>-<原文件名>
└── .uniarchive/
    ├── config.json
    ├── index.db          # SQLite FTS5 索引，可删除重建
    ├── tags.json
    ├── templates/
    ├── plugins/
    ├── themes/
    ├── backups/
    ├── logs/
    └── recycle/
        └── <recycleId>/  # { 原文件, meta.json }
```

### 1.1 vault.json

```json
{
  "vaultId": "uuid-v4",
  "name": "我的大学档案库",
  "createdAt": "2026-09-12T10:00:00+08:00",
  "appVersion": "1.0.0",
  "formatVersion": "1.0"
}
```

### 1.2 档案 Markdown

```markdown
---
id: 8f3c2a1e-1111-2222-3333-444455556666
title: 校级专业竞赛二等奖
category: 荣誉实践/学科竞赛
type: 证书
date: 2026-09-01
tags:
  - 竞赛
  - 评优
issuer: XX大学
level: 校级
files:
  - assets/2026/09/8f3c2a1e-证书.pdf
sensitive: false
version: 1
created_at: 2026-09-12T10:00:00+08:00
updated_at: 2026-09-12T10:00:00+08:00
---

## 备注
校级专业竞赛二等奖，可用于评优和求职材料。
```

字段顺序固定；`date` 必须保持字符串（实现上使用 js-yaml `CORE_SCHEMA`，避免被解析为 Date 对象）。
`files` 中的路径**一律相对 Vault 根目录**，使用 `/` 分隔。

### 1.3 分类

```
学业档案/学籍档案        学业档案/课程资料档案    学业档案/学业成绩档案
学业档案/作业考试档案    学业档案/教材工具档案    学业档案/科研学业档案
荣誉实践/荣誉奖项        荣誉实践/学科竞赛        荣誉实践/学生工作任职
荣誉实践/志愿服务        荣誉实践/实习实践        荣誉实践/科研创新
生活行政/个人证件        生活行政/健康档案        生活行政/校园行政
生活行政/缴费凭证        生活行政/校园凭证
```

### 1.4 命名规范

- 档案文件名：`【二级分类】-YYYY.MM-标题-标签1,标签2.md`
- 非法字符 `\ / : * ? " < > |` 统一替换为 `_`
- 重名时追加 `-1`、`-2`…
- 附件文件名：`<uuid>-<sanitized原文件名>`

### 1.5 .uniarchive/config.json

```json
{
  "recycleTtlDays": 30,
  "autoBackup": false,
  "autoBackupIntervalDays": 7,
  "blurSensitive": true,
  "pageSize": 50,
  "pluginsEnabled": true,
  "lastBackupAt": "2026-09-12T10:00:00+08:00"
}
```

### 1.6 日志

日志以 JSONL 追加写入 `.uniarchive/logs/YYYY-MM.jsonl`，每行一条：

```json
{"id":"uuid","action":"archive.create","target":"<archiveId>","detail":"标题","timestamp":"2026-09-12T10:00:00+08:00"}
```

---

## 2. UEAP（UniArchive Package）

`.ueap` 本质是一个 **ZIP** 文件，改名为 `.zip` 后可直接解压。

```
example.ueap
├── manifest.json        # 明文（加密时同样明文）
├── checksums.sha256     # 明文
├── README.md            # 明文
└── vault/               # 加密模式下为 vault.enc
    ├── vault.json
    ├── archives/
    ├── assets/
    └── .uniarchive/
        ├── config.json
        ├── tags.json
        └── templates/
```

**永不包含**：`index.db`、`logs/`、`backups/`、`recycle/`。

### 2.1 manifest.json

```json
{
  "format": "UEAP",
  "version": "1.0",
  "app": "UniArchive",
  "appVersion": "1.0.0",
  "vaultId": "uuid",
  "vaultName": "我的大学档案库",
  "exportType": "full | category:<分类> | filter:<数量> | template:<评优|求职|升学|答辩>",
  "exportedAt": "2026-09-12T10:00:00+08:00",
  "exportedBy": "可选",
  "encryption": {
    "enabled": false,
    "algorithm": null
  },
  "checksums": "checksums.sha256",
  "compatibility": { "minAppVersion": "1.0.0", "formatVersion": "1.0" }
}
```

加密时 `encryption` 变为：

```json
{
  "enabled": true,
  "algorithm": "AES-256-GCM",
  "kdf": { "name": "argon2id", "memory": 65536, "iterations": 3, "parallelism": 1 },
  "salt": "<base64>",
  "iv": "<base64>",
  "tag": "<base64>"
}
```

### 2.2 checksums.sha256

每行一条，`<sha256>` + 两个空格 + 相对包内路径：

```
e3b0c442...  vault/archives/荣誉实践/学科竞赛/【学科竞赛】-2026.09-标题.md
```

导入时逐条校验，任一不匹配即中止导入。

### 2.3 加密

- 算法：AES-256-GCM
- 密钥派生：Argon2id（memory = 64 MiB，iterations = 3，parallelism = 1，dkLen = 32）
- 加密对象：`vault/` 目录打包后的 ZIP 二进制
- `manifest.json` / `checksums.sha256` / `README.md` 保持明文
- 密文容器 `vault.enc` 布局：`UAENC1 | uint32 headerLen | JSON header | ciphertext`
- 密码错误时 GCM 校验失败，统一返回「密码错误或文件已损坏」

---

## 3. 导入模式与冲突策略

| 模式 | 行为 |
| --- | --- |
| `new` | 在 `targetVaultPath` 新建档案库并写入 |
| `merge` | 合并进当前档案库，冲突按策略处理 |
| `overwrite` | 强制覆盖同 id 档案（保留原 `created_at`，版本递增） |
| `add-only` | 只新增，遇到冲突直接跳过 |
| `preview` | 只返回预览，不写入 |

| 冲突策略 | 行为 |
| --- | --- |
| `skip` | 跳过 |
| `overwrite` | 覆盖 |
| `keep-both` | 生成新 UUID 与「（冲突副本）」标题 |
| `newer-wins` | 比较 `updated_at`，新者胜 |
| `ask` | 交由上层逐个决定（默认降级为 `keep-both`） |

冲突原因（reason）：`id-exists` / `hash-differs` / `path-conflict`。

导入前会自动生成当前档案库快照（`.ueap` 备份），可在「备份」页回滚。

---

## 4. 版本与兼容

- `formatVersion` 当前为 `1.0`。
- `minAppVersion` 标明解包所需的最低应用版本。
- 索引结构版本记录在 SQLite `user_version` 中，落后时自动迁移。
