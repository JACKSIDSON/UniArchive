import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import type { Archive, ExportOptions, UeapManifest, VaultMeta } from '@shared/types';
import { APP_VERSION, MIN_APP_VERSION, FORMAT_VERSION } from '@shared/constants';
import { ensureDir, atomicWriteFile, listFilesRecursive, vaultPaths, nowIso } from '../core/paths';
import { requireVaultRoot } from '../core/vault';
import { loadArchives } from '../core/archive';
import { sha256File, formatChecksums, type ChecksumEntry } from '../core/hash';
import { logAction } from '../log/logger';
import { encryptBuffer, serializeEnvelope } from './encrypt';
import { getTemplate, selectByTemplate, templateReadme } from './templates';

/**
 * UEAP 导出：本质是一个 ZIP，改名 .zip 后可直接解压。
 * 包内结构（规格书 5.5）：
 *   manifest.json / checksums.sha256 / README.md / vault/**
 * 永远不包含 index.db、logs/、backups/、recycle/。
 */

export interface ExportResult {
  outputPath: string;
  manifest: UeapManifest;
  archiveCount: number;
  attachmentCount: number;
  size: number;
}

function posix(rel: string): string {
  return rel.split(path.sep).join('/');
}

/** 按导出范围挑选档案 */
export function selectArchives(scope: ExportOptions['scope']): Archive[] {
  const all = loadArchives();
  switch (scope.kind) {
    case 'full':
      return all;
    case 'category':
      return all.filter((a) => a.frontmatter.category === scope.category);
    case 'filter': {
      const set = new Set(scope.archiveIds);
      return all.filter((a) => set.has(a.frontmatter.id));
    }
    case 'template':
      return selectByTemplate(all, scope.template);
    default:
      return all;
  }
}

function exportTypeOf(scope: ExportOptions['scope']): string {
  switch (scope.kind) {
    case 'full':
      return 'full';
    case 'category':
      return `category:${scope.category}`;
    case 'filter':
      return `filter:${scope.archiveIds.length}`;
    case 'template':
      return `template:${scope.template}`;
    default:
      return 'full';
  }
}

function buildReadme(
  scope: ExportOptions['scope'],
  archives: Archive[],
  meta: VaultMeta,
  exportedAt: string,
  encrypted: boolean
): string {
  if (scope.kind === 'template') return templateReadme(scope.template, archives, exportedAt);
  const scopeText =
    scope.kind === 'full'
      ? '完整档案库'
      : scope.kind === 'category'
        ? `分类：${scope.category}`
        : `指定档案 ${scope.archiveIds.length} 篇`;
  return [
    `# ${meta.name} · 导出包`,
    '',
    '- 格式：UEAP 1.0（本质是 ZIP，改名为 .zip 后可直接解压）',
    `- 导出范围：${scopeText}`,
    `- 档案数量：${archives.length}`,
    `- 导出时间：${exportedAt}`,
    `- 加密：${encrypted ? '是（AES-256-GCM + Argon2id）' : '否'}`,
    '',
    '## 目录',
    '',
    '- `vault/archives/`：档案 Markdown（YAML frontmatter + 正文）',
    '- `vault/assets/`：附件原始文件',
    '- `vault/.uniarchive/`：配置与标签',
    '- `manifest.json`：包元信息',
    '- `checksums.sha256`：校验和（导入时会校验）',
    '',
    '## 提示',
    '',
    '本包不含任何私有格式，即使没有 UniArchive 也可以用文本编辑器阅读 `vault/archives/` 下的全部内容。',
    ''
  ].join('\n');
}

