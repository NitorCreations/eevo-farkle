/**
 * Farkle UI and Game Flow
 */

import { FarkleGame, findAllScoringOptions, findScoringCombinations, WINNING_SCORE, ACTIVE_RELICS, MOMENTUM_INCREMENT } from './game.js';
import * as eevo from './eevo.js';

// DOM Elements
const elements = {
  playerScore: document.getElementById('player-score'),
  aiScore: document.getElementById('ai-score'),
  playerTurnScore: document.getElementById('player-turn-score'),
  aiTurnScore: document.getElementById('ai-turn-score'),
  status: document.getElementById('status'),
  diceContainer: document.getElementById('dice-container'),
  rollInfo: document.getElementById('roll-info'),
  btnRoll: document.getElementById('btn-roll'),
  btnBank: document.getElementById('btn-bank'),
  btnNewGame: document.getElementById('btn-new-game'),
  insightContent: document.getElementById('insight-content'),
  decisionLog: document.getElementById('decision-log'),
  apiKeyInput: document.getElementById('api-key'),
  playerMomentum: document.getElementById('player-momentum'),
  aiMomentum: document.getElementById('ai-momentum'),
  hotHandProgress: document.getElementById('hot-hand-progress'),
};

// Game instance
let game = new FarkleGame();
let isProcessing = false;

// Die face rendering (using Unicode dice)
const dieFaces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/**
 * Initialize the app
 */
function init() {
  // Event listeners
  elements.btnRoll.addEventListener('click', handleRoll);
  elements.btnBank.addEventListener('click', handleBank);
  elements.btnNewGame.addEventListener('click', handleNewGame);
  elements.apiKeyInput.addEventListener('input', handleKeyInput);
  
  // Initial UI
  updateUI();
  logDecision('system', 'Game ready. Click "New Game" to start!');
}

/**
 * Set API key on input (in-memory only, not persisted)
 */
function handleKeyInput() {
  eevo.setApiKey(elements.apiKeyInput.value.trim());
}

/**
 * Start a new game
 */
function handleNewGame() {
  game.reset();
  prevMomentum = { player: null, ai: null };
  elements.decisionLog.innerHTML = '';
  elements.insightContent.innerHTML = '<p class="muted">Eevo decision reasoning will appear here after the AI takes its turn.</p>';
  updateUI();
  setStatus('Your turn! Roll the dice.');
  logDecision('system', 'New game started. First to 10,000 wins!');
}

/**
 * Handle roll button click
 */
async function handleRoll() {
  if (isProcessing || game.gameOver) return;
  
  // If dice are rolled and some are selected, confirm selection first before rolling
  if (game.currentDice.length > 0 && game.getSelectedDice().length > 0) {
    if (!confirmSelectionForRoll()) return;
  }
  
  isProcessing = true;
  elements.btnRoll.disabled = true;
  elements.btnBank.disabled = true;
  
  try {
    // Animate rolling
    await animateRolling();
    
    const result = game.roll();
    
    if (result.type === 'farkle') {
      renderDice(result.dice, [], true);
      setStatus('💀 FARKLE! No scoring dice.', 'farkle');
      logDecision('player', 'Farkle! Lost all turn points.', { dice: result.dice });
      
      await delay(1500);
      game.farkle();
      updateUI();
      
      // AI turn
      if (!game.gameOver) {
        await handleAITurn();
      }
    } else {
      renderDice(result.dice);
      updateRollInfo();
      setStatus('Select scoring dice to keep, then roll again or bank.');
      elements.btnBank.disabled = game.turnScore === 0;
    }
  } finally {
    isProcessing = false;
    if (!game.gameOver && game.currentPlayer === 'player') {
      elements.btnRoll.disabled = false;
    }
  }
}

/**
 * Handle bank button click
 */
