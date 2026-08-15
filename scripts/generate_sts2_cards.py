#!/usr/bin/env python3
"""从 Flex Games Wiki 的 STS2 卡牌数据库 JSON 生成 src/data/sts2_cards.ts。

用法：
    curl -sL https://flex.shunshu-labo.org/sts2-data/cards.json -o /tmp/sts2_cards.json
    python3 scripts/generate_sts2_cards.py /tmp/sts2_cards.json

卡名/描述/费用/稀有度/升级为游戏真实数据；effects 为可解析部分的近似
（伤害/格挡/抽牌/能量/状态/宝珠/星辰/灵魂/灾厄等），复杂机制保留原文描述
并在文档中标注待精修。跳过与现有 BASE_CARDS 冲突的 id（保留手工精修版本）。
"""

import json
import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
SRC_CARDS = ROOT / "src" / "data" / "cards.ts"
OUTPUT = ROOT / "src" / "data" / "sts2_cards.ts"

CHAR_MAP = {
    "ironclad": "warrior",
    "silent": "silent",
    "defect": "defect",
    "necrobinder": "necrobinder",
    "regent": "regent",
}
CHAR_ART = {
    "warrior": "⚔️",
    "silent": "🗡️",
    "defect": "🔮",
    "necrobinder": "💀",
    "regent": "👑",
    None: "⭐",
}
CHAR_COLOR = {
    "ironclad": "#8B0000",
    "silent": "#2E8B57",
    "defect": "#1E90FF",
    "necrobinder": "#4B0082",
    "regent": "#8B008B",
    "colorless": "#808080",
}
RARITY_MAP = {
    "Starter": "starter",
    "Basic": "starter",
    "Common": "common",
    "Uncommon": "uncommon",
    "Rare": "rare",
    "Special": "rare",
}