export function exportUeap(options: ExportOptions): ExportResult {
  const vaultRoot = requireVaultRoot();
  const p = vaultPaths(vaultRoot);
  const meta = JSON.parse(fs.readFileSync(p.vaultJson, 'utf8')) as VaultMeta;
  const archives = selectArchives(options.scope);
  const encrypted = Boolean(options.encrypt?.password);
  const exportedAt = nowIso();

  const workDir = path.join(os.tmpdir(), `uniarchive-export-${uuidv4()}`);
  const vaultDir = path.join(workDir, 'vault');
  ensureDir(vaultDir);
  try {
    // vault.json + README
    fs.copyFileSync(p.vaultJson, path.join(vaultDir, 'vault.json'));

    // archives：只拷贝命中的档案，保持原目录结构
    for (const a of archives) {
      const src = path.resolve(vaultRoot, a.filePath.split('/').join(path.sep));
      if (!fs.existsSync(src)) continue;
      const dst = path.join(vaultDir, a.filePath.split('/').join(path.sep));
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
    }

    // assets
    let attachmentCount = 0;
    if (options.includeAttachments) {
      for (const a of archives) {
        for (const rel of a.frontmatter.files) {
          const src = path.resolve(vaultRoot, rel.split('/').join(path.sep));
          if (!fs.existsSync(src)) continue;
          const dst = path.join(vaultDir, rel.split('/').join(path.sep));
          ensureDir(path.dirname(dst));
          fs.copyFileSync(src, dst);
          attachmentCount += 1;
        }
      }
    }

    // .uniarchive 中允许入包的部分（禁止 index.db / logs / backups / recycle）
    const uniDir = path.join(vaultDir, '.uniarchive');
    ensureDir(uniDir);
    if (fs.existsSync(p.configJson)) fs.copyFileSync(p.configJson, path.join(uniDir, 'config.json'));
    if (fs.existsSync(p.tagsJson)) fs.copyFileSync(p.tagsJson, path.join(uniDir, 'tags.json'));
    if (fs.existsSync(p.templates)) {
      fs.cpSync(p.templates, path.join(uniDir, 'templates'), { recursive: true });
    }

    // checksums（相对 vault/ 的路径）
    const checksums: ChecksumEntry[] = listFilesRecursive(vaultDir)
      .sort()
      .map((abs) => ({
        hash: sha256File(abs),
        path: `vault/${posix(path.relative(vaultDir, abs))}`
      }));

    const manifest: UeapManifest = {
      format: 'UEAP',
      version: FORMAT_VERSION,
      app: 'UniArchive',
      appVersion: APP_VERSION,
      vaultId: meta.vaultId,
      vaultName: meta.name,
      exportType: exportTypeOf(options.scope),
      exportedAt,
      encryption: {
        enabled: encrypted,
        algorithm: encrypted ? 'AES-256-GCM' : null
      },
      checksums: 'checksums.sha256',
      compatibility: { minAppVersion: MIN_APP_VERSION, formatVersion: FORMAT_VERSION }
    };

    const readme = buildReadme(options.scope, archives, meta, exportedAt, encrypted);

    // 打包
    const outer = new AdmZip();
    outer.addFile('checksums.sha256', Buffer.from(formatChecksums(checksums), 'utf8'));
    outer.addFile('README.md', Buffer.from(readme, 'utf8'));

    if (encrypted) {
      const inner = new AdmZip();
      inner.addLocalFolder(vaultDir, 'vault');
      const plain = inner.toBuffer();
      const env = encryptBuffer(plain, options.encrypt!.password);
      manifest.encryption = {
        enabled: true,
        algorithm: 'AES-256-GCM',
        kdf: {
          name: 'argon2id',
          memory: env.kdf.memory,
          iterations: env.kdf.iterations,
          parallelism: env.kdf.parallelism
        },
        salt: env.salt,
        iv: env.iv,
        tag: env.tag
      };
      outer.addFile('vault.enc', serializeEnvelope(env));
    } else {
      outer.addLocalFolder(vaultDir, 'vault');
    }
    outer.addFile('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));

    ensureDir(path.dirname(options.outputPath));
    atomicWriteFile(options.outputPath, outer.toBuffer());
    const size = fs.statSync(options.outputPath).size;

    logAction({
      action: 'export.ueap',
      target: options.outputPath,
      detail: `${manifest.exportType}｜${archives.length} 篇｜加密=${encrypted ? '是' : '否'}`
    });

    return { outputPath: options.outputPath, manifest, archiveCount: archives.length, attachmentCount, size };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** 便捷方法：按模板导出 */
export function exportByTemplate(
  template: '评优' | '求职' | '升学' | '答辩',
  options: Omit<ExportOptions, 'scope'>
): ExportResult {
  const t = getTemplate(template);
  if (!t) throw new Error(`未知模板：${template}`);
  return exportUeap({ ...options, scope: { kind: 'template', template } });
}
