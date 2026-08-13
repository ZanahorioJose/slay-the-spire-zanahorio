import type {
  AncientData,
  CardData,
  CardPool,
  CardRarity,
  CardTarget,
  CardType,
  Effect,
  EffectTarget,
  EnemyData,
  EnemyMove,
  EnemyPattern,
  EventData,
  EventOption,
  RelicData,
  RelicPool,
  RelicTrigger,
  StatusType,
} from "../core/types";
import { STATUS_DEFS } from "../core/types";
import {
  buildDatabase,
  exportCustomData,
  importCustomData,
} from "../data";
import type { CustomData } from "../data";
import {
  bindDataDirectory,
  clearDebugData,
  getBackendKind,
  getBackendLabel,
  loadDebugData,
  loadFormalData,
  mergeCustomData,
  saveDebugData,
  saveFormalData,
  supportsDirectoryPicker,
  unbindDataDirectory,
} from "../data/store";
import type { GameDatabase } from "../core/types";
import { STARTING_DECK } from "../core/game";
import { clear, el, button } from "./dom";
import { renderCard } from "./cardView";

type Tab = "cards" | "enemies" | "relics" | "events" | "ancients" | "settings";
type SectionKey = "cards" | "enemies" | "relics" | "events" | "ancients";

const STATUS_OPTIONS = Object.keys(STATUS_DEFS) as StatusType[];

const TARGET_OPTIONS = ["self", "enemy", "allEnemies"] as const;

const RELIC_TRIGGER_OPTIONS: { value: RelicTrigger; label: string }[] = [
  { value: "combatStart", label: "战斗开始时" },
  { value: "turnStart", label: "回合开始时" },
  { value: "turnEnd", label: "回合结束时" },
  { value: "cardPlayed", label: "打出一张牌时" },
  { value: "damageDealt", label: "造成伤害时" },
  { value: "blockGained", label: "获得格挡时" },
  { value: "battleEnd", label: "战斗结束时" },
];

