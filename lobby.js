const crypto = require("crypto");
const { getAI, findPossibleMelds, calculateDeadwood } = require("./cpuAI");

class Lobby {
  constructor(code, game, isCPU) {
    this.code = code;
    this.game = game;
    this.isCPU = isCPU;
    this.token = crypto.randomBytes(8).toString("hex");
    this.playerTokens = [null, null, null, null];

    // For CPU games, reserve slot 0 for human player
    this.sockets = isCPU
      ? [null, "CPU", "CPU", "CPU"]
      : [null, null, null, null];
    this.playerNames = isCPU
      ? ["You", "CPU 1", "CPU 2", "CPU 3"]
      : ["", "", "", ""];

    this.turn = 0; // 0=You/Bottom, 1=Right, 2=Top, 3=Left (anticlockwise)
    this.phase = "draw"; // 'draw' or 'discard'
    this.deck = [];
    this.pile = [];
    this.hands = [[], [], [], []];
    this.melds = []; // Board melds: { cards: [], owner: playerIndex }
    this.playerOpened = [false, false, false, false]; // Track if player has opened (laid 71+ points)
    this.scores = [0, 0, 0, 0];
    this.gameOver = false;
    this.winner = -1;
    this.isWaiting = !isCPU; // Multiplayer waits for players, CPU starts immediately

    this._setupGame();

    // Initialize AI for CPU games
    if (this.isCPU) {
      this._initAI();
    }
  }

  async _initAI() {
    try {
      this.ai = await getAI();
      // Start CPU turn if it's not human's turn
      if (this.turn !== 0) {
        this._processCPUTurn();
      }
    } catch (e) {
      console.error("Failed to initialize AI:", e);
      this.ai = null;
    }
  }

  // Setup deck, hands, pile
  _setupGame() {
    const suits = ["spade", "heart", "diamond", "club"];
    const ranks = [
      "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
    ];

    let cards = [];

    // Create two standard decks
    for (let d = 0; d < 2; d++) {
      for (let suit of suits) {
        for (let rank of ranks) {
          cards.push({ suit, rank });
        }
      }
      // Add 2 jokers per deck (4 total)
      cards.push({ suit: "joker", rank: "Joker" });
      cards.push({ suit: "joker", rank: "Joker" });
    }

    // Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    // Deal 14 cards to each player
    for (let i = 0; i < 4; i++) {
      this.hands[i] = cards.splice(0, 14);
    }

    // Rest goes to deck
    this.deck = cards;

    // First card to pile (optional, can start empty)
    if (this.deck.length > 0) {
      this.pile.push(this.deck.pop());
    }

    console.log(
      `[Lobby ${this.code}] Game setup complete. Deck: ${this.deck.length}, Pile: ${this.pile.length}`
    );
  }

  /**
   * Handle incoming data from a client WebSocket
   */
  handleData(ws, data) {
    let idx = this.sockets.indexOf(ws);

    // Handle player joining (including reconnects)
    if (data.cmd === "join") {
      if (data.playerToken) {
        // Try to reconnect using player token
        let found = false;
        for (let i = 0; i < 4; i++) {
          if (this.playerTokens[i] === data.playerToken) {
            this.sockets[i] = ws;
            idx = i;
            found = true;
            this._sendFullState(ws, i);
            break;
          }
        }
        if (!found) {
          this._handleJoin(ws, data.name || "");
          idx = this.sockets.indexOf(ws);
        }
      } else {
        this._handleJoin(ws, data.name || "");
        idx = this.sockets.indexOf(ws);
      }
      return;
    }

    // Ignore commands if game is over
    if (this.gameOver) {
      return;
    }

    // Handle draw command
    if (data.cmd === "draw" && idx === this.turn && this.phase === "draw") {
      this._handleDraw(idx, data.from);
    }
    // Handle meld command
    else if (data.cmd === "meld" && idx === this.turn && this.phase === "discard") {
      this._handleMeld(idx, data.melds);
    }
    // Handle discard command
    else if (data.cmd === "discard" && idx === this.turn && this.phase === "discard") {
      this._handleDiscard(idx, data.card);
    }
  }