# 官方英文卡名 → 中文译名（STS1 沿用通行中文译名，STS2 新卡按字面/机制翻译）。
CARD_NAMES_ZH = {
    "aggression": "好战", "anger": "愤怒", "armaments": "军备", "ashen_strike": "灰烬打击",
    "barricade": "壁垒", "bash": "痛击", "battle_trance": "战斗狂热", "blood_wall": "血墙",
    "bloodletting": "放血", "bludgeon": "重击", "body_slam": "身体冲撞", "brand": "烙印",
    "break": "破裂", "breakthrough": "突破", "bully": "欺凌", "burning_pact": "燃烧契约",
    "cascade": "连锁", "cinder": "余烬", "colossus": "巨像", "conflagration": "大火灾",
    "corruption": "腐化", "crimson_mantle": "猩红披风", "cruelty": "残忍", "dark_embrace": "黑暗拥抱",
    "defend_ironclad": "防御（铁甲）", "demon_form": "恶魔形态", "demonic_shield": "恶魔之盾",
    "dismantle": "拆解", "dominate": "压制", "drum_of_battle": "战鼓", "evil_eye": "邪眼",
    "expect_a_fight": "期待战斗", "feed": "进食", "feel_no_pain": "无痛感", "fiend_fire": "恶魔之火",
    "fight_me": "来战", "flame_barrier": "火焰屏障", "forgotten_ritual": "遗忘仪式", "grapple": "擒抱",
    "havoc": "浩劫", "headbutt": "头槌", "hellraiser": "引魔人", "hemokinesis": "鲜血魔法",
    "howl_from_beyond": "彼方嚎叫", "impervious": "坚不可摧", "infernal_blade": "地狱之刃",
    "inferno": "地狱火", "inflame": "燃烧", "iron_wave": "铁波", "juggernaut": "主宰",
    "juggling": "抛接", "mangle": "撕裂", "molten_fist": "熔岩之拳", "not_yet": "还没完",
    "offering": "献祭", "one_two_punch": "左右连击", "pacts_end": "契约终结",
    "perfected_strike": "完美打击", "pillage": "掠夺", "pommel_strike": "剑柄打击",
    "primal_force": "原始之力", "pyre": "火葬堆", "rage": "狂怒", "rampage": "暴走",
    "rupture": "裂伤", "second_wind": "喘息", "setup_strike": "预备打击", "shrug_it_off": "耸肩",
    "spite": "怨恨", "stampede": "践踏", "stoke": "添柴", "stomp": "重踏", "stone_armor": "石甲",
    "strike_ironclad": "打击（铁甲）", "sword_boomerang": "飞剑回旋", "tank": "坦克",
    "taunt": "嘲讽", "tear_asunder": "撕成两半", "thrash": "痛殴", "thunderclap": "雷鸣",
    "tremble": "颤抖", "true_grit": "坚毅", "twin_strike": "双连斩", "unmovable": "岿然不动",
    "unrelenting": "毫不留情", "uppercut": "上勾拳", "vicious": "凶残", "whirlwind": "旋风斩",
    "midnight": "午夜", "blaze": "烈焰", "outrage": "义愤",
    "abrasive": "磨砺", "accelerant": "助燃剂", "accuracy": "精准", "acrobatics": "杂技",
    "adrenaline": "肾上腺素", "afterimage": "残影", "anticipate": "预判", "assassinate": "刺杀",
    "backflip": "后空翻", "backstab": "背刺", "blade_dance": "刀舞", "blade_of_ink": "墨刃",
    "blur": "模糊", "bouncing_flask": "弹跳药瓶", "bubble_bubble": "泡泡", "bullet_time": "子弹时间",
    "burst": "爆发", "calculated_gamble": "精算赌局", "cloak_and_dagger": "斗篷与匕首",
    "corrosive_wave": "腐蚀波", "dagger_spray": "飞刀散射", "dagger_throw": "掷刀", "dash": "突进",
    "deadly_poison": "致命毒药", "defend_silent": "防御（静默）", "deflect": "偏斜",
    "dodge_and_roll": "闪转腾挪", "echoing_slash": "回声斩", "envenom": "淬毒",
    "escape_plan": "逃脱计划", "expertise": "专长", "expose": "暴露", "fan_of_knives": "刀扇",
    "finisher": "终结技", "flanking": "侧翼", "flechettes": "飞镖", "flick_flack": "弹跳",
    "follow_through": "顺势追击", "scare": "惊吓", "footwork": "步法", "grand_finale": "华丽收场",
    "hand_trick": "手部戏法", "haze": "迷雾", "hidden_daggers": "暗藏飞刀", "infinite_blades": "无尽刀锋",
    "knife_trap": "刀陷阱", "leading_strike": "先手打击", "leg_sweep": "扫堂腿", "malaise": "萎靡",
    "master_planner": "谋士", "memento_mori": "勿忘终将一死", "mirage": "海市蜃楼", "murder": "谋杀",
    "neutralize": "中和", "nightmare": "噩梦", "noxious_fumes": "毒雾", "outbreak": "瘟疫爆发",
    "phantom_blades": "幻影刀锋", "piercing_wail": "刺耳尖啸", "pinpoint": "精准点刺",
    "poisoned_stab": "淬毒刺击", "pounce": "猛扑", "precise_cut": "精准切割", "predator": "掠食者",
    "prepared": "有备无患", "reflex": "反射", "ricochet": "弹射", "serpent_form": "蛇形",
    "shadow_step": "影步", "shadowmeld": "融影", "skewer": "穿刺", "slice": "切割",
    "snakebite": "蛇咬", "sneaky": "鬼祟", "speedster": "极速者", "storm_of_steel": "钢铁风暴",
    "strangle": "绞杀", "strike_silent": "打击（静默）", "sucker_punch": "偷袭", "suppress": "压制",
    "survivor": "幸存者", "tactician": "战术家", "the_hunt": "狩猎", "tools_of_the_trade": "行商工具",
    "tracking": "追踪", "untouchable": "不可触碰", "up_my_sleeve": "袖中乾坤",
    "well_laid_plans": "缜密计划", "wraith_form": "幽魂形态", "blade_symphony": "刀锋交响",
    "concoct": "调配", "fade": "消隐",
    "adaptive_strike": "自适应打击", "all_for_one": "一夫当关", "ball_lightning": "球状闪电",
    "barrage": "弹幕", "beam_cell": "光束细胞", "biased_cognition": "偏差认知", "boost_away": "助推弹开",
    "boot_sequence": "启动序列", "buffer": "缓冲", "bulk_up": "增肌", "capacitor": "电容器",
    "chaos": "混沌", "charge_battery": "充电电池", "chill": "寒流", "claw": "爪击",
    "cold_snap": "寒冰冲击", "compact": "紧凑", "compile_driver": "编译驱动", "consuming_shadow": "吞噬之影",
    "coolant": "冷却液", "coolheaded": "冷静头脑", "creative_ai": "创造型 AI", "darkness": "黑暗",
    "defend_defect": "防御（故障）", "defragment": "碎片整理", "double_energy": "双重能量",
    "dualcast": "双重充能", "echo_form": "回声形态", "energy_surge": "能量涌动", "feral": "野性",
    "fight_through": "硬闯", "flak_cannon": "高射炮", "focused_strike": "专注打击", "ftl": "超光速",
    "fusion": "聚变", "genetic_algorithm": "遗传算法", "glacier": "冰川", "glasswork": "玻璃工艺",
    "go_for_the_eyes": "直击要害", "gunk_up": "堵塞", "hailstorm": "冰雹风暴", "helix_drill": "螺旋钻",
    "hologram": "全息影像", "hotfix": "热修复", "hyperbeam": "超光束", "ice_lance": "冰枪",
    "ignition": "点火", "iteration": "迭代", "leap": "跳跃", "lightning_rod": "避雷针",
    "loop": "循环", "machine_learning": "机器学习", "meteor_strike": "陨石冲击", "modded": "改装",
    "momentum_strike": "动量打击", "multi_cast": "多重释放", "null": "空值", "overclock": "超频",
    "quadcast": "四重充能", "rainbow": "彩虹", "reboot": "重启", "refract": "折射",
    "rocket_punch": "火箭拳", "scavenge": "拾荒", "scrape": "刮擦", "shadow_shield": "暗影护盾",
    "shatter": "碎裂", "signal_boost": "信号增强", "skim": "浏览", "smokestack": "烟囱",
    "spinner": "旋转器", "storm": "风暴", "strike_defect": "打击（故障）", "subroutine": "子程序",
    "sunder": "断裂", "supercritical": "超临界", "sweeping_beam": "扫射光束", "synchronize": "同步",
    "synthesis": "合成", "tempest": "暴风雨", "tesla_coil": "特斯拉线圈", "thunder": "雷霆",
    "trash_to_treasure": "变废为宝", "turbo": "涡轮", "uproar": "喧嚣", "voltaic": "伏特",
    "white_noise": "白噪音", "zap": "电击", "hibernate": "休眠", "one_for_all": "万众一心",
    "imitation_learning": "模仿学习",
    "afterlife": "来世", "banshees_cry": "女妖之嚎", "blight_strike": "枯萎打击", "bodyguard": "护卫",
    "bone_shards": "骨片", "borrowed_time": "借来的时间", "bury": "埋葬", "calcify": "钙化",
    "call_of_the_void": "虚空呼唤", "capture_spirit": "捕获灵魂", "cleanse": "净化",
    "countdown": "倒计时", "danse_macabre": "死亡之舞", "death_march": "死亡行军",
    "deathbringer": "死神使者", "deaths_door": "死亡之门", "debilitate": "衰弱",
    "defend_necrobinder": "防御（亡灵）", "defile": "亵渎", "defy": "抗拒", "delay": "拖延",
    "demesne": "领地", "devour_life": "吞噬生命", "dirge": "挽歌", "drain_power": "汲取力量",
    "dredge": "打捞", "eidolon": "幻灵", "end_of_days": "末日", "enfeebling_touch": "衰弱之触",
    "eradicate": "根除", "fear": "恐惧", "fetch": "取回", "flatten": "压扁",
    "forbidden_grimoire": "禁书", "friendship": "友谊", "glimpse_beyond": "窥见彼岸",
    "grave_warden": "守墓人", "graveblast": "墓穴冲击", "hang": "悬挂", "haunt": "萦绕",
    "high_five": "击掌", "invoke": "召令", "legion_of_bone": "骸骨军团", "lethality": "致命",
    "melancholy": "忧郁", "misery": "苦痛", "necro_mastery": "死灵精通", "negative_pulse": "负极脉冲",
    "neurosurge": "神经涌动", "no_escape": "无处可逃", "oblivion": "湮灭", "pagestorm": "书页风暴",
    "parse": "解析", "poke": "戳刺", "protector": "守护者", "pull_aggro": "吸引仇恨",
    "pull_from_below": "从下拖拽", "putrefy": "腐烂", "rattle": "咔嗒", "reanimate": "复生",
    "reap": "收割", "reaper_form": "死神形态", "reave": "收割灵魂", "right_hand_hand": "右手之手",
    "sacrifice": "牺牲", "scourge": "天灾", "sculpting_strike": "雕刻打击", "seance": "通灵",
    "sentry_mode": "哨兵模式", "severance": "断绝", "shared_fate": "共命运", "shroud": "裹尸布",
    "sic_em": "上啊", "sleight_of_flesh": "血肉戏法", "snap": "折断", "soul_storm": "灵魂风暴",
    "sow": "播种", "spirit_of_ash": "灰烬之灵", "spur": "鞭策", "squeeze": "挤压",
    "strike_necrobinder": "打击（亡灵）", "the_scythe": "大镰刀", "times_up": "时间到",
    "transfigure": "变形", "undeath": "不死", "unleash": "释放", "veilpiercer": "破纱者",
    "wisp": "幽光", "underworld": "冥界", "soulbound": "灵魂绑定", "cacophony": "刺耳噪音",
    "alignment": "调和", "arsenal": "军械库", "astral_pulse": "星界脉冲", "beat_into_shape": "千锤百炼",
    "begone": "退散", "big_bang": "大爆炸", "black_hole": "黑洞", "bombardment": "炮轰",
    "bulwark": "壁垒", "bundle_of_joy": "欢乐包", "celestial_might": "天界之力", "charge": "冲锋",
    "child_of_the_stars": "星辰之子", "cloak_of_stars": "星辰斗篷", "collision_course": "碰撞航线",
    "comet": "彗星", "conqueror": "征服者", "convergence": "汇聚", "cosmic_indifference": "宇宙的漠然",
    "crash_landing": "坠落", "crescent_spear": "新月长枪", "crush_under": "碾碎",
    "decisions_decisions": "抉择", "defend_regent": "防御（储君）", "devastate": "毁灭",
    "dying_star": "垂死之星", "falling_star": "坠星", "foregone_conclusion": "注定的结局",
    "furnace": "熔炉", "gamma_blast": "伽马爆发", "gather_light": "聚光", "genesis": "创世纪",
    "glimmer": "微光", "glitterstream": "闪光流", "glow": "辉光", "guards": "卫兵",
    "guiding_star": "启明星", "hammer_time": "锤击时刻", "heavenly_drill": "天界钻", "hegemony": "霸权",
    "heirloom_hammer": "传家锤", "hidden_cache": "隐秘宝库", "i_am_invincible": "我不可战胜",
    "kingly_kick": "王者踢击", "kingly_punch": "王者重拳", "knockout_blow": "击倒一击",
    "know_thy_place": "认清你的位置", "largesse": "慷慨", "lunar_blast": "月之爆", "make_it_so": "如我所愿",
    "manifest_authority": "彰显权威", "meteor_shower": "流星雨", "monarchs_gaze": "君主凝视",
    "monologue": "独白", "neutron_aegis": "中子护盾", "orbit": "轨道", "pale_blue_dot": "暗淡蓝点",
    "parry": "招架", "particle_wall": "粒子墙", "patter": "碎碎念", "photon_cut": "光子切割",
    "pillar_of_creation": "创世之柱", "prophesize": "预言", "quasar": "类星体", "radiate": "辐射",
    "refine_blade": "淬炼剑刃", "reflect": "反射", "resonance": "共鸣", "royal_gamble": "皇家豪赌",
    "royalties": "王室贡金", "seeking_edge": "追刃", "seven_stars": "七星", "shining_strike": "闪耀打击",
    "solar_strike": "太阳打击", "spectrum_shift": "光谱位移", "spoils_of_battle": "战利品",
    "stardust": "星尘", "strike_regent": "打击（储君）", "summon_forth": "召唤而来",
    "supermassive": "超大质量", "sword_sage": "剑圣", "terraforming": "地形改造",
    "the_sealed_throne": "封印王座", "the_smith": "铁匠", "tyranny": "暴政", "venerate": "尊崇",
    "void_form": "虚空形态", "wrought_in_war": "战火铸就", "plot": "谋划", "constellation": "星宿",
    "tutor": "导师",
    "alchemize": "炼金", "anointed": "涂油", "automation": "自动化", "beacon_of_hope": "希望灯塔",
    "beat_down": "痛殴", "believe_in_you": "相信你", "bolas": "捕兽索", "calamity": "灾难",
    "catastrophe": "大灾变", "coordinate": "协同", "dark_shackles": "黑暗镣铐", "discovery": "发现",
    "dramatic_entrance": "闪亮登场", "entropy": "熵", "equilibrium": "均衡", "eternal_armor": "永恒装甲",
    "fasten": "系紧", "finesse": "巧技", "fisticuffs": "拳斗", "flash_of_steel": "钢铁闪光",
    "gang_up": "群起而攻", "gold_axe": "金斧", "hand_of_greed": "贪婪之手", "hidden_gem": "隐藏宝石",
    "huddle_up": "聚拢", "impatience": "焦躁", "intercept": "拦截", "jack_of_all_trades": "万事通",
    "jackpot": "头奖", "knockdown": "击倒", "lift": "托举", "master_of_strategy": "策略大师",
    "mayhem": "混乱", "mimic": "模仿", "mind_blast": "精神冲击", "nostalgia": "怀旧",
    "omnislice": "全斩", "panache": "潇洒", "panic_button": "紧急按钮", "prep_time": "备战时间",
    "production": "量产", "prolong": "延长", "prowess": "武艺", "purity": "纯净", "rally": "重整旗鼓",
    "rend": "撕裂", "restlessness": "躁动", "rolling_boulder": "滚石", "salvo": "齐射",
    "scrawl": "潦草字条", "secret_technique": "秘技", "secret_weapon": "秘密武器",
    "seeker_strike": "追踪打击", "shockwave": "冲击波", "splash": "溅射", "stratagem": "计谋",
    "tag_team": "车轮战", "the_bomb": "炸弹", "the_gambit": "弃子战术", "thinking_ahead": "未雨绸缪",
    "thrumming_hatchet": "嗡鸣短斧", "ultimate_defend": "终极防御", "ultimate_strike": "终极打击",
    "volley": "齐发", "the_ball": "那颗球",
}
STATUS_IDS = {
    "strength": "strength",
    "dexterity": "dexterity",
    "thorns": "thorns",
    "intangible": "intangible",
    "artifact": "artifact",
    "ritual": "ritual",
    "metallicize": "metallicize",
    "weak": "weak",
    "vulnerable": "vulnerable",
    "poison": "poison",
    "frail": "frail",
    "doom": "doom",
}
ORB_IDS = {"lightning": "lightning", "frost": "frost", "dark": "dark", "glass": "glass"}