export async function renderEditor(
  app: HTMLElement,
  initialDb: GameDatabase,
  onExit: () => void
): Promise<void> {
  app.replaceChildren(
    el("div", "editor-view", el("p", "editor-empty", "正在加载数据…"))
  );

  let formal = await loadFormalData();
  let debug = loadDebugData();
  // New upgrade format: `<id>+` cards must not exist as data, only as derived
  // views. Clean any legacy explicit entries so saves never write them back.
  stripLegacyUpgrades(formal);
  stripLegacyUpgrades(debug);
  let custom = mergeCustomData(formal, debug);
  let workingDb = buildDatabase(custom);
  void initialDb;

  function stripLegacyUpgrades(data: CustomData): void {
    const cards = data.cards as Record<string, unknown> | undefined;
    if (!cards) return;
    for (const id of Object.keys(cards)) {
      if (id.endsWith("+")) delete cards[id];
    }
  }

  let tab: Tab = "cards";
  let selectedId: string | null = null;

  const root = el("div", "editor-view");
  const header = el("div", "editor-header");
  const tabs = el("div", "editor-tabs");
  const body = el("div", "editor-body");
  const list = el("div", "editor-list");
  const form = el("div", "editor-form");
  body.append(list, form);

  const exportBtn = button("导出 JSON", () => {
    download("custom-data.json", exportCustomData(custom));
  }, "btn");
  const importBtn = button("导入 JSON", () => {
    fileInput.click();
  }, "btn");
  const clearDebugBtn = button("清空临时调整", () => {
    clearTemporary();
  }, "btn btn-danger");
  const bindDirBtn = button("绑定 data 文件夹", () => {
    void bindDirectory();
  }, "btn");
  const unbindDirBtn = button("解除绑定", () => {
    void unbindDirectory();
  }, "btn btn-plain");
  const backBtn = button("返回主菜单", onExit, "btn btn-plain");
  const backendInfo = el("div", "editor-backend");

  const fileInput = el("input", "hidden-input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = importCustomData(String(reader.result));
        formal = imported;
        debug = {};
        clearDebugData();
        await saveFormalData(formal);
        rebuild();
        alert("导入成功！已覆盖正式数据并清空临时调整。");
      } catch (err) {
        alert(`导入失败：${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file, "utf-8");
  });

  header.append(
    exportBtn,
    importBtn,
    clearDebugBtn,
    bindDirBtn,
    unbindDirBtn,
    backBtn,
    backendInfo,
    fileInput
  );

  function switchTab(next: Tab): void {
    tab = next;
    selectedId = null;
    renderTabs();
    renderList();
    renderForm();
  }

  function renderTabs(): void {
    clear(tabs);
    const defs: { id: Tab; label: string }[] = [
      { id: "cards", label: "卡牌" },
      { id: "enemies", label: "怪物" },
      { id: "relics", label: "遗物" },
      { id: "events", label: "事件" },
      { id: "ancients", label: "先古" },
      { id: "settings", label: "全局设置" },
    ];
    for (const def of defs) {
      tabs.appendChild(
        button(def.label, () => switchTab(def.id), `tab-btn${tab === def.id ? " active" : ""}`)
      );
    }
  }

  function entryList(): {
    id: string;
    label: string;
    art: string;
    source: "base" | "formal" | "debug";
  }[] {
    const map: Record<string, { label: string; art: string }> = {};
    if (tab === "cards") {
      for (const [id, card] of Object.entries(workingDb.cards)) {
        if (isDerivedUpgrade(id)) continue;
        map[id] = { label: card.name, art: card.art ?? "🃏" };
      }
    } else if (tab === "enemies") {
      for (const [id, enemy] of Object.entries(workingDb.enemies)) {
        map[id] = { label: enemy.name, art: enemy.art ?? "👾" };
      }
    } else if (tab === "relics") {
      for (const [id, relic] of Object.entries(workingDb.relics)) {
        map[id] = { label: relic.name, art: relic.art ?? "💎" };
      }
    } else if (tab === "events") {
      for (const [id, event] of Object.entries(workingDb.events)) {
        map[id] = { label: event.name, art: event.art ?? "❓" };
      }
    } else if (tab === "ancients") {
      for (const [id, ancient] of Object.entries(workingDb.ancients)) {
        map[id] = { label: ancient.name, art: ancient.art ?? "🧭" };
      }
    } else {
      return [];
    }
    return Object.entries(map).map(([id, info]) => ({
      id,
      ...info,
      source: entrySource(tab, id),
    }));
  }

  // `<id>+` cards are derived from their base card; hide them from the list
  // (explicit legacy overrides are stripped at load, so every `+` in the
  // working database is a derived view).
  function isDerivedUpgrade(id: string): boolean {
    return id.endsWith("+");
  }

  function sectionHas(section: Tab, id: string, layer: CustomData): boolean {
    const loose = layer as Record<string, Record<string, unknown>>;
    const sectionData = loose[section];
    return Boolean(sectionData && id in sectionData);
  }

  function entrySource(
    section: Tab,
    id: string
  ): "base" | "formal" | "debug" {
    if (sectionHas(section, id, debug)) return "debug";
    if (sectionHas(section, id, formal)) return "formal";
    return "base";
  }

  function renderList(): void {
    clear(list);
    if (tab === "settings") {
      list.appendChild(
        el("div", "editor-settings-note", "在这里调整开局数值，保存后新开一局生效。")
      );
      return;
    }
    const entries = entryList().sort((a, b) => a.id.localeCompare(b.id));
    for (const entry of entries) {
      const item = el(
        "div",
        `editor-list-item${selectedId === entry.id ? " active" : ""}${
          entry.source !== "base" ? " custom" : ""
        }${entry.source === "debug" ? " debug" : ""}`
      );
      item.title =
        entry.source === "debug"
          ? "临时调整（localStorage，未写入 data/ 文件）"
          : entry.source === "formal"
            ? "正式数据（data/ 文件或浏览器存储）"
            : "内置数据";
      item.append(
        el("span", "editor-list-art", entry.art),
        el("span", "editor-list-name", entry.label),
        el("span", "editor-list-id", entry.id)
      );
      item.addEventListener("click", () => {
        selectedId = entry.id;
        renderList();
        renderForm();
      });
      list.appendChild(item);
    }
    list.appendChild(
      button("+ 新建", () => {
        selectedId = "__new__";
        renderList();
        renderForm();
      }, "btn btn-small new-btn")
    );
  }

  function renderForm(): void {
    clear(form);
    if (tab === "settings") {
      renderSettingsForm();
      return;
    }
    if (selectedId === "__new__") {
      renderNewForm();
      return;
    }
    if (!selectedId) {
      form.appendChild(el("p", "editor-empty", "从左侧选择一个条目开始编辑，或新建一个。"));
      return;
    }
    if (tab === "cards") {
      const card = workingDb.cards[selectedId];
      if (card) renderCardForm(card);
    } else if (tab === "enemies") {
      const enemy = workingDb.enemies[selectedId];
      if (enemy) renderEnemyForm(enemy);
    } else if (tab === "relics") {
      const relic = workingDb.relics[selectedId];
      if (relic) renderRelicForm(relic);
    } else if (tab === "ancients") {
      const ancient = workingDb.ancients[selectedId];
      if (ancient) renderAncientForm(ancient);
    } else {
      const event = workingDb.events[selectedId];
      if (event) renderEventForm(event);
    }
  }

  function renderNewForm(): void {
    const idInput = textInput("", () => undefined);
    form.append(
      el("h3", "form-title", "新建条目"),
      field("id", idInput),
      button("创建", () => {
        const id = idInput.value.trim();
        if (!id) {
          alert("id 不能为空");
          return;
        }
        createEmptyEntry(id);
      }, "btn")
    );
  }

  function createEmptyEntry(id: string): void {
    if (!isSectionKey(tab)) return;
    const section = (debug[tab] ?? {}) as Record<string, unknown>;
    const formalSection = (formal[tab] ?? {}) as Record<string, unknown>;
    if (id in section || id in formalSection) {
      alert("该 id 已存在");
      return;
    }
    if (tab === "cards") {
      section[id] = {
        id,
        name: "新卡牌",
        type: "attack",
        cost: 1,
        rarity: "common",
        target: "enemy",
        description: "造成 5 点伤害。",
        effects: [{ op: "damage", amount: 5 }],
      };
    } else if (tab === "enemies") {
      section[id] = {
        id,
        name: "新怪物",
        maxHp: 20,
        pattern: "loop",
        moves: [{ name: "攻击", type: "attack", damage: 5 }],
      };
    } else if (tab === "relics") {
      section[id] = {
        id,
        name: "新遗物",
        description: "效果描述",
        trigger: "combatStart",
        effects: [],
      };
    } else if (tab === "ancients") {
      section[id] = {
        id,
        name: "新先古角色",
        text: "先古角色的描述",
        healPercent: 100,
        relicPool: [],
      };
    } else {
      section[id] = {
        id,
        name: "新事件",
        text: "事件描述",
        options: [{ label: "继续", effects: [] }],
      };
    }
    debug[tab] = section as never;
    saveDebugData(debug);
    rebuild(id);
    alert("已创建临时条目（临时层）。编辑后点「写入正式数据」可固化到 data/ 文件。");
  }

  function isSectionKey(value: Tab): value is SectionKey {
    return value !== "settings";
  }

  // ------------------------------------------------------------------
  // Layered save actions: temporary (debug) vs permanent (formal)
  // ------------------------------------------------------------------

  function saveToSection(
    layer: CustomData,
    section: SectionKey,
    draft: { id: string }
  ): void {
    const loose = layer as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const map = loose[section] ?? {};
    map[draft.id] = draft;
    loose[section] = map;
  }

  function removeFromSection(
    layer: CustomData,
    section: SectionKey,
    id: string
  ): void {
    const loose = layer as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const map = loose[section] ?? {};
    map[id] = null;
    loose[section] = map;
  }

  function rebuild(selectId?: string): void {
    custom = mergeCustomData(formal, debug);
    workingDb = buildDatabase(custom);
    selectedId = selectId ?? null;
    renderList();
    renderForm();
    renderBackend();
  }

  function commitTemporary(section: SectionKey, draft: { id: string }): void {
    saveToSection(debug, section, draft);
    saveDebugData(debug);
    rebuild(draft.id);
    alert("已保存为临时调整（立即生效，尚未写入 data/ 文件）。");
  }

  async function commitFormal(
    section: SectionKey,
    draft: { id: string }
  ): Promise<void> {
    saveToSection(formal, section, draft);
    const result = await saveFormalData(formal);
    rebuild(draft.id);
    alert(result.message);
  }

  function deleteTemporary(section: SectionKey, id: string): void {
    removeFromSection(debug, section, id);
    saveDebugData(debug);
    rebuild();
    alert("已临时删除（未写入 data/ 文件）。");
  }

  async function deleteFormal(section: SectionKey, id: string): Promise<void> {
    removeFromSection(formal, section, id);
    const debugSection = debug[section] as Record<string, unknown> | undefined;
    if (debugSection && id in debugSection) {
      delete debugSection[id];
    }
    saveDebugData(debug);
    const result = await saveFormalData(formal);
    rebuild();
    alert(result.message);
  }

  function clearTemporary(): void {
    if (!window.confirm("确定清空所有临时调整？")) return;
    clearDebugData();
    debug = {};
    rebuild();
    alert("已清空临时调整。");
  }

  async function bindDirectory(): Promise<void> {
    if (!supportsDirectoryPicker()) {
      alert("当前浏览器不支持 File System Access API，请使用 Chrome / Edge。");
      return;
    }
    const result = await bindDataDirectory();
    if (result.ok) {
      formal = await loadFormalData();
      rebuild();
    }
    alert(result.message);
  }

  async function unbindDirectory(): Promise<void> {
    if (!window.confirm("解除绑定后，正式数据将回到浏览器存储。确定？")) {
      return;
    }
    await unbindDataDirectory();
    formal = await loadFormalData();
    rebuild();
    alert("已解除绑定。");
  }

  function hasDebug(): boolean {
    return (
      ["cards", "enemies", "relics", "events", "ancients", "settings"] as const
    ).some((section) => {
        const value = debug[section];
        return (
          value !== undefined &&
          Object.keys(value as Record<string, unknown>).length > 0
        );
      });
  }

  function renderBackend(): void {
    const bound = getBackendKind() === "directory";
    const mode = getBackendLabel();
    const debugMark = hasDebug() ? " · 有临时调整" : "";
    backendInfo.textContent = `数据源：${mode}${debugMark}`;
    unbindDirBtn.style.display = bound ? "" : "none";
    bindDirBtn.textContent = bound ? "重新绑定文件夹" : "绑定 data 文件夹";
  }

  // ------------------------------------------------------------------
  // Card form
  // ------------------------------------------------------------------

  function renderCardForm(card: CardData): void {
    const draft: CardData = structuredClone(card);
    const fields = el("div", "form-fields");
    const effectsBox = el("div", "form-effects");
    const upgradeBox = el("div", "form-upgrade");
    const compareBox = el("div", "card-compare");

    // Live side-by-side preview: base card on the left, derived upgraded
    // card on the right, so number tweaks are visible at a glance.
    const renderCompare = (): void => {
      clear(compareBox);
      compareBox.append(
        el("div", "compare-label", "基础"),
        renderCard(structuredClone(draft), { small: true }),
        el("span", "compare-arrow", "➜")
      );
      if (draft.upgrade) {
        const upgraded: CardData = {
          ...structuredClone(draft),
          ...structuredClone(draft.upgrade),
          id: `${draft.id}+`,
          name: `${draft.name}+`,
          upgrade: undefined,
        };
        compareBox.append(
          el("div", "compare-label", "升级"),
          renderCard(upgraded, { small: true })
        );
      } else {
        compareBox.append(el("span", "compare-empty", "（未启用升级版）"));
      }
    };

    const bump = <T,>(fn: (v: T) => void): ((v: T) => void) => {
      return (v: T) => {
        fn(v);
        renderCompare();
      };
    };

    fields.append(
      field("id（只读）", textInput(draft.id, () => undefined, true)),
      field("名称", textInput(draft.name, bump((v) => (draft.name = v)))),
      field(
        "类型",
        selectInput<CardType>(
          ["attack", "skill", "power"].map((v) => ({ value: v as CardType, label: v })),
          draft.type,
          bump((v) => (draft.type = v))
        )
      ),
      field(
        "费用",
        numInput(draft.cost, bump((v) => (draft.cost = v)), 0, 9)
      ),
      field(
        "稀有度",
        selectInput<CardRarity>(
          ["starter", "common", "uncommon", "rare"].map((v) => ({
            value: v as CardRarity,
            label: v,
          })),
          draft.rarity,
          bump((v) => (draft.rarity = v))
        )
      ),
      field(
        "出没池（逗号分隔 reward/shop/boss/event，留空=全部）",
        textInput((draft.pools ?? []).join(","), bump((v) => {
          draft.pools = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) as CardPool[];
        }))
      ),
      field(
        "目标",
        selectInput<CardTarget>(
          ["enemy", "allEnemies", "self", "none"].map((v) => ({
            value: v as CardTarget,
            label: v,
          })),
          draft.target,
          bump((v) => (draft.target = v))
        )
      ),
      field("描述（展示用，可随意写）", textAreaInput(draft.description, bump((v) => (draft.description = v)))),
      field("图标（emoji）", textInput(draft.art ?? "", bump((v) => (draft.art = v)))),
      field("主色调", colorInput(draft.color ?? "#888888", bump((v) => (draft.color = v)))),
      field(
        "版本/拓展包（如 基础版、DLC1，可留空）",
        textInput(draft.version ?? "", bump((v) => (draft.version = v || undefined)))
      ),
      field(
        "消耗",
        checkboxInput(Boolean(draft.exhaust), bump((v) => (draft.exhaust = v)))
      )
    );

    const effectsTitle = el("h4", "form-subtitle", "效果（按顺序执行）");
    const upgradeTitle = el("h4", "form-subtitle", "升级版（可选）");
    const hasUpgrade = checkboxInput(Boolean(draft.upgrade), (v) => {
      if (v && !draft.upgrade) {
        // Upgrade is an override on top of the base card: only the fields
        // the player actually edits are stored. Everything else inherits.
        draft.upgrade = {};
      }
      if (!v) draft.upgrade = undefined;
      renderUpgrade();
      renderCompare();
    }, "启用升级版");
    upgradeBox.append(upgradeTitle, hasUpgrade);

    const renderEffects = (): void => {
      renderEffectList(effectsBox, draft.effects, (next) => {
        draft.effects = next;
        renderCompare();
      });
    };
    const renderUpgrade = (): void => {
      clear(upgradeBox);
      upgradeBox.append(upgradeTitle, hasUpgrade);
      if (draft.upgrade) {
        const up = draft.upgrade;
        upgradeBox.append(
          field(
            "升级费用（留空继承基础）",
            numInput(up.cost ?? draft.cost, bump((v) => (up.cost = v)), 0, 9)
          ),
          field(
            "升级描述（留空继承基础）",
            textAreaInput(
              up.description ?? draft.description,
              bump((v) => (up.description = v))
            )
          ),
          field(
            "升级后消耗",
            checkboxInput(
              Boolean(up.exhaust ?? draft.exhaust),
              bump((v) => (up.exhaust = v))
            )
          )
        );
        upgradeBox.append(el("h4", "form-subtitle", "升级效果"));
        if (up.effects === undefined) {
          const hint = el(
            "p",
            "editor-note",
            "当前继承基础效果：修改基础效果后升级版自动跟随。"
          );
          const preview = el("div", "form-effects preview-effects");
          for (const effect of draft.effects) {
            preview.appendChild(
              el("div", "effect-row preview-row", describeEffect(effect))
            );
          }
          upgradeBox.append(
            hint,
            preview,
            button("自定义升级效果", () => {
              up.effects = structuredClone(draft.effects);
              renderUpgrade();
              renderCompare();
            }, "btn btn-small")
          );
        } else {
          const upEffects = el("div", "form-effects");
          renderEffectList(upEffects, up.effects, (next) => {
            up.effects = next;
            renderCompare();
          });
          upgradeBox.append(
            upEffects,
            button("恢复继承基础效果", () => {
              up.effects = undefined;
              renderUpgrade();
              renderCompare();
            }, "btn btn-small")
          );
        }
      }
    };

    form.append(
      el("h3", "form-title", `编辑卡牌：${draft.name}`),
      compareBox,
      fields,
      effectsTitle,
      effectsBox,
      upgradeBox,
      actionRow("cards", draft)
    );
    renderEffects();
    renderUpgrade();
    renderCompare();
  }

  // ------------------------------------------------------------------
  // Enemy form
  // ------------------------------------------------------------------

  function renderEnemyForm(enemy: EnemyData): void {
    const draft: EnemyData = structuredClone(enemy);
    const fields = el("div", "form-fields");
    const movesBox = el("div", "form-effects");

    fields.append(
      field("id（只读）", textInput(draft.id, () => undefined, true)),
      field("名称", textInput(draft.name, (v) => (draft.name = v))),
      field("生命值", numInput(draft.maxHp, (v) => (draft.maxHp = Math.max(1, v)), 1, 9999)),
      field("图标（emoji）", textInput(draft.art ?? "", (v) => (draft.art = v))),
      field("主色调", colorInput(draft.color ?? "#888888", (v) => (draft.color = v))),
      field(
        "行动模式",
        selectInput<EnemyPattern>(
          [
            { value: "loop", label: "循环（按顺序）" },
            { value: "random", label: "随机" },
          ],
          draft.pattern,
          (v) => (draft.pattern = v)
        )
      ),
      field("首领", checkboxInput(Boolean(draft.isBoss), (v) => (draft.isBoss = v)))
    );

    form.append(
      el("h3", "form-title", `编辑怪物：${draft.name}`),
      fields,
      el("h4", "form-subtitle", "行动（按顺序循环，第一个即开场动作）"),
      movesBox,
      actionRow("enemies", draft)
    );

    const renderMoves = (): void => {
      renderMoveList(movesBox, draft.moves, (next) => {
        draft.moves = next;
      });
    };
    renderMoves();
  }

  // ------------------------------------------------------------------
  // Relic form
  // ------------------------------------------------------------------

  function renderRelicForm(relic: RelicData): void {
    const draft: RelicData = structuredClone(relic);
    const fields = el("div", "form-fields");
    const effectsBox = el("div", "form-effects");

    fields.append(
      field("id（只读）", textInput(draft.id, () => undefined, true)),
      field("名称", textInput(draft.name, (v) => (draft.name = v))),
      field("描述", textAreaInput(draft.description, (v) => (draft.description = v))),
      field("图标（emoji）", textInput(draft.art ?? "", (v) => (draft.art = v))),
      field(
        "版本/拓展包（如 基础版、DLC1，可留空）",
        textInput(draft.version ?? "", (v) => (draft.version = v || undefined))
      ),
      field(
        "触发时机",
        selectInput<RelicTrigger>(
          RELIC_TRIGGER_OPTIONS,
          draft.trigger,
          (v) => (draft.trigger = v)
        )
      ),
      field("额外能量（战斗开始）", numInput(draft.energyBonus ?? 0, (v) => (draft.energyBonus = v), 0, 9)),
      field("每回合多抽", numInput(draft.drawBonus ?? 0, (v) => (draft.drawBonus = v), 0, 9)),
      field(
        "出没池（逗号分隔 reward/shop/boss/event，留空=全部）",
        textInput((draft.pools ?? []).join(","), (v) => {
          draft.pools = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) as RelicPool[];
        })
      )
    );

    form.append(
      el("h3", "form-title", `编辑遗物：${draft.name}`),
      fields,
      el("h4", "form-subtitle", "触发效果"),
      effectsBox,
      actionRow("relics", draft)
    );
    renderEffectList(effectsBox, draft.effects, (next) => {
      draft.effects = next;
    });
  }

  // ------------------------------------------------------------------
  // Event form
  // ------------------------------------------------------------------

  function renderEventForm(event: EventData): void {
    const draft: EventData = structuredClone(event);
    const fields = el("div", "form-fields");
    const optionsBox = el("div", "form-effects");

    fields.append(
      field("id（只读）", textInput(draft.id, () => undefined, true)),
      field("名称", textInput(draft.name, (v) => (draft.name = v))),
      field("文本", textAreaInput(draft.text, (v) => (draft.text = v))),
      field("图标（emoji）", textInput(draft.art ?? "", (v) => (draft.art = v)))
    );

    form.append(
      el("h3", "form-title", `编辑事件：${draft.name}`),
      fields,
      el("h4", "form-subtitle", "选项"),
      optionsBox,
      actionRow("events", draft)
    );

    const renderOptions = (): void => {
      renderOptionList(optionsBox, draft.options, (next) => {
        draft.options = next;
      });
    };
    renderOptions();
  }

  function renderAncientForm(ancient: AncientData): void {
    const draft: AncientData = structuredClone(ancient);
    const fields = el("div", "form-fields");
    fields.append(
      field("id（只读）", textInput(draft.id, () => undefined, true)),
      field("名称", textInput(draft.name, (v) => (draft.name = v))),
      field("文本", textAreaInput(draft.text, (v) => (draft.text = v))),
      field("图标（emoji）", textInput(draft.art ?? "", (v) => (draft.art = v))),
      field(
        "回血比例 %（回复缺失生命值的百分比，默认 100）",
        numInput(draft.healPercent ?? 100, (v) => (draft.healPercent = v), 0, 100)
      ),
      field(
        "先古遗物池（遗物 id，逗号分隔）",
        textAreaInput(draft.relicPool.join(","), (v) => {
          draft.relicPool = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        })
      )
    );
    form.append(
      el("h3", "form-title", `编辑先古角色：${draft.name}`),
      el(
        "p",
        "editor-settings-note",
        "每层第一个节点进入该先古事件：先按比例回血，再随机获得池中的一件遗物。"
      ),
      fields,
      actionRow("ancients", draft)
    );
  }

  function renderSettingsForm(): void {
    const draft = {
      startingHp: custom.settings?.startingHp ?? 70,
      startingGold: custom.settings?.startingGold ?? 99,
      drawPerTurn: custom.settings?.drawPerTurn ?? 5,
      energyPerTurn: custom.settings?.energyPerTurn ?? 3,
      startingDeck: (custom.settings?.startingDeck ?? STARTING_DECK).join(","),
      ancientHealPercent: custom.settings?.ancientHealPercent ?? 100,
      ancientId: custom.settings?.ancientId ?? "",
    };
    const fields = el("div", "form-fields");
    fields.append(
      field("初始生命", numInput(draft.startingHp, (v) => (draft.startingHp = v), 1, 9999)),
      field("初始金币", numInput(draft.startingGold, (v) => (draft.startingGold = v), 0, 99999)),
      field("每回合抽牌数", numInput(draft.drawPerTurn, (v) => (draft.drawPerTurn = v), 1, 20)),
      field("每回合能量", numInput(draft.energyPerTurn, (v) => (draft.energyPerTurn = v), 0, 20)),
      field(
        "起始牌组（卡牌 id，逗号分隔）",
        textAreaInput(draft.startingDeck, (v) => (draft.startingDeck = v))
      ),
      field(
        "先古回血比例 %（回复缺失生命值的百分比）",
        numInput(draft.ancientHealPercent, (v) => (draft.ancientHealPercent = v), 0, 100)
      ),
      field(
        "先古角色",
        selectInput(
          [
            { value: "", label: "（默认先古角色）" },
            ...Object.values(workingDb.ancients).map((a) => ({
              value: a.id,
              label: a.name,
            })),
          ],
          draft.ancientId,
          (v) => (draft.ancientId = v)
        )
      )
    );
    form.append(
      el("h3", "form-title", "全局设置"),
      el(
        "p",
        "editor-settings-note",
        "新开一局游戏时生效。「临时微调」立即生效且不写入 data/ 文件。"
      ),
      fields,
      el("div", "form-actions", [
        button("临时微调", () => {
          debug.settings = collectSettings();
          saveDebugData(debug);
          custom = mergeCustomData(formal, debug);
          renderBackend();
          alert("已保存为临时调整（新开一局生效）。");
        }, "btn"),
        button("写入正式数据", () => {
          formal.settings = collectSettings();
          void saveFormalData(formal).then((result) => {
            custom = mergeCustomData(formal, debug);
            renderBackend();
            alert(result.message);
          });
        }, "btn"),
      ])
    );

    function collectSettings(): CustomData["settings"] {
      return {
        startingHp: draft.startingHp,
        startingGold: draft.startingGold,
        drawPerTurn: draft.drawPerTurn,
        energyPerTurn: draft.energyPerTurn,
        startingDeck: draft.startingDeck
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ancientHealPercent: draft.ancientHealPercent,
        ancientId: draft.ancientId || undefined,
      };
    }
  }

  function actionRow(
    section: SectionKey,
    draft: { id: string }
  ): HTMLElement {
    const row = el("div", "form-actions");
    row.append(
      button("临时微调", () => commitTemporary(section, draft), "btn"),
      button("写入正式数据", () => void commitFormal(section, draft), "btn"),
      button("删除（临时）", () => {
        deleteTemporary(section, draft.id);
      }, "btn btn-danger"),
      button("删除（正式）", () => {
        void deleteFormal(section, draft.id);
      }, "btn btn-danger")
    );
    return row;
  }

  // ------------------------------------------------------------------
  // Shared form widgets
  // ------------------------------------------------------------------

  function field(label: string, control: HTMLElement): HTMLElement {
    const wrap = el("label", "form-field");
    wrap.append(el("span", "form-label", label), control);
    return wrap;
  }

  function textInput(
    value: string,
    onChange: (v: string) => void,
    readonly = false
  ): HTMLInputElement {
    const input = el("input", "text-input");
    input.type = "text";
    input.value = value;
    input.readOnly = readonly;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  function textAreaInput(
    value: string,
    onChange: (v: string) => void
  ): HTMLTextAreaElement {
    const input = el("textarea", "text-input");
    input.value = value;
    input.rows = 2;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  function numInput(
    value: number,
    onChange: (v: number) => void,
    min = -999,
    max = 999
  ): HTMLInputElement {
    const input = el("input", "num-input");
    input.type = "number";
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.addEventListener("input", () => {
      const parsed = Number(input.value);
      onChange(Number.isFinite(parsed) ? parsed : 0);
    });
    return input;
  }

  function checkboxInput(
    value: boolean,
    onChange: (v: boolean) => void,
    labelText = ""
  ): HTMLElement {
    const input = el("input", "check-input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    if (labelText) {
      const wrap = el("label", "check-wrap");
      wrap.append(input, el("span", "check-label", labelText));
      return wrap;
    }
    return input;
  }

  function colorInput(
    value: string,
    onChange: (v: string) => void
  ): HTMLInputElement {
    const input = el("input", "color-input");
    input.type = "color";
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  function selectInput<T extends string>(
    options: { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void
  ): HTMLSelectElement {
    const select = el("select", "select-input");
    for (const opt of options) {
      const option = el("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value as T));
    return select;
  }

  function describeEffect(effect: Effect): string {
    switch (effect.op) {
      case "damage":
        return `伤害 ${effect.amount}${effect.hits && effect.hits > 1 ? ` × ${effect.hits}` : ""}`;
      case "block":
        return `格挡 ${effect.amount}`;
      case "apply":
        return `${STATUS_DEFS[effect.status].name} ${effect.amount}（${effect.target}）`;
      case "multiplyStatus":
        return `${STATUS_DEFS[effect.status].name} ×${effect.multiplier}（${effect.target}）`;
      case "draw":
        return `抽 ${effect.amount} 张`;
      case "energy":
        return `能量 ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
      case "heal":
        return `治疗 ${effect.amount}`;
      case "loseHp":
        return `失去 ${effect.amount} 生命`;
      case "damageAll":
        return `全体伤害 ${effect.amount}`;
      case "addCard":
        return `加入「${workingDb.cards[effect.cardId]?.name ?? effect.cardId}」×${effect.amount ?? 1}`;
      case "exhaustRandom":
        return `随机消耗 ${effect.amount ?? 1} 张手牌`;
      case "gainGold":
        return `获得 ${effect.amount} 金币`;
    }
  }

  function renderEffectList(
    container: HTMLElement,
    effects: Effect[],
    onCommit: (next: Effect[]) => void
  ): void {
    clear(container);
    effects.forEach((effect, index) => {
      const row = effectEditor(effect, (next) => {
        const copy = [...effects];
        copy[index] = next;
        onCommit(copy);
        renderEffectList(container, copy, onCommit);
      }, () => {
        onCommit(effects.filter((_, i) => i !== index));
      });
      container.appendChild(row);
    });
    container.appendChild(
      button("+ 添加效果", () => {
        onCommit([...effects, { op: "damage", amount: 5 }]);
      }, "btn btn-small")
    );
  }

  function effectEditor(
    effect: Effect,
    onChange: (next: Effect) => void,
    onRemove: () => void
  ): HTMLElement {
    const row = el("div", "effect-row");
    const opSel = selectInput<Effect["op"]>(
      [
        "damage",
        "block",
        "apply",
        "multiplyStatus",
        "draw",
        "energy",
        "heal",
        "loseHp",
        "damageAll",
        "addCard",
        "exhaustRandom",
        "gainGold",
      ].map((v) => ({ value: v as Effect["op"], label: v })),
      effect.op,
      (v) => {
        const base = { ...effect, op: v } as Effect;
        onChange(base);
      }
    );
    row.appendChild(opSel);

    const num = (key: string, value: number, onChange: (n: number) => void): void => {
      row.append(
        el("span", "effect-label", key),
        numInput(value, onChange, -999, 999)
      );
    };
    const sel = <T extends string>(
      key: string,
      options: { value: T; label: string }[],
      value: T,
      onChange: (v: T) => void
    ): void => {
      row.append(
        el("span", "effect-label", key),
        selectInput(options, value, onChange)
      );
    };

    switch (effect.op) {
      case "damage":
        num("伤害", effect.amount, (v) => onChange({ ...effect, amount: v }));
        num("次数", effect.hits ?? 1, (v) => onChange({ ...effect, hits: v }));
        break;
      case "block":
        num("格挡", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "apply":
        sel<StatusType>(
          "状态",
          STATUS_OPTIONS.map((v) => ({ value: v, label: STATUS_DEFS[v].name })),
          effect.status,
          (v) => onChange({ ...effect, status: v })
        );
        num("层数", effect.amount, (v) => onChange({ ...effect, amount: v }));
        sel<EffectTarget>(
          "目标",
          TARGET_OPTIONS.map((v) => ({ value: v, label: v })),
          effect.target,
          (v) => onChange({ ...effect, target: v })
        );
        break;
      case "multiplyStatus":
        sel<StatusType>(
          "状态",
          STATUS_OPTIONS.map((v) => ({ value: v, label: STATUS_DEFS[v].name })),
          effect.status,
          (v) => onChange({ ...effect, status: v })
        );
        num("倍数", effect.multiplier, (v) => onChange({ ...effect, multiplier: v }));
        sel<EffectTarget>(
          "目标",
          TARGET_OPTIONS.map((v) => ({ value: v, label: v })),
          effect.target,
          (v) => onChange({ ...effect, target: v })
        );
        break;
      case "draw":
        num("抽牌", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "energy":
        num("能量", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "heal":
        num("治疗", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "loseHp":
        num("失去生命", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "damageAll":
        num("全体伤害", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
      case "addCard":
        sel(
          "卡牌",
          Object.keys(workingDb.cards).map((v) => ({
            value: v,
            label: workingDb.cards[v]?.name ?? v,
          })),
          effect.cardId,
          (v) => onChange({ ...effect, cardId: v })
        );
        num("张数", effect.amount ?? 1, (v) => onChange({ ...effect, amount: v }));
        break;
      case "exhaustRandom":
        num("数量", effect.amount ?? 1, (v) => onChange({ ...effect, amount: v }));
        break;
      case "gainGold":
        num("金币", effect.amount, (v) => onChange({ ...effect, amount: v }));
        break;
    }

    row.appendChild(button("✕", onRemove, "btn btn-danger btn-mini"));
    return row;
  }

  function renderMoveList(
    container: HTMLElement,
    moves: EnemyMove[],
    onCommit: (next: EnemyMove[]) => void
  ): void {
    clear(container);
    moves.forEach((move, index) => {
      const row = el("div", "effect-row move-row");
      const typeSel = selectInput<EnemyMove["type"]>(
        ["attack", "defend", "buff", "debuff", "special"].map((v) => ({
          value: v as EnemyMove["type"],
          label: v,
        })),
        move.type,
        (v) => {
          const copy = [...moves];
          copy[index] = { ...move, type: v };
          onCommit(copy);
          renderMoveList(container, copy, onCommit);
        }
      );
      row.append(
        el("span", "effect-label", "type"),
        typeSel,
        el("span", "effect-label", "name"),
        textInput(move.name, (v) => {
          const copy = [...moves];
          copy[index] = { ...move, name: v };
          onCommit(copy);
        })
      );
      if (move.type === "attack") {
        row.append(
          el("span", "effect-label", "伤害"),
          numInput(move.damage ?? 0, (v) => {
            const copy = [...moves];
            copy[index] = { ...move, damage: v };
            onCommit(copy);
          }, 0, 999),
          el("span", "effect-label", "次数"),
          numInput(move.hits ?? 1, (v) => {
            const copy = [...moves];
            copy[index] = { ...move, hits: v };
            onCommit(copy);
          }, 1, 10)
        );
      }
      if (move.type === "defend") {
        row.append(
          el("span", "effect-label", "格挡"),
          numInput(move.block ?? 0, (v) => {
            const copy = [...moves];
            copy[index] = { ...move, block: v };
            onCommit(copy);
          }, 0, 999)
        );
      }
      if (move.type === "special") {
        row.append(
          el("span", "effect-label", "治疗"),
          numInput(move.heal ?? 0, (v) => {
            const copy = [...moves];
            copy[index] = { ...move, heal: v };
            onCommit(copy);
          }, 0, 999)
        );
      }
      if (move.type === "buff" || move.type === "debuff") {
        const statuses = move.statuses ?? [];
        statuses.forEach((s, sIdx) => {
          row.append(
            el("span", "effect-label", "状态"),
            selectInput<StatusType>(
              STATUS_OPTIONS.map((v) => ({ value: v, label: STATUS_DEFS[v].name })),
              s.status,
              (v) => {
                const copy = [...moves];
                const newStatuses = [...statuses];
                newStatuses[sIdx] = { ...s, status: v };
                copy[index] = { ...move, statuses: newStatuses };
                onCommit(copy);
              }
            ),
            numInput(s.amount, (v) => {
              const copy = [...moves];
              const newStatuses = [...statuses];
              newStatuses[sIdx] = { ...s, amount: v };
              copy[index] = { ...move, statuses: newStatuses };
              onCommit(copy);
            }, 0, 99),
            selectInput<"self" | "player">(
              [
                { value: "self", label: "自己" },
                { value: "player", label: "玩家" },
              ],
              s.target,
              (v) => {
                const copy = [...moves];
                const newStatuses = [...statuses];
                newStatuses[sIdx] = { ...s, target: v };
                copy[index] = { ...move, statuses: newStatuses };
                onCommit(copy);
              }
            )
          );
        });
        row.append(
          button("+ 状态", () => {
            const copy = [...moves];
            copy[index] = {
              ...move,
              statuses: [
                ...statuses,
                { status: "weak", amount: 1, target: "player" },
              ],
            };
            onCommit(copy);
          }, "btn btn-small")
        );
      }
      row.appendChild(
        button("✕", () => {
          onCommit(moves.filter((_, i) => i !== index));
        }, "btn btn-danger btn-mini")
      );
      container.appendChild(row);
    });
    container.appendChild(
      button("+ 添加行动", () => {
        onCommit([
          ...moves,
          { name: "攻击", type: "attack", damage: 5 },
        ]);
      }, "btn btn-small")
    );
  }

  function renderOptionList(
    container: HTMLElement,
    options: EventOption[],
    onCommit: (next: EventOption[]) => void
  ): void {
    clear(container);
    options.forEach((option, index) => {
      const card = el("div", "option-card");
      const header = el("div", "option-header");
      header.append(
        textInput(option.label, (v) => {
          const copy = [...options];
          copy[index] = { ...option, label: v };
          onCommit(copy);
        }),
        button("✕", () => {
          onCommit(options.filter((_, i) => i !== index));
        }, "btn btn-danger btn-mini")
      );
      const fields = el("div", "option-fields");
      fields.append(
        field("说明", textAreaInput(option.description ?? "", (v) => {
          const copy = [...options];
          copy[index] = { ...option, description: v };
          onCommit(copy);
        })),
        field("花费金币", numInput(option.goldCost ?? 0, (v) => {
          const copy = [...options];
          copy[index] = { ...option, goldCost: v > 0 ? v : undefined };
          onCommit(copy);
        }, 0, 9999)),
        field("获得卡牌（逗号分隔 id）", textInput((option.addCards ?? []).join(","), (v) => {
          const copy = [...options];
          copy[index] = {
            ...option,
            addCards: v.split(",").map((s) => s.trim()).filter(Boolean),
          };
          onCommit(copy);
        })),
        field("获得遗物 id", textInput(option.addRelic ?? "", (v) => {
          const copy = [...options];
          copy[index] = { ...option, addRelic: v || undefined };
          onCommit(copy);
        })),
        field("随机遗物池（逗号分隔 id，随机获得一件）", textInput(
          (option.addRelicPool ?? []).join(","),
          (v) => {
            const copy = [...options];
            copy[index] = {
              ...option,
              addRelicPool: v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            };
            onCommit(copy);
          }
        )),
        field("移除卡牌数", numInput(option.removeCards ?? 0, (v) => {
          const copy = [...options];
          copy[index] = { ...option, removeCards: v > 0 ? v : undefined };
          onCommit(copy);
        }, 0, 99)),
        field("失去最大生命", numInput(option.loseMaxHp ?? 0, (v) => {
          const copy = [...options];
          copy[index] = { ...option, loseMaxHp: v > 0 ? v : undefined };
          onCommit(copy);
        }, 0, 999)),
        field("触发战斗（怪物 id）", textInput(option.fightEnemy ?? "", (v) => {
          const copy = [...options];
          copy[index] = { ...option, fightEnemy: v || undefined };
          onCommit(copy);
        })),
        field("随机升级一张牌", checkboxInput(Boolean(option.upgradeRandomCard), (v) => {
          const copy = [...options];
          copy[index] = { ...option, upgradeRandomCard: v || undefined };
          onCommit(copy);
        }))
      );
      const effectsBox = el("div", "form-effects");
      renderEffectList(effectsBox, option.effects, (next) => {
        const copy = [...options];
        copy[index] = { ...option, effects: next };
        onCommit(copy);
      });
      card.append(header, fields, effectsBox);
      container.appendChild(card);
    });
    container.appendChild(
      button("+ 添加选项", () => {
        onCommit([...options, { label: "继续", effects: [] }]);
      }, "btn btn-small")
    );
  }

  function download(filename: string, content: string): void {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderTabs();
  renderList();
  renderForm();
  renderBackend();
  root.append(header, tabs, body);
  app.replaceChildren(root);
}