async function handleBank() {
  if (isProcessing || game.gameOver) return;
  
  // Must select dice first if there's a roll
  const selected = game.getSelectedDice();
  if (game.currentDice.length > 0 && selected.length === 0) {
    setStatus('Select at least one scoring die first!');
    return;
  }
  
  // Confirm selection if dice selected
  if (selected.length > 0) {
    const result = game.confirmSelection();
    if (!result.valid) {
      setStatus(result.message);
      return;
    }
  }
  
  const bankedScore = game.turnScore;
  const bankResult = game.bank();
  
  // bankResult now includes momentum bonus & streak info
  const momentumInfo = bankResult && bankResult.bonus > 0
    ? `momentum bonus: +${Math.round(bankResult.bonus)} (streak ${bankResult.streak})`
    : `streak: ${bankResult ? bankResult.streak : 0}`;
  
  logDecision('player', `Banked ${bankResult ? bankResult.banked : bankedScore} points (${bankedScore} + momentum)`, {
    totalScore: game.playerScore,
    momentum: momentumInfo,
  });
  
  updateUI();
  
  if (game.gameOver) {
    handleGameOver();
  } else {
    // AI turn
    await handleAITurn();
  }
}

/**
 * Handle dice selection
 */
function handleDiceClick(index) {
  if (isProcessing || game.gameOver || game.currentPlayer !== 'player') return;
  if (game.currentDice.length === 0) return;
  
  game.selectDie(index);
  
  const selected = game.getSelectedDice();
  const scoring = findScoringCombinations(selected);
  
  // Update dice display
  renderDice(game.currentDice, Array.from(game.selectedIndices));
  
  // Update roll info
  if (selected.length > 0) {
    if (scoring.score > 0) {
      const combos = scoring.combinations.map(c => c.name).join(', ');
      elements.rollInfo.innerHTML = `Selected: <strong>+${scoring.score}</strong> (${combos})`;
      elements.btnBank.disabled = false;
    } else {
      elements.rollInfo.innerHTML = '<span style="color: var(--danger)">Invalid selection - must all score</span>';
      elements.btnBank.disabled = true;
    }
  } else {
    updateRollInfo();
    elements.btnBank.disabled = game.turnScore === 0;
  }
}

/**
 * Confirm dice selection and prepare for next roll
 */
function confirmSelectionForRoll() {
  const selected = game.getSelectedDice();
  if (selected.length === 0) return false;
  
  const result = game.confirmSelection();
  if (!result.valid) {
    setStatus(result.message);
    return false;
  }
  
  logDecision('player', `Kept ${selected.join(', ')} for +${result.score} points`, {
    turnScore: game.turnScore,
    remaining: result.remaining
  });
  
  if (result.hotDice) {
    if (result.hotHandBonus > 0) {
      setStatus(`🔥 HOT HAND! +${result.hotHandBonus} bonus (${result.score} worth tripled) — roll all 6 again!`);
      logDecision('player', `🔥 Hot Hand! ${result.score} tripled to +${result.score * 3} this segment`);
    } else {
      setStatus('🔥 HOT DICE! All dice scored - roll all 6 again!');
    }
  }
  
  updateUI();
  return true;
}

/**
 * Handle AI turn
 */