def existing_card_ids() -> set:
    text = SRC_CARDS.read_text(encoding="utf-8")
    return set(re.findall(r'id: "([a-z0-9_]+)"', text))


def split_sentences(desc: str) -> list:
    desc = desc.replace("\n", " ")
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", desc) if s.strip()]


STATUS_ZH = {
    "Weak": "虚弱",
    "Vulnerable": "易伤",
    "Poison": "中毒",
    "Frail": "脆弱",
    "Doom": "灾厄",
    "Strength": "力量",
    "Dexterity": "敏捷",
    "Thorns": "荆棘",
    "Intangible": "虚无",
    "Artifact": "人工制品",
    "Ritual": "仪式",
    "Metallicize": "金属化",
}
ORB_ZH = {"Lightning": "闪电", "Frost": "冰霜", "Dark": "黑暗", "Glass": "玻璃"}

# 无法模板化的常见特殊句：精确匹配（小写）→ 中文。
SPECIAL_ZH = {
    "exhaust 1 card": "消耗 1 张牌",
    "exhaust a card": "消耗 1 张牌",
    "upgrade a card in your hand": "升级手牌中的 1 张牌",
    "upgrade all cards in your hand": "升级手牌中的所有牌",
    "put a random attack from your discard pile into your hand and upgrade it": "每回合开始时，从弃牌堆随机取 1 张攻击牌入手并升级它",
    "at the start of your turn, put a random attack from your discard pile into your hand and upgrade it": "每回合开始时，从弃牌堆随机取 1 张攻击牌入手并升级它",
    "deal damage equal to your block": "造成等同于你格挡值的伤害",
    "deal damage equal to twice your block": "造成等同于两倍格挡值的伤害",
    "block is not removed at the start of your turn": "你的格挡不会在回合开始时被清除",
    "skills cost 0 . whenever you play a skill, exhaust it": "技能牌费用变为 0；打出技能牌时将其消耗",
    "you cannot draw additional cards this turn": "本回合你无法再抽牌",
    "poison is triggered 1 additional time": "中毒每回合多触发 1 次",
    "poison is triggered 2 additional time": "中毒每回合多触发 2 次",
    "shivs deal 4 additional damage": "飞刀额外造成 4 点伤害",
    "shivs deal 6 additional damage": "飞刀额外造成 6 点伤害",
    "vulnerable enemies take an additional 25% damage": "易伤敌人额外受到 25% 伤害",
    "vulnerable enemies take an additional 50% damage": "易伤敌人额外受到 50% 伤害",
    "the first time you lose hp each turn, heal hp equal to the amount lost": "每回合首次失去生命时，回复等量生命",
    "every time you lose hp, gain 1 strength": "每当你失去生命，获得 1 点力量",
    "every time you lose hp, gain 2 strength": "每当你失去生命，获得 2 点力量",
    "whenever a card is exhausted, draw 1 card": "每当你消耗一张牌，抽 1 张牌",
    "whenever a card is exhausted, gain 1 block": "每当你消耗一张牌，获得 1 点格挡",
    "whenever you play an attack, gain 1 strength this turn": "每当你打出攻击牌，本回合获得 1 点力量",
    "draw cards equal to the number of cards in your exhaust pile": "抽等同于消耗堆牌数的牌",
    "add a shiv into your hand": "将 1 张飞刀加入手牌",
    "add 2 shivs into your hand": "将 2 张飞刀加入手牌",
    "add 3 shivs into your hand": "将 3 张飞刀加入手牌",
    "ethereal": "虚无",
    "exhaust": "消耗",
}

# 「每当/每次 X，Y」句型中的 X 短语翻译。
PHRASE_ZH = {
    "you play a skill": "你打出技能牌",
    "you play an attack": "你打出攻击牌",
    "you play an attack this turn": "你本回合打出攻击牌",
    "you play a power": "你打出一张能力牌",
    "you play a card": "你打出一张牌",
    "you play a card this turn": "你本回合打出牌",
    "you play a card that costs 1 energy or more": "你打出费用 ≥1 的牌",
    "you play a colorless card": "你打出无色牌",
    "you play a curse": "你打出诅咒牌",
    "a card is exhausted": "一张牌被消耗",
    "you gain block": "你获得格挡",
    "you gain block on your turn": "你回合内获得格挡",
    "you gain block this turn": "你本回合获得格挡",
    "you lose hp": "你失去生命",
    "you lose hp on your turn": "你回合内失去生命",
    "you draw a card": "你抽到一张牌",
    "you draw a card during your turn": "你回合内抽牌",
    "you draw this card": "你抽到这张牌",
    "you gain energy": "你获得能量",
    "you take damage": "你受到伤害",
    "an enemy dies": "一名敌人死亡",
    "anyone dies": "任意单位死亡",
    "you attack": "你攻击",
    "you attack an enemy": "你攻击敌人",
    "osty loses hp": "骷髅护卫失去生命",
    "osty hits this enemy this turn": "骷髅护卫本回合击中该敌人",
    "another player attacks an enemy": "另一名玩家攻击敌人（暂无队友系统）",
    "you apply vulnerable": "你施加易伤",
    "you apply doom": "你施加灾厄",
    "you apply a debuff to an enemy": "你对敌人施加负面状态",
    "you create a status card": "你创造状态牌",
    "you create a status": "你创造状态",
    "you create a card": "你创造卡牌",
    "you spend or gain a star": "你消耗或获得星辰",
    "you spend a star": "你消耗星辰",
    "you shuffle your draw pile": "你洗牌",
    "you evoke lightning": "你打出闪电宝珠",
    "you play sovereign blade": "你打出主权之刃",
    "you forge": "你锻造",
    "you play an ethereal card": "你打出虚无牌",
    "you play 5 cards in a single turn": "你单回合打出 5 张牌",
    "an attack deals unblocked damage": "攻击造成未被格挡的伤害",
    "an attack deals damage": "攻击造成伤害",
    "attacks deal damage": "攻击造成伤害",
}


def phrase_zh(trigger: str) -> str:
    """按包含关系匹配触发短语（如「you play an attack this turn」匹配
    「you play an attack」）。"""
    for key, value in PHRASE_ZH.items():
        if key in trigger:
            return value
    return trigger

