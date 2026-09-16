import fs from 'node:fs';
import path from 'node:path';
import { vaultPaths, ensureDir, listFilesRecursive } from '../core/paths';
import { requireVault, requireVaultRoot, reindexVault } from '../core/vault';
import { logAction } from '../log/logger';
import { getBackupPath, createSnapshot } from './backup';
import { openPackage } from '../import/ueap';

/**
 * 备份恢复：把 .ueap 备份包的内容还原进当前 Vault。
 * 恢复前会自动生成一份「恢复前快照」，保证可再次回滚（禁止覆盖用户文件而不生成备份）。
 */

export interface RestoreResult {
  restoredArchives: number;
  restoredAssets: number;
  snapshotId: string;
}

export function restoreBackup(backupId: string, password?: string): RestoreResult {
  const { root } = requireVault();
  const p = vaultPaths(root);
  const packagePath = getBackupPath(backupId);

  // 恢复前先快照
  const snapshotId = createSnapshot(`恢复备份前 ${backupId}`);

  const pkg = openPackage(packagePath, password);
  try {
    // 清空现有档案与附件（它们在快照里有副本）
    for (const dir of [p.archives, p.assets]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      ensureDir(dir);
    }

    let restoredArchives = 0;
    let restoredAssets = 0;
    for (const abs of listFilesRecursive(pkg.vaultDir)) {
      const rel = path.relative(pkg.vaultDir, abs).split(path.sep).join('/');
      if (rel.startsWith('.uniarchive/')) continue;
      const target = path.resolve(root, rel.split('/').join(path.sep));
      ensureDir(path.dirname(target));
      fs.copyFileSync(abs, target);
      if (rel.startsWith('archives/')) restoredArchives += 1;
      else if (rel.startsWith('assets/')) restoredAssets += 1;
    }

    // 恢复分类目录骨架
    ensureDir(p.archives);
    ensureDir(p.assets);
    reindexVault();

    logAction({
      action: 'backup.restore',
      target: backupId,
      detail: `档案 ${restoredArchives}｜附件 ${restoredAssets}`
    });

    return { restoredArchives, restoredAssets, snapshotId };
  } finally {
    pkg.cleanup();
  }
}