async function handleAITurn() {
  if (game.currentPlayer !== 'ai') return;
  
  if (!eevo.hasApiKey()) {
    setStatus('⚠️ No Eevo API key set. Enter one in the top bar to let the AI play.');
    game.farkle();
    updateUI();
    return;
  }
  
  isProcessing = true;
  elements.btnRoll.disabled = true;
  elements.btnBank.disabled = true;
  
  setStatus("🤖 Eevo AI is thinking...");
  
  // Collect all decisions this turn so we can display the full history
  const aiTurnLog = [];
  let turnEndType = null; // 'banked', 'farkle', 'error'
  let turnBankedScore = 0;
  
  try {
    await delay(500);
    
    let safetyCounter = 0;
    const MAX_AI_ROLLS = 20;
    
    while (game.currentPlayer === 'ai' && !game.gameOver) {
      safetyCounter++;
      if (safetyCounter > MAX_AI_ROLLS) {
        console.error('AI turn safety limit reached — banking forcibly');
        if (game.turnScore > 0) {
          game.bank();
        } else {
          game.farkle();
        }
        break;
      }
      
      // Roll dice
      await animateRolling();
      const rollResult = game.roll();
      
      if (rollResult.type === 'farkle') {
        renderDice(rollResult.dice, [], true, true);
        setStatus('💀 AI Farkle! Lost all turn points.');
        logDecision('ai', 'Farkle! Lost all turn points.', { dice: rollResult.dice });
        
        aiTurnLog.push({
          type: 'farkle',
          dice: [...rollResult.dice],
          turnScore: game.turnScore
        });
        
        turnEndType = 'farkle';
        await delay(2000);
        game.farkle();
        break;
      }
      
      renderDice(rollResult.dice, [], false, true);
      await delay(800);
      
      // Get scoring options
      const options = findAllScoringOptions(rollResult.dice);
      
      if (options.length === 0) {
        // Should not happen as we already checked for farkle
        game.farkle();
        break;
      }
      
      // Make AI decision
      setStatus("🧠 Eevo is analyzing options...");
      let aiDecision;
      try {
        aiDecision = await eevo.makeAIDecision(game.getState(), options, options[0].remaining);
      } catch (err) {
        console.error('Eevo API error:', err);
        logDecision('ai', `Eevo API error: ${err.message}. Turn ended.`);
        setStatus('💥 Eevo API error — ending turn.');
        aiTurnLog.push({ type: 'error', message: err.message });
        turnEndType = 'error';
        game.farkle();
        break;
      }
      
      // Select and confirm dice
      const selectedOpt = aiDecision.selectedOption;
      if (!selectedOpt || !selectedOpt.dice || !selectedOpt.dice.length) {
        aiTurnLog.push({ type: 'error', message: 'Invalid selection' });
        turnEndType = 'error';
        game.farkle();
        break;
      }
      
      // Highlight selected dice
      const selectedIndices = [];
      const diceCopy = [...rollResult.dice];
      for (const d of selectedOpt.dice) {
        const idx = diceCopy.findIndex((v, i) => v === d && !selectedIndices.includes(i));
        if (idx !== -1) selectedIndices.push(idx);
      }
      
      renderDice(rollResult.dice, selectedIndices, false, true);
      await delay(1000);
      
      // Actually select in game state
      for (const idx of selectedIndices) {
        game.selectDie(idx);
      }
      
      const confirmResult = game.confirmSelection();
      
      logDecision('ai', `Kept [${selectedOpt.dice.join(', ')}] for +${selectedOpt.score}`, {
        turnScore: game.turnScore,
        confidence: `${(aiDecision.diceDecision.confidence * 100).toFixed(0)}%`
      });
      
      // Record this roll's full decision data
      aiTurnLog.push({
        type: 'roll',
        dice: [...rollResult.dice],
        keptDice: [...selectedOpt.dice],
        keptScore: selectedOpt.score,
        cumulativeScore: game.turnScore,
        optionsCount: options.length,
        diceDecision: aiDecision.diceDecision,
        rollDecision: aiDecision.rollDecision,
        finalAction: aiDecision.finalAction,
        remaining: confirmResult.remaining,
        hotDice: confirmResult.hotDice
      });
      
      updateUI();
      await delay(600);
      
      // Roll or bank decision
      // Hot dice (all 6 scored) — Hot Hand triples the turn, then must roll all 6 again
      if (confirmResult.hotDice) {
        const hotBonus = confirmResult.hotHandBonus > 0 ? confirmResult.hotHandBonus : 0;
        const msg = hotBonus > 0
          ? `🔥 HOT HAND! +${hotBonus} bonus (${confirmResult.segmentScore} tripled) — roll all 6 again!`
          : '🔥 Hot dice — must roll all 6 again!';
        setStatus(msg);
        logDecision('ai', hotBonus > 0
          ? `🔥 Hot Hand! ${confirmResult.segmentScore} tripled to +${confirmResult.segmentScore * 3} this segment`
          : 'Hot dice! Must roll all 6 again.');
        await delay(800);
        continue;
      }
      
      if (aiDecision.finalAction === 'bank') {
        const bankedScore = game.turnScore;
        const bankResult = game.bank();
        turnBankedScore = bankResult ? bankResult.banked : bankedScore;
        
        const momentumInfo = bankResult && bankResult.bonus > 0
          ? `momentum bonus: +${Math.round(bankResult.bonus)} (streak ${bankResult.streak})`
          : `streak: ${bankResult ? bankResult.streak : 0}`;
        
        logDecision('ai', `Banked ${bankResult ? bankResult.banked : bankedScore} points (${bankedScore} + momentum)`, {
          totalScore: game.aiScore,
          momentum: momentumInfo,
          confidence: aiDecision.rollDecision ? `${(aiDecision.rollDecision.bankProbability * 100).toFixed(0)}%` : 'N/A'
        });
        
        setStatus(`AI banked ${bankResult ? bankResult.banked : bankedScore} points!`);
        turnEndType = 'banked';
        updateUI();
        
        if (game.gameOver) {
          handleGameOver();
          return;
        }
        break;
      }
      
      // Continue rolling
      setStatus(`AI rolling ${confirmResult.remaining} dice...`);
      await delay(800);
    }
    
    // Render the full AI turn history (all rolls' decisions)
    displayAITurnHistory(aiTurnLog, game, turnEndType, turnBankedScore);
    
    // Player's turn
    if (!game.gameOver && game.currentPlayer === 'player') {
      setStatus("Your turn! Roll the dice.");
    }
    
  } finally {
    isProcessing = false;
    if (!game.gameOver && game.currentPlayer === 'player') {
      elements.btnRoll.disabled = false;
    }
    updateUI();
  }
}