# 招牌卡风味文案（趣味卡面描述，不参与游戏逻辑）。按角色分批扩充。
FLAVOR_ZH = {
    "whirlwind": "剑刃掀起的气流，足以让空气都燃烧起来。",
    "demon_form": "体内的恶魔终于撕破了皮囊。",
    "corruption": "正义与代价，本是一体两面。",
    "impervious": "盾墙之后，是无坚不摧的意志。",
    "bludgeon": "用最笨重的方式，解决最顽固的问题。",
    "feed": "在尖塔里，强大的人才有资格吃饱。",
    "offering": "献出鲜血，换取力量——尖塔从不做亏本买卖。",
    "barricade": "只要他不退，就没有人能让城墙后退。",
    "hemokinesis": "血是武器，也是燃料。",
    "fiend_fire": "地狱的火焰，以卡牌为柴。",
    "adrenaline": "生死一线时，心脏比头脑先动。",
    "neutralize": "一击之后，对手甚至来不及感到疼痛。",
    "backstab": "正面是礼貌，背后是效率。",
    "catalyst": "毒药的尽头，是彻底的溶解。",
    "nightmare": "它会在你最深的梦里，数清你的呼吸。",
    "wraith_form": "当猎手化作幽魂，猎物便无处可藏。",
    "grand_finale": "所有的铺垫，只为这一秒的谢幕。",
    "blade_dance": "刀刃划过之处，月光都要让路。",
    "bullet_time": "慢下来，世界就全是破绽。",
    "claw": "锈迹斑斑的爪子，会记得每一场战斗。",
    "hyperbeam": "光的尽头，是灰烬。",
    "meteor_strike": "坠落的天体，不在乎地面是谁。",
    "echo_form": "先听见回音，再看见本体。",
    "genetic_algorithm": "每一次失败，都是一次进化。",
    "reboot": "重启之后，错误也成了经验。",
    "sunder": "切断的不只是躯体，还有未来。",
    "reaper_form": "当死神拿起镰刀，灵魂便有了定价。",
    "soul_storm": "千百个亡灵同时开口，便是风暴。",
    "afterlife": "死亡对亡灵契约师而言，只是搬家。",
    "reanimate": "躺下的人，也会被重新叫醒。",
    "legion_of_bone": "一支军队，从墓地里站了起来。",
    "the_scythe": "镰刀划过，世界安静了一秒。",
    "oblivion": "比死亡更彻底的，是遗忘。",
    "devour_life": "它吃掉的不只是生命，还有来世。",
    "big_bang": "一切的开始与结束，是同一声巨响。",
    "black_hole": "连光都逃不出去的地方，王座也在那里。",
    "quasar": "星辰的余晖，也要臣服于王冠。",
    "void_form": "虚无之中，王座依然闪耀。",
    "sword_sage": "剑不在手里的时候，才算真正出鞘。",
    "pale_blue_dot": "从王座远眺，世间不过一粒尘埃。",
    "the_bomb": "倒计时结束前，最好离远一点。",
    "the_gambit": "输掉一枚棋子，赢下一整盘棋。",
    "master_of_strategy": "计划永远比敌人多一步。",
    "mayhem": "混乱不是敌人，而是机会。",
    "hand_of_greed": "这只手从不为空手而归而道歉。",
    "panic_button": "紧急时刻，按下去就对了。",
}

# 特殊机制卡的手写中文描述（规则翻译无法覆盖，逐张精修）。
CARD_DESC_ZH = {
    "havoc": "打出抽牌堆顶的牌，然后消耗它。",
    "juggernaut": "每当你获得格挡，对随机敌人造成 1 点伤害。",
    "one_two_punch": "本回合你的下 1 张攻击牌额外打出一次。",
    "stoke": "消耗全部手牌，每消耗 1 张牌抽 1 张。",
    "bullet_time": "本回合你无法再抽牌，所有手牌本回合可免费打出。",
    "burst": "本回合你的下 2 张技能牌额外打出一次。",
    "corrosive_wave": "每当你抽牌，对所有敌人施加 1 层中毒。",
    "fan_of_knives": "将 4 张飞刀加入手牌（飞刀改为打全体敌人）。",
    "knife_trap": "将消耗堆中所有飞刀打向该敌人。",
    "malaise": "敌人失去 X 点力量，施加 X 层虚弱。",
    "nightmare": "选择 1 张手牌，下回合将其 3 张复制加入手牌。",
    "noxious_fumes": "每回合开始时，对所有敌人施加 2 层中毒。",
    "serpent_form": "每当你打出一张牌，对随机敌人造成 4 点伤害。",
    "shadowmeld": "本回合获得的格挡翻倍。",
    "storm_of_steel": "弃置全部手牌，每弃 1 张将 1 张飞刀加入手牌。",
    "all_for_one": "造成 10 点伤害，将弃牌堆中所有 0 费牌抽入手。",
    "coolant": "每回合开始时，按你拥有的不同宝珠种类获得格挡。",
    "hailstorm": "每回合结束时，若拥有冰霜宝珠则对所有敌人造成 6 点伤害。",
    "ignition": "另一名玩家引导 1 颗等离子宝珠（暂无队友系统，近似自身）。",
    "signal_boost": "你打出的下一张能力牌额外打出一次。",
    "thunder": "每当你打出闪电宝珠，对每个命中的敌人造成 6 点伤害。",
    "voltaic": "引导与本场战斗已引导闪电等量的闪电宝珠。",
    "countdown": "每回合开始时，对随机敌人施加 1 层灾厄。",
    "debilitate": "造成 7 点伤害，本回合敌人身上的易伤与虚弱效果翻倍。",
    "oblivion": "每当你打出一张牌，对该敌人施加 3 层灾厄。",
    "pagestorm": "每当你抽到虚无牌，抽 1 张牌。",
    "seance": "将抽牌堆中 1 张牌变形为灵魂。",
    "snap": "骷髅护卫造成 7 点伤害，为手牌中 1 张牌附加保留。",
    "charge": "选择抽牌堆中 2 张牌变形为仆从突击。",
    "child_of_the_stars": "每当你消耗星辰，按消耗的星数获得格挡。",
    "convergence": "下回合获得 1 点能量和 1 点星辰，本回合保留手牌。",
    "guards": "将手牌中任意数量牌变形为仆从献祭。",
    "largesse": "另一名玩家将 1 张随机无色牌加入手牌（暂无队友系统，近似自身）。",
    "believe_in_you": "另一名玩家获得 1 点能量（暂无队友系统，近似自身）。",
    "coordinate": "给予另一名玩家本回合 1 点力量（暂无队友系统，近似自身）。",
    "discovery": "从 3 张随机牌中选择 1 张加入手牌，本回合可免费打出。",
    "gold_axe": "造成等同于本场战斗打出牌数的伤害。",
    "hidden_gem": "抽牌堆中 1 张随机牌获得重放 1。",
    "lift": "给予另一名玩家 1 点格挡（暂无队友系统，近似自身）。",
    "mind_blast": "造成等同于抽牌堆牌数的伤害。",
    "prolong": "下回合获得等同于当前格挡值的格挡。",
    "purity": "消耗手牌中至多 3 张牌。",
    "rolling_boulder": "每回合开始时，对所有敌人造成 5 点伤害，且每次伤害 +5。",
    "secret_technique": "将抽牌堆中 1 张技能牌抽入手。",
    "secret_weapon": "将抽牌堆中 1 张攻击牌抽入手。",
    "splash": "从另一名角色的 3 张随机攻击牌中选择 1 张加入手牌，本回合可免费打出。",
}


