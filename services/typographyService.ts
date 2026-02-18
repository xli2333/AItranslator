import { LayoutBlock, SemanticType, TextRole } from '../types';

const LEVEL_MIN = 1;
const LEVEL_MAX = 5;

const LEVEL_SCALE: Record<number, number> = {
  1: 0.78,
  2: 0.9,
  3: 1,
  4: 1.18,
  5: 1.36,
};

const DEFAULT_ROLE_BY_TYPE: Record<SemanticType, TextRole> = {
  header: 'meta',
  footer: 'footnote',
  h1: 'title',
  h2: 'subtitle',
  h3: 'subtitle',
  paragraph: 'body',
  list_item: 'body',
  caption: 'caption',
  quote: 'quote',
  callout: 'body',
  image: 'body',
};

const DEFAULT_LEVEL_BY_ROLE: Record<TextRole, number> = {
  title: 5,
  subtitle: 4,
  body: 3,
  quote: 3,
  caption: 2,
  footnote: 1,
  meta: 2,
};

const DEFAULT_LEVEL_BY_TYPE: Record<SemanticType, number> = {
  header: 2,
  footer: 1,
  h1: 5,
  h2: 4,
  h3: 4,
  paragraph: 3,
  list_item: 3,
  caption: 2,
  quote: 3,
  callout: 3,
  image: 3,
};

const ROLE_LEVEL_BOUNDS: Record<TextRole, [number, number]> = {
  title: [4, 5],
  subtitle: [3, 4],
  body: [2, 4],
  quote: [2, 4],
  caption: [1, 3],
  footnote: [1, 2],
  meta: [1, 2],
};

const TEXT_TYPES: SemanticType[] = [
  'header',
  'footer',
  'h1',
  'h2',
  'h3',
  'paragraph',
  'list_item',
  'caption',
  'quote',
  'callout',
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isTextType = (type: SemanticType) => TEXT_TYPES.includes(type);

const toInt = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 3;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const normalizeRole = (role: unknown, type: SemanticType): TextRole => {
  if (typeof role === 'string') {
    const candidate = role as TextRole;
    if (candidate in DEFAULT_LEVEL_BY_ROLE) {
      return candidate;
    }
  }
  return DEFAULT_ROLE_BY_TYPE[type] ?? 'body';
};

const normalizeLevel = (level: unknown, role: TextRole, type: SemanticType): number => {
  const [minByRole, maxByRole] = ROLE_LEVEL_BOUNDS[role];
  const fallback = DEFAULT_LEVEL_BY_TYPE[type] ?? DEFAULT_LEVEL_BY_ROLE[role];
  const raw = toInt(level) ?? fallback;
  return clamp(raw, Math.max(minByRole, LEVEL_MIN), Math.min(maxByRole, LEVEL_MAX));
};

type ResolvedTypography = {
  role: TextRole;
  sizeLevel: number;
};

const resolveBlockTypography = (block: LayoutBlock): ResolvedTypography => {
  const role = normalizeRole(block.textRole, block.type);
  const sizeLevel = normalizeLevel(block.sizeLevel, role, block.type);
  return { role, sizeLevel };
};

export const withTypographyDefaults = (block: LayoutBlock): LayoutBlock => {
  if (!isTextType(block.type)) return block;
  const resolved = resolveBlockTypography(block);
  return {
    ...block,
    textRole: resolved.role,
    sizeLevel: resolved.sizeLevel,
  };
};

export const harmonizeTypographyForBlocks = (blocks: LayoutBlock[]): LayoutBlock[] => {
  const normalized = blocks.map(withTypographyDefaults);
  const roleToLevels = new Map<TextRole, number[]>();

  for (const block of normalized) {
    if (!isTextType(block.type) || !block.textRole || !block.sizeLevel) continue;
    const current = roleToLevels.get(block.textRole) ?? [];
    current.push(block.sizeLevel);
    roleToLevels.set(block.textRole, current);
  }

  const roleLevel = new Map<TextRole, number>();
  (Object.keys(DEFAULT_LEVEL_BY_ROLE) as TextRole[]).forEach((role) => {
    const values = roleToLevels.get(role) ?? [];
    const [min, max] = ROLE_LEVEL_BOUNDS[role];
    const chosen = values.length > 0 ? median(values) : DEFAULT_LEVEL_BY_ROLE[role];
    roleLevel.set(role, clamp(chosen, min, max));
  });

  const bodyLevel = roleLevel.get('body') ?? DEFAULT_LEVEL_BY_ROLE.body;
  roleLevel.set('title', clamp(Math.max(roleLevel.get('title') ?? 5, bodyLevel + 1), 4, 5));
  roleLevel.set('subtitle', clamp(Math.max(roleLevel.get('subtitle') ?? 4, bodyLevel), 3, 4));
  roleLevel.set('caption', clamp(Math.min(roleLevel.get('caption') ?? 2, bodyLevel - 1), 1, 3));
  roleLevel.set('meta', clamp(Math.min(roleLevel.get('meta') ?? 2, bodyLevel - 1), 1, 2));
  roleLevel.set('footnote', clamp(Math.min(roleLevel.get('footnote') ?? 1, roleLevel.get('caption') ?? 2), 1, 2));

  return normalized.map((block) => {
    if (!isTextType(block.type)) return block;
    const role = normalizeRole(block.textRole, block.type);
    const [minRole, maxRole] = ROLE_LEVEL_BOUNDS[role];
    const candidate = roleLevel.get(role) ?? DEFAULT_LEVEL_BY_ROLE[role];
    return {
      ...block,
      textRole: role,
      sizeLevel: clamp(candidate, minRole, maxRole),
    };
  });
};

export const getTypographyScale = (block: LayoutBlock): number => {
  const { sizeLevel } = resolveBlockTypography(block);
  const baselineLevel = DEFAULT_LEVEL_BY_TYPE[block.type] ?? 3;
  const currentScale = LEVEL_SCALE[sizeLevel] ?? 1;
  const baselineScale = LEVEL_SCALE[baselineLevel] ?? 1;
  return clamp(currentScale / baselineScale, 0.75, 1.45);
};

export const getDefaultRoleForType = (type: SemanticType): TextRole => DEFAULT_ROLE_BY_TYPE[type] ?? 'body';