/**
 * Display full AI turn history with every roll's decision data
 */
function displayAITurnHistory(turnLog, gameState, endType, bankedScore) {
  if (!turnLog.length) {
    elements.insightContent.innerHTML = '<p class="muted">No AI decision data for this turn.</p>';
    return;
  }
  
  const dieFace = v => ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v];
  
  let html = `<div class="insight-summary">`;
  
  // Turn summary header
  let summaryLine = '';
  if (endType === 'banked') {
    summaryLine = `💰 Banked <strong>${bankedScore}</strong> points (total: ${gameState.aiScore})`;
  } else if (endType === 'farkle') {
    summaryLine = `💀 Farkled! Lost <strong>${turnLog.find(r => r.type === 'farkle')?.turnScore || 0}</strong> points`;
  } else if (endType === 'error') {
    summaryLine = `💥 Error: ${turnLog.find(r => r.type === 'error')?.message || 'unknown'}`;
  }
  if (summaryLine) html += `<div class="insight-result">${summaryLine}</div>`;
  
  // Each roll
  turnLog.forEach((entry, i) => {
    if (entry.type === 'error') {
      html += `<div class="insight-roll" style="border-color: var(--danger);">
        <div class="insight-roll-header">❌ Error</div>
        <div class="insight-roll-detail">${entry.message || 'Unknown error'}</div>
      </div>`;
      return;
    }
    
    const rollNum = i + 1;
    const keptLabel = entry.keptDice ? ` → Kept [${entry.keptDice.join(', ')}]` : '';
    html += `<div class="insight-roll">`;
    html += `<div class="insight-roll-header">Roll ${rollNum} — 🎲 [${entry.dice.join(', ')}]${keptLabel}</div>`;
    
    if (entry.type === 'farkle') {
      html += `<div class="insight-roll-detail">No scoring combinations.</div>`;
      html += `</div>`;
      return;
    }
    
    html += `<div class="insight-roll-detail">`;
    
    // Dice selection probabilities
    const dd = entry.diceDecision;
    if (dd && dd.probabilities && dd.probabilities.length) {
      html += `<div class="insight-subsection">🎯 Dice Selection (${dd.reasoning || ''})</div>`;
      html += `<div class="confidence">`;
      dd.probabilities.forEach((p, j) => {
        const optLabel = dd.options?.[j] || `Option ${j + 1}`;
        html += `
          <div class="confidence-bar">
            <span class="label" title="${optLabel}">Option ${j + 1}</span>
            <div class="bar"><div class="fill" style="width: ${p * 100}%"></div></div>
            <span class="value">${(p * 100).toFixed(0)}%</span>
            <span class="option-desc">${optLabel}</span>
          </div>`;
      });
      html += `</div>`;
    }
    
    // Roll vs Bank
    const rd = entry.rollDecision;
    if (rd) {
      html += `<div class="insight-subsection">🎲 Roll or Bank?</div>`;
      html += `<div class="confidence">`;
      
      const bankPct = typeof rd.bankProbability === 'number' ? rd.bankProbability : 0.5;
      const rollPct = typeof rd.rollProbability === 'number' ? rd.rollProbability : 0.5;
      const chosen = entry.finalAction;
      // Show the momentum-adjusted bank value (streak at decision + this bank = next bonus)
      const streakForBank = game.aiStreak; // current AI streak before this bank
      const momentumDisplay = streakForBank > 0
        ? `<span class="option-desc">(×${(1 + streakForBank * 0.10).toFixed(2)} moment.)</span>`
        : '';
      html += `
        <div class="confidence-bar ${chosen === 'bank' ? 'chosen' : ''}">
          <span class="label">Bank ${entry.cumulativeScore} pts</span>
          <div class="bar"><div class="fill bank-fill" style="width: ${bankPct * 100}%"></div></div>
          <span class="value">${(bankPct * 100).toFixed(0)}%</span>
          ${momentumDisplay}
        </div>
        <div class="confidence-bar ${chosen === 'roll' ? 'chosen' : ''}">
          <span class="label">Roll ${entry.remaining} dice</span>
          <div class="bar"><div class="fill roll-fill" style="width: ${rollPct * 100}%"></div></div>
          <span class="value">${(rollPct * 100).toFixed(0)}%</span>
        </div>`;
      
      if (entry.hotDice) {
        html += `<div class="insight-extra">🔥 Hot dice — forced to roll all 6 again</div>`;
      } else if (chosen === 'bank') {
        html += `<div class="insight-extra chosen-bank">✅ Chose to bank</div>`;
      } else {
        html += `<div class="insight-extra chosen-roll">🔄 Chose to roll — ${rd.reasoning || ''}</div>`;
      }
      
      html += `</div>`;
    }
    
    html += `</div>`; // insight-roll-detail
    html += `</div>`; // insight-roll
  });
  
  html += `</div>`; // insight-summary
  elements.insightContent.innerHTML = html;
}