def translate_desc_zh(desc: str) -> str:
    """规则化翻译 STS2 效果描述；未覆盖的特殊句保留英文原文。"""
    if not desc:
        return desc
    parts = []
    for s in split_sentences(desc):
        low = s.lower().rstrip(".")
        t = None
        pre_rules = [
            (r"^forge (\d+)$", lambda m: f"锻造 {m.group(1)}（升级手牌中 {m.group(1)} 张随机牌）"),
            (r"^discard (\d+) cards?$", lambda m: f"弃置 {m.group(1)} 张手牌"),
            (r"^discard your hand$", lambda m: "弃置全部手牌"),
            (r"^next turn,? (.+)$", lambda m: f"下回合，{translate_desc_zh(m.group(1))}"),
            (
                r"^in (\d+) turns?,? (.+)$",
                lambda m: f"{m.group(1)} 回合后，{translate_desc_zh(m.group(2))}",
            ),
            (
                r"^at the start of your next turn,? (.+)$",
                lambda m: f"下回合开始时，{translate_desc_zh(m.group(1))}",
            ),
            (
                r"^at the start of your turn,? (.+)$",
                lambda m: f"每回合开始时，{translate_desc_zh(m.group(1))}",
            ),
            (
                r"^at the end of your turn,? (.+)$",
                lambda m: f"每回合结束时，{translate_desc_zh(m.group(1))}",
            ),
            (
                r"^whenever ([^,]+),? (.+)$",
                lambda m: f"每当{phrase_zh(m.group(1).strip())}，{translate_desc_zh(m.group(2))}",
            ),
            (
                r"^(?:every time|each time) ([^,]+),? (.+)$",
                lambda m: f"每次{phrase_zh(m.group(1).strip())}，{translate_desc_zh(m.group(2))}",
            ),
            (
                r"^you receive 50% less damage from vulnerable enemies this turn$",
                lambda m: "本回合来自易伤敌人的伤害减半",
            ),
            (
                r"^deals? (\d+) additional damage for each (card in your exhaust pile|vulnerable on the enemy|other attack you'?ve played this turn|attack already played this turn|skill played this turn|card in your hand|poison on the enemy)$",
                lambda m: {
                    "card in your exhaust pile": "消耗堆里的每张牌",
                    "vulnerable on the enemy": "敌人身上的每层易伤",
                    "other attack you've played this turn": "本回合打出的其他每张攻击牌",
                    "attack already played this turn": "本回合已打出的每张攻击牌",
                    "skill played this turn": "本回合打出的每张技能牌",
                    "card in your hand": "手牌中的每张牌",
                    "poison on the enemy": "敌人身上的每层中毒",
                }[m.group(2).strip().lower()]
                + f"额外造成 {m.group(1)} 点伤害",
            ),
            (
                r"^gain (\d+) (strength|dexterity|focus) this turn$",
                lambda m: f"本回合获得 {m.group(1)} 点{'集中' if m.group(2) == 'focus' else STATUS_ZH[m.group(2).title()]}",
            ),
            (r"^the next (attack|skill|power) you play costs 0$", lambda m: f"你打出的下一张{'攻击牌' if m.group(1) == 'attack' else '技能牌' if m.group(1) == 'skill' else '能力牌'}费用为 0"),
            (r"^costs 1 less for each (attack|skill) played this turn$", lambda m: f"本回合每打出 1 张{'攻击牌' if m.group(1) == 'attack' else '技能牌'}，费用 -1"),
            (r"^if fatal, (.+)$", lambda m: f"若此牌击杀敌人，{translate_desc_zh(m.group(1))}"),
            (r"^exhaust the top card of your draw pile$", lambda m: "消耗抽牌堆顶的 1 张牌"),
            (r"^enemy loses (\d+) (strength|dexterity) this turn$", lambda m: f"敌人本回合失去 {m.group(1)} 点{STATUS_ZH[m.group(2).title()]}"),
            (r"^all enemies lose (\d+) strength this turn$", lambda m: f"所有敌人本回合失去 {m.group(1)} 点力量"),
            (r"^apply (\d+) weak to all enemies$", lambda m: f"对所有敌人施加 {m.group(1)} 层虚弱"),
            (r"^gain (\d+) plating$", lambda m: f"获得 {m.group(1)} 层装甲"),
            (r"^gain (\d+) vigor$", lambda m: f"获得 {m.group(1)} 点活力"),
            (r"^deal (\d+) damage for each (attack|skill) (?:already played this turn|in your hand)$", lambda m: f"按本回合已打出的每张{'攻击牌' if m.group(1) else '技能牌'}造成 {m.group(1)} 点伤害"),
            (r"^draw cards until you have (\d+) in your hand$", lambda m: f"抽牌直到手牌达到 {m.group(1)} 张"),
            (r"^draw cards until your hand is full$", lambda m: "抽牌直到手牌补满"),
            (r"^play(s)? from the exhaust( pile)?$", lambda m: "从消耗堆打出"),
            (r"^double your energy$", lambda m: "能量翻倍"),
            (r"^exhaust your hand$", lambda m: "消耗全部手牌"),
            (
                r"^add a random (attack|skill|power) into your hand$",
                lambda m: f"将 1 张随机{'攻击牌' if m.group(1) == 'attack' else '技能牌' if m.group(1) == 'skill' else '能力牌'}加入手牌",
            ),
            (
                r"^put a card from your discard pile on top of your draw pile$",
                lambda m: "从弃牌堆取 1 张牌置于抽牌堆顶",
            ),
            (r"^retain up to 1 card$", lambda m: "保留至多 1 张手牌到下一回合"),
            (r"^play the top X cards of your draw pile$", lambda m: "打出抽牌堆顶的 X 张牌"),
            (r"^deal (\d+) damage to all enemies X times$", lambda m: f"对所有敌人造成 {m.group(1)} 点伤害 X 次"),
            (r"^deal (\d+) damage X times$", lambda m: f"造成 {m.group(1)} 点伤害 X 次"),
            (r"^evoke your rightmost orb X times$", lambda m: "打出最右侧宝珠 X 次"),
            (r"^enemy loses X strength$", lambda m: "敌人失去 X 点力量"),
            (r"^apply X (weak|vulnerable|poison|doom)$", lambda m: f"施加 X 层{STATUS_ZH[m.group(1).title()]}"),
            (r"^gain X (stars?|souls?|block|energy|focus)$", lambda m: f"获得 X 点{'星辰' if 'star' in m.group(1) else '灵魂' if 'soul' in m.group(1) else '格挡' if m.group(1) == 'block' else '能量' if m.group(1) == 'energy' else '集中'}"),
            (r"^spend X stars?$", lambda m: "消耗 X 点星辰"),
            (r"^spend X souls?$", lambda m: "消耗 X 点灵魂"),
            (r"^lose X hp$", lambda m: "失去 X 点生命"),
            (r"^gain X (strength|dexterity|thorns)$", lambda m: f"获得 X 点{STATUS_ZH[m.group(1).title()]}"),
            (
                r"^(.+) and (.+)$",
                lambda m: f"{translate_desc_zh(m.group(1))}，{translate_desc_zh(m.group(2))}",
            ),
            (r"^deal (\d+) damage twice$", lambda m: f"造成 {m.group(1)} 点伤害 2 次"),
            (r"^deal (\d+) damage to all enemies twice$", lambda m: f"对所有敌人造成 {m.group(1)} 点伤害 2 次"),
            (r"^deal (\d+) damage to a random enemy (\d+) times?$", lambda m: f"对随机敌人造成 {m.group(1)} 点伤害 {m.group(2)} 次"),
            (r"^deal (\d+) damage to a random enemy twice$", lambda m: f"对随机敌人造成 {m.group(1)} 点伤害 2 次"),
            (r"^it'?s free to play this turn$", lambda m: "本回合可免费打出"),
            (r"^retain your hand this turn$", lambda m: "本回合保留你的手牌"),
            (r"^put (\d+) cards? from your hand on top of your draw pile$", lambda m: f"将手牌中的 {m.group(1)} 张牌置于抽牌堆顶"),
            (r"^put a card from your discard pile into your hand$", lambda m: "从弃牌堆取 1 张牌入手"),
            (r"^play the top card of your draw pile$", lambda m: "打出抽牌堆顶的牌"),
            (r"^play the top x cards of your draw pile$", lambda m: "打出抽牌堆顶的 X 张牌"),
            (r"^draw (\d+) additional card$", lambda m: f"额外抽 {m.group(1)} 张牌"),
            (r"^draw 1 additional card$", lambda m: "额外抽 1 张牌"),
            (r"^gain (\d+) energy at the start of each turn$", lambda m: f"每回合开始时获得 {m.group(1)} 点能量"),
            (r"^the enemy takes double damage from other players this turn$", lambda m: "敌人本回合受到来自其他玩家的伤害翻倍（暂无队友系统）"),
            (r"^osty deals (\d+) damage\.?$", lambda m: f"骷髅护卫造成 {m.group(1)} 点伤害"),
            (r"^return this (?:card )?to your hand$", lambda m: "将本牌返回手牌"),
            (r"^add (\d+) random colorless cards? into your hand$", lambda m: f"将 {m.group(1)} 张随机无色牌加入手牌"),
            (r"^if the enemy is vulnerable, hits twice$", lambda m: "若敌人易伤，命中次数翻倍"),
            (r"^gain (\d+) strength for each vulnerable on the enemy$", lambda m: f"敌人身上每层易伤使你获得 {m.group(1)} 点力量"),
            (r"^gain another (\d+) block if you have exhausted a card this turn$", lambda m: f"若本回合消耗过牌，再获得 {m.group(1)} 点格挡"),
            (r"^raise your max hp by (\d+)$", lambda m: f"最大生命 +{m.group(1)}"),
            (r"^deal (\d+) damage for each card exhausted$", lambda m: f"每消耗 1 张牌造成 {m.group(1)} 点伤害"),
            (r"^the enemy gains (\d+) strength$", lambda m: f"敌人获得 {m.group(1)} 点力量"),
            (r"^if you exhausted a card this turn, gain (\d+) energy$", lambda m: f"若本回合消耗过牌，获得 {m.group(1)} 点能量"),
            (r"^you gain block this turn$", lambda m: "你本回合获得格挡"),
            (r"^deal (\d+) damage to the enemy$", lambda m: f"对敌人造成 {m.group(1)} 点伤害"),
            (r"^double the enemy'?s vulnerable$", lambda m: "将敌人的易伤翻倍"),
            (r"^this turn, your next (\d+) attacks? (?:is|are) played an extra time$", lambda m: f"本回合你的下 {m.group(1)} 张攻击牌额外打出一次"),
            (r"^can only be played if you have (\d+) or more cards in your exhaust pile\.?$", lambda m: f"仅当消耗堆有 {m.group(1)} 张以上牌时可打出"),
            (r"^deals (\d+) additional damage for all your cards containing .strike.$", lambda m: f"你每有一张含「打击」的牌，额外造成 {m.group(1)} 点伤害"),
            (r"^draw cards until you draw a non-attack card$", lambda m: "抽牌直到抽到非攻击牌"),
            (r"^skills cost 0 \.?$", lambda m: "技能牌费用为 0"),
            (r"^give another player block equal to your block$", lambda m: "将等同于你格挡值的格挡给予另一名玩家（暂无队友系统，近似）"),
            (r"^gain for each attack in your hand$", lambda m: "按手牌中每张攻击牌获得对应数值（效果待精修）"),
            (r"^transform all attacks in your hand into giant rock$", lambda m: "将手牌中所有攻击牌变形为巨石"),
            (r"^you play a card that costs (\d+) energy or more$", lambda m: f"你打出费用 ≥{m.group(1)} 的牌"),
            (r"^you draw this card$", lambda m: "你抽到这张牌"),
            (r"^you play an attack this turn$", lambda m: "你本回合打出攻击牌"),
            (r"^you lose hp on your turn$", lambda m: "你回合内失去生命"),
            (r"^(?:weak|vulnerable|poison|frail) to all enemies$", lambda m: f"对所有敌人施加{STATUS_ZH[m.group(0).split(' ')[0].title()]}"),
            (r"^add a copy of the third attack you play each turn into your hand$", lambda m: "每回合你打出的第 3 张攻击牌复制一张入手"),
            (r"^you draw a card containing .strike.$", lambda m: "你抽到含「打击」的牌"),
            (r"^it is played against a random enemy$", lambda m: "它被自动打向随机敌人"),
            (r"^the first time you gain block from a card each turn, double the amount gained$", lambda m: "每回合首次从卡牌获得格挡时，获得量翻倍"),
            (r"^you play a card this turn$", lambda m: "你本回合打出牌"),
            (r"^the enemy loses (\d+) strength this turn$", lambda m: f"敌人本回合失去 {m.group(1)} 点力量"),
            (r"^if (.+),? (.+)$", lambda m: f"若{translate_desc_zh(m.group(1))}，{translate_desc_zh(m.group(2))}"),
            (r"^if you (.+),? (.+)$", lambda m: f"若你{translate_desc_zh(m.group(1))}，{translate_desc_zh(m.group(2))}"),
            (r"^deals? (\d+) (?:additional )?damage for each (.+)$", lambda m: f"每{phrase_zh(m.group(2).strip().rstrip('.'))}额外造成 {m.group(1)} 点伤害"),
            (r"^gain (\d+) block for each (.+)$", lambda m: f"每{phrase_zh(m.group(2).strip().rstrip('.'))}获得 {m.group(1)} 点格挡"),
            (r"^gain (\d+) strength for each (.+)$", lambda m: f"每{phrase_zh(m.group(2).strip().rstrip('.'))}获得 {m.group(1)} 点力量"),
            (r"^draw (\d+) card for each (.+)$", lambda m: f"每{phrase_zh(m.group(2).strip().rstrip('.'))}抽 {m.group(1)} 张牌"),
            (r"^add (\d+) (shiv|soul|dazed|burn|wound|slimed|debris|fuel)s? into your (discard pile|hand|draw pile)$", lambda m: f"将 {m.group(1)} 张{'飞刀' if m.group(2)=='shiv' else '灵魂' if m.group(2)=='soul' else '眩晕' if m.group(2)=='dazed' else '灼伤' if m.group(2)=='burn' else '伤口' if m.group(2)=='wound' else '黏糊' if m.group(2)=='slimed' else '碎片' if m.group(2)=='debris' else '燃料'}加入{'弃牌堆' if 'discard' in m.group(3) else '手牌' if 'hand' in m.group(3) else '抽牌堆'}"),
            (r"^add (a|an|1) (shiv|soul|dazed|burn|wound|slimed|debris|fuel) into your (discard pile|hand|draw pile)$", lambda m: f"将 1 张{'飞刀' if m.group(2)=='shiv' else '灵魂' if m.group(2)=='soul' else '眩晕' if m.group(2)=='dazed' else '灼伤' if m.group(2)=='burn' else '伤口' if m.group(2)=='wound' else '黏糊' if m.group(2)=='slimed' else '碎片' if m.group(2)=='debris' else '燃料'}加入{'弃牌堆' if 'discard' in m.group(3) else '手牌' if 'hand' in m.group(3) else '抽牌堆'}"),
            (r"^reduce this card'?s cost by (\d+)$", lambda m: f"本牌费用 -{m.group(1)}"),
            (r"^reduce this card'?s cost by 1 energy whenever anyone dies$", lambda m: "每当任意单位死亡，本牌费用 -1"),
            (r"^reduce this card'?s cost to 0$", lambda m: "本牌费用变为 0"),
            (r"^increase this card'?s damage by (\d+) this combat$", lambda m: f"本牌本场战斗伤害 +{m.group(1)}"),
            (r"^permanently increase this card'?s (damage|block) by (\d+)$", lambda m: f"本牌永久{'伤害' if m.group(1)=='damage' else '格挡'} +{m.group(2)}"),
            (r"^upgrade (\d+) random cards? in your discard pile$", lambda m: f"升级弃牌堆中 {m.group(1)} 张随机牌"),
            (r"^put (\d+) cards from your discard pile into your hand$", lambda m: f"从弃牌堆取 {m.group(1)} 张牌入手"),
            (r"^evoke your rightmost orb (\d+) times?$", lambda m: f"打出最右侧宝珠 {m.group(1)} 次"),
            (r"^lose (\d+) (dexterity|focus|strength)$", lambda m: f"失去 {m.group(1)} 点{'敏捷' if m.group(2)=='dexterity' else '集中' if m.group(2)=='focus' else '力量'}"),
            (r"^apply (\d+) doom to yourself$", lambda m: f"对自己施加 {m.group(1)} 层灾厄"),
            (r"^if this is on top of your draw pile, play it$", lambda m: "若本牌在抽牌堆顶，打出它"),
            (r"^osty heals (\d+) hp$", lambda m: f"骷髅护卫回复 {m.group(1)} 点生命"),
            (r"^osty'?s attacks deal (\d+) additional damage$", lambda m: f"骷髅护卫的攻击额外造成 {m.group(1)} 点伤害"),
            (r"^all players? (gain|add|draw|summon) (.+)$", lambda m: f"所有玩家{translate_desc_zh(m.group(2))}（暂无队友系统，仅自身生效）"),
            (r"^another player (gains|adds|draws|channels|gives) (.+)$", lambda m: f"另一名玩家{translate_desc_zh(m.group(2))}（暂无队友系统，近似）"),
            (r"^give another player (.+)$", lambda m: f"给予另一名玩家{translate_desc_zh(m.group(1))}（暂无队友系统，近似）"),
            (r"^enemy loses (\d+) hp\.?$", lambda m: f"敌人失去 {m.group(1)} 点生命"),
            (r"^this card costs 0 if (.+)$", lambda m: f"若{translate_desc_zh(m.group(1))}，本牌费用为 0"),
            (r"^the next ethereal card you play costs 0$", lambda m: "你打出的下一张虚无牌费用为 0"),
            (r"^channel x (lightning|frost|dark|glass)$", lambda m: f"引导 X 颗{ORB_ZH[m.group(1).title()]}宝珠"),
            (r"^channel (\d+) random orbs?$", lambda m: f"引导 {m.group(1)} 颗随机宝珠"),
            (r"^channel (\d+) plasma$", lambda m: f"引导 {m.group(1)} 颗等离子宝珠"),
            (r"^channel x lightning$", lambda m: "引导 X 颗闪电宝珠"),
            (r"^evoke your rightmost orb x times$", lambda m: "打出最右侧宝珠 X 次"),
            (r"^trigger the passive ability of all dark orbs$", lambda m: "触发所有黑暗宝珠的被动效果"),
            (r"^trigger all lightning against the enemy$", lambda m: "将所有闪电宝珠打向该敌人"),
            (r"^osty has attacked this turn$", lambda m: "骷髅护卫本回合攻击过"),
            (r"^applies? (\d+) (weak|vulnerable|poison) to all enemies$", lambda m: f"对所有敌人施加 {m.group(1)} 层{STATUS_ZH[m.group(2).title()]}"),
            (r"^deals additional damage equal to osty'?s max hp$", lambda m: "额外造成等同于骷髅护卫最大生命的伤害"),
            (r"^hits an additional time for each other time he has attacked this turn$", lambda m: "骷髅护卫每多攻击一次，额外命中一次"),
            (r"^return this to your hand from the discard pile$", lambda m: "将本牌从弃牌堆返回手牌"),
            (r"^deals (\d+) additional damage for all your other osty attacks$", lambda m: f"你的其他每张骷髅护卫攻击牌额外造成 {m.group(1)} 点伤害"),
            (r"^deal damage equal to the enemy'?s doom$", lambda m: "造成等同于敌人灾厄层数的伤害"),
            (r"^add replay to a card in your hand\.?$", lambda m: "为手牌中 1 张牌附加重放"),
            (r"^it costs an extra (\d+) energy$", lambda m: f"其费用 +{m.group(1)}"),
            (r"^sovereign blade deals double damage to the enemy this turn$", lambda m: "主权之刃本回合对该敌人伤害翻倍"),
            (r"^sovereign blade now deals damage to all enemies$", lambda m: "主权之刃改为对所有敌人造成伤害"),
            (r"^sovereign blade now hits an additional time$", lambda m: "主权之刃额外命中一次"),
            (r"^put sovereign blade into your hand from anywhere$", lambda m: "将主权之刃从任意位置置入手牌"),
            (r"^gain 1 star$", lambda m: "获得 1 点星辰"),
            (r"^put (\d+) cards from your draw pile into your hand$", lambda m: f"将抽牌堆顶 {m.group(1)} 张牌抽入手"),
            (r"^choose 1 of 3 random colorless cards? to add into your hand$", lambda m: "从 3 张随机无色牌中选择 1 张加入手牌"),
            (r"^choose 1 of 3 random cards? to add into your hand$", lambda m: "从 3 张随机牌中选择 1 张加入手牌"),
            (r"^choose 1 of 3 cards in your draw pile to add into your hand$", lambda m: "从抽牌堆的 3 张牌中选择 1 张加入手牌"),
            (r"^put every rare card from your draw pile into your hand$", lambda m: "将抽牌堆中所有稀有牌抽入手"),
            (r"^play (\d+) random attacks? from your discard pile$", lambda m: f"从弃牌堆随机打出 {m.group(1)} 张攻击牌"),
            (r"^play (\d+) random cards? from your draw pile$", lambda m: f"从抽牌堆随机打出 {m.group(1)} 张牌"),
            (r"^procure a random potion$", lambda m: "获得 1 瓶随机药水"),
            (r"^gain block equal to damage dealt$", lambda m: "获得等同于造成伤害的格挡"),
            (r"^gain block equal to poison on all enemies$", lambda m: "获得等同于全体敌人中毒层数的格挡"),
            (r"^gain block equal to the block on another player$", lambda m: "获得等同于另一名玩家格挡值的格挡（暂无队友系统，近似）"),
            (r"^blocked attack damage is reflected to your attacker this turn$", lambda m: "本回合格挡的攻击伤害反弹给攻击者"),
            (r"^lose 2 strength\.?$", lambda m: "失去 2 点力量"),
            (r"^enemy loses 2 strength$", lambda m: "敌人失去 2 点力量"),
            (r"^discard all cards drawn this way that do not cost 0$", lambda m: "弃置以这种方式抽到且费用不为 0 的牌"),
            (r"^reduce this card'?s cost by 1$", lambda m: "本牌费用 -1"),
            (r"^gain an additional card reward$", lambda m: "获得额外的卡牌奖励"),
            (r"^gain 20 gold$", lambda m: "获得 20 金币"),
            (r"^(\d+) stars?$", lambda m: f"获得 {m.group(1)} 点星辰"),
            (r"^(\d+) energy$", lambda m: f"获得 {m.group(1)} 点能量"),
            (r"^(\d+) block$", lambda m: f"获得 {m.group(1)} 点格挡"),
            (r"^(\d+) souls?$", lambda m: f"获得 {m.group(1)} 点灵魂"),
        ]
        for pattern, fn in pre_rules:
            m = re.match(pattern, low)
            if m:
                t = fn(m)
                break
        if t is not None:
            parts.append(t)
            continue
        rules = [
            (r"^deal (\d+) damage (\d+) times?$", lambda m: f"造成 {m.group(1)} 点伤害 {m.group(2)} 次"),
            (r"^deal (\d+) damage to all enemies$", lambda m: f"对所有敌人造成 {m.group(1)} 点伤害"),
            (r"^deal (\d+) damage$", lambda m: f"造成 {m.group(1)} 点伤害"),
            (r"^gain (\d+) block$", lambda m: f"获得 {m.group(1)} 点格挡"),
            (
                r"^gain (\d+) (strength|dexterity|thorns|intangible|artifact|ritual|metallicize)$",
                lambda m: f"获得 {m.group(1)} 点{STATUS_ZH[m.group(2).title()]}",
            ),
            (
                r"^apply (\d+) (weak|vulnerable|poison|frail|doom)$",
                lambda m: f"施加 {m.group(1)} 层{STATUS_ZH[m.group(2).title()]}",
            ),
            (r"^draw (\d+) cards?$", lambda m: f"抽 {m.group(1)} 张牌"),
            (r"^gain (\d+) energy$", lambda m: f"获得 {m.group(1)} 点能量"),
            (r"^heal (\d+) hp?$", lambda m: f"回复 {m.group(1)} 点生命"),
            (r"^lose (\d+) hp$", lambda m: f"失去 {m.group(1)} 点生命"),
            (
                r"^channel (\d+) (lightning|frost|dark|glass)$",
                lambda m: f"引导 {m.group(1)} 颗{ORB_ZH[m.group(2).title()]}宝珠",
            ),
            (r"^gain (\d+) stars?$", lambda m: f"获得 {m.group(1)} 点星辰"),
            (r"^gain (\d+) souls?$", lambda m: f"获得 {m.group(1)} 点灵魂"),
            (r"^gain (\d+) focus$", lambda m: f"获得 {m.group(1)} 点集中"),
            (r"^spend (\d+) stars?$", lambda m: f"消耗 {m.group(1)} 点星辰"),
            (r"^spend (\d+) souls?$", lambda m: f"消耗 {m.group(1)} 点灵魂"),
            (r"^summon (\d+)$", lambda m: f"召唤 {m.group(1)} 点生命值的骷髅护卫"),
            (
                r"^add a copy of this card into your discard pile$",
                lambda m: "将本卡牌的一张复制加入弃牌堆",
            ),
            (
                r"^add (\d+) (shiv|soul)s? into your (?:discard pile|hand)$",
                lambda m: f"将 {m.group(1)} 张{'飞刀' if m.group(2) == 'shiv' else '灵魂'}加入{'弃牌堆' if 'discard' in m.group(0) else '手牌'}",
            ),
            (r"^exhaust (\d+) card", lambda m: f"消耗 {m.group(1)} 张牌"),
        ]
        for pattern, fn in rules:
            m = re.match(pattern, low)
            if m:
                t = fn(m)
                break
        if t is None:
            t = SPECIAL_ZH.get(low, s)
        parts.append(t)
    return "。".join(parts)


