import type { HistoryRecord } from '@/lib/history'
import type { VerifyResult } from '@/types'

/**
 * 演示用的预置核验记录。
 * 仅当本机没有任何真实记录时，「我的」页整页改用它——统计、等级、连续天数、话题、
 * 足迹、历史全部读这一份，页面上会明确标注「演示数据」。之所以必须同源：曾经统计读
 * 真实记录而话题和足迹读演示数据，于是「累计 0 条 / 还没有核验记录」和「话题各 4 条 +
 * 满格足迹图」同屏出现。
 * 不写入 localStorage：用户一旦产生真实记录就完全以真实为准。
 */

type Seed = {
  daysAgo: number
  topic: string
  claim: string
  verdict: string
  risk: '低' | '中' | '高'
  correction: string
}

// author/title 复用少量来源即可；重点是话题、结论与日期分布。
const SEEDS: Seed[] = [
  // —— 最近连续几天（让「连续核验」有数）
  { daysAgo: 0, topic: '孕期营养', claim: '孕妇每天必须额外补 2000 大卡才够', verdict: '疑似夸大', risk: '中', correction: '孕中晚期约增加 300~450 大卡即可，并非翻倍。' },
  { daysAgo: 1, topic: '减脂', claim: '不吃主食就能快速减脂不反弹', verdict: '有条件争议', risk: '中', correction: '短期可能掉秤，长期极低碳水难坚持且易反弹，需看总热量。' },
  { daysAgo: 2, topic: '睡眠', claim: '睡前一杯红酒助眠', verdict: '不建议采纳', risk: '高', correction: '酒精缩短深睡、加重后半夜觉醒，不推荐用于助眠。' },
  { daysAgo: 3, topic: '心血管健康', claim: '每天一万步是健康硬指标', verdict: '有条件争议', risk: '中', correction: '关键是规律活动，6000~8000 步已有明显获益，步数因人而异。' },
  { daysAgo: 4, topic: '膳食补剂', claim: '人人都该每天补维生素C预防感冒', verdict: '疑似夸大', risk: '中', correction: '常规饮食多已足量，补充C对预防感冒证据有限。' },
  // —— 往前散布
  { daysAgo: 0, topic: '增肌', claim: '增肌必须每天喝三勺蛋白粉', verdict: '疑似夸大', risk: '中', correction: '优先从日常饮食获取蛋白，约每公斤体重1.6g即可，粉是补充非必需。' },
  { daysAgo: 0, topic: '孕期营养', claim: '孕妇一口咖啡都不能碰', verdict: '有条件争议', risk: '中', correction: '多数指南建议每日咖啡因<200mg（约一小杯），并非绝对禁止。' },
  { daysAgo: 1, topic: '防脱发', claim: '洗发水含硅油会导致脱发', verdict: '不可信', risk: '高', correction: '硅油主要影响顺滑与堆积感，与脱发无因果证据。' },
  { daysAgo: 3, topic: '饮食误区', claim: '隔夜菜致癌不能吃', verdict: '疑似夸大', risk: '中', correction: '妥善冷藏并彻底加热风险有限，重点是储存与卫生。' },
  { daysAgo: 12, topic: '运动损伤', claim: '运动后立刻冰敷才科学', verdict: '有条件争议', risk: '中', correction: '急性肿痛可短时冰敷，但长时间冰敷可能延缓恢复，需分情况。' },
  { daysAgo: 14, topic: '心血管健康', claim: '喝红酒软化血管护心脏', verdict: '不建议采纳', risk: '高', correction: '任何剂量酒精都非心血管保护因素，不建议为护心而饮酒。' },
  { daysAgo: 16, topic: '减脂', claim: '过午不食能健康减肥', verdict: '有条件争议', risk: '中', correction: '本质是限制进食窗口减少总热量，长期营养均衡与可持续更关键。' },
  { daysAgo: 18, topic: '膳食补剂', claim: '胶原蛋白口服直接补到皮肤', verdict: '疑似夸大', risk: '中', correction: '口服后被消化为氨基酸，不定向补到皮肤，护肤证据有限。' },
  { daysAgo: 21, topic: '睡眠', claim: '每个人每天都必须睡满8小时', verdict: '有条件争议', risk: '低', correction: '成人7~9小时为参考区间，个体差异大，规律与质量同样重要。' },
  { daysAgo: 23, topic: '儿童饮食', claim: '孩子补钙越多长得越高', verdict: '疑似夸大', risk: '中', correction: '身高主要由遗传与整体营养决定，过量补钙无益甚至有风险。' },
  { daysAgo: 26, topic: '增肌', claim: '不练到力竭就等于白练', verdict: '有条件争议', risk: '低', correction: '接近力竭有效，但并非每组都要力竭，需兼顾容量与恢复。' },
  { daysAgo: 29, topic: '饮食误区', claim: '喝柠檬水能碱化体质防癌', verdict: '不可信', risk: '高', correction: '人体酸碱由生理调节，「酸碱体质」无科学依据。' },
  { daysAgo: 31, topic: '心血管健康', claim: '鸡蛋黄胆固醇高会堵血管', verdict: '较公认', risk: '低', correction: '健康人每天一个全蛋通常无需担心，重点看整体膳食模式。' },
  { daysAgo: 34, topic: '孕期营养', claim: '孕中晚期需适当增加优质蛋白', verdict: '较公认', risk: '低', correction: '鱼禽蛋瘦肉豆制品等优质蛋白适量增加，是常见孕期建议。' },
  { daysAgo: 37, topic: '减脂', claim: '代餐奶昔能替代所有正餐', verdict: '不建议采纳', risk: '高', correction: '长期全代餐易营养不均，仅可短期或部分替代并遵医嘱。' },
  { daysAgo: 41, topic: '运动损伤', claim: '拉伸能完全避免运动受伤', verdict: '疑似夸大', risk: '中', correction: '热身与循序渐进更关键，拉伸降低风险有限，不能「完全避免」。' },
  { daysAgo: 45, topic: '防脱发', claim: '生姜擦头皮能生发', verdict: '不可信', risk: '高', correction: '生姜刺激可能反而伤发，缺乏生发证据。' },
  { daysAgo: 52, topic: '睡眠', claim: '午睡越久下午越精神', verdict: '有条件争议', risk: '低', correction: '20~30分钟短睡更利于清醒，过长午睡易昏沉并影响夜眠。' },
  { daysAgo: 58, topic: '膳食补剂', claim: '鱼油人人都要常年吃', verdict: '有条件争议', risk: '中', correction: '普通人群常规补鱼油获益有限，是否需要因人而异。' },
  { daysAgo: 64, topic: '儿童饮食', claim: '儿童喝纯牛奶不如喝儿童牛奶', verdict: '疑似夸大', risk: '中', correction: '多数「儿童牛奶」含糖增味，普通纯牛奶通常更合适。' },
  { daysAgo: 71, topic: '饮食误区', claim: '无糖饮料完全健康可随便喝', verdict: '有条件争议', risk: '中', correction: '无糖优于含糖，但代糖并非「随便喝」，仍建议以水为主。' },
  { daysAgo: 79, topic: '增肌', claim: '深蹲伤膝盖应该少练', verdict: '不可信', risk: '中', correction: '姿势正确、循序渐进的深蹲通常有益膝关节，而非伤膝。' },
  { daysAgo: 86, topic: '心血管健康', claim: '每天快走30分钟有益心血管', verdict: '较公认', risk: '低', correction: '规律中等强度有氧对心血管有明确益处，是主流建议。' },
  { daysAgo: 94, topic: '减脂', claim: '只做局部动作就能瘦肚子', verdict: '不可信', risk: '中', correction: '不存在局部减脂，需整体热量缺口配合力量与有氧。' },
  { daysAgo: 103, topic: '孕期营养', claim: '孕妇吃燕窝宝宝更聪明', verdict: '疑似夸大', risk: '中', correction: '燕窝营养有限，「更聪明」无证据，均衡饮食更重要。' },
  { daysAgo: 112, topic: '睡眠', claim: '睡前玩手机不影响入睡', verdict: '不建议采纳', risk: '中', correction: '屏幕蓝光与信息刺激会延迟入睡，建议睡前减少使用。' },
  { daysAgo: 121, topic: '饮食误区', claim: '果汁等于水果同样健康', verdict: '疑似夸大', risk: '中', correction: '榨汁损失纤维、糖分集中，整果优于果汁。' },
]

function makeResult(verdict: string, risk: string, correction: string): VerifyResult {
  return {
    verdict,
    risk_level: risk,
    confidence: '',
    strength: '',
    correction,
    cited_evidence_ids: [],
    evidence: [],
    evidence_status: 'matched',
  }
}

const SIGNAL_BY_RISK: Record<string, string> = { 低: '较公认', 中: '疑似夸大', 高: '疑似夸大' }

/** 生成演示历史记录（createdAt 基于当前时间回推，热力图/连续天数即时有数）。 */
export function demoHistory(): HistoryRecord[] {
  const now = Date.now()
  const day = 86_400_000
  return SEEDS.map((s, index) => ({
    id: `demo-${index}`,
    claim: s.claim,
    signal: SIGNAL_BY_RISK[s.risk] || '疑似夸大',
    topic: s.topic,
    reference: { author: '健康科普内容', title: '来自短视频的健康说法', url: '' },
    result: makeResult(s.verdict, s.risk, s.correction),
    // 同一天多条也可，热力图会自然叠深；加少许小时偏移让排序稳定
    createdAt: new Date(now - s.daysAgo * day - index * 60_000).toISOString(),
  }))
}
