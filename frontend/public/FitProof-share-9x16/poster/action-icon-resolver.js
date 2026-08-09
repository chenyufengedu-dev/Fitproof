const fs = require('node:fs')
const path = require('node:path')

const POSTER_ROOT = __dirname
const PROJECT_ROOT = path.resolve(POSTER_ROOT, '..')
const PRIMARY_ICON_ROOT = path.join(POSTER_ROOT, 'assets', 'action-icons')
const POSTER_ASSET_ROOT = path.join(POSTER_ROOT, 'assets')
const SKIPPED_DIRECTORIES = new Set(['.git', '.next', 'node_modules', 'output'])

const ICON_ALIASES = new Map(Object.entries({
  dry: 'hairdryer',
  dryer: 'hairdryer',
  'blow-dry': 'hairdryer',
  blowdryer: 'hairdryer',
  bath: 'shower',
  wash: 'shower',
  medicine: 'pill',
  medication: 'pill',
  clinic: 'doctor',
  medical: 'doctor',
  emergency: 'hospital',
  hydrate: 'water',
  hydration: 'water',
  drink: 'water',
  egg: 'food',
  milk: 'food',
  meat: 'food',
  veggie: 'food',
  grain: 'food',
  'oil-salt-sugar': 'food',
  'tea-coffee': 'water',
  alcohol: 'water',
  diet: 'food',
  meal: 'food',
  protein: 'food',
  recovery: 'rest',
  monitor: 'thermometer',
  measurement: 'thermometer',
  safe: 'check',
  safety: 'check',
}))

// Ordered from the most safety-critical/specific meaning to broad everyday
// actions. Only the first matching rule is used, keeping image generation
// deterministic for the same action copy.
const SEMANTIC_RULES = [
  ['hospital', /急救|急诊|立即就医|尽快就医|拨打\s*120|呼吸困难|意识不清|胸痛|emergency|hospital|urgent\s*care/i],
  ['doctor', /医生|医师|专业人士|专业人员|咨询|就诊|复诊|医疗机构|doctor|physician|consult|clinic/i],
  ['stop', /停止|停用|暂停|避免|不要|不可|禁止|远离|stop|avoid|do\s*not/i],
  ['thermometer', /体温|测温|发热|发烧|高热|temperature|fever|thermometer/i],
  ['bandage', /伤口|创口|包扎|敷料|擦伤|止血|wound|bandage|dressing/i],
  ['pill', /服药|用药|药物|药片|剂量|处方|medicine|medication|pill|dose/i],
  ['shower', /冲洗|淋浴|洗澡|清洗|清洁|洗头|rinse|shower|wash|clean/i],
  ['tub', /泡澡|浸泡|浴缸|坐浴|soak|bathtub|tub/i],
  ['hairdryer', /吹干|吹风|风筒|低温风|中低温|hair\s*dryer|blow[ -]?dry|dryer/i],
  ['water', /喝水|饮水|补水|水分|液体|饮料|茶|咖啡|drink|water|hydrate|fluid/i],
  ['food', /进食|饮食|膳食|食物|蛋白|鸡蛋|蛋黄|鱼|禽|肉|奶|豆|蔬菜|水果|主食|food|diet|meal|egg|protein/i],
  ['sleep', /睡眠|睡觉|入睡|熬夜|夜间|sleep|bedtime/i],
  ['rest', /休息|静养|放松|恢复|rest|recovery|relax/i],
  ['home', /居家|家中|在家|home/i],
  ['check', /确认|检查|合格|安全|可靠|观察反应|结合自身情况|check|verify|safe|reliable/i],
]

let cachedIconIndex

function normalizeIconName(value) {
  return String(value || '')
    .trim()
    .replace(/\.svg$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function collectSvgFiles(directory, files) {
  let entries
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) collectSvgFiles(fullPath, files)
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.svg') {
      files.push(fullPath)
    }
  }
}

function iconPriority(filePath) {
  if (isInside(PRIMARY_ICON_ROOT, filePath)) return 0
  if (isInside(POSTER_ASSET_ROOT, filePath)) return 1
  return 2
}

function discoverSvgIcons() {
  const files = []
  collectSvgFiles(PROJECT_ROOT, files)
  files.sort((left, right) => iconPriority(left) - iconPriority(right) || left.localeCompare(right, 'en'))
  const index = new Map()
  for (const filePath of files) {
    const name = normalizeIconName(path.basename(filePath))
    if (name && !index.has(name)) index.set(name, filePath)
  }
  return index
}

function iconIndex() {
  if (!cachedIconIndex) cachedIconIndex = discoverSvgIcons()
  return cachedIconIndex
}

function iconSource(filePath) {
  const relative = path.relative(POSTER_ROOT, filePath).split(path.sep).join('/')
  return encodeURI(relative)
}

function semanticIconName(action) {
  const narrative = `${action?.title || ''} ${action?.desc || ''}`.trim()
  const match = SEMANTIC_RULES.find(([, pattern]) => pattern.test(narrative))
  return match?.[0] || ''
}

function resolveActionIcon(action) {
  const files = iconIndex()
  const requested = normalizeIconName(action?.icon)
  const candidates = []
  const add = (name) => {
    const normalized = normalizeIconName(name)
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
  }

  // A meaningful upstream English name wins. `general` is deliberately
  // deferred so narrative copy still gets a more precise local SVG.
  if (requested && requested !== 'general') {
    add(requested)
    add(ICON_ALIASES.get(requested))
  }
  add(semanticIconName(action))
  if (requested === 'general') add('general')
  add(ICON_ALIASES.get(requested))
  add('general')

  for (const candidate of candidates) {
    const filePath = files.get(candidate)
    if (filePath) return iconSource(filePath)
  }

  // This branch only protects an incomplete hand-off package in which even
  // assets/action-icons/general.svg was omitted.
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="8" fill="none" stroke="%230A8B7E" stroke-width="2"/%3E%3Cpath d="M12 8v4l3 2" fill="none" stroke="%230A8B7E" stroke-width="2" stroke-linecap="round"/%3E%3C/svg%3E'
}

module.exports = {
  discoverSvgIcons,
  normalizeIconName,
  resolveActionIcon,
}
