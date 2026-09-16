import type { ArchiveCategory, ArchiveLevel, AppSettings } from './types';

export const APP_NAME = 'UniArchive';
export const APP_VERSION = '1.0.0';
export const FORMAT_VERSION = '1.0' as const;
export const MIN_APP_VERSION = '1.0.0';

export const CATEGORIES: ArchiveCategory[] = [
  '学业档案/学籍档案',
  '学业档案/课程资料档案',
  '学业档案/学业成绩档案',
  '学业档案/作业考试档案',
  '学业档案/教材工具档案',
  '学业档案/科研学业档案',
  '荣誉实践/荣誉奖项',
  '荣誉实践/学科竞赛',
  '荣誉实践/学生工作任职',
  '荣誉实践/志愿服务',
  '荣誉实践/实习实践',
  '荣誉实践/科研创新',
  '生活行政/个人证件',
  '生活行政/健康档案',
  '生活行政/校园行政',
  '生活行政/缴费凭证',
  '生活行政/校园凭证'
];

/** 一级分类（目录第一层） */
export const TOP_CATEGORIES = ['学业档案', '荣誉实践', '生活行政'] as const;

export function subCategoriesOf(top: string): string[] {
  return CATEGORIES.filter((c) => c.startsWith(`${top}/`)).map((c) => c.split('/')[1]);
}

export const LEVELS: ArchiveLevel[] = ['国家级', '省级', '市级', '校级', '院级', '其他'];

/** 预设标签（Phase 5） */
export const PRESET_TAGS = ['学业', '荣誉', '竞赛', '实习', '评优', '求职', '科研'] as const;

/** 回收站保留天数 */
export const RECYCLE_TTL_DAYS = 30;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  recentVaults: [],
  autoBackup: false,
  autoBackupIntervalDays: 7,
  recycleTtlDays: RECYCLE_TTL_DAYS,
  blurSensitive: true,
  pageSize: 50
};

export const LOG_ACTIONS = [
  'vault.create', 'vault.open', 'vault.close',
  'archive.create', 'archive.update', 'archive.delete',
  'attachment.add', 'attachment.delete',
  'export.ueap', 'import.ueap',
  'backup.create', 'backup.restore',
  'recycle.restore', 'recycle.purge',
  'settings.update'
] as const;

/** 导出模板（Phase 6） */
export const EXPORT_TEMPLATES = ['评优', '求职', '升学', '答辩'] as const;
export type ExportTemplateName = (typeof EXPORT_TEMPLATES)[number];

export const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export const ARCHIVE_EXT = '.md';
export const UEAP_EXT = '.ueap';

/** 简体中文 UI 文案 */
export const UI_TEXT = {
  appName: 'UniArchive 大学档案库',
  tagline: '本地优先 · 文件夹即数据库 · 一键打包导出'
} as const;
