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

// LocalStorage key for API key
const API_KEY_STORAGE = 'farkle.eevoApiKey';

export function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
    return true;
  } catch {
    return false;
  }
}

export function hasApiKey() {
  return !!getApiKey();
}

/**
 * Call Eevo SystemOne API
 */
async function eevoSystemOne(state, questions) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No Eevo API key configured');
  }
  
  const payload = {
    model: 'eevo-1',
    state,
    questions
  };
  
  const url = EEVO_API_URL;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
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
  const { playerScore, aiScore, turnScore, currentDice } = gameState;
  const target = 10000;
  
  const diceStr = currentDice.join(', ');
  const optionsStr = options.map((opt, i) => 
    `Option ${i + 1}: Keep [${opt.dice.join(', ')}] for ${opt.score} points, ${opt.remaining} dice left to roll`
  ).join('\n');
  
  return `You are playing Farkle, a dice game. First to ${target} points wins.

CURRENT SITUATION:
- Your score: ${aiScore} points
- Opponent score: ${playerScore} points
- Points accumulated this turn: ${turnScore}
- Current roll: [${diceStr}]

SCORING OPTIONS:
${optionsStr}

FARKLE RISK: If you roll and get no scoring dice, you lose ALL points from this turn (currently ${turnScore} + whatever you keep).

KEY CONSIDERATIONS:
- More dice = more chances to score, but also more risk of farkle
- 1s and 5s always score individually
- Three of a kind and better combos are valuable
- If you're behind, you may need to take more risks
- If you're ahead, conservative play might be better
- "Hot dice" (scoring all 6 dice) lets you roll all 6 again`;
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
  
  // Build criteria from options
  const criteria = options.map((opt, i) => 
    `Keep [${opt.dice.join(', ')}] (+${opt.score} pts, ${opt.remaining} dice remain)`
  );
  
  const questions = {
    dice_selection: {
      type: 'score',
      instructions: `Which dice should you keep? Consider the tradeoff between immediate points and remaining dice for the next roll. More remaining dice means more scoring potential but also more farkle risk.`,
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
  
  const state = `You are playing Farkle. First to ${target} points wins.

CURRENT SITUATION:
- Your score: ${aiScore} points
- Opponent score: ${playerScore} points  
- Points accumulated this turn: ${turnScore}
- Your potential total if you bank now: ${potentialTotal}
- Dice available to roll: ${diceRemaining}
${couldWin ? '\n⚠️ BANKING NOW WOULD WIN THE GAME!' : ''}

DECISION: Should you roll ${diceRemaining} dice (risking farkle and losing ${turnScore} points) or bank your ${turnScore} points safely?

FARKLE PROBABILITIES (approximate):
- 1 die: ~67% farkle chance
- 2 dice: ~44% farkle chance
- 3 dice: ~28% farkle chance
- 4 dice: ~16% farkle chance
- 5 dice: ~8% farkle chance
- 6 dice: ~2.3% farkle chance`;

  const questions = {
    roll_or_bank: {
      type: 'score',
      instructions: `Should you roll again or bank your points? Consider: your lead/deficit, points at risk, dice remaining, and whether banking would win.`,
      criteria: [
        `BANK: Secure ${turnScore} points (total: ${potentialTotal})${couldWin ? ' - THIS WINS THE GAME' : ''}`,
        `ROLL: Risk ${turnScore} points for potential gain with ${diceRemaining} dice`
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
