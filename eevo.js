/**
 * Eevo API Integration for Farkle AI
 * 
 * Uses Eevo's SystemOne decision-making model to make strategic Farkle decisions.
 * The model evaluates risk/reward tradeoffs for:
 * 1. Which dice to keep when multiple scoring options exist
 * 2. Whether to roll again or bank points
 * 
 * NOTE: On GitHub Pages, the API is called directly from the browser.
 * If you encounter CORS errors, try hosting the app locally with the included server.
 */

/**
 * Determine the Eevo API URL based on the environment.
 * - On GitHub Pages / static hosting: call directly (may need CORS proxy if Eevo doesn't support it)
 * - Behind the local Python server: use the proxy path
 */
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '';
const EEVO_API_URL = IS_LOCAL_DEV ? '/proxy/eevo/api/v1/systemone' : 'https://eevo.io/api/v1/systemone';

// In-memory API key — never persisted
let currentApiKey = '';

// Store the most recent raw request payloads for the debug viewer.
// The API key is stripped from them before storing.
const recentRequests = [];
const MAX_DEBUG_REQUESTS = 50;

/**
 * Get a copy of the recent raw requests (minus the API key).
 * Each entry: { id, url, model, state, questions, at }
 */
export function getDebugRequests() {
  return recentRequests.slice();
}

export function setApiKey(key) {
  currentApiKey = key;
}

export function hasApiKey() {
  return !!currentApiKey;
}

/**
 * Call Eevo SystemOne API
 */
async function eevoSystemOne(state, questions) {
  if (!currentApiKey) {
    throw new Error('No Eevo API key configured');
  }
  
  const payload = {
    model: 'eevo-1',
    state,
    questions
  };
  
  // Store a redacted copy for the debug viewer (never the API key)
  recentRequests.push({
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    url: EEVO_API_URL,
    model: payload.model,
    state,
    questions,
    at: new Date().toISOString(),
  });
  if (recentRequests.length > MAX_DEBUG_REQUESTS) recentRequests.shift();
  
  const url = EEVO_API_URL;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentApiKey}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 0 || res.type === 'opaque') {
      throw new Error('CORS error: The browser blocked the request to Eevo. Host the app locally with server.py, or configure a CORS proxy.');
    }
    throw new Error(`Eevo API error: ${res.status} - ${errText}`);
  }
  
  return res.json();
}

/**
 * Build game state description for Eevo
 */
function buildStateDescription(gameState, options) {
  const { playerScore, aiScore, turnScore, currentDice, playerStreak, aiStreak, hotHandCount, enabledRelics } = gameState;
  const target = 10000;
  
  const relics = Array.isArray(enabledRelics) ? new Set(enabledRelics) : new Set(['momentum', 'hotHand']);
  const momentumOn = relics.has('momentum');
  const hotHandOn = relics.has('hotHand');
  
  const diceStr = currentDice.join(', ');
  const optionsStr = options.map((opt, i) => 
    `Option ${i + 1}: Keep [${opt.dice.join(', ')}] for ${opt.score} points, ${opt.remaining} dice left to roll`
  ).join('\n');
  
  // Momentum relic context (only if enabled)
  const relicLines = [];
  if (momentumOn) {
    const yourStreak = aiStreak || 0;
    const oppStreak = playerStreak || 0;
    relicLines.push(`MOMENTUM RELIC ACTIVE:
Rule: Each consecutive banked turn adds +10% to the points you bank. A farkle resets your streak to 0.
- Your current streak: ${yourStreak} consecutive banks
- Opponent's current streak: ${oppStreak} consecutive banks`);
  }
  
  // Hot Hand relic context (only if enabled)
  if (hotHandOn) {
    relicLines.push(`HOT HAND RELIC ACTIVE:
Rule: If you score all 6 dice in a single roll, the points you've banked since your last hot hand are doubled instead of just rerolling.
- Hot dice triggered ${hotHandCount || 0} times this turn.`);
  }
  
  const relicBlock = relicLines.length ? relicLines.join('\n\n') : '(No relics are active this game.)';

  return `You are playing Farkle, a dice game. First to ${target} points wins.

CURRENT SITUATION:
- Your score: ${aiScore} points
- Opponent score: ${playerScore} points
- Points accumulated this turn: ${turnScore}
- Current roll: [${diceStr}]

SCORING OPTIONS:
${optionsStr}
${relicBlock}

RULES:
- Each turn you roll dice, then you must set aside at least one scoring die/combination. You may then bank your accumulated turn points, or roll the remaining dice again.
- A "farkle" is a roll with no scoring dice. It loses all points accumulated this turn${momentumOn ? ' and resets your momentum streak to 0' : ''}.
- Hot dice: if you score all 6 dice in a roll without a farkle, you roll all 6 again (and, with Hot Hand active, the since-last-hot-hand points are doubled).`;
}