  /**
   * Send full game state to a player (for joins/reconnects)
   */
  _sendFullState(ws, idx) {
    const opponentCardCounts = this.hands.map((h) => h.length);

    ws.send(
      JSON.stringify({
        cmd: "cards",
        myIndex: idx,
        hand: this.hands[idx],
        pile: this.pile,
        deckCount: this.deck.length,
        melds: this.melds,
        playerNames: this.playerNames,
        turn: this.turn,
        phase: this.phase,
        opponentCardCounts: opponentCardCounts,
        playerOpened: this.playerOpened,
        playerToken: this.playerTokens[idx],
        isCPU: this.isCPU,
      })
    );
  }

  /**
   * Handle player joining the lobby
   */
  _handleJoin(ws, name) {
    // Find empty slot (null)
    const emptySlot = this.sockets.indexOf(null);
    if (emptySlot === -1) {
      ws.send(JSON.stringify({ cmd: "full" }));
      return;
    }

    this.sockets[emptySlot] = ws;
    if (name) this.playerNames[emptySlot] = name;
    this.playerTokens[emptySlot] = crypto.randomBytes(8).toString("hex");

    // Check if all players joined (for multiplayer)
    if (!this.isCPU) {
      const filledSlots = this.sockets.filter((s) => s !== null).length;
      if (filledSlots === 4) {
        this.isWaiting = false;
      }
    }

    this._sendFullState(ws, emptySlot);

    // Broadcast updated player names
    this._broadcast({
      cmd: "playerJoined",
      playerNames: this.playerNames,
      playerIndex: emptySlot,
    });
  }

  /**
   * Handle drawing a card
   */
  _handleDraw(idx, from) {
    let card = null;

    if (from === "deck" && this.deck.length > 0) {
      card = this.deck.pop();
    } else if (from === "pile" && this.pile.length > 0) {
      card = this.pile.pop();
    } else if (from === "deck" && this.deck.length === 0 && this.pile.length > 1) {
      // Reshuffle pile into deck (keep top card)
      const topCard = this.pile.pop();
      this.deck = this.pile.slice();
      this.pile = [topCard];
      // Shuffle the deck
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      card = this.deck.pop();
    }

    if (card) {
      this.hands[idx].push(card);
      this.phase = "discard";

      this._broadcast({
        cmd: "draw",
        player: idx,
        card: idx === this.sockets.indexOf(this.sockets[idx]) ? card : null, // Only send card to drawer
        from,
        deckCount: this.deck.length,
        pileCount: this.pile.length,
      });

      // Send the actual card to the player who drew
      const ws = this.sockets[idx];
      if (ws && typeof ws.send === "function") {
        ws.send(
          JSON.stringify({
            cmd: "yourDraw",
            card: card,
          })
        );
      }

      this._broadcastPhase();

      console.log(`[Lobby ${this.code}] Player ${idx} drew from ${from}`);

      // Trigger CPU turn if needed
      if (this.isCPU && idx !== 0) {
        this._processCPUTurn();
      }
    }
  }