def parse_effects(desc: str, card_id: str) -> list:
    effects: list = []
    low = desc.lower()
    scaling_info = None
    for sentence in split_sentences(desc):
        s = sentence.lower()
        # 条件增伤子句（可能出现在伤害句之前或之后）。
        m = re.search(
            r"^deals? (\d+) additional damage for each (.+)$", s
        )
        if m:
            per_map = {
                "card in your exhaust pile": "exhaustPile",
                "vulnerable on the enemy": "vulnerable",
                "other attack you've played this turn": "attacksPlayed",
                "attack already played this turn": "attacksPlayed",
                "skill played this turn": "skillsPlayed",
                "card in your hand": "cardsInHand",
                "poison on the enemy": "poisonOnEnemy",
            }
            per = per_map.get(m.group(2).lower().strip())
            if per:
                scaling_info = {"per": per, "amount": int(m.group(1))}
            continue
        # 延迟/计数器：下回合 / X 回合后 / 下回合开始时。
        m = re.match(
            r"^(?:next turn|at the start of your next turn|in (\d+) turns?),? (.+)$",
            s,
        )
        if m:
            turns = int(m.group(1)) if m.group(1) else 1
            sub = m.group(2).strip().rstrip(".")
            sub_effects = parse_effects(sub, card_id)
            if sub_effects:
                label_zh = translate_desc_zh(sub)
                if turns > 1:
                    label_zh = f"{turns} 回合后，{label_zh}"
                else:
                    label_zh = f"下回合，{label_zh}"
                effects.append(
                    {
                        "op": "addCountdown",
                        "turns": turns,
                        "label": label_zh,
                        "icon": "⏳",
                        "effects": sub_effects,
                    }
                )
            continue
        # 锻造 / 弃牌。
        m = re.match(r"^forge (\d+)$", s)
        if m:
            effects.append({"op": "forge", "amount": int(m.group(1))})
            continue
        m = re.match(r"^discard (\d+) cards?$", s)
        if m:
            effects.append({"op": "discard", "amount": int(m.group(1))})
            continue
        if s == "discard your hand" or s.startswith("discard your hand"):
            effects.append({"op": "discard"})
            continue
        # 被动结构化：每回合开始/结束时、每当/每次 X 时 → passive 钩子。
        m = re.match(
            r"^at the start of (?:your |each )?turn,? (.+)$", s
        )
        if m:
            sub = parse_effects(m.group(1), card_id)
            if sub:
                effects.append(
                    {"op": "passive", "hook": "turnStart", "effects": sub}
                )
            continue
        m = re.match(r"^at the end of (?:your |each )?turn,? (.+)$", s)
        if m:
            sub = parse_effects(m.group(1), card_id)
            if sub:
                effects.append(
                    {"op": "passive", "hook": "turnEnd", "effects": sub}
                )
            continue
        m = re.match(
            r"^(?:whenever|every time|each time) ([^,]+),? (.+)$", s
        )
        if m:
            trigger = m.group(1).strip().lower()
            sub = parse_effects(m.group(2), card_id)
            hook = None
            if "play an attack" in trigger:
                hook = "attackPlayed"
            elif "play a skill" in trigger:
                hook = "skillPlayed"
            elif "play a power" in trigger:
                hook = "cardPlayed"
            elif "play a card" in trigger:
                hook = "cardPlayed"
            elif "gain block" in trigger:
                hook = "blockGained"
            elif "a card is exhausted" in trigger:
                hook = "cardExhausted"
            elif "deal damage" in trigger or "attack deals damage" in trigger:
                hook = "damageDealt"
            elif "draw a card" in trigger:
                hook = "drawCard"
            elif "lose hp" in trigger:
                hook = "receiveDamage"
            else:
                hook = "cardPlayed"
            if hook and sub:
                effects.append(
                    {"op": "passive", "hook": hook, "effects": sub}
                )
            continue
        m = re.search(r"deal (\d+) damage (\d+) times?", s)
        if m:
            effect = {
                "op": "damage",
                "amount": int(m.group(1)),
                "hits": int(m.group(2)),
            }
            if scaling_info:
                effect["scaling"] = scaling_info
                scaling_info = None
            effects.append(effect)
            continue
        m = re.search(r"deal (\d+) damage to all enemies", s)
        if m:
            effect = {"op": "damageAll", "amount": int(m.group(1))}
            if scaling_info:
                effect["scaling"] = scaling_info
                scaling_info = None
            effects.append(effect)
            continue
        m = re.search(r"deal (\d+) damage", s)
        if m:
            effect = {"op": "damage", "amount": int(m.group(1))}
            if scaling_info:
                effect["scaling"] = scaling_info
                scaling_info = None
            effects.append(effect)
            continue
        m = re.search(r"gain (\d+) block", s)
        if m:
            effects.append({"op": "block", "amount": int(m.group(1))})
            continue
        m = re.search(
            r"gain (\d+) (strength|dexterity|thorns|intangible|artifact|ritual|metallicize)",
            s,
        )
        if m:
            effects.append(
                {
                    "op": "apply",
                    "status": STATUS_IDS[m.group(2)],
                    "amount": int(m.group(1)),
                    "target": "self",
                }
            )
            continue
        m = re.search(r"apply (\d+) (weak|vulnerable|poison|frail|doom)", s)
        if m:
            effects.append(
                {
                    "op": "apply",
                    "status": STATUS_IDS[m.group(2)],
                    "amount": int(m.group(1)),
                    "target": "enemy",
                }
            )
            continue
        m = re.search(r"draw (\d+)", s)
        if m:
            effects.append({"op": "draw", "amount": int(m.group(1))})
            continue
        m = re.search(r"gain (\d+) energy", s)
        if m:
            effects.append({"op": "energy", "amount": int(m.group(1))})
            continue
        m = re.search(r"heal (\d+)", s)
        if m:
            effects.append({"op": "heal", "amount": int(m.group(1))})
            continue
        m = re.search(r"lose (\d+) hp", s)
        if m:
            effects.append({"op": "loseHp", "amount": int(m.group(1))})
            continue
        m = re.search(r"channel (\d+) (lightning|frost|dark|glass)", s)
        if m:
            for _ in range(int(m.group(1))):
                effects.append({"op": "channel", "orb": ORB_IDS[m.group(2)]})
            continue
        m = re.search(r"gain (\d+) stars?", s)
        if m:
            effects.append({"op": "gainStars", "amount": int(m.group(1))})
            continue
        m = re.search(r"gain (\d+) souls?", s)
        if m:
            effects.append({"op": "gainSouls", "amount": int(m.group(1))})
            continue
        m = re.search(r"gain (\d+) focus", s)
        if m:
            effects.append({"op": "focus", "amount": int(m.group(1))})
            continue
        m = re.search(r"summon (\d+)", s)
        if m:
            effects.append(
                {"op": "summon", "hp": int(m.group(1)), "damage": 3, "name": "骷髅护卫", "art": "🦴"}
            )
            continue
        if "add a copy of this card" in s:
            effects.append({"op": "addCard", "cardId": card_id, "amount": 1})
            continue
        m = re.search(r"add (\d+) (shiv|soul)s?", s)
        if m:
            effects.append({"op": "addCard", "cardId": m.group(2), "amount": int(m.group(1))})
            continue
        if "retrieve" in s and "exhaust" in s:
            effects.append({"op": "retrieveFromExhaust", "amount": 1})
            continue
    return effects


