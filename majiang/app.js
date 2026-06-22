"use strict";

const SUIT_NAMES = ["万", "条", "筒"];
const SUIT_CLASS = ["suit-0", "suit-1", "suit-2"];
const SAVE_KEY = "pixian-mahjong-web-save-v1";
const DEFAULT_SAVE = {
  coins: 999,
  stats: { wins: 5, zimo: 2, gangs: 3, qing_yi_se: 0 },
  unlocked: ["初到茶馆"]
};

function clonePlain(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

const ACHIEVEMENTS = [
  ["初到茶馆", "赢得人生的第一局麻将"],
  ["自摸狂人", "累计自摸达到 3 次"],
  ["刮风下雨", "累计杠牌达到 5 次"],
  ["清一色信仰", "成功胡出一次清一色"],
  ["家里有矿", "资产累计突破 5000 金币"],
  ["老辈子", "资产破万且胜场达到 10 次"]
];

function tileToStr(tileId) {
  return `${(tileId % 9) + 1}${SUIT_NAMES[Math.floor(tileId / 9)]}`;
}

function cloneCounts(counts) {
  return counts.slice();
}

function canHu(handCounts, queColor) {
  if (
    queColor !== -1 &&
    handCounts.some((count, index) => count > 0 && Math.floor(index / 9) === queColor)
  ) {
    return false;
  }

  if (handCounts.reduce((sum, count) => sum + count, 0) % 3 !== 2) {
    return false;
  }

  function dfs(counts) {
    if (counts.reduce((sum, count) => sum + count, 0) === 0) {
      return true;
    }

    for (let i = 0; i < 27; i += 1) {
      if (counts[i] <= 0) {
        continue;
      }

      if (counts[i] >= 3) {
        counts[i] -= 3;
        if (dfs(counts)) {
          return true;
        }
        counts[i] += 3;
      }

      if (i % 9 <= 6 && counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i] -= 1;
        counts[i + 1] -= 1;
        counts[i + 2] -= 1;
        if (dfs(counts)) {
          return true;
        }
        counts[i] += 1;
        counts[i + 1] += 1;
        counts[i + 2] += 1;
      }

      return false;
    }

    return true;
  }

  for (let i = 0; i < 27; i += 1) {
    if (handCounts[i] >= 2) {
      const temp = cloneCounts(handCounts);
      temp[i] -= 2;
      if (dfs(temp)) {
        return true;
      }
    }
  }

  return false;
}

