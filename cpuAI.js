/**
 * Monte Carlo AI for Tunisian Rummy
 * Uses @computekit/core for parallel simulation processing
 */

const { ComputeKit } = require("@computekit/core");

// Card ranking utilities
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const SUITS = ["spade", "heart", "diamond", "club"];

/**
 * Calculate the point value of a card
 */
function cardValue(card) {
  if (card.rank === "Joker") return 25;
  if (card.rank === "A") return 1;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

/**
 * Calculate deadwood (unmelded card points) for a hand
 */
function calculateDeadwood(hand) {
  return hand.reduce((sum, card) => sum + cardValue(card), 0);
}

/**
 * Check if cards form a valid set (same rank, different suits)
 */
function isValidSet(cards) {
  if (cards.length < 3 || cards.length > 4) return false;
  const rank = cards[0].rank;
  const suits = new Set();
  for (const card of cards) {
    if (card.rank !== "Joker" && card.rank !== rank) return false;
    if (card.rank !== "Joker") {
      if (suits.has(card.suit)) return false;
      suits.add(card.suit);
    }
  }
  return true;
}

/**
 * Check if cards form a valid run (same suit, consecutive ranks)
 */
function isValidRun(cards) {
  if (cards.length < 3) return false;

  // Separate jokers and regular cards
  const jokers = cards.filter((c) => c.rank === "Joker");
  const regular = cards.filter((c) => c.rank !== "Joker");

  if (regular.length === 0) return false;

  // All regular cards must be the same suit
  const suit = regular[0].suit;
  if (!regular.every((c) => c.suit === suit)) return false;

  // Sort by rank index
  const sorted = regular
    .slice()
    .sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));

  // Check for gaps that can be filled with jokers
  let jokersNeeded = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      RANKS.indexOf(sorted[i].rank) - RANKS.indexOf(sorted[i - 1].rank) - 1;
    if (gap < 0) return false; // Duplicate
    jokersNeeded += gap;
  }

  // Check for high-ace wrap (Q-K-A)
  if (sorted.length >= 2) {
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    if (last.rank === "K" && first.rank === "A") {
      // A can wrap around after K
      jokersNeeded = 0;
      // Recheck without wrap penalty
      const withoutA = sorted.filter((c) => c.rank !== "A");
      for (let i = 1; i < withoutA.length; i++) {
        const gap =
          RANKS.indexOf(withoutA[i].rank) -
          RANKS.indexOf(withoutA[i - 1].rank) -
          1;
        if (gap < 0) return false;
        jokersNeeded += gap;
      }
    }
  }

  return jokersNeeded <= jokers.length;
}

/**
 * Calculate meld points
 */
function calculateMeldPoints(cards) {
  return cards.reduce((sum, card) => sum + cardValue(card), 0);
}

/**
 * Find all possible melds in a hand
 */
function findPossibleMelds(hand) {
  const melds = [];

  // Find sets (same rank, different suits)
  const byRank = {};
  hand.forEach((card, idx) => {
    if (card.rank !== "Joker") {
      if (!byRank[card.rank]) byRank[card.rank] = [];
      byRank[card.rank].push({ card, idx });
    }
  });

  // Find jokers
  const jokers = hand
    .map((card, idx) => ({ card, idx }))
    .filter((c) => c.card.rank === "Joker");

  // Generate set combinations
  for (const rank in byRank) {
    const cards = byRank[rank];
    if (cards.length >= 3) {
      // 3-card sets
      for (let i = 0; i < cards.length - 2; i++) {
        for (let j = i + 1; j < cards.length - 1; j++) {
          for (let k = j + 1; k < cards.length; k++) {
            const meld = [cards[i], cards[j], cards[k]];
            if (isValidSet(meld.map((c) => c.card))) {
              melds.push({
                cards: meld.map((c) => c.card),
                indices: meld.map((c) => c.idx),
                points: calculateMeldPoints(meld.map((c) => c.card)),
                type: "set",
              });
            }
          }
        }
      }
      // 4-card sets
      if (cards.length >= 4) {
        const meld = cards.slice(0, 4);
        if (isValidSet(meld.map((c) => c.card))) {
          melds.push({
            cards: meld.map((c) => c.card),
            indices: meld.map((c) => c.idx),
            points: calculateMeldPoints(meld.map((c) => c.card)),
            type: "set",
          });
        }
      }
    }
    // Sets with jokers
    if (cards.length >= 2 && jokers.length >= 1) {
      for (let i = 0; i < cards.length - 1; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const meld = [cards[i], cards[j], jokers[0]];
          if (isValidSet(meld.map((c) => c.card))) {
            melds.push({
              cards: meld.map((c) => c.card),
              indices: meld.map((c) => c.idx),
              points: calculateMeldPoints(meld.map((c) => c.card)),
              type: "set",
            });
          }
        }
      }
    }
  }

  // Find runs (same suit, consecutive ranks)
  const bySuit = {};
  hand.forEach((card, idx) => {
    if (card.rank !== "Joker") {
      if (!bySuit[card.suit]) bySuit[card.suit] = [];
      bySuit[card.suit].push({ card, idx });
    }
  });

  for (const suit in bySuit) {
    const cards = bySuit[suit].sort(
      (a, b) => RANKS.indexOf(a.card.rank) - RANKS.indexOf(b.card.rank)
    );

    // Find consecutive runs of 3+ cards
    for (let start = 0; start < cards.length; start++) {
      for (let end = start + 2; end < cards.length; end++) {
        const segment = cards.slice(start, end + 1);
        // Check if consecutive
        let isConsecutive = true;
        for (let i = 1; i < segment.length; i++) {
          if (
            RANKS.indexOf(segment[i].card.rank) -
              RANKS.indexOf(segment[i - 1].card.rank) !==
            1
          ) {
            isConsecutive = false;
            break;
          }
        }
        if (isConsecutive) {
          melds.push({
            cards: segment.map((c) => c.card),
            indices: segment.map((c) => c.idx),
            points: calculateMeldPoints(segment.map((c) => c.card)),
            type: "run",
          });
        }
      }
    }
  }

  return melds;
}