def fallback_effects(card_type: str, cost: int) -> list:
    if card_type == "attack":
        return [{"op": "damage", "amount": 4 + cost * 3}]
    if card_type == "skill":
        return [{"op": "block", "amount": 5 + cost * 3}]
    return []


def refine_target(card_type: str, desc: str, effects: list) -> str:
    """按解析出的效果修正目标：单体敌方施加/伤害需要 enemy 目标。"""
    low = desc.lower()
    if "all enemies" in low:
        return "allEnemies"
    if any(e.get("op") == "damageAll" for e in effects):
        return "allEnemies"
    if any(
        e.get("op") == "apply" and e.get("target") == "enemy" for e in effects
    ):
        return "enemy"
    if card_type == "attack":
        return "enemy"
    return "self"


def is_self_exhaust(desc: str) -> bool:
    low = desc.lower()
    if "exhaust" not in low:
        return False
    if re.search(
        r"exhaust (a|an|your|random|\d+ card|\d+ cards|it|the|this|top card)",
        low,
    ):
        return False
    if "exhaust pile" in low:
        return False
    return True


def gen_card(card: dict, char_id: str, char_key: Optional[str]) -> dict:
    ver = card.get("versions", {}).get("0.98.0", {})
    base = ver.get("base", {})
    up = ver.get("upgraded", {})
    desc = (base.get("description", {}).get("en", "") or "").strip()
    up_desc = (up.get("description", {}).get("en", "") or "").strip()
    try:
        cost = int(base.get("cost", 0) or 0)
    except ValueError:
        # X 费用卡（如 Tempest）：按 0 处理，描述保留原文说明。
        cost = 0
    card_type = card.get("type", "Skill").lower()
    rarity = RARITY_MAP.get(card.get("rarity", "Common"), "common")

    effects = parse_effects(desc, card["id"])
    if not effects:
        effects = fallback_effects(card_type, cost)

    data: dict = {
        "id": card["id"],
        "name": CARD_NAMES_ZH.get(card["id"], card.get("name_en") or card["id"]),
        "type": card_type,
        "cost": cost,
        "rarity": rarity,
        "description": CARD_DESC_ZH.get(card["id"], translate_desc_zh(desc)),
        "effects": effects,
        "art": CHAR_ART[char_key],
        "color": CHAR_COLOR[char_id],
    }
    if char_key:
        data["character"] = char_key
    data["target"] = refine_target(card_type, desc, effects)
    if card["id"] in FLAVOR_ZH:
        data["flavor"] = FLAVOR_ZH[card["id"]]

    low = desc.lower()
    m = re.search(r"spend (\d+) stars?", low)
    if m:
        data["starsCost"] = int(m.group(1))
    m = re.search(r"spend (\d+) souls?", low)
    if m:
        data["soulsCost"] = int(m.group(1))
    if is_self_exhaust(desc):
        data["exhaust"] = True
    if "ethereal" in low:
        data["ethereal"] = True

    if up_desc or up.get("cost") is not None:
        upgrade: dict = {}
        if up_desc:
            upgrade["description"] = translate_desc_zh(up_desc)
            up_effects = parse_effects(up_desc, card["id"])
            if up_effects:
                upgrade["effects"] = up_effects
            else:
                upgrade["effects"] = effects
        else:
            upgrade["description"] = translate_desc_zh(desc)
            upgrade["effects"] = effects
        if up.get("cost") is not None:
            upgrade["cost"] = int(up["cost"])
        data["upgrade"] = upgrade
    return data


