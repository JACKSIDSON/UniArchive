import type { Archive } from '@shared/types';
import type { ExportTemplateName } from '@shared/constants';

/**
 * 导出模板：评优 / 求职 / 升学 / 答辩
 * DECISION: 模板用「分类 + 标签 + 敏感标记」的声明式规则描述，纯数据、可被用户改写。
 */

export interface ExportTemplate {
  name: ExportTemplateName;
  description: string;
  /** 命中任一分类即可纳入 */
  categories: string[];
  /** 命中任一标签即可纳入 */
  tags: string[];
  /** 排除的标签 */
  excludeTags: string[];
  /** 正文 README 标题 */
  readmeTitle: string;
  /** 正文 README 说明 */
  readmeIntro: string;
}

export const TEMPLATES: Record<ExportTemplateName, ExportTemplate> = {
  评优: {
    name: '评优',
    description: '奖学金、三好学生、优秀干部等评优材料',
    categories: ['荣誉实践/荣誉奖项', '荣誉实践/学科竞赛', '荣誉实践/学生工作任职', '学业档案/学业成绩档案'],
    tags: ['评优', '荣誉', '竞赛', '成绩'],
    excludeTags: [],
    readmeTitle: '评优材料包',
    readmeIntro: '本包按「评优」模板导出，包含荣誉奖项、学科竞赛、学生工作与学业成绩相关档案。'
  },
  求职: {
    name: '求职',
    description: '实习、项目、竞赛与证书，用于简历投递',
    categories: ['荣誉实践/实习实践', '荣誉实践/学科竞赛', '荣誉实践/科研创新', '学业档案/学业成绩档案'],
    tags: ['求职', '实习', '竞赛', '科研'],
    excludeTags: [],
    readmeTitle: '求职材料包',
    readmeIntro: '本包按「求职」模板导出，包含实习实践、竞赛、科研创新与成绩证明相关档案。'
  },
  升学: {
    name: '升学',
    description: '推免 / 考研 / 留学申请所需的成绩、排名与科研材料',
    categories: ['学业档案/学业成绩档案', '学业档案/科研学业档案', '荣誉实践/科研创新', '荣誉实践/荣誉奖项'],
    tags: ['升学', '科研', '成绩', '荣誉'],
    excludeTags: [],
    readmeTitle: '升学材料包',
    readmeIntro: '本包按「升学」模板导出，包含成绩、科研与荣誉奖项相关档案。'
  },
  答辩: {
    name: '答辩',
    description: '毕业设计 / 课程答辩所需的全过程材料',
    categories: ['学业档案/课程资料档案', '学业档案/作业考试档案', '学业档案/科研学业档案', '荣誉实践/科研创新'],
    tags: ['答辩', '课程', '科研'],
    excludeTags: [],
    readmeTitle: '答辩材料包',
    readmeIntro: '本包按「答辩」模板导出，包含课程资料、作业考试与科研创新相关档案。'
  }
};

export function getTemplate(name: ExportTemplateName): ExportTemplate {
  return TEMPLATES[name];
}

export function listTemplates(): ExportTemplate[] {
  return Object.values(TEMPLATES);
}

/** 判断档案是否命中模板 */
export function matchesTemplate(archive: Archive, name: ExportTemplateName): boolean {
  const t = TEMPLATES[name];
  const tags = archive.frontmatter.tags.map((x) => x.toLowerCase());
  if (t.excludeTags.some((x) => tags.includes(x.toLowerCase()))) return false;
  const byCategory = t.categories.includes(archive.frontmatter.category);
  const byTag = t.tags.some((x) => tags.includes(x.toLowerCase()));
  return byCategory || byTag;
}

/** 按模板筛选档案 */
export function selectByTemplate(archives: Archive[], name: ExportTemplateName): Archive[] {
  return archives.filter((a) => matchesTemplate(a, name));
}

export function templateReadme(name: ExportTemplateName, archives: Archive[], exportedAt: string): string {
  const t = TEMPLATES[name];
  const lines = archives
    .slice()
    .sort((a, b) => (b.frontmatter.date ?? '').localeCompare(a.frontmatter.date ?? ''))
    .map((a, i) => `${i + 1}. ${a.frontmatter.title}（${a.frontmatter.category}${a.frontmatter.date ? `，${a.frontmatter.date}` : ''}）`);
  return [
    `# ${t.readmeTitle}`,
    '',
    t.readmeIntro,
    '',
    `- 导出时间：${exportedAt}`,
    `- 档案数量：${archives.length}`,
    '',
    '## 清单',
    '',
    ...(lines.length ? lines : ['（无匹配档案）']),
    ''
  ].join('\n');
}
