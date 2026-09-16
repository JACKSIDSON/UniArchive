import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Archive, ConflictItem, ImportOptions, ImportPreview, ImportReport, UeapManifest } from '@shared/types';
import { ensureDir, listFilesRecursive, vaultPaths, readJsonFile, nowIso } from '../core/paths';
import { requireVault, requireVaultRoot, createVault, openVault, reindexVault } from '../core/vault';
import { serializeArchiveFile, parseArchiveFile } from '../core/frontmatter';
import { getArchive, resolveArchivePath, updateArchive } from '../core/archive';
import { getDb } from '../db';
import { upsertArchiveIndex } from '../db/fts';
import { logAction } from '../log/logger';
import { sha256File, parseChecksums, verifyChecksums } from '../core/hash';
import { decryptBuffer, parseEnvelope } from '../export/encrypt';
import { archiveContentHash, detectAll, resolveConflict, type ConflictStrategy } from './conflict';

/**
 * UEAP 导入：new / merge / overwrite / add-only / preview
 * 导入前会生成当前 Vault 快照（由主进程注入 provider），可随时回滚。
 */

let snapshotProvider: ((label: string) => string) | null = null;

/** 由主进程注册：用于导入前自动生成快照备份 */
export function setSnapshotProvider(fn: (label: string) => string): void {
  snapshotProvider = fn;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code = 'IMPORT_ERROR'
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/* ------------------------------------------------------------------ */
/* 读取 .ueap                                                          */
/* ------------------------------------------------------------------ */

export interface OpenedPackage {
  workDir: string;
  vaultDir: string;
  manifest: UeapManifest;
  cleanup: () => void;
}

export function readManifest(packagePath: string): UeapManifest {
  const zip = new AdmZip(packagePath);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new ImportError('不是有效的 UEAP 包：缺少 manifest.json', 'NO_MANIFEST');
  return JSON.parse(entry.getData().toString('utf8')) as UeapManifest;
}

function decryptVaultEntry(zip: AdmZip, password: string | undefined): AdmZip {
  const encEntry = zip.getEntry('vault.enc');
  if (!encEntry) throw new ImportError('包已标记为加密，但缺少 vault.enc', 'NO_PAYLOAD');
  if (!password) throw new ImportError('该包已加密，请输入密码', 'PASSWORD_REQUIRED');
  const env = parseEnvelope(encEntry.getData());
  const plain = decryptBuffer(env, password);
  return new AdmZip(plain);
}

/** 解包到临时目录并校验 checksums.sha256 */
export function openPackage(packagePath: string, password?: string, verify = true): OpenedPackage {
  if (!fs.existsSync(packagePath)) throw new ImportError(`包文件不存在：${packagePath}`, 'NOT_FOUND');
  const zip = new AdmZip(packagePath);
  const manifest = readManifest(packagePath);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniarchive-import-'));
  const vaultDir = path.join(workDir, 'vault');
  ensureDir(vaultDir);

  if (manifest.encryption?.enabled) {
    const inner = decryptVaultEntry(zip, password);
    inner.extractAllTo(workDir, true);
  } else {
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith('vault/') || entry.isDirectory) continue;
      const rel = entry.entryName.slice('vault/'.length);
      const target = path.join(vaultDir, rel.split('/').join(path.sep));
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, entry.getData());
    }
  }

  if (verify) {
    const csEntry = zip.getEntry('checksums.sha256');
    if (!csEntry) throw new ImportError('缺少 checksums.sha256', 'NO_CHECKSUMS');
    const entries = parseChecksums(csEntry.getData().toString('utf8'));
    const bad = verifyChecksums(entries, (p) =>
      fs.readFileSync(path.join(workDir, p.split('/').join(path.sep)))
    );
    if (bad.length > 0) {
      throw new ImportError(`校验和不匹配，共 ${bad.length} 个文件（例如 ${bad[0]}）`, 'CHECKSUM_MISMATCH');
    }
  }

  return { workDir, vaultDir, manifest, cleanup: () => fs.rmSync(workDir, { recursive: true, force: true }) };
}