  /**
   * Handle melding cards
   */
  _handleMeld(idx, meldsData) {
    if (!Array.isArray(meldsData) || meldsData.length === 0) return;

    let totalPoints = 0;
    const validMelds = [];
    const usedIndices = new Set();

    // Validate all melds
    for (const meldCards of meldsData) {
      if (!Array.isArray(meldCards) || meldCards.length < 3) {
        console.log(`[Lobby ${this.code}] Invalid meld format`);
        return;
      }

      // Find cards in hand
      const foundCards = [];
      for (const card of meldCards) {
        const handIdx = this.hands[idx].findIndex(
          (c, i) =>
            c.suit === card.suit &&
            c.rank === card.rank &&
            !usedIndices.has(i)
        );
        if (handIdx === -1) {
          console.log(`[Lobby ${this.code}] Card not found in hand:`, card);
          return;
        }
        foundCards.push({ card: this.hands[idx][handIdx], idx: handIdx });
        usedIndices.add(handIdx);
      }

      // Validate the meld
      const points = this._validateMeld(foundCards.map((c) => c.card));
      if (points === 0) {
        console.log(`[Lobby ${this.code}] Invalid meld structure`);
        return;
      }

      totalPoints += points;
      validMelds.push(foundCards.map((c) => c.card));
    }

    // Check opening requirement
    if (!this.playerOpened[idx]) {
      if (totalPoints < 71) {
        console.log(
          `[Lobby ${this.code}] Need 71 points to open, only have ${totalPoints}`
        );
        // Send feedback to player
        const ws = this.sockets[idx];
        if (ws && typeof ws.send === "function") {
          ws.send(
            JSON.stringify({
              cmd: "meldError",
              message: `Need 71 points to open. You have ${totalPoints}.`,
            })
          );
        }
        return;
      }
      this.playerOpened[idx] = true;
    }

    // Remove cards from hand (in reverse order to maintain indices)
    const indicesToRemove = Array.from(usedIndices).sort((a, b) => b - a);
    for (const i of indicesToRemove) {
      this.hands[idx].splice(i, 1);
    }

    // Add melds to board
    for (const meld of validMelds) {
      this.melds.push({ cards: meld, owner: idx });
    }

    // Broadcast meld update
    this._broadcast({
      cmd: "meld",
      player: idx,
      melds: this.melds,
      playerOpened: this.playerOpened,
      handCounts: this.hands.map((h) => h.length),
    });

    // Check for win condition (empty hand after melding)
    if (this.hands[idx].length === 0) {
      this._handleWin(idx);
      return;
    }

    console.log(
      `[Lobby ${this.code}] Player ${idx} melded ${validMelds.length} meld(s) for ${totalPoints} points`
    );
  }

  /**
   * Validate a meld and return its point value (0 if invalid)
   */
  _validateMeld(cards) {
    const RANKS = [
      "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
    ];

    // Separate jokers from regular cards
    const jokers = cards.filter((c) => c.rank === "Joker");
    const regular = cards.filter((c) => c.rank !== "Joker");

    if (cards.length < 3) return 0;
    if (regular.length === 0) return 0; // Can't have all jokers

    // Check for SET (same rank, different suits)
    const isSet = this._checkSet(cards, regular, jokers);
    if (isSet) return this._calculatePoints(cards);

    // Check for RUN (same suit, consecutive ranks)
    const isRun = this._checkRun(cards, regular, jokers, RANKS);
    if (isRun) return this._calculatePoints(cards);

    return 0;
  }

  _checkSet(cards, regular, jokers) {
    if (cards.length < 3 || cards.length > 4) return false;

    const rank = regular[0].rank;
    const suits = new Set();

    for (const card of regular) {
      if (card.rank !== rank) return false;
      if (suits.has(card.suit)) return false;
      suits.add(card.suit);
    }

    return true;
  }

  _checkRun(cards, regular, jokers, RANKS) {
    if (cards.length < 3) return false;

    // All regular cards must be same suit
    const suit = regular[0].suit;
    if (!regular.every((c) => c.suit === suit)) return false;

    // Sort by rank
    const sorted = regular.slice().sort(
      (a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)
    );

    // Count gaps
    let jokersNeeded = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        RANKS.indexOf(sorted[i].rank) - RANKS.indexOf(sorted[i - 1].rank) - 1;
      if (gap < 0) return false; // Duplicate
      jokersNeeded += gap;
    }

    if (jokersNeeded <= jokers.length) return true;

    // Check for high-ace wrap (Q-K-A)
    if (sorted.some((c) => c.rank === "A") && sorted.some((c) => c.rank === "K")) {
      // Check if it's a valid wrap sequence
      const hasQ = sorted.some((c) => c.rank === "Q");
      const hasK = sorted.some((c) => c.rank === "K");
      const hasA = sorted.some((c) => c.rank === "A");

      if (hasQ && hasK && hasA) {
        // This is a Q-K-A run
        const wrapCards = sorted.filter((c) =>
          ["Q", "K", "A"].includes(c.rank)
        );
        if (wrapCards.length + jokers.length >= 3) return true;
      }
    }

