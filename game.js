/**
 * Farkle Game Logic
 * 
 * Standard Farkle rules:
 * - 6 dice, first to 10,000 points wins
 * - Must score at least one die each roll or "Farkle" (lose turn points)
 * - Can bank points at any time after scoring
 * - "Hot dice": if all 6 dice score, player can roll all 6 again
 */

export const WINNING_SCORE = 10000;

// Scoring combinations
export const SCORING = {
  SINGLE_1: 100,
  SINGLE_5: 50,
  TRIPLE_1: 1000,
  TRIPLE_2: 200,
  TRIPLE_3: 300,
  TRIPLE_4: 400,
  TRIPLE_5: 500,
  TRIPLE_6: 600,
  STRAIGHT: 1500,    // 1-2-3-4-5-6
  THREE_PAIRS: 1500,
  TWO_TRIPLETS: 2500,
};

/**
 * Roll n dice, returning array of values 1-6
 */
export function rollDice(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1);
}

/**
 * Count occurrences of each die value
 */
export function countDice(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for die values
  for (const d of dice) counts[d]++;
  return counts;
}

/**
 * Find all scoring combinations in a set of dice
 * Returns { score, scoringDice, combinations }
 */
export function findScoringCombinations(dice) {
  if (!dice.length) return { score: 0, scoringDice: [], combinations: [] };
  
  const counts = countDice(dice);
  const combinations = [];
  let score = 0;
  const used = new Array(dice.length).fill(false);
  
  // Check for straight (1-2-3-4-5-6)
  if (dice.length === 6 && counts.slice(1).every(c => c === 1)) {
    return {
      score: SCORING.STRAIGHT,
      scoringDice: [...dice],
      combinations: [{ name: 'Straight (1-6)', score: SCORING.STRAIGHT, dice: [...dice] }]
    };
  }
  
  // Check for three pairs
  if (dice.length === 6) {
    const pairs = counts.slice(1).filter(c => c === 2).length;
    if (pairs === 3) {
      return {
        score: SCORING.THREE_PAIRS,
        scoringDice: [...dice],
        combinations: [{ name: 'Three Pairs', score: SCORING.THREE_PAIRS, dice: [...dice] }]
      };
    }
  }
  
  // Check for two triplets
  if (dice.length === 6) {
    const triplets = counts.slice(1).filter(c => c === 3).length;
    if (triplets === 2) {
      return {
        score: SCORING.TWO_TRIPLETS,
        scoringDice: [...dice],
        combinations: [{ name: 'Two Triplets', score: SCORING.TWO_TRIPLETS, dice: [...dice] }]
      };
    }
  }
  
  // Process 6-of-a-kind, 5-of-a-kind, 4-of-a-kind, 3-of-a-kind
  for (let val = 1; val <= 6; val++) {
    if (counts[val] >= 3) {
      const baseScore = val === 1 ? SCORING.TRIPLE_1 : val * 100;
      let comboScore, comboName;
      let numUsed;
      
      if (counts[val] >= 6) {
        comboScore = baseScore * 8;
        comboName = `Six ${val}s`;
        numUsed = 6;
      } else if (counts[val] >= 5) {
        comboScore = baseScore * 4;
        comboName = `Five ${val}s`;
        numUsed = 5;
      } else if (counts[val] >= 4) {
        comboScore = baseScore * 2;
        comboName = `Four ${val}s`;
        numUsed = 4;
      } else {
        comboScore = baseScore;
        comboName = `Three ${val}s`;
        numUsed = 3;
      }
      
      score += comboScore;
      const comboDice = [];
      let marked = 0;
      for (let i = 0; i < dice.length && marked < numUsed; i++) {
        if (!used[i] && dice[i] === val) {
          used[i] = true;
          comboDice.push(val);
          marked++;
        }
      }
      combinations.push({ name: comboName, score: comboScore, dice: comboDice });
      counts[val] -= numUsed;
    }
  }
  
  // Count remaining 1s and 5s
  for (let i = 0; i < dice.length; i++) {
    if (used[i]) continue;
    if (dice[i] === 1) {
      score += SCORING.SINGLE_1;
      used[i] = true;
      combinations.push({ name: 'Single 1', score: SCORING.SINGLE_1, dice: [1] });
    } else if (dice[i] === 5) {
      score += SCORING.SINGLE_5;
      used[i] = true;
      combinations.push({ name: 'Single 5', score: SCORING.SINGLE_5, dice: [5] });
    }
  }
  
  const scoringDice = dice.filter((_, i) => used[i]);
  
  return { score, scoringDice, combinations };
}

/**
 * Check if any dice can score
 */
export function canScore(dice) {
  return findScoringCombinations(dice).score > 0;
}