/**
 * Handle game over
 */
function handleGameOver() {
  const winner = game.winner;
  const winnerName = winner === 'player' ? 'You' : 'Eevo AI';
  const finalScore = winner === 'player' ? game.playerScore : game.aiScore;
  
  setStatus(`🏆 ${winnerName} won with ${finalScore} points!`, 'win');
  logDecision('system', `Game Over! ${winnerName} wins with ${finalScore} points!`);
  
  elements.btnRoll.disabled = true;
  elements.btnBank.disabled = true;
}

/**
 * Render dice in the container
 */
function renderDice(dice, selectedIndices = [], isFarkle = false, isAI = false) {
  elements.diceContainer.innerHTML = dice.map((value, i) => {
    const selected = selectedIndices.includes(i);
    const classes = ['die'];
    if (selected) classes.push('selected');
    if (isFarkle) classes.push('locked');
    if (isAI) classes.push('disabled');
    
    return `<div class="${classes.join(' ')}" data-index="${i}">${dieFaces[value]}</div>`;
  }).join('');
  
  // Add click handlers for player
  if (!isAI && !isFarkle) {
    elements.diceContainer.querySelectorAll('.die').forEach(die => {
      die.addEventListener('click', () => handleDiceClick(parseInt(die.dataset.index)));
    });
  }
}

/**
 * Animate rolling dice
 */
async function animateRolling() {
  const numDice = game.diceToRoll;
  const frames = 8;
  
  for (let f = 0; f < frames; f++) {
    const fakeDice = Array.from({ length: numDice }, () => Math.floor(Math.random() * 6) + 1);
    elements.diceContainer.innerHTML = fakeDice.map(v => 
      `<div class="die rolling">${dieFaces[v]}</div>`
    ).join('');
    await delay(80);
  }
}

/**
 * Update roll info display
 */
function updateRollInfo() {
  if (game.currentDice.length === 0) {
    elements.rollInfo.textContent = '';
    return;
  }
  
  const scoring = findScoringCombinations(game.currentDice);
  const options = findAllScoringOptions(game.currentDice);
  
  if (options.length > 0) {
    const maxScore = options[0].score;
    elements.rollInfo.innerHTML = `Best possible: <strong>+${maxScore}</strong> | ${options.length} scoring option${options.length > 1 ? 's' : ''}`;
  }
}

/**
 * Update all UI elements
 */