/**
 * Ask Eevo which dice to keep from available options
 */
export async function askWhichDiceToKeep(gameState, options) {
  if (options.length === 1) {
    // Only one valid option, no decision needed
    return {
      decision: 0,
      confidence: 1.0,
      reasoning: 'Only one scoring option available',
      probabilities: [1.0]
    };
  }
  
  const state = buildStateDescription(gameState, options);
  
  // Build criteria from options, stating facts only (no advice)
  const hotHandOn = Array.isArray(gameState.enabledRelics) ? gameState.enabledRelics.includes('hotHand') : true;
  const criteria = options.map((opt, i) => {
    let extra = '';
    if (opt.remaining === 0) {
      // Keeping all 6 dice scores everything on this roll (hot dice)
      extra = hotHandOn ? ' — this scores all 6 dice (triggering Hot Hand, doubling since-last-hot-hand points)' : ' — this scores all 6 dice (hot dice, so you roll all 6 again)';
    }
    return `Keep [${opt.dice.join(', ')}] (+${opt.score} pts, ${opt.remaining} dice remain)${extra}`;
  });
  
  const questions = {
    dice_selection: {
      type: 'score',
      instructions: `You must set aside at least one scoring die or combination. Choose which option to keep.`,
      criteria
    }
  };
  
  const response = await eevoSystemOne(state, questions);
  
  // Parse response
  const result = response.answers?.dice_selection;
  if (!result) {
    const raw = JSON.stringify(response).slice(0, 500);
    throw new Error(`Invalid Eevo response structure — missing answers.dice_selection. Response: ${raw}`);
  }
  
  // Find the highest probability option
  // Eevo returns probabilities as an object {"0": p0, "1": p1, ...} — convert to array
  const rawProbs = result.probabilities || {};
  const probs = typeof rawProbs.map === 'function' ? rawProbs : Object.values(rawProbs);
  let maxIdx = 0;
  let maxProb = probs[0] || 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      maxIdx = i;
    }
  }
  
  return {
    decision: maxIdx,
    confidence: maxProb,
    reasoning: `Selected option ${maxIdx + 1} with ${(maxProb * 100).toFixed(1)}% confidence`,
    probabilities: probs,
    options: criteria,
    rawResponse: result
  };
}

/**
 * Ask Eevo whether to roll again or bank points
 */