function readArchivesFromDir(vaultDir: string): Archive[] {
  const archivesDir = path.join(vaultDir, 'archives');
  const out: Archive[] = [];
  if (!fs.existsSync(archivesDir)) return out;
  for (const abs of listFilesRecursive(archivesDir, (f) => f.toLowerCase().endsWith('.md')).sort()) {
    try {
      const parsed = parseArchiveFile(fs.readFileSync(abs, 'utf8'));
      const rel = path.relative(vaultDir, abs).split(path.sep).join('/');
      out.push({ frontmatter: parsed.frontmatter, body: parsed.body, filePath: rel });
    } catch {
      /* 跳过损坏档案 */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 预览                                                                */
/* ------------------------------------------------------------------ */

export function previewImport(packagePath: string, password?: string): ImportPreview {
  const pkg = openPackage(packagePath, password);
  try {
    const incoming = readArchivesFromDir(pkg.vaultDir);
    const assetsDir = path.join(pkg.vaultDir, 'assets');
    const attachmentCount = fs.existsSync(assetsDir) ? listFilesRecursive(assetsDir).length : 0;

    let conflicts: ConflictItem[] = [];
    const vault = requireVault();
    if (vault) {
      conflicts = detectAll(
        incoming,
        (id) => getArchive(id) ?? undefined,
        (rel) => {
          const row = getDb().prepare('SELECT id FROM archives WHERE file_path = ?').get(rel) as
            | { id: string }
            | undefined;
          return row?.id;
        }
      );
    }

    return {
      manifest: pkg.manifest,
      archiveCount: incoming.length,
      attachmentCount,
      conflicts,
      sample: incoming.slice(0, 20).map((a) => ({
        id: a.frontmatter.id,
        title: a.frontmatter.title,
        category: a.frontmatter.category,
        type: a.frontmatter.type,
        date: a.frontmatter.date,
        issuer: a.frontmatter.issuer,
        level: a.frontmatter.level,
        sensitive: a.frontmatter.sensitive,
        version: a.frontmatter.version,
        filePath: a.filePath,
        tags: a.frontmatter.tags,
        attachmentCount: a.frontmatter.files.length,
        created_at: a.frontmatter.created_at,
        updated_at: a.frontmatter.updated_at
      }))
    };
  } finally {
    pkg.cleanup();
  }
}

/* ------------------------------------------------------------------ */
/* 执行导入                                                            */
/* ------------------------------------------------------------------ */

function pathOwner(rel: string): string | undefined {
  const row = getDb().prepare('SELECT id FROM archives WHERE file_path = ?').get(rel) as { id: string } | undefined;
  return row?.id;
}

/** 把一篇档案写入当前 Vault（文件 + 索引） */
function writeArchiveIntoVault(archive: Archive): void {
  const root = requireVaultRoot();
  const target = path.resolve(root, archive.filePath.split('/').join(path.sep));
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, serializeArchiveFile(archive.frontmatter, archive.body), 'utf8');
  upsertArchiveIndex(archive);
}

/** 已存在时：在原路径上覆盖写入 */
function overwriteExisting(archive: Archive): void {
  const existingRel = resolveArchivePath(archive.frontmatter.id);
  if (existingRel) {
    updateArchive(archive.frontmatter.id, {
      title: archive.frontmatter.title,
      category: archive.frontmatter.category,
      type: archive.frontmatter.type,
      date: archive.frontmatter.date,
      tags: archive.frontmatter.tags,
      issuer: archive.frontmatter.issuer,
      level: archive.frontmatter.level,
      sensitive: archive.frontmatter.sensitive,
      files: archive.frontmatter.files,
      body: archive.body
    });
    return;
  }
  writeArchiveIntoVault(archive);
}

export interface ImportUeapInput extends ImportOptions {
  password?: string;
  /** 是否生成导入前快照（默认 true） */
  snapshot?: boolean;
}

export function importUeap(input: ImportUeapInput): ImportReport {
  if (input.mode === 'preview') {
    throw new ImportError('preview 模式请使用 import:preview 通道', 'USE_PREVIEW');
  }

  // 1) 导入前快照（可回滚）
  let snapshotId: string | undefined;
  if (input.snapshot !== false && input.mode !== 'new' && snapshotProvider) {
    try {
      snapshotId = snapshotProvider(`导入前自动快照 ${nowIso()}`);
    } catch {
      /* 快照失败不阻断导入 */
    }
  }

  const pkg = openPackage(input.packagePath, input.password);
  try {
    const incoming = readArchivesFromDir(pkg.vaultDir);

    if (input.mode === 'new') {
      const target = input.targetVaultPath;
      if (!target) throw new ImportError('new 模式需要指定 targetVaultPath', 'NO_TARGET');
      createVault({ targetPath: target, name: pkg.manifest.vaultName });
      copyVaultPayload(pkg.vaultDir, target);
      openVault(target);
      reindexVault();
      logAction({ action: 'import.ueap', target, detail: `new｜${incoming.length} 篇`, vaultRoot: target });
      return {
        mode: 'new',
        created: incoming.length,
        updated: 0,
        skipped: 0,
        conflictCopies: 0,
        targetVaultPath: target
      };
    }

    const root = requireVaultRoot();
    copyAssets(pkg.vaultDir, root);

    const strategy: ConflictStrategy =
      input.mode === 'overwrite'
        ? 'overwrite'
        : input.mode === 'add-only'
          ? 'skip'
          : (input.conflictStrategy === 'ask' ? 'keep-both' : input.conflictStrategy);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let conflictCopies = 0;

    for (const archive of incoming) {
      const existing = getArchive(archive.frontmatter.id) ?? undefined;
      const owner = pathOwner(archive.filePath);

      if (!existing && !owner) {
        writeArchiveIntoVault(archive);
        created += 1;
        continue;
      }

      const resolution = resolveConflict({ incoming: archive, existing, pathConflictWith: owner }, strategy);
      if (resolution.action === 'skip' || !resolution.archive) {
        skipped += 1;
        continue;
      }
      if (resolution.renamed) {
        writeArchiveIntoVault(resolution.archive);
        conflictCopies += 1;
        continue;
      }
      overwriteExisting(resolution.archive);
      updated += 1;
    }

    reindexVault();
    logAction({
      action: 'import.ueap',
      target: input.packagePath,
      detail: `${input.mode}｜新增 ${created}｜更新 ${updated}｜跳过 ${skipped}｜冲突副本 ${conflictCopies}`
    });

    return {
      mode: input.mode,
      created,
      updated,
      skipped,
      conflictCopies,
      snapshotId,
      targetVaultPath: root
    };
  } finally {
    pkg.cleanup();
  }
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function copyAssets(srcVaultDir: string, targetRoot: string): void {
  const srcAssets = path.join(srcVaultDir, 'assets');
  if (!fs.existsSync(srcAssets)) return;
  for (const abs of listFilesRecursive(srcAssets)) {
    const rel = path.relative(srcVaultDir, abs).split(path.sep).join('/');
    const target = path.resolve(targetRoot, rel.split('/').join(path.sep));
    if (fs.existsSync(target)) {
      if (sha256File(abs) === sha256File(target)) continue;
      // 同名但内容不同：保留双方，避免覆盖用户文件
      const ext = path.extname(target);
      const alt = `${target.slice(0, target.length - ext.length)}-imported-${Date.now()}${ext}`;
      ensureDir(path.dirname(alt));
      fs.copyFileSync(abs, alt);
      continue;
    }
    ensureDir(path.dirname(target));
    fs.copyFileSync(abs, target);
  }
}

function copyVaultPayload(srcVaultDir: string, targetRoot: string): void {
  for (const abs of listFilesRecursive(srcVaultDir)) {
    const rel = path.relative(srcVaultDir, abs).split(path.sep).join('/');
    const target = path.resolve(targetRoot, rel.split('/').join(path.sep));
    ensureDir(path.dirname(target));
    fs.copyFileSync(abs, target);
  }
  // 保证目录结构完整
  const p = vaultPaths(targetRoot);
  for (const dir of [p.archives, p.assets, p.templates, p.plugins, p.themes, p.backups, p.logs, p.recycle]) {
    ensureDir(dir);
  }
}

export { archiveContentHash };