def js(v) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(",", ": "))


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: generate_sts2_cards.py <cards.json>")
        sys.exit(1)
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    cards = data["cards"]
    taken = existing_card_ids()
    generated: list = []
    skipped: list = []
    for char_id, char_key in CHAR_MAP.items():
        for card in cards.get(char_id, []):
            if card["id"] in taken:
                skipped.append(card["id"])
                continue
            generated.append(gen_card(card, char_id, char_key))
    for card in cards.get("colorless", []):
        if card["id"] in taken:
            skipped.append(card["id"])
            continue
        generated.append(gen_card(card, "colorless", None))

    # 移除引用不存在卡牌（如 token 卡 Soul）的 addCard 效果。
    known = taken | {c["id"] for c in generated}
    for c in generated:
        c["effects"] = [
            e
            for e in c["effects"]
            if not (e.get("op") == "addCard" and e["cardId"] not in known)
        ]
        if "upgrade" in c:
            c["upgrade"]["effects"] = [
                e
                for e in c["upgrade"].get("effects", [])
                if not (e.get("op") == "addCard" and e["cardId"] not in known)
            ]

    lines = [
        "// 本文件由 scripts/generate_sts2_cards.py 自动生成，勿手改；",
        "// 数据来源：Flex Games Wiki STS2 卡牌数据库（EA 0.98.0）。",
        "// 卡名/描述/费用/稀有度/升级为真实数据；effects 为可解析近似，",
        "// 复杂机制保留原文描述，可在编辑器里精修。",
        'import type { CardData } from "../core/types";',
        "",
        "export const STS2_CARDS: CardData[] = [",
    ]
    for card in generated:
        lines.append("  " + js(card) + ",")
    lines.append("];")
    lines.append("")
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"generated {len(generated)} cards -> {OUTPUT}")
    print(f"skipped (existing ids): {len(skipped)} {skipped[:20]}")
    unresolved = [c["id"] for c in generated if c["effects"] == fallback_effects(c["type"], c["cost"])]
    print(f"cards using fallback effects: {len(unresolved)}")


if __name__ == "__main__":
    main()