export async function askRollOrBank(gameState, diceRemaining) {
  const { playerScore, aiScore, turnScore } = gameState;
  const target = 10000;
  
  const potentialTotal = aiScore + turnScore;
  const couldWin = potentialTotal >= target;
  
  // Relics gating
  const relics = Array.isArray(gameState.enabledRelics) ? new Set(gameState.enabledRelics) : new Set(['momentum', 'hotHand']);
  const momentumOn = relics.has('momentum');
  const hotHandOn = relics.has('hotHand');
  
  // Momentum-related values (only meaningful if momentum is enabled)
  const streak = gameState.aiStreak || 0;
  const bonusMult = momentumOn ? 1 + streak * 0.10 : 1;
  const bankedWithMomentum = momentumOn ? Math.round(turnScore * bonusMult) : turnScore;
  const bankLabel = momentumOn
    ? `${turnScore} (${bankedWithMomentum} with momentum)`
    : `${turnScore}`;
  
  const relicLines = [];
  if (momentumOn) {
    relicLines.push(`MOMENTUM RELIC ACTIVE:
Rule: Each consecutive banked turn adds +10% to the points you bank. A farkle resets your streak to 0.
- Your momentum streak: ${streak} consecutive banks
- Banking now: ${turnScore} × ${bonusMult.toFixed(2)} = ${bankedWithMomentum} points`);
  }
  if (hotHandOn) {
    relicLines.push(`HOT HAND RELIC ACTIVE:
Rule: If you score all 6 dice in a single roll, the points you've banked since your last hot hand are doubled.`);
  }
  const relicBlock = relicLines.length ? relicLines.join('\n\n') : 'No relics active this game.';

  const state = `You are playing Farkle, a dice game. First to ${target} points wins.

CURRENT SITUATION:
- Your score: ${aiScore} points
- Opponent score: ${playerScore} points  
- Points accumulated this turn: ${turnScore}
- Your potential total if you bank now: ${momentumOn ? potentialTotal + ' (' + bankedWithMomentum + ' with momentum)' : potentialTotal}
- Dice available to roll: ${diceRemaining}
${couldWin ? '\nNOTE: Banking now would reach the ' + target + '-point target and win the game.' : ''}

${relicBlock}

DECISION: Choose one: bank your ${turnScore} points now, or roll the remaining ${diceRemaining} dice.
- Rolling risks a farkle, which loses all ${turnScore} points accumulated this turn${momentumOn ? ' and resets your momentum streak to 0' : ''}.
- If you score all ${diceRemaining} remaining dice, you roll 6 new dice${hotHandOn ? ' and, having scored all 6 of a roll, your since-last-hot-hand points double' : ''}.

FARKLE PROBABILITIES:
- 1 die: ~67% farkle chance
- 2 dice: ~44% farkle chance
- 3 dice: ~28% farkle chance
- 4 dice: ~16% farkle chance
- 5 dice: ~8% farkle chance
- 6 dice: ~2.3% farkle chance`;

  const questions = {
    roll_or_bank: {
      type: 'score',
      instructions: `Choose whether to bank your current turn points or roll again.`,
      criteria: [
        `BANK: Secure ${bankLabel} now${couldWin ? ' - THIS WINS THE GAME' : ''}`,
        `ROLL: Roll the remaining ${diceRemaining} dice, risking the ${turnScore} points accumulated this turn to score more`
      ]
    }
  };
  
  const response = await eevoSystemOne(state, questions);
  
  const result = response.answers?.roll_or_bank;
  if (!result) {
    const raw = JSON.stringify(response).slice(0, 200);
    throw new Error(`Invalid Eevo response structure — missing answers.roll_or_bank. Response: ${raw}`);
  }
  
  const rawProbs = result.probabilities || { 0: 0.5, 1: 0.5 };
  const probs = typeof rawProbs.map === 'function' ? rawProbs : Object.values(rawProbs);
  const shouldBank = probs[0] > probs[1];
  
  return {
    decision: shouldBank ? 'bank' : 'roll',
    confidence: Math.max(probs[0], probs[1]),
    bankProbability: probs[0],
    rollProbability: probs[1],
    reasoning: shouldBank 
      ? `Banking with ${(probs[0] * 100).toFixed(1)}% confidence`
      : `Rolling with ${(probs[1] * 100).toFixed(1)}% confidence`,
    rawResponse: result
  };
}

/**
 * Combined AI turn decision
 */
export async function makeAIDecision(gameState, scoringOptions, diceRemaining) {
  const decisions = [];
  
  // First, decide which dice to keep
  const diceDecision = await askWhichDiceToKeep(gameState, scoringOptions);
  decisions.push({
    type: 'dice_selection',
    ...diceDecision
  });
  
  const selectedOption = scoringOptions[diceDecision.decision];
  if (!selectedOption) {
    throw new Error(`Eevo decided option ${diceDecision.decision} but only ${scoringOptions.length} options available`);
  }
  
  // Update turn score for roll/bank decision
  const updatedGameState = {
    ...gameState,
    turnScore: gameState.turnScore + selectedOption.score
  };
  
  // Then decide whether to roll or bank
  const rollDecision = await askRollOrBank(updatedGameState, selectedOption.remaining);
  decisions.push({
    type: 'roll_or_bank',
    ...rollDecision
  });
  
  return {
    selectedOption,
    diceDecision,
    rollDecision,
    finalAction: rollDecision.decision,
    decisions
  };
}
