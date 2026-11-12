# 🎲 Farkle vs Eevo AI

A web-based Farkle dice game where you play against an AI opponent powered by [Eevo](https://eevo.io)'s SystemOne decision-making model.

**Play it here:** https://NitorCreations.github.io/eevo-farkle/## 🎲 Farkle vs Eevo AI

A web-based Farkle dice game where you play against an AI opponent powered by [Eevo](https://eevo.io)'s SystemOne decision-making model.

## What is This?

This project explores the decision-making capabilities of Eevo's AI model through the classic dice game Farkle. The AI must make strategic decisions about:

1. **Which dice to keep** - When multiple scoring combinations are possible, which maximizes expected value?
2. **Risk assessment** - Should it roll again (risking a Farkle) or bank safe points?
3. **Game state awareness** - How does being ahead/behind affect optimal strategy?

The UI provides insights into Eevo's decision-making process, showing confidence levels for each choice.

## Getting Started

### 1. Get an Eevo API Key

Sign up at [eevo.io](https://eevo.io) to get your API key.

### 2. Play online (GitHub Pages)

Visit the deployed site, enter your API key, and start playing!

### 3. Or run locally

The game can also be run locally with a proxy server that avoids potential CORS issues:

```bash
python3 server.py
```

Then open http://localhost:8080 in your browser.

## Farkle Rules

**Objective:** First player to reach 10,000 points wins.

**Gameplay:**
1. Roll 6 dice
2. Set aside at least one scoring die/combination
3. Choose to either:
   - **Roll again** with remaining dice (risk losing turn points)
   - **Bank** your accumulated turn points safely

**Scoring:**
| Combination | Points |
|-------------|--------|
| Single 1 | 100 |
| Single 5 | 50 |
| Three 1s | 1,000 |
| Three 2s | 200 |
| Three 3s | 300 |
| Three 4s | 400 |
| Three 5s | 500 |
| Three 6s | 600 |
| Four of a kind | 2× triple |
| Five of a kind | 4× triple |
| Six of a kind | 8× triple |
| Straight (1-6) | 1,500 |
| Three pairs | 1,500 |
| Two triplets | 2,500 |

**Special Rules:**
- **Farkle:** If you roll and no dice can score, you lose ALL points from this turn
- **Hot Dice:** If all 6 dice score, you MUST roll all 6 again

## How Eevo Makes Decisions

The AI uses Eevo's SystemOne API to evaluate game situations. For each decision point, it:

1. **Builds context** - Current scores, turn points, dice rolled, available options
2. **Asks structured questions** - "Which dice to keep?" with criteria for each option
3. **Gets probabilistic answers** - Confidence levels for each choice
4. **Executes decisions** - Picks the highest-confidence option

The "AI Insights" panel shows confidence percentages for each option considered and why it chose to roll vs bank.

## Getting an API Key

The game requires an Eevo API key to function. Get one at [eevo.io](https://eevo.io).

## Files

- `index.html` - Main HTML structure
- `styles.css` - Dark theme styling
- `game.js` - Farkle game logic (scoring, rules, state)
- `eevo.js` - Eevo API integration
- `app.js` - UI and game flow
- `server.py` - Development server with API proxy

## Development

No build step required! Just edit files and refresh.

To add more detailed decision logging or modify the AI's prompts, edit `eevo.js`.

## License

MIT
