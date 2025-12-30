const crypto = require("crypto");

class Lobby {
  constructor(code, game, isCPU) {
    this.code = code;
    this.game = game;
    this.isCPU = isCPU;
    this.token = crypto.randomBytes(8).toString("hex");
    this.sockets = [null, null, null, null];
    this.playerNames = isCPU
      ? ["You", "CPU1", "CPU2", "CPU3"]
      : ["", "", "", ""];
    this.turn = 0; // 0=You, 1=Right, 2=Top, 3=Left
    this.phase = "draw"; // 'draw' or 'discard'
    this.deck = [];
    this.pile = [];
    this.hands = [[], [], [], []];
    this.melds = [];
    this.isWaiting = !isCPU; // Multiplayer waits, CPU game starts immediately
    this._setupGame();
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
    // One card to pile, rest to deck
    this.pile = [cards.pop()];
    this.deck = cards;
  }

  // Handle incoming data from client
  handleData(ws, data) {
    const idx = this.sockets.indexOf(ws);
    if (data.cmd === "join") {
      this._handleJoin(ws, data.name || "");
    } else if (
      data.cmd === "draw" &&
      idx === this.turn &&
      this.phase === "draw"
    ) {
      this._handleDraw(idx, data.from);
    } else if (
      data.cmd === "discard" &&
      idx === this.turn &&
      this.phase === "discard"
    ) {
      this._handleDiscard(idx, data.card);
    }
  }

  // Handle player joining
  _handleJoin(ws, name) {
    if (this.sockets.indexOf(null) === -1) {
      ws.send(JSON.stringify({ cmd: "exit" }));
      return;
    }
    const idx = this.sockets.indexOf(null);
    this.sockets[idx] = ws;
    if (name) this.playerNames[idx] = name;
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
      this._broadcast({ cmd: "phase", phase: this.phase, turn: this.turn });
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
      // Next turn anti-clockwise
      this.turn = (this.turn - 1 + 4) % 4;
      this.phase = "draw";
      this._broadcast({ cmd: "phase", phase: this.phase, turn: this.turn });
    }
  }

  // Broadcast to all players
  _broadcast(data) {
    for (let ws of this.sockets) {
      if (ws) ws.send(JSON.stringify(data));
    }
  }
}

module.exports = Lobby;