/**
 * Check if specific dice selection is valid (all selected dice must score)
 */
export function isValidSelection(selectedDice) {
  if (!selectedDice.length) return false;
  const { scoringDice } = findScoringCombinations(selectedDice);
  return scoringDice.length === selectedDice.length;
}

/**
 * Get score for a specific selection of dice
 */
export function getSelectionScore(selectedDice) {
  if (!isValidSelection(selectedDice)) return 0;
  return findScoringCombinations(selectedDice).score;
}

/**
 * Find all valid ways to select scoring dice from a roll
 * Returns array of { dice, score, remaining } options
 */
export function findAllScoringOptions(dice) {
  const options = [];
  const n = dice.length;
  
  // Generate all subsets of dice (2^n possibilities)
  for (let mask = 1; mask < (1 << n); mask++) {
    const selected = [];
    const remaining = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        selected.push(dice[i]);
      } else {
        remaining.push(dice[i]);
      }
    }
    
    if (isValidSelection(selected)) {
      const score = getSelectionScore(selected);
      options.push({
        dice: selected,
        score,
        remaining: remaining.length,
        combinations: findScoringCombinations(selected).combinations
      });
    }
  }
  
  // Sort by score descending
  options.sort((a, b) => b.score - a.score);
  
  // Remove duplicates (same score and same remaining count)
  const seen = new Set();
  return options.filter(opt => {
    const key = `${opt.score}-${opt.remaining}-${opt.dice.sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Check for "hot dice" (all dice scored)
 */
export function isHotDice(totalDice, scoredDice) {
  return scoredDice >= totalDice;
}

/**
 * Game state management
 */
export class FarkleGame {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.playerScore = 0;
    this.aiScore = 0;
    this.currentPlayer = 'player'; // 'player' or 'ai'
    this.turnScore = 0;
    this.currentDice = [];
    this.selectedIndices = new Set();
    this.scoredThisTurn = 0; // Track dice scored this turn for hot dice
    this.gameOver = false;
    this.winner = null;
    this.diceToRoll = 6;
  }
  
  roll() {
    if (this.gameOver) return null;
    
    this.currentDice = rollDice(this.diceToRoll);
    this.selectedIndices.clear();
    
    // Check for farkle
    if (!canScore(this.currentDice)) {
      return { type: 'farkle', dice: this.currentDice };
    }
    
    return { type: 'roll', dice: this.currentDice };
  }
  
  selectDie(index) {
    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
    return this.getSelectedDice();
  }
  
  getSelectedDice() {
    return Array.from(this.selectedIndices).map(i => this.currentDice[i]);
  }
  
  getUnselectedDice() {
    return this.currentDice.filter((_, i) => !this.selectedIndices.has(i));
  }
  
  confirmSelection() {
    const selected = this.getSelectedDice();
    if (!isValidSelection(selected)) {
      return { valid: false, message: 'Invalid selection - all dice must score' };
    }
    
    const score = getSelectionScore(selected);
    this.turnScore += score;
    this.scoredThisTurn += selected.length;
    
    // Calculate remaining dice
    const remaining = this.currentDice.length - selected.length;
    
    // Hot dice check
    if (remaining === 0) {
      this.diceToRoll = 6;
      this.scoredThisTurn = 0;
      return { valid: true, score, hotDice: true, remaining: 6 };
    }
    
    this.diceToRoll = remaining;
    return { valid: true, score, hotDice: false, remaining };
  }
  
  bank() {
    if (this.turnScore === 0) return false;
    
    if (this.currentPlayer === 'player') {
      this.playerScore += this.turnScore;
    } else {
      this.aiScore += this.turnScore;
    }
    
    // Check for win
    const finalScore = this.currentPlayer === 'player' ? this.playerScore : this.aiScore;
    if (finalScore >= WINNING_SCORE) {
      this.gameOver = true;
      this.winner = this.currentPlayer;
    }
    
    this.endTurn();
    return true;
  }
  
  farkle() {
    this.turnScore = 0;
    this.endTurn();
  }
  
  endTurn() {
    this.turnScore = 0;
    this.scoredThisTurn = 0;
    this.diceToRoll = 6;
    this.currentDice = [];
    this.selectedIndices.clear();
    
    if (!this.gameOver) {
      this.currentPlayer = this.currentPlayer === 'player' ? 'ai' : 'player';
    }
  }
  
  getState() {
    return {
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      currentPlayer: this.currentPlayer,
      turnScore: this.turnScore,
      currentDice: [...this.currentDice],
      selectedIndices: new Set(this.selectedIndices),
      diceToRoll: this.diceToRoll,
      gameOver: this.gameOver,
      winner: this.winner
    };
  }
}