function calculateFan(handCounts, pengs, gangs, isZimo) {
  let fan = 0;
  const types = [];
  const suits = [0, 0, 0];

  for (let i = 0; i < 27; i += 1) {
    if (handCounts[i] > 0 || pengs.includes(i) || gangs.includes(i)) {
      suits[Math.floor(i / 9)] += 1;
    }
  }

  if (suits.filter(Boolean).length === 1) {
    fan += 2;
    types.push("清一色");
  }

  const temp = cloneCounts(handCounts);
  for (let i = 0; i < 27; i += 1) {
    while (temp[i] >= 3) {
      temp[i] -= 3;
    }
  }

  if (temp.reduce((sum, count) => sum + count, 0) === 2 && temp.some((count) => count === 2)) {
    fan += 1;
    types.push("大对子");
  }

  if (fan === 0) {
    types.push("平胡");
  }

  const gen = handCounts.filter((count) => count === 4).length + gangs.length;
  if (gen > 0) {
    fan += gen;
    types.push(`带${gen}根`);
  }

  if (isZimo) {
    fan += 1;
    types.push("自摸");
  }

  if (fan > 4) {
    fan = 4;
    types.push("[极品]");
  }

  return { fan, money: 2 ** fan, desc: types.join(" + ") };
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function totalTiles(counts) {
  return counts.reduce((sum, count) => sum + count, 0);
}

function tileListFromCounts(counts) {
  const tiles = [];
  for (let i = 0; i < counts.length; i += 1) {
    for (let j = 0; j < counts[i]; j += 1) {
      tiles.push(i);
    }
  }
  return tiles;
}

class Player {
  constructor(uid, isHuman = false, name = "AI") {
    this.uid = uid;
    this.isHuman = isHuman;
    this.name = name;
    this.handCounts = Array(27).fill(0);
    this.pengs = [];
    this.gangs = [];
    this.discardedTiles = [];
    this.queColor = -1;
    this.isHu = false;
    this.newestTile = -1;
    this.mustDiscard = false;
  }

  autoQue() {
    const countsBySuit = [
      this.handCounts.slice(0, 9).reduce((sum, count) => sum + count, 0),
      this.handCounts.slice(9, 18).reduce((sum, count) => sum + count, 0),
      this.handCounts.slice(18, 27).reduce((sum, count) => sum + count, 0)
    ];
    this.queColor = countsBySuit.indexOf(Math.min(...countsBySuit));
  }

  autoDiscard() {
    const qs = this.queColor * 9;
    const queTiles = [];
    for (let i = qs; i < qs + 9; i += 1) {
      if (this.handCounts[i] > 0) {
        queTiles.push(i);
      }
    }
    if (queTiles.length) {
      return queTiles[Math.floor(Math.random() * queTiles.length)];
    }

    const available = [];
    for (let i = 0; i < 27; i += 1) {
      if (this.handCounts[i] > 0) {
        available.push(i);
      }
    }

    let best = available[0];
    let lowest = 9999;
    for (const tile of available) {
      let score = 0;
      const count = this.handCounts[tile];
      if (count >= 3) {
        score += 100;
      } else if (count === 2) {
        score += 50;
      }

      const suitStart = Math.floor(tile / 9) * 9;
      const suitEnd = suitStart + 8;
      if (tile > suitStart && this.handCounts[tile - 1] > 0) {
        score += 15;
      }
      if (tile < suitEnd && this.handCounts[tile + 1] > 0) {
        score += 15;
      }
      if (score < lowest) {
        lowest = score;
        best = tile;
      }
    }

    return best;
  }
}

class MahjongGame {
  constructor(saveData) {
    this.aiNamePool = [
      "张嬢嬢",
      "李大爷",
      "王幺妹",
      "赵老哥",
      "春熙路雀圣",
      "九眼桥赌神",
      "宽窄巷子豹子",
      "太古里包租婆",
      "川西老江湖"
    ];

    this.totalCoins = saveData.coins ?? 1000;
    this.stats = { wins: 0, zimo: 0, gangs: 0, qing_yi_se: 0, ...saveData.stats };
    this.unlocked = Array.isArray(saveData.unlocked) ? [...saveData.unlocked] : [];
    this.toast = null;
    this.celebration = null;
    this.resetGame();
  }

  snapshotSave() {
    return {
      coins: this.totalCoins,
      stats: this.stats,
      unlocked: this.unlocked
    };
  }

  resetGame() {
    this.deck = [];
    for (let i = 0; i < 27; i += 1) {
      this.deck.push(i, i, i, i);
    }
    shuffle(this.deck);

    const chosenNames = shuffle([...this.aiNamePool]).slice(0, 3);
    this.players = [new Player(0, true, "你")];
    for (let i = 1; i < 4; i += 1) {
      this.players.push(new Player(i, false, chosenNames[i - 1]));
    }

    for (let pid = 0; pid < 4; pid += 1) {
      const drawCount = pid === 0 ? 14 : 13;
      for (let i = 0; i < drawCount; i += 1) {
        const tile = this.deck.pop();
        this.players[pid].handCounts[tile] += 1;
        if (pid === 0) {
          this.players[0].newestTile = tile;
        }
      }
    }

    this.state = "CHOOSE_QUE";
    this.currentTurn = 0;
    this.actionInfo = null;
    this.actionLog = "请选择定缺花色";
    this.settlements = [];
    this.celebration = null;
    this.checkAchievements();
  }

  chooseQue(color) {
    if (this.state !== "CHOOSE_QUE") {
      return;
    }
    this.players[0].queColor = color;
    for (const ai of this.players.slice(1)) {
      ai.autoQue();
    }
    this.state = "PLAYING";
    this.actionLog = "游戏开始，请出牌";
    this.checkSelfActions(0);
  }

  checkGameOver() {
    const huCount = this.players.filter((player) => player.isHu).length;
    if (huCount >= 3 || this.deck.length === 0) {
      this.state = "GAME_OVER";
    }
  }

  advanceTurn(fromPid = null) {
    this.checkGameOver();
    if (this.state === "GAME_OVER") {
      return;
    }

    const basePid = fromPid ?? this.currentTurn;
    this.currentTurn = (basePid + 1) % 4;
    while (this.players[this.currentTurn].isHu) {
      this.currentTurn = (this.currentTurn + 1) % 4;
    }

    if (this.currentTurn === 0 && !this.players[0].mustDiscard) {
      this.playerDrawTile(0);
    }
  }

  playerDrawTile(pid, fromBack = false) {
    if (!this.deck.length) {
      this.checkGameOver();
      return;
    }

    const tile = fromBack ? this.deck.shift() : this.deck.pop();
    const player = this.players[pid];
    player.handCounts[tile] += 1;
    player.newestTile = tile;
    player.mustDiscard = false;

    if (pid === 0) {
      this.checkSelfActions(0);
    }
  }

  checkSelfActions(pid) {
    const player = this.players[pid];
    const actions = [];
    const isZimo = canHu(player.handCounts, player.queColor);
    if (isZimo) {
      actions.push("胡");
    }

    const gangTiles = [];
    if (player.queColor !== -1) {
      for (let i = 0; i < 27; i += 1) {
        if (Math.floor(i / 9) === player.queColor) {
          continue;
        }
        if (player.handCounts[i] === 4) {
          gangTiles.push(["暗杠", i]);
        }
        if (player.handCounts[i] === 1 && player.pengs.includes(i)) {
          gangTiles.push(["加杠", i]);
        }
      }
    }

    if (gangTiles.length) {
      actions.push("杠");
    }

    if (pid === 0 && actions.length) {
      let result = { fan: 0, money: 0, desc: "" };
      if (isZimo) {
        result = calculateFan(player.handCounts, player.pengs, player.gangs, true);
      }
      this.actionInfo = {
        type: "SELF_ACTION",
        actions,
        gangTiles,
        desc: result.desc,
        fan: result.fan,
        money: result.money,
        tile: -1
      };
      this.state = "OFFER_ACTION";
      return true;
    }

    return false;
  }

  processGlobalInterrupt(discardTile, sourcePid) {
    const interrupts = [];

    for (let pid = 0; pid < 4; pid += 1) {
      if (pid === sourcePid || this.players[pid].isHu) {
        continue;
      }

      const player = this.players[pid];
      player.handCounts[discardTile] += 1;
      const canHuFlag = canHu(player.handCounts, player.queColor);
      player.handCounts[discardTile] -= 1;
      const isQue = player.queColor !== -1 && Math.floor(discardTile / 9) === player.queColor;

      if (canHuFlag) {
        interrupts.push({ pid, action: "胡" });
      } else if (!isQue) {
        if (player.handCounts[discardTile] === 3) {
          interrupts.push({ pid, action: "杠" });
        } else if (player.handCounts[discardTile] >= 2) {
          interrupts.push({ pid, action: "碰" });
        }
      }
    }

    if (!interrupts.length) {
      return false;
    }

    const hus = interrupts.filter((item) => item.action === "胡");
    if (hus.length) {
      const humanHu = hus.find((item) => item.pid === 0);
      if (humanHu) {
        this.actionInfo = {
          type: "INTERRUPT",
          actions: ["胡"],
          tile: discardTile,
          source: sourcePid,
          pendingAiHu: hus.filter((item) => item.pid !== 0)
        };
        this.state = "OFFER_ACTION";
        return true;
      }

      this.resolveAiHuList(hus, discardTile, sourcePid);
      return true;
    }

    interrupts.sort((a, b) => {
      const score = (item) => (item.action === "杠" ? 2 : 1);
      return score(b) - score(a);
    });

    const bestAct = interrupts[0];
    if (bestAct.pid === 0) {
      this.actionInfo = {
        type: "INTERRUPT",
        actions: [bestAct.action],
        tile: discardTile,
        source: sourcePid,
        pendingAiHu: []
      };
      this.state = "OFFER_ACTION";
      return true;
    }

    this.resolveAiPengGang(bestAct, discardTile, sourcePid);
    return true;
  }

  removeLastDiscard(sourcePid) {
    const source = this.players[sourcePid];
    if (source.discardedTiles.length) {
      source.discardedTiles.pop();
    }
  }

  resolveAiHuList(hus, discardTile, sourcePid) {
    for (const hu of hus) {
      const ai = this.players[hu.pid];
      ai.isHu = true;
      ai.handCounts[discardTile] += 1;
      const result = calculateFan(ai.handCounts, ai.pengs, ai.gangs, false);
      this.totalCoins -= result.money;
      this.settlements.push(`${ai.name} 点炮胡 (${result.desc}) 赢取 ${result.money} 分`);
      this.actionLog = `${ai.name} 截胡了`;
      this.triggerCelebration(hu.pid, false);
    }

    this.removeLastDiscard(sourcePid);
    this.advanceTurn(sourcePid);
  }

  resolveAiPengGang(bestAct, discardTile, sourcePid) {
    const ai = this.players[bestAct.pid];
    this.removeLastDiscard(sourcePid);

    if (bestAct.action === "杠") {
      ai.handCounts[discardTile] -= 3;
      ai.gangs.push(discardTile);
      this.currentTurn = bestAct.pid;
      this.playerDrawTile(bestAct.pid, true);
      ai.mustDiscard = true;
      this.actionLog = `${ai.name} 明杠`;
      return;
    }

    ai.handCounts[discardTile] -= 2;
    ai.pengs.push(discardTile);
    ai.newestTile = -1;
    ai.mustDiscard = true;
    this.currentTurn = bestAct.pid;
    this.actionLog = `${ai.name} 碰牌`;
  }

  executeAiTurn() {
    if (this.state !== "PLAYING" || this.currentTurn === 0) {
      return;
    }

    const ai = this.players[this.currentTurn];
    if (ai.isHu) {
      this.advanceTurn();
      return;
    }

    if (!ai.mustDiscard) {
      this.playerDrawTile(this.currentTurn);
    }

    if (canHu(ai.handCounts, ai.queColor)) {
      ai.isHu = true;
      const result = calculateFan(ai.handCounts, ai.pengs, ai.gangs, true);
      this.totalCoins -= result.money * 3;
      this.settlements.push(`${ai.name} 自摸 (${result.desc}) 赢取 ${result.money * 3} 分`);
      this.actionLog = `${ai.name} 自摸胡牌了`;
      this.triggerCelebration(ai.uid, true);
      this.advanceTurn();
      return;
    }

    const gangTiles = [];
    if (ai.queColor !== -1) {
      for (let i = 0; i < 27; i += 1) {
        if (Math.floor(i / 9) === ai.queColor) {
          continue;
        }
        if (ai.handCounts[i] === 4) {
          gangTiles.push(["暗杠", i]);
        }
        if (ai.handCounts[i] === 1 && ai.pengs.includes(i)) {
          gangTiles.push(["加杠", i]);
        }
      }
    }

    if (gangTiles.length) {
      const [gangType, tile] = gangTiles[0];
      if (gangType === "暗杠") {
        ai.handCounts[tile] -= 4;
        ai.gangs.push(tile);
        this.actionLog = `${ai.name} 暗杠`;
      } else {
        ai.handCounts[tile] -= 1;
        ai.pengs = ai.pengs.filter((peng) => peng !== tile);
        ai.gangs.push(tile);
        this.actionLog = `${ai.name} 加杠`;
      }
      this.playerDrawTile(this.currentTurn, true);
      ai.mustDiscard = true;
      return;
    }

    const discard = ai.autoDiscard();
    ai.handCounts[discard] -= 1;
    ai.discardedTiles.push(discard);
    ai.mustDiscard = false;
    this.actionLog = `${ai.name} 打出了 ${tileToStr(discard)}`;

    if (this.processGlobalInterrupt(discard, this.currentTurn)) {
      return;
    }

    this.advanceTurn();
  }

  humanDiscard(tile) {
    if (this.state !== "PLAYING" || this.currentTurn !== 0 || this.players[0].isHu) {
      return false;
    }

    const player = this.players[0];
    if (player.handCounts[tile] <= 0) {
      return false;
    }

    if (player.queColor !== -1) {
      const hasQue = player.handCounts.some(
        (count, index) => count > 0 && Math.floor(index / 9) === player.queColor
      );
      if (hasQue && Math.floor(tile / 9) !== player.queColor) {
        this.actionLog = `还没打完缺门，请先打${SUIT_NAMES[player.queColor]}牌`;
        return false;
      }
    }

    player.handCounts[tile] -= 1;
    player.discardedTiles.push(tile);
    player.newestTile = -1;
    player.mustDiscard = false;
    this.actionLog = `你打出了 ${tileToStr(tile)}`;

    if (this.processGlobalInterrupt(tile, 0)) {
      return true;
    }

    this.advanceTurn();
    return true;
  }

  humanAction(action) {
    if (this.state !== "OFFER_ACTION" || !this.actionInfo) {
      return;
    }

    const info = this.actionInfo;
    const player = this.players[0];

    if (info.type === "SELF_ACTION") {
      if (action === "胡") {
        player.isHu = true;
        this.totalCoins += info.money * 3;
        this.stats.wins += 1;
        this.stats.zimo += 1;
        if (info.desc.includes("清一色")) {
          this.stats.qing_yi_se += 1;
        }
        this.settlements.push(`你 自摸 (${info.desc}) 赢取 ${info.money * 3} 分`);
        this.state = "PLAYING";
        this.actionLog = "你自摸了";
        this.triggerCelebration(0, true);
        this.checkAchievements();
        this.advanceTurn();
      } else if (action === "杠") {
        const [gangType, tile] = info.gangTiles[0];
        if (gangType === "暗杠") {
          player.handCounts[tile] -= 4;
          player.gangs.push(tile);
          this.actionLog = "你暗杠了";
        } else {
          player.handCounts[tile] -= 1;
          player.pengs = player.pengs.filter((peng) => peng !== tile);
          player.gangs.push(tile);
          this.actionLog = "你加杠了";
        }
        this.stats.gangs += 1;
        this.checkAchievements();
        this.currentTurn = 0;
        this.state = "PLAYING";
        this.playerDrawTile(0, true);
        player.mustDiscard = true;
      } else {
        this.state = "PLAYING";
      }
      this.actionInfo = null;
      return;
    }

    if (info.type === "INTERRUPT") {
      const tile = info.tile;
      const source = info.source;

      if (["杠", "碰", "胡"].includes(action)) {
        this.removeLastDiscard(source);
      }

      if (action === "胡") {
        player.handCounts[tile] += 1;
        player.isHu = true;
        const result = calculateFan(player.handCounts, player.pengs, player.gangs, false);
        this.totalCoins += result.money;
        this.stats.wins += 1;
        if (result.desc.includes("清一色")) {
          this.stats.qing_yi_se += 1;
        }
        this.settlements.push(`你 点炮胡 (${result.desc}) 赢取 ${result.money} 分`);
        this.state = "PLAYING";
        this.actionLog = "你胡了";
        this.triggerCelebration(0, false);
        this.checkAchievements();
        this.advanceTurn(source);
      } else if (action === "杠") {
        player.handCounts[tile] -= 3;
        player.gangs.push(tile);
        this.stats.gangs += 1;
        this.checkAchievements();
        this.currentTurn = 0;
        this.state = "PLAYING";
        this.playerDrawTile(0, true);
        player.mustDiscard = true;
        this.actionLog = "明杠，请出牌";
      } else if (action === "碰") {
        player.handCounts[tile] -= 2;
        player.pengs.push(tile);
        player.newestTile = -1;
        player.mustDiscard = true;
        this.currentTurn = 0;
        this.state = "PLAYING";
        this.actionLog = "碰，请直接出牌";
      } else {
        this.state = "PLAYING";
        if (info.pendingAiHu?.length) {
          this.resolveAiHuList(info.pendingAiHu, tile, source);
        } else {
          this.advanceTurn(source);
        }
      }
      this.actionInfo = null;
    }
  }

  triggerCelebration(pid, isZimo) {
    const name = this.players[pid].name;
    this.celebration = {
      message: isZimo ? `${name} 杠上开花 / 自摸啦` : `${name} 胡牌啦`,
      isZimo,
      until: Date.now() + 2500
    };
  }

  clearCelebration() {
    this.celebration = null;
  }

  checkAchievements() {
    const checks = new Map([
      ["初到茶馆", this.stats.wins >= 1],
      ["自摸狂人", this.stats.zimo >= 3],
      ["刮风下雨", this.stats.gangs >= 5],
      ["清一色信仰", this.stats.qing_yi_se >= 1],
      ["家里有矿", this.totalCoins >= 5000],
      ["老辈子", this.totalCoins >= 10000 && this.stats.wins >= 10]
    ]);

    let unlockedSomething = false;
    for (const [name, isReady] of checks.entries()) {
      if (isReady && !this.unlocked.includes(name)) {
        this.unlocked.push(name);
        this.toast = {
          message: `解锁新成就：${name}`,
          until: Date.now() + 4000
        };
        unlockedSomething = true;
      }
    }

    return unlockedSomething;
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return clonePlain(DEFAULT_SAVE);
    }
    return { ...clonePlain(DEFAULT_SAVE), ...JSON.parse(raw) };
  } catch {
    return clonePlain(DEFAULT_SAVE);
  }
}