/**
 * Evaluate a card's usefulness for building melds
 */
function evaluateCardUsefulness(card, hand) {
  let score = 0;

  // Check for potential sets
  const sameRank = hand.filter(
    (c) =>
      c.rank === card.rank &&
      c.suit !== card.suit &&
      !(c.suit === card.suit && c.rank === card.rank)
  );
  score += sameRank.length * 15;

  // Check for potential runs
  const sameSuit = hand.filter(
    (c) => c.suit === card.suit && c.rank !== card.rank
  );
  const cardRankIdx = RANKS.indexOf(card.rank);

  for (const c of sameSuit) {
    const diff = Math.abs(RANKS.indexOf(c.rank) - cardRankIdx);
    if (diff === 1) score += 20; // Adjacent
    else if (diff === 2) score += 10; // One gap (could use joker)
  }

  // Penalize high-value cards slightly (they cost more if stuck with them)
  score -= cardValue(card) * 0.5;

  return score;
}

/**
 * Monte Carlo simulation for evaluating a move
 */
function simulateGame(hand, pile, deckCount, numSimulations = 100) {
  let wins = 0;

  for (let i = 0; i < numSimulations; i++) {
    // Simplified simulation: check how close to winning
    const melds = findPossibleMelds(hand);
    const bestMeld = melds.sort((a, b) => b.points - a.points)[0];

    if (bestMeld && bestMeld.points >= 71) {
      wins += 2; // Can open
    } else if (melds.length > 0) {
      wins += 0.5; // Has potential
    }

    // Score based on deadwood
    const deadwood = calculateDeadwood(hand);
    wins += Math.max(0, (200 - deadwood) / 200);
  }

  return wins / numSimulations;
}

/**
 * CPU AI Class using Monte Carlo simulation
 */