function updateUI() {
  elements.playerScore.textContent = game.playerScore.toLocaleString();
  elements.aiScore.textContent = game.aiScore.toLocaleString();
  
  // Turn scores
  if (game.turnScore > 0) {
    if (game.currentPlayer === 'player') {
      elements.playerTurnScore.textContent = `+${game.turnScore}`;
      elements.aiTurnScore.textContent = '';
    } else {
      elements.aiTurnScore.textContent = `+${game.turnScore}`;
      elements.playerTurnScore.textContent = '';
    }
  } else {
    elements.playerTurnScore.textContent = '';
    elements.aiTurnScore.textContent = '';
  }
  
  // Highlight active player
  document.querySelector('.player-score.you').classList.toggle('active', game.currentPlayer === 'player' && !game.gameOver);
  document.querySelector('.player-score.ai').classList.toggle('active', game.currentPlayer === 'ai' && !game.gameOver);
  
  // Buttons
  elements.btnRoll.disabled = game.gameOver || game.currentPlayer !== 'player' || isProcessing;
  elements.btnBank.disabled = game.gameOver || game.currentPlayer !== 'player' || game.turnScore === 0 || isProcessing;
  
  // Clear dice if no current roll
  if (game.currentDice.length === 0) {
    elements.diceContainer.innerHTML = '<p class="muted">Roll the dice!</p>';
    elements.rollInfo.textContent = '';
  }
  
  // Relic: Momentum display
  renderMomentum();
  // Relic: Hot Hand display
  renderHotHand();
}

/**
 * Render the Hot Hand relic progress (how many times turn was tripled, and current turn).
 */
function renderHotHand() {
  const el = elements.hotHandProgress;
  if (!el) return;
  
  const triples = game.hotHandCount || 0;
  if (triples > 0) {
    el.textContent = `Tripled ${triples}× · Turn: ${game.turnScore} pts`;
  } else {
    el.textContent = '';
  }
}

/**
 * Track previous momentum values to trigger pop animation on change
 */
let prevMomentum = { player: null, ai: null };

/**
 * Render the Momentum relic percentages with change animation.
 */
function renderMomentum() {
  const pBonus = game.momentumBonus('player');
  const aBonus = game.momentumBonus('ai');
  
  elements.playerMomentum.textContent = pBonus > 0 ? `+${pBonus}%` : '+0%';
  elements.aiMomentum.textContent = aBonus > 0 ? `+${aBonus}%` : '+0%';
  
  // Highlight active streaks
  elements.playerMomentum.classList.toggle('player-momentum-active', pBonus > 0);
  elements.aiMomentum.classList.toggle('ai-momentum-active', aBonus > 0);
  
  // Pop animation when a value increases
  if (prevMomentum.player !== null && pBonus > prevMomentum.player) {
    elements.playerMomentum.classList.remove('pop');
    void elements.playerMomentum.offsetWidth; // reflow to restart animation
    elements.playerMomentum.classList.add('pop');
  }
  if (prevMomentum.ai !== null && aBonus > prevMomentum.ai) {
    elements.aiMomentum.classList.remove('pop');
    void elements.aiMomentum.offsetWidth;
    elements.aiMomentum.classList.add('pop');
  }
  
  prevMomentum.player = pBonus;
  prevMomentum.ai = aBonus;
}

/**
 * Set status message
 */
function setStatus(message, className = '') {
  elements.status.textContent = message;
  elements.status.className = 'status-message ' + className;
}

/**
 * Log a decision to the decision history
 */
function logDecision(actor, action, details = {}) {
  const time = new Date().toLocaleTimeString();
  const detailsStr = Object.entries(details)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' | ');
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${actor}`;
  entry.innerHTML = `
    <span class="time">${time}</span>
    <span class="action">[${actor.toUpperCase()}] ${action}</span>
    ${detailsStr ? `<div class="details">${detailsStr}</div>` : ''}
  `;
  
  // Remove placeholder if present
  const placeholder = elements.decisionLog.querySelector('.muted');
  if (placeholder) placeholder.remove();
  
  elements.decisionLog.insertBefore(entry, elements.decisionLog.firstChild);
  
  // Keep log reasonable size
  while (elements.decisionLog.children.length > 50) {
    elements.decisionLog.removeChild(elements.decisionLog.lastChild);
  }
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize
init();