function saveGame(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.snapshotSave()));
  } catch {
    // localStorage can be disabled in private browsing. Gameplay can continue without persistence.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTile(tile, { mini = false, back = false, button = false, classes = "", data = "" } = {}) {
  const tag = button ? "button" : "div";
  const buttonAttrs = button ? 'type="button"' : "";
  const suit = Math.floor(tile / 9);
  const cls = [
    button ? "tile-button" : "tile",
    mini ? "mini-tile" : "",
    back ? "tile-back" : SUIT_CLASS[suit],
    classes
  ].filter(Boolean).join(" ");

  if (back) {
    return `<${tag} class="${cls}" ${buttonAttrs} ${data} aria-label="背面牌"></${tag}>`;
  }

  return `
    <${tag} class="${cls}" ${buttonAttrs} ${data} aria-label="${tileToStr(tile)}">
      <span class="tile-face">
        <span>
          <span class="tile-number">${(tile % 9) + 1}</span>
          <span class="tile-suit">${SUIT_NAMES[suit]}</span>
        </span>
      </span>
    </${tag}>
  `;
}

function renderMelds(player, mini = false) {
  const parts = [];
  for (const tile of player.gangs) {
    parts.push(`
      <div class="meld-group" title="杠 ${tileToStr(tile)}">
        <span class="meld-label">杠</span>
        ${renderTile(tile, { mini })}
        ${renderTile(tile, { mini })}
        ${renderTile(tile, { mini })}
        ${renderTile(tile, { mini })}
      </div>
    `);
  }
  for (const tile of player.pengs) {
    parts.push(`
      <div class="meld-group" title="碰 ${tileToStr(tile)}">
        <span class="meld-label">碰</span>
        ${renderTile(tile, { mini })}
        ${renderTile(tile, { mini })}
        ${renderTile(tile, { mini })}
      </div>
    `);
  }
  return parts.join("");
}