    return false;
  }

  _calculatePoints(cards) {
    let score = 0;
    for (const card of cards) {
      if (card.rank === "Joker") score += 25;
      else if (card.rank === "A") score += 1;
      else if (["J", "Q", "K"].includes(card.rank)) score += 10;
      else score += parseInt(card.rank);
    }
    return score;
  }

  /**
   * Handle discarding a card
   */
  _handleDiscard(idx, card) {
    const i = this.hands[idx].findIndex(
      (c) => c.suit === card.suit && c.rank === card.rank
    );

    if (i === -1) {
      console.log(`[Lobby ${this.code}] Discard card not found in hand`);
      return;
    }

    const discarded = this.hands[idx].splice(i, 1)[0];
    this.pile.push(discarded);

    // Check for win (empty hand after discard - rare but possible if they melded everything)
    if (this.hands[idx].length === 0) {
      this._broadcast({
        cmd: "discard",
        player: idx,
        card: discarded,
        pileCount: this.pile.length,
      });
      this._handleWin(idx);
      return;
    }

    // Next turn (anticlockwise: 0 -> 3 -> 2 -> 1 -> 0)
    this.phase = "draw";
    this.turn = (this.turn + 3) % 4; // Same as (turn - 1 + 4) % 4

    this._broadcast({
      cmd: "discard",
      player: idx,
      card: discarded,
      pileCount: this.pile.length,
    });

    this._broadcastPhase();

    console.log(`[Lobby ${this.code}] Player ${idx} discarded, next turn: ${this.turn}`);

    // Trigger CPU turn if needed
    if (this.isCPU && this.turn !== 0) {
      setTimeout(() => this._processCPUTurn(), 800);
    }
  }

  /**
   * Handle a player winning
   */
  _handleWin(idx) {
    this.gameOver = true;
    this.winner = idx;

    // Calculate scores (deadwood penalties)
    for (let i = 0; i < 4; i++) {
      if (i !== idx) {
        let penalty = 0;
        for (const card of this.hands[i]) {
          if (card.rank === "Joker") penalty += 25;
          else if (card.rank === "A") penalty += 1;
          else if (["J", "Q", "K"].includes(card.rank)) penalty += 10;
          else penalty += parseInt(card.rank);
        }
        this.scores[i] = -penalty;
      }
    }
    this.scores[idx] = Math.abs(
      this.scores.reduce((a, b) => a + b, 0) - this.scores[idx]
    );

    this._broadcast({
      cmd: "gameOver",
      winner: idx,
      winnerName: this.playerNames[idx],
      scores: this.scores,
      hands: this.hands,
    });

    console.log(`[Lobby ${this.code}] Player ${idx} (${this.playerNames[idx]}) wins!`);

    // Remove lobby after delay
    setTimeout(() => {
      this.game.removeLobby(this.code);
    }, 60000);
  }

  /**
   * Broadcast phase and turn update
   */
  _broadcastPhase() {
    this._broadcast({
      cmd: "phase",
      phase: this.phase,
      turn: this.turn,
      playerNames: this.playerNames,
    });
  }

  /**
   * Process CPU player turn using Monte Carlo AI
   */
  async _processCPUTurn() {
    if (!this.isCPU || this.turn === 0 || this.gameOver) return;

    const cpuIndex = this.turn;
    const cpuHand = this.hands[cpuIndex];
    const delay = 1200;

    console.log(`[Lobby ${this.code}] CPU ${cpuIndex} turn, phase: ${this.phase}`);

    setTimeout(async () => {
      try {
        if (this.phase === "draw") {
          // Decide draw source using AI
          let from = "deck";

          if (this.ai) {
            try {
              const pileTop = this.pile.length > 0 ? this.pile[this.pile.length - 1] : null;
              from = await this.ai.decideDrawSource(
                cpuHand,
                pileTop,
                this.deck.length,
                this.playerOpened[cpuIndex]
              );
            } catch (e) {
              console.error("AI draw decision error:", e);
            }
          } else {
            // Fallback: random choice with slight preference for deck
            if (this.deck.length === 0 && this.pile.length > 0) {
              from = "pile";
            } else if (Math.random() < 0.8) {
              from = "deck";
            }
          }

          console.log(`[Lobby ${this.code}] CPU ${cpuIndex} drawing from ${from}`);
          this._handleDraw(cpuIndex, from);
        } else if (this.phase === "discard") {
          // Try to meld first
          if (this.ai) {
            try {
              const meldsToPlay = await this.ai.decideMelds(
                cpuHand,
                this.playerOpened[cpuIndex]
              );
              if (meldsToPlay.length > 0) {
                console.log(`[Lobby ${this.code}] CPU ${cpuIndex} melding`);
                this._handleMeld(cpuIndex, meldsToPlay);

                // Check if game ended
                if (this.gameOver) return;
              }
            } catch (e) {
              console.error("AI meld decision error:", e);
            }
          } else {
            // Fallback: try to find and play melds
            const possibleMelds = findPossibleMelds(cpuHand);
            if (possibleMelds.length > 0) {
              const best = possibleMelds.sort((a, b) => b.points - a.points);

              if (!this.playerOpened[cpuIndex]) {
                // Need 71+ to open
                let totalPoints = 0;
                const toPlay = [];
                const usedIndices = new Set();

                for (const meld of best) {
                  const overlap = meld.indices.some((i) => usedIndices.has(i));
                  if (!overlap) {
                    toPlay.push(meld.cards);
                    meld.indices.forEach((i) => usedIndices.add(i));
                    totalPoints += meld.points;
                    if (totalPoints >= 71) break;
                  }
                }

                if (totalPoints >= 71) {
                  this._handleMeld(cpuIndex, toPlay);
                  if (this.gameOver) return;
                }
              } else {
                // Already open, play any meld
                this._handleMeld(cpuIndex, [best[0].cards]);
                if (this.gameOver) return;
              }
            }
          }

          // Now discard
          let cardToDiscard = null;

          if (this.ai && cpuHand.length > 0) {
            try {
              cardToDiscard = await this.ai.decideDiscard(
                cpuHand,
                this.playerOpened[cpuIndex]
              );
            } catch (e) {
              console.error("AI discard decision error:", e);
            }
          }

          if (!cardToDiscard && cpuHand.length > 0) {
            // Fallback: discard highest value non-joker card
            const nonJokers = cpuHand.filter((c) => c.rank !== "Joker");
            if (nonJokers.length > 0) {
              nonJokers.sort((a, b) => {
                const valA =
                  a.rank === "A" ? 1 : ["J", "Q", "K"].includes(a.rank) ? 10 : parseInt(a.rank);
                const valB =
                  b.rank === "A" ? 1 : ["J", "Q", "K"].includes(b.rank) ? 10 : parseInt(b.rank);
                return valB - valA;
              });
              cardToDiscard = nonJokers[0];
            } else {
              cardToDiscard = cpuHand[0];
            }
          }

          if (cardToDiscard) {
            console.log(`[Lobby ${this.code}] CPU ${cpuIndex} discarding`);
            this._handleDiscard(cpuIndex, cardToDiscard);
          }
        }
      } catch (e) {
        console.error(`[Lobby ${this.code}] CPU ${cpuIndex} turn error:`, e);
        // Fallback: make a simple move
        if (this.phase === "draw" && this.deck.length > 0) {
          this._handleDraw(cpuIndex, "deck");
        } else if (this.phase === "discard" && cpuHand.length > 0) {
          this._handleDiscard(cpuIndex, cpuHand[0]);
        }
      }
    }, delay);
  }

  /**
   * Broadcast to all connected players
   */
  _broadcast(data) {
    for (const ws of this.sockets) {
      if (ws && typeof ws.send === "function") {
        try {
          ws.send(JSON.stringify(data));
        } catch (e) {
          console.error(`[Lobby ${this.code}] Broadcast error:`, e);
        }
      }
    }
  }
}

module.exports = Lobby;
