const crypto = require("crypto");

class Lobby {
  constructor(code, game, isCPU) {
    this.code = code;
    this.game = game;
    this.isCPU = isCPU;
    this.token = crypto.randomBytes(8).toString("hex");
    // For CPU games reserve slot 0 for human player so the client-side
    // logic (which assumes human is index 0 in CPU games) stays consistent.
    this.sockets = isCPU
      ? [null, "CPU", "CPU", "CPU"]
      : [null, null, null, null];
    this.playerNames = isCPU
      ? ["You", "CPU1", "CPU2", "CPU3"]
      : ["", "", "", ""];
    this.turn = 0; // 0=You, 1=Right, 2=Top, 3=Left
    this.phase = "draw"; // 'draw' or 'discard'
    this.deck = [];
    this.pile = [];
    this.hands = [[], [], [], []];
    this.melds = [];
    this.playerOpened = [false, false, false, false]; // Track if player has opened
    this.isWaiting = !isCPU; // Multiplayer waits, CPU game starts immediately
    this._setupGame();
    if (this.isCPU && this.turn !== 0) {
      this._processCPUTurn();
    }
  }

  // Setup deck, hands, pile
  _setupGame() {
    const suits = ["spade", "heart", "diamond", "club"];
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
    let cards = [];
    for (let d = 0; d < 2; d++) {
      for (let suit of suits) {
        for (let rank of ranks) {
          cards.push({ suit, rank });
        }
      }
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
    //rest to deck
    this.deck = cards;
  }

  /**
   * Handle incoming data from a client WebSocket.
   * This method routes commands from the client to the appropriate game logic.
   *
   * - Handles joining, drawing, melding, and discarding.
   * - Associates a reconnecting user (page reload) with their previous slot using a token.
   * - Triggers CPU actions if needed after a human move.
   *
   * @param {WebSocket} ws - The client's WebSocket connection
   * @param {Object} data - The data sent from the client
   */
  handleData(ws, data) {
    // Find the player's index by their WebSocket
    let idx = this.sockets.indexOf(ws);

    // --- Handle player joining (including reconnects) ---
    if (data.cmd === "join") {
      // If the client provides a token, try to match them to their previous slot
      if (data.token) {
        // If this token matches a player, re-associate this ws with that slot
        if (!this.playerTokens) this.playerTokens = [null, null, null, null];
        let found = false;
        for (let i = 0; i < 4; i++) {
          if (this.playerTokens[i] === data.token) {
            // Reconnect: replace old ws with new ws
            this.sockets[i] = ws;
            idx = i;
            found = true;
            break;
          }
        }
        if (!found) {
          // New player or token not found, assign as usual
          this._handleJoin(ws, data.name || "", data.token);
          idx = this.sockets.indexOf(ws);
        } else {
          // On reconnect, re-send full game state to this player
          let opponentCardCounts = [];
          for (let i = 0; i < 4; i++) {
            opponentCardCounts.push(this.hands[i].length);
          }
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
            })
          );
        }
      } else {
        // No token provided, treat as new join
        this._handleJoin(ws, data.name || "");
        idx = this.sockets.indexOf(ws);
      }
    }

    // --- Handle draw command ---
    // Only allow if it's this player's turn and phase is 'draw'
    else if (
      data.cmd === "draw" &&
      idx === this.turn &&
      this.phase === "draw"
    ) {
      this._handleDraw(idx, data.from);
    }

    // --- Handle meld command ---
    // Only allow if it's this player's turn and phase is 'discard'
    else if (
      data.cmd === "meld" &&
      idx === this.turn &&
      this.phase === "discard"
    ) {
      this._handleMeld(idx, data.melds);
    }

    // --- Handle discard command ---
    // Only allow if it's this player's turn and phase is 'discard'
    else if (
      data.cmd === "discard" &&
      idx === this.turn &&
      this.phase === "discard"
    ) {
      this._handleDiscard(idx, data.card);
    }

    // --- After any human action, check if it's now a CPU turn ---
    if (this.isCPU && this.turn !== 0) {
      // Only if CPU game and current turn is not human player
      this._processCPUTurn();
    }
  }

  /**
   * Handle player joining the lobby.
   * If a token is provided, associate it with the player slot for reconnects.
   * @param {WebSocket} ws - The player's WebSocket
   * @param {string} name - The player's name
   * @param {string} [token] - Optional player token for reconnects
   */
  _handleJoin(ws, name, token) {
    if (this.sockets.indexOf(null) === -1) {
      ws.send(JSON.stringify({ cmd: "exit" }));
      return;
    }
    const idx = this.sockets.indexOf(null);
    this.sockets[idx] = ws;
    if (name) this.playerNames[idx] = name;
    // Track player tokens for reconnects
    if (!this.playerTokens) this.playerTokens = [null, null, null, null];
    if (token) {
      this.playerTokens[idx] = token;
    } else {
      // If no token, generate and assign one
      this.playerTokens[idx] = crypto.randomBytes(8).toString("hex");
    }

    let opponentCardCounts = [];
    for (let i = 0; i < 4; i++) {
      opponentCardCounts.push(this.hands[i].length);
    }

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
        token: this.playerTokens[idx], // Send token to client for reconnect
      })
    );
  }

  // Handle drawing a card
  _handleDraw(idx, from) {
    let card = null;
    if (from === "deck" && this.deck.length > 0) {
      card = this.deck.pop();
    } else if (from === "pile" && this.pile.length > 0) {
      card = this.pile.pop();
    }
    if (card) {
      this.hands[idx].push(card);
      this._broadcast({ cmd: "draw", player: idx, card, from });
      this.phase = "discard";
      console.log(
        `[SERVER] After draw: current-turn=${this.turn}, next-phase=${this.phase}`
      );

      if (this.isCPU && idx !== 0) {
        this._broadcast({ cmd: "phase", phase: this.phase, turn: this.turn });
        // If a CPU drew, it's now their discard phase, trigger CPU turn again
        this._processCPUTurn();
      }
    }
  }

  // Handle discarding a card
  _handleDiscard(idx, card) {
    // Find and remove card from hand
    const i = this.hands[idx].findIndex(
      (c) => c.suit === card.suit && c.rank === card.rank
    );
    if (i !== -1) {
      const discarded = this.hands[idx].splice(i, 1)[0];
      this.pile.push(discarded);
      this._broadcast({ cmd: "discard", player: idx, card: discarded });

      this.phase = "draw";
      // Next turn anti-clockwise
      this.turn = (this.turn - 1 + 4) % 4;
      console.log(
        `[SERVER] After discard: next-turn=${this.turn}, next-phase=${this.phase}`
      );

      //if (this.isCPU && this.turn !== 0) {
      this._broadcast({ cmd: "phase", phase: this.phase, turn: this.turn });
      //}
    }
    // After any discard, if it's a CPU game and next turn is CPU, trigger CPU turn
    if (this.isCPU && this.turn !== 0) {
      this._processCPUTurn();
    }
  }

  // Handle melding
  _handleMeld(idx, meldsData) {
    // meldsData is an array of melds (each meld is an array of cards)
    // We must validate ALL melds provided in this move
    let totalPoints = 0;
    let validMelds = [];
    let cardsToRemove = [];

    // Verify user has these cards
    // And validate structure
    for (let meld of meldsData) {
      if (!Array.isArray(meld) || meld.length < 3) return; // Invalid format

      let verifiedCards = [];
      for (let card of meld) {
        // Check if card is in hand
        let found = this.hands[idx].find(
          (c) => c.suit === card.suit && c.rank === card.rank
        );
        if (!found) return; // Cheating or sync error
        // Check if we are using the same card multiple times in this single request?
        // For simplicity, we assume client sends distinct cards.
        // Real logic should track consumed cards to prevent double usage.
        verifiedCards.push(found);
      }

      let points = this._validateMeld(verifiedCards);
      if (points === 0) return; // Invalid meld

      totalPoints += points;
      validMelds.push(verifiedCards);
      cardsToRemove = cardsToRemove.concat(verifiedCards);
    }

    // Check opening condition
    if (!this.playerOpened[idx]) {
      if (totalPoints < 71) {
        // Fail: Not enough points to open
        return;
      }
      this.playerOpened[idx] = true;
    }

    // If we are here, everything is valid.
    // Remove cards from hand
    for (let card of cardsToRemove) {
      let i = this.hands[idx].indexOf(card);
      if (i !== -1) {
        this.hands[idx].splice(i, 1);
      }
    }

    // Add to board melds
    // We add them as separate melds
    for (let vm of validMelds) {
      this.melds.push(vm);
    }

    // Broadcast update
    // We send the updated hand of the player, and the full list of melds
    this._broadcast({
      cmd: "meld",
      player: idx,
      melds: this.melds,
      hand: this.hands[idx], // Only the player sees their own new hand really, others see count
    });

    // Note: Turn does not end after meld. Player must still discard.
  }

  _validateMeld(cards) {
    // Sort cards for easier checking
    // Ranks: A, 2, 3, ... 10, J, Q, K
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

    // Sort by rank index
    cards.sort((a, b) => ranks.indexOf(a.rank) - ranks.indexOf(b.rank));

    let isSet = true;
    let isRun = true;

    // Check Set (Group): Same rank, different suits
    let firstRank = cards[0].rank;
    let suitsSeen = new Set();
    for (let card of cards) {
      if (card.rank !== firstRank) isSet = false;
      if (suitsSeen.has(card.suit)) isSet = false;
      suitsSeen.add(card.suit);
    }
    if (cards.length < 3 || cards.length > 4) isSet = false;

    // Check Run (Sequence): Same suit, consecutive ranks
    let firstSuit = cards[0].suit;
    let firstRankIdx = ranks.indexOf(cards[0].rank);
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].suit !== firstSuit) isRun = false;
      if (ranks.indexOf(cards[i].rank) !== firstRankIdx + i) isRun = false;
    }
    // Ace special case (Q-K-A)?
    // The rules say "Ace can be Low (A-2-3) or High (Q-K-A)".
    // Our sort puts A at 0. So A-2-3 is covered.
    // For Q-K-A, we need to check specifically if it fails normal run check.
    if (!isRun && cards.length >= 3) {
      // Check for Q, K, A
      // A is at index 0 in our sorted list (rank 0).
      // Q is 11, K is 12.
      // If we have A, Q, K -> sorted it is A, Q, K.
      // Check if [0] is A, and the rest are consecutive ending at K?
      // Actually, if we have A, 2, K -> Invalid.
      // If we have A, Q, K -> Indices: 0, 11, 12.
      // If we have A, J, Q, K -> Indices: 0, 10, 11, 12.
      // Logic: if cards[0] is A, and cards[1...] are consecutive ending at K?
      if (cards[0].rank === "A") {
        let subRun = true;
        // Check remaining cards are consecutive
        let startIdx = ranks.indexOf(cards[1].rank);
        for (let i = 1; i < cards.length; i++) {
          if (cards[i].suit !== firstSuit) subRun = false;
          if (ranks.indexOf(cards[i].rank) !== startIdx + (i - 1))
            subRun = false;
        }
        // And the last card must be K (index 12)
        if (ranks.indexOf(cards[cards.length - 1].rank) !== 12) subRun = false;

        // And we need to ensure the sequence "connects" to A?
        // If it ends at K, A follows K. Yes.
        // But we need to ensure it's specifically Q-K-A or J-Q-K-A.
        // If we have 9-10-J-Q-K-A, that's valid.
        if (subRun) isRun = true;
      }
    }

    if (isSet || isRun) {
      return this._calculatePoints(cards);
    }
    return 0;
  }

  _calculatePoints(cards) {
    let score = 0;
    for (let card of cards) {
      if (card.rank === "A") score += 1; // Ace is 1 point per rules
      else if (["J", "Q", "K"].includes(card.rank)) score += 10;
      else score += parseInt(card.rank);
    }
    return score;
  }

  // AI for CPU players
  _processCPUTurn() {
    if (!this.isCPU || this.turn === 0) return; // Only for CPU players, not human

    const cpuIndex = this.turn;
    const cpuHand = this.hands[cpuIndex];
    const delay = 1000; // 1 second delay for CPU "thinking"

    setTimeout(() => {
      if (this.phase === "draw") {
        // Simple AI: always draw from deck if available, otherwise from pile
        let from = "deck";
        if (this.deck.length === 0 && this.pile.length > 0) {
          from = "pile";
        }
        console.log(`CPU ${cpuIndex} drawing from ${from}`);
        this._handleDraw(cpuIndex, from);
      } else if (this.phase === "discard") {
        // Simple AI: discard a random card from hand
        if (cpuHand.length > 0) {
          const randomIndex = Math.floor(Math.random() * cpuHand.length);
          const cardToDiscard = cpuHand[randomIndex];
          this._handleDiscard(cpuIndex, cardToDiscard);
        } else {
          // No cards to discard, this shouldn't happen
          console.log(`CPU ${cpuIndex} has no cards to discard!`);
        }
      }
    }, delay);
  }

  // Broadcast to all players
  _broadcast(data) {
    for (let ws of this.sockets) {
      // Only call send on actual websocket objects
      if (ws && typeof ws.send === "function") {
        try {
          ws.send(JSON.stringify(data));
        } catch (e) {
          // Ignore or log send errors to individual sockets
          console.error("Failed to send to socket:", e);
        }
      }
    }
  }
}

module.exports = Lobby;