function renderSeat(game, pid, className) {
  const player = game.players[pid];
  const handCount = totalTiles(player.handCounts);
  const backTiles = Array.from({ length: handCount }, () => renderTile(0, { mini: true, back: true })).join("");
  const que = player.queColor === -1 ? "未定缺" : `缺${SUIT_NAMES[player.queColor]}`;
  const turnClass = game.currentTurn === pid && game.state === "PLAYING" ? " is-turn" : "";
  return `
    <section class="seat ${className}" data-seat="${pid}">
      <div class="seat-header">
        <div class="seat-name${turnClass}">${escapeHtml(player.name)}</div>
        <div class="que-pill">${que}</div>
      </div>
      <div class="seat-body">
        <div class="meld-row">${renderMelds(player, true) || '<span class="empty-note">无副露</span>'}</div>
        <div class="ai-hand">${player.isHu ? '<span class="hu-pill">已胡</span>' : backTiles}</div>
      </div>
    </section>
  `;
}

function renderRiver(game, pid) {
  const player = game.players[pid];
  const tiles = player.discardedTiles
    .map((tile) => renderTile(tile, { mini: true }))
    .join("");
  return `
    <section class="river">
      <div class="river-name">${escapeHtml(player.name)}</div>
      <div class="discard-grid">${tiles || '<span class="empty-note">暂无弃牌</span>'}</div>
    </section>
  `;
}