class MonteCarloAI {
  constructor() {
    this.kit = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.kit = new ComputeKit({
        maxWorkers: 2,
        timeout: 5000,
        debug: false,
      });

      // Register the simulation function
      this.kit.register("evaluateMove", (params) => {
        const { hand, card, isDiscard } = params;

        let score = 0;

        // Base evaluation
        if (isDiscard) {
          // For discarding, prefer cards that are less useful
          // Lower score = better to discard
          const cardVal =
            card.rank === "A"
              ? 1
              : ["J", "Q", "K"].includes(card.rank)
              ? 10
              : parseInt(card.rank) || 25;

          // Check if card is part of potential melds
          const sameRank = hand.filter(
            (c) =>
              c.rank === card.rank &&
              !(c.suit === card.suit && c.rank === card.rank)
          );
          const sameSuit = hand.filter(
            (c) => c.suit === card.suit && c.rank !== card.rank
          );

          score = cardVal; // Start with card value (higher = worse to keep)

          // Reduce score if card has meld potential (we want to keep it)
          score -= sameRank.length * 15;
          score -=
            sameSuit.filter((c) => {
              const ranks = [
                "A",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "10",
                "J",
                "Q",
                "K",
              ];
              const diff = Math.abs(
                ranks.indexOf(c.rank) - ranks.indexOf(card.rank)
              );
              return diff <= 2;
            }).length * 10;
        } else {
          // For drawing, evaluate how much the card would help
          score = 50; // Base value
        }

        return score;
      });

      this.initialized = true;
    } catch (e) {
      console.error("Failed to initialize ComputeKit:", e);
      this.kit = null;
    }
  }

  /**
   * Decide whether to draw from deck or pile
   */
  async decideDrawSource(hand, pileTop, deckCount, playerOpened) {
    if (!pileTop || deckCount === 0) {
      return deckCount > 0 ? "deck" : "pile";
    }

    // Evaluate pile card usefulness
    const pileScore = evaluateCardUsefulness(pileTop, hand);

    // Higher threshold if not opened (need 71 points to meld)
    const threshold = playerOpened ? 15 : 25;

    // Monte Carlo: simulate both options
    const handWithPile = [...hand, pileTop];
    const pileSimScore = simulateGame(handWithPile, [], deckCount, 50);

    // Random deck card average
    const deckSimScore = simulateGame(hand, [], deckCount, 50) * 0.9;

    if (pileScore > threshold || pileSimScore > deckSimScore + 0.1) {
      return "pile";
    }

    return "deck";
  }

  /**
   * Decide which card to discard using Monte Carlo evaluation
   */
  async decideDiscard(hand, playerOpened) {
    if (hand.length === 0) return null;
    if (hand.length === 1) return hand[0];

    const scores = [];

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const handWithout = hand.filter((_, idx) => idx !== i);

      // Evaluate the hand without this card
      const usefulness = evaluateCardUsefulness(card, handWithout);
      const simScore = simulateGame(handWithout, [], 50, 30);

      // Calculate discard score (higher = better to discard)
      let discardScore = cardValue(card) * 2 - usefulness + (1 - simScore) * 50;

      // Never discard jokers
      if (card.rank === "Joker") {
        discardScore = -1000;
      }

      // Try parallel evaluation if ComputeKit is available
      if (this.kit && this.initialized) {
        try {
          const evalScore = await this.kit.run("evaluateMove", {
            hand: handWithout,
            card: card,
            isDiscard: true,
          });
          discardScore = (discardScore + evalScore) / 2;
        } catch (e) {
          // Continue with local evaluation
        }
      }

      scores.push({ card, score: discardScore, idx: i });
    }

    // Sort by score (highest = best to discard)
    scores.sort((a, b) => b.score - a.score);

    return scores[0].card;
  }

  /**
   * Decide which melds to play
   */
  async decideMelds(hand, playerOpened) {
    const possibleMelds = findPossibleMelds(hand);

    if (possibleMelds.length === 0) return [];

    // If not opened, need at least 71 points in a single meld action
    if (!playerOpened) {
      // Find combinations that sum to 71+
      const sortedMelds = possibleMelds.sort((a, b) => b.points - a.points);

      // Try single melds first
      for (const meld of sortedMelds) {
        if (meld.points >= 71) {
          return [meld.cards];
        }
      }

      // Try combining non-overlapping melds
      for (let i = 0; i < sortedMelds.length; i++) {
        for (let j = i + 1; j < sortedMelds.length; j++) {
          const meld1 = sortedMelds[i];
          const meld2 = sortedMelds[j];

          // Check for overlap
          const overlap = meld1.indices.some((idx) =>
            meld2.indices.includes(idx)
          );
          if (!overlap && meld1.points + meld2.points >= 71) {
            return [meld1.cards, meld2.cards];
          }
        }
      }

      // Can't open yet
      return [];
    }

    // Already opened - play any valid meld
    // Prefer larger melds
    const best = possibleMelds.sort((a, b) => b.points - a.points)[0];
    return best ? [best.cards] : [];
  }

  /**
   * Cleanup
   */
  async terminate() {
    if (this.kit) {
      try {
        await this.kit.terminate();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.kit = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
let aiInstance = null;

/**
 * Get or create the AI instance
 */
async function getAI() {
  if (!aiInstance) {
    aiInstance = new MonteCarloAI();
    await aiInstance.initialize();
  }
  return aiInstance;
}

module.exports = {
  MonteCarloAI,
  getAI,
  findPossibleMelds,
  calculateDeadwood,
  cardValue,
  evaluateCardUsefulness,
  isValidSet,
  isValidRun,
  calculateMeldPoints,
  RANKS,
  SUITS,
};