function getHumanHandView(game) {
  const player = game.players[0];
  const temp = cloneCounts(player.handCounts);
  const hasNewest = player.newestTile !== -1 && temp[player.newestTile] > 0;
  if (hasNewest) {
    temp[player.newestTile] -= 1;
  }
  const tiles = tileListFromCounts(temp).map((tile) => ({ tile, isNewest: false }));
  if (hasNewest) {
    tiles.push({ tile: player.newestTile, isNewest: true });
  }
  return tiles;
}

function renderHumanPanel(game) {
  const player = game.players[0];
  const canPlay = game.state === "PLAYING" && game.currentTurn === 0 && !player.isHu;
  const hasQue = player.queColor !== -1 && player.handCounts.some(
    (count, index) => count > 0 && Math.floor(index / 9) === player.queColor
  );
  const tiles = getHumanHandView(game).map(({ tile, isNewest }) => {
    const isQue = player.queColor !== -1 && Math.floor(tile / 9) === player.queColor;
    const blocked = canPlay && hasQue && !isQue;
    const classes = [
      canPlay ? "is-playable" : "",
      isNewest ? "is-new" : "",
      isQue ? "is-que" : "",
      blocked ? "is-blocked" : ""
    ].filter(Boolean).join(" ");
    return renderTile(tile, {
      button: true,
      classes,
      data: `data-discard="${tile}" ${blocked ? 'aria-disabled="true"' : ""}`
    });
  }).join("");

  return `
    <section class="human-panel">
      <div class="human-melds">${renderMelds(player, false) || '<span class="empty-note">碰杠区</span>'}</div>
      <div class="human-hand">${player.isHu ? '<span class="hu-pill">已经胡牌，观看血战</span>' : tiles}</div>
    </section>
  `;
}

function renderChooseQue(game) {
  const player = game.players[0];
  const counts = [0, 1, 2].map((suit) => {
    let count = 0;
    for (let tile = suit * 9; tile < suit * 9 + 9; tile += 1) {
      count += player.handCounts[tile];
    }
    return count;
  });

  return `
    <div class="overlay">
      <section class="modal-panel">
        <h2 class="modal-title">请选择定缺</h2>
        <p class="modal-copy">定缺后必须先打完这一门，手里不含缺门才可以胡牌。</p>
        <div class="que-grid">
          ${[0, 1, 2].map((suit) => `
            <button type="button" class="que-button ${SUIT_CLASS[suit]}" data-que="${suit}">
              <span class="que-main">缺 ${SUIT_NAMES[suit]}</span>
              <span class="que-sub">当前 ${counts[suit]} 张</span>
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderActionOverlay(game) {
  if (game.state !== "OFFER_ACTION" || !game.actionInfo) {
    return "";
  }

  const info = game.actionInfo;
  let title = "请选择操作";
  let copy = "";

  if (info.type === "SELF_ACTION") {
    title = info.actions.includes("胡") ? "自摸啦" : "发现有杠";
    copy = info.desc ? `${info.desc}，可赢取 ${info.money * 3} 分` : "杠后从牌尾补牌";
  } else {
    title = `有人打出 ${tileToStr(info.tile)}`;
    copy = "可以响应则先处理响应，过牌后继续血战。";
  }

  const actions = [...info.actions, "过"];
  return `
    <div class="overlay">
      <section class="action-panel">
        <h2 class="action-title">${title}</h2>
        <p class="action-copy">${copy}</p>
        <div class="action-buttons">
          ${actions.map((action) => `
            <button type="button" class="action-button ${action === "过" ? "pass" : ""}" data-action="${action}">
              ${action}
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderGameOver(game) {
  if (game.state !== "GAME_OVER") {
    return "";
  }
  const settlements = game.settlements.length
    ? game.settlements.map((line) => `<div class="settlement-line">${escapeHtml(line)}</div>`).join("")
    : '<div class="settlement-line">本局流局（黄庄）</div>';

  return `
    <div class="overlay">
      <section class="modal-panel">
        <h2 class="modal-title">血战到底 - 最终结算</h2>
        <div class="settlement-list">${settlements}</div>
        <button type="button" class="replay-button" data-restart="1">重新开始</button>
      </section>
    </div>
  `;
}

function renderAchievements(game) {
  return `
    <div class="overlay" data-close-achievements="1">
      <section class="modal-panel" data-stop-close="1">
        <h2 class="modal-title">老辈子荣誉室</h2>
        <div class="achievement-list">
          ${ACHIEVEMENTS.map(([name, desc]) => {
            const unlocked = game.unlocked.includes(name);
            return `
              <div class="achievement-card ${unlocked ? "" : "is-locked"}">
                <div class="achievement-name">${unlocked ? "已解锁" : "未解锁"} · ${name}</div>
                <div class="achievement-desc">${desc}</div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderCelebration(game) {
  if (!game.celebration || Date.now() >= game.celebration.until) {
    return "";
  }
  return `
    <div class="overlay celebration" data-skip-celebration="1">
      <div>
        <div class="celebration-title">${escapeHtml(game.celebration.message)}</div>
        <div class="celebration-note">点击可跳过动画</div>
      </div>
    </div>
  `;
}

function renderToast(game) {
  if (!game.toast || Date.now() >= game.toast.until) {
    return "";
  }
  return `<div class="toast">${escapeHtml(game.toast.message)}</div>`;
}

class MahjongApp {
  constructor(root) {
    this.root = root;
    this.game = new MahjongGame(loadSave());
    this.showAchievements = false;
    this.aiTimer = null;
    this.visualTimer = null;
    this.audioReady = false;
    this.soundEnabled = true;
    this.audioContext = null;
    this.bgm = document.getElementById("bgm");
    this.huSound = document.getElementById("huSound");
    this.zimoSound = document.getElementById("zimoSound");

    this.root.addEventListener("click", (event) => this.handleClick(event));
    document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "r") {
        this.game.resetGame();
        this.afterMutation();
      }
    });

    this.render();
    this.scheduleAi();
  }

  afterMutation() {
    saveGame(this.game);
    this.playPendingCelebrationSound();
    this.render();
    this.scheduleAi();
  }

  unlockAudio() {
    if (this.audioReady || !this.soundEnabled) {
      return;
    }
    this.audioReady = true;
    this.bgm.volume = 0.28;
    this.huSound.volume = 0.72;
    this.zimoSound.volume = 0.78;
    this.bgm.play().catch(() => {});
  }

  playTone(kind) {
    if (!this.soundEnabled || !this.audioReady) {
      return;
    }
    try {
      this.audioContext ??= new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = kind === "discard" ? "triangle" : "sine";
      oscillator.frequency.value = kind === "gang" ? 180 : kind === "peng" ? 260 : 420;
      gain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, this.audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.16);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.18);
    } catch {
      // WebAudio is optional.
    }
  }

  playPendingCelebrationSound() {
    if (!this.soundEnabled || !this.audioReady || !this.game.celebration) {
      return;
    }
    const sound = this.game.celebration.isZimo ? this.zimoSound : this.huSound;
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  handleClick(event) {
    const target = event.target.closest("button, [data-skip-celebration], [data-close-achievements]");
    if (!target) {
      return;
    }

    this.unlockAudio();

    if (target.matches("[data-stop-close]")) {
      return;
    }

    if (target.matches("[data-skip-celebration]")) {
      this.game.clearCelebration();
      this.afterMutation();
      return;
    }

    if (target.matches("[data-close-achievements]")) {
      this.showAchievements = false;
      this.render();
      return;
    }

    if (target.dataset.sound) {
      this.soundEnabled = !this.soundEnabled;
      if (!this.soundEnabled) {
        this.bgm.pause();
        this.huSound.pause();
        this.zimoSound.pause();
      } else {
        this.audioReady = false;
        this.unlockAudio();
      }
      this.render();
      return;
    }

    if (target.dataset.achievements) {
      this.showAchievements = true;
      this.render();
      return;
    }

    if (target.dataset.restart) {
      this.game.resetGame();
      this.afterMutation();
      return;
    }

    if (target.dataset.que) {
      this.game.chooseQue(Number(target.dataset.que));
      this.afterMutation();
      return;
    }

    if (target.dataset.action) {
      const action = target.dataset.action;
      this.game.humanAction(action);
      if (action === "碰") this.playTone("peng");
      if (action === "杠") this.playTone("gang");
      this.afterMutation();
      return;
    }

    if (target.dataset.discard) {
      const player = this.game.players[0];
      const tile = Number(target.dataset.discard);
      const hasQue = player.queColor !== -1 && player.handCounts.some(
        (count, index) => count > 0 && Math.floor(index / 9) === player.queColor
      );
      if (hasQue && Math.floor(tile / 9) !== player.queColor) {
        this.game.humanDiscard(tile);
        this.afterMutation();
        return;
      }
      if (this.game.humanDiscard(tile)) {
        this.playTone("discard");
      }
      this.afterMutation();
    }
  }

  scheduleAi() {
    clearTimeout(this.aiTimer);
    clearTimeout(this.visualTimer);

    const now = Date.now();
    const celebrationActive = this.game.celebration && now < this.game.celebration.until;
    const toastActive = this.game.toast && now < this.game.toast.until;

    if (celebrationActive) {
      this.visualTimer = setTimeout(() => {
        this.game.clearCelebration();
        this.afterMutation();
      }, this.game.celebration.until - now + 20);
      return;
    }

    if (toastActive) {
      this.visualTimer = setTimeout(() => this.render(), this.game.toast.until - now + 20);
    }

    if (this.game.state === "PLAYING" && this.game.currentTurn !== 0) {
      this.aiTimer = setTimeout(() => {
        const beforeLog = this.game.actionLog;
        this.game.executeAiTurn();
        if (this.game.actionLog.includes("碰牌") && this.game.actionLog !== beforeLog) this.playTone("peng");
        if (this.game.actionLog.includes("杠") && this.game.actionLog !== beforeLog) this.playTone("gang");
        if (this.game.actionLog.includes("打出了") && this.game.actionLog !== beforeLog) this.playTone("discard");
        this.afterMutation();
      }, 650);
    }
  }

  render() {
    const game = this.game;
    const currentPlayer = game.players[game.currentTurn];
    const humanQue = game.players[0].queColor === -1 ? "未定缺" : `缺${SUIT_NAMES[game.players[0].queColor]}`;
    const overlays = [
      game.state === "CHOOSE_QUE" ? renderChooseQue(game) : "",
      renderActionOverlay(game),
      renderGameOver(game),
      this.showAchievements ? renderAchievements(game) : "",
      renderCelebration(game),
      renderToast(game)
    ].join("");

    this.root.innerHTML = `
      <div class="game-frame">
        <header class="top-bar">
          <div class="brand">
            <div class="brand-mark">郫</div>
            <div>
              <h1 class="brand-title">郫县麻将</h1>
              <div class="brand-subtitle">血战到底 · 定缺 · 碰杠不吃</div>
            </div>
          </div>
          <div class="score-stack">
            <div class="metric">
              <span class="metric-label">剩余牌</span>
              <span class="metric-value">${game.deck.length}</span>
            </div>
            <div class="metric">
              <span class="metric-label">资产</span>
              <span class="metric-value">${game.totalCoins}</span>
            </div>
            <div class="metric">
              <span class="metric-label">你的定缺</span>
              <span class="metric-value">${humanQue}</span>
            </div>
          </div>
          <div class="tool-stack">
            <button type="button" class="icon-button" data-sound="1" title="${this.soundEnabled ? "关闭声音" : "打开声音"}" aria-label="${this.soundEnabled ? "关闭声音" : "打开声音"}">${this.soundEnabled ? "♪" : "×"}</button>
            <button type="button" class="icon-button" data-achievements="1" title="查看成就" aria-label="查看成就">★</button>
            <button type="button" class="icon-button" data-restart="1" title="重新开始" aria-label="重新开始">↻</button>
          </div>
        </header>

        <section class="table">
          ${renderSeat(game, 2, "seat-top")}
          ${renderSeat(game, 3, "seat-left")}
          ${renderSeat(game, 1, "seat-right")}

          <section class="center-board">
            <div class="round-meta">
              <span class="turn-pill is-active">当前：${escapeHtml(currentPlayer.name)}</span>
              <span class="turn-pill">胜场 ${game.stats.wins} · 自摸 ${game.stats.zimo} · 杠 ${game.stats.gangs}</span>
            </div>
            <div class="rivers">
              ${[2, 1, 3, 0].map((pid) => renderRiver(game, pid)).join("")}
            </div>
            <div class="log-strip">${escapeHtml(game.actionLog)}</div>
          </section>
        </section>

        ${renderHumanPanel(game)}
      </div>
      ${overlays}
    `;
  }
}

if (typeof window !== "undefined") {
  window.PixianMahjongCore = {
    SUIT_NAMES,
    tileToStr,
    canHu,
    calculateFan,
    Player,
    MahjongGame
  };

  window.addEventListener("DOMContentLoaded", () => {
    new MahjongApp(document.getElementById("app"));
  });
}
