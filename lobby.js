const Crypto = require("crypto");

// Exports Lobby Class
module.exports = class Lobby {
  /**
   * Constructs a Game Instance
   * @constructor
   * @param {string} code - The lobby code
   * @param {Game} game - The main Rummy Game
   * @param {boolean} isCPU - If the game is vs bot
   */
  constructor(code, game, isCPU) {
    this.code = code;
    this.cpu = isCPU;
    this.game = game;
    this.token = Crypto.randomBytes(22).toString("hex"); // Generate random lobby code

    this.sockets = [null, null, null, null];
    this.isWaiting = true;
    this.choosePhase = true;
    this.turn = 0;

    // Player display names
    this.playerNames = ["", "", "", ""];
    if (this.cpu) {
      // Pre-assign CPU names for opponents
      this.playerNames = ["You", "CPU1", "CPU2", "CPU3"];
    }

    this.selfDestruct = null;

    this._genCards();
  }

  /**
   * Main Method for Handling Data
   * @param {WebSocket} ws - The clients websocket
   * @param {Object} data - The data recieved
   */
  handleData(ws, data) {
    clearTimeout(this.selfDestruct); // Continue to postpone self destruct until no data is sent
    this.selfDestruct = setTimeout(() => {
      this._doSelfDistruct();
    }, 300 * 1000);

    this._ensure_players();

    if (data.cmd == "join") {
      // If client included a name in the join payload, store it temporarily on ws
      if (data.name) ws._pendingName = data.name;
      this._process_join(ws);
    } else if (data.cmd == "click" && this.sockets.indexOf(ws) == this.turn) {
      let playerIndex = this.sockets.indexOf(ws);

      if (this.choosePhase) {
        this._process_choose_phase(playerIndex, data);
      } else {
        let card = this._getCard(this.playerCards[playerIndex], data);

        if (card != null) {
          if (data.button == "left") {
            this._process_discard(playerIndex, card);
          } else {
            this._process_meld(playerIndex, card);
          }

          this._check_win();
        }
      }
    }
  }

  /**
   * Sends Data to Client
   * @param {WebSocket} ws - The clients websocket
   * @param {Object} data - The data to send
   * @returns {boolean} If data was sent
   */
  _send(ws, data) {
    if (ws !== null) {
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (e) {
        // oops..
      }
    }
    return false;
  }

  /**
   * Finds Card that Matches
   * @param {Card[]} cards - A collection of cards
   * @param {Card} targetCard - The query card
   * @returns {?Card} A card from cards that matches targetCard
   */
  _getCard(cards, targetCard) {
    for (let card of cards) {
      if (card.suit == targetCard.suit && card.rank == targetCard.rank) {
        return card;
      }
    }
    return null;
  }

  /**
   * Finds Card that Matches
   * @param {Card[]} cards - A collection of cards
   * @param {string} suit - A card suit
   * @param {number} value - A card value
   * @returns {?Card} A card from cards that matches given inputs
   */
  _getCardByValue(cards, suit, value) {
    for (let card of cards) {
      if (card.suit == suit && card.value == value) {
        return card;
      }
    }
    return null;
  }

  /**
   * In-Place Sorts Cards
   * @param {Card[]} deck - A collection of cards
   */
  _sortDeck(deck) {
    deck.sort((a, b) => {
      if (a.rank != b.rank) {
        return a.value - b.value;
      } else {
        return a.suit - b.suit;
      }
    });
  }

  /**
   * Destroys and Removes This Lobby
   */
  _doSelfDistruct() {
    console.log("Removing Lobby", this.code);
    for (let socket of this.sockets) {
      if (socket != null) {
        socket.terminate();
      }
    }
    this.game.removeLobby(this.code);
  }

  /**
   * Checks and Ensures Players (websockets) are Connected
   */
  _ensure_players() {
    if (this.cpu) {
      try {
        this._send(this.sockets[0], { cmd: "ping" });
      } catch (e) {
        this._doSelfDistruct();
      }
    } else {
      for (let i = 0; i < this.sockets.length; i++) {
        if (this.sockets[i] != null) {
          try {
            this._send(this.sockets[i], { cmd: "ping" });
          } catch (e) {
            this.isWaiting = true;
            this.sockets[i] = null;
          }
        }
      }
    }
  }

  /**
   * Calculates Card Score
   * @param {Card[]} cards - Cards
   * @returns {number} Total number of points from the cards
   */
  _calculate_card_score(cards) {
    let sum = 0;

    for (let card of cards) {
      if (card.rank == "A") {
        sum += 1;
      } else if (card.rank == "J" || card.rank == "K" || card.rank == "Q") {
        sum += 10;
      } else {
        sum += card.value + 1;
      }
    }

    return sum;
  }

  /**
   * Checks If a Player Won and then Sends Win/Loss Data
   */
  _check_win() {
    for (let i = 0; i < this.playerCards.length; i++) {
      if (this.playerCards[i].length == 0) {
        // Player i won
        if (this.sockets[i]) {
          // Calculate scores (simplified for now, usually sum of others)
          let score = 0;
          for (let j = 0; j < 4; j++) {
            if (i !== j)
              score += this._calculate_card_score(this.playerCards[j]);
          }
          this._send(this.sockets[i], { cmd: "win", score: score });
        }

        // Notify others of loss
        for (let j = 0; j < 4; j++) {
          if (i !== j && this.sockets[j]) {
            this._send(this.sockets[j], { cmd: "loss" });
          }
        }

        this._doSelfDistruct();
        break;
      }
    }
  }

  /**
   * Handles a Client Joining
   * @param {WebSocket} ws - The client socket
   */
  _process_join(ws) {
    if (!this.isWaiting || this.sockets.indexOf(null) == -1) {
      // If lobby full -> tell new client to leave

      this._send(ws, {
        cmd: "exit",
      });
    } else {
      this.sockets[this.sockets.indexOf(null)] = ws; // Add client to lobby via its Websocket
      if (this.sockets.indexOf(null) == -1 || this.cpu) {
        this.isWaiting = false;
      }

      let myIndex = this.sockets.indexOf(ws);
      let opCardsCounts = [];
      // Calculate opponent card counts relative to me: [Next, Opposite, Previous]
      for (let i = 1; i < 4; i++) {
        let opIndex = (myIndex + i) % 4;
        opCardsCounts.push(this.playerCards[opIndex].length);
      }

      // Capture player provided name if present in ws (sent earlier via a join 'name' field)
      // (clients store name in localStorage and will attach it as ws 'name' before join)
      if (ws._pendingName) this.playerNames[myIndex] = ws._pendingName;

      this._send(ws, {
        // Send copy of current deck and layout to new client
        cmd: "cards",
        myIndex: myIndex, // Inform client of their index
        cards: this.playerCards[myIndex],
        opcards: opCardsCounts, // Send array of opponent card counts
        playerNames: this.playerNames,
        turn: this.turn,
        deck: this.deck.length,
        melds: this.melds,
        draw: this.draw,
        myturn: myIndex == this.turn,
      });
    }
  }

  /**
   * Handles the Choose a Card Phase
   * @param {number} playerIndex - The player choosing
   * @param {Object} data - Data associated w/choice
   */
  _process_choose_phase(playerIndex, data) {
    if (data.button == "left" && data.card == "deck" && this.deck.length > 0) {
      // Draw from deck

      let nextCard = this.deck.pop();
      this.playerCards[playerIndex].push(nextCard);

      this._send(this.sockets[playerIndex], {
        cmd: "draw",
        from: "deck",
        player: "me",
        card: nextCard,
      });

      // Notify all other players
      for (let i = 0; i < 4; i++) {
        if (i !== playerIndex && this.sockets[i]) {
          this._send(this.sockets[i], {
            cmd: "draw",
            from: "deck",
            player: "op",
            actorIndex: playerIndex, // Who drew
          });
        }
      }
      this.choosePhase = false;
    } else if (
      data.button == "left" &&
      data.card != "deck" &&
      this._getCard(this.draw, data) != null &&
      this.draw.length > 0
    ) {
      // Draw from pile

      let nextCard = this.draw.pop();
      this.playerCards[playerIndex].push(nextCard);

      this._send(this.sockets[playerIndex], {
        cmd: "draw",
        from: "draw",
        player: "me",
        actorIndex: playerIndex,
        card: nextCard,
      });

      // Notify others
      for (let i = 0; i < 4; i++) {
        if (i !== playerIndex && this.sockets[i]) {
          this._send(this.sockets[i], {
            cmd: "draw",
            from: "draw",
            player: "op",
            actorIndex: playerIndex,
          });
        }
      }
      this.choosePhase = false;
    }
  }

  /**
   * Handles Discarding a Card
   * @param {number} playerIndex - The player discarding
   * @param {Card} card - The card being discarded
   */
  _process_discard(playerIndex, card) {
    this.playerCards[playerIndex].splice(
      this.playerCards[playerIndex].indexOf(card),
      1
    );
    this.draw.push(card);

    for (let i = 0; i < 4; i++) {
      if (this.sockets[i]) {
        this._send(this.sockets[i], {
          cmd: "discard",
          player: i === playerIndex ? "me" : "op",
          actorIndex: playerIndex,
          card: card,
        });
      }
    }

    this.choosePhase = true;
    this.turn = (this.turn + 1) % 4; // Use modulo for turn

    // If there are CPU slots, ensure names are set
    if (this.cpu) {
      this.playerNames = [this.playerNames[0] || "You", "CPU1", "CPU2", "CPU3"];
    }

    // Broadcast turn update to all players
    for (let i = 0; i < 4; i++) {
      if (this.sockets[i]) {
        this._send(this.sockets[i], {
          cmd: "turn",
          index: this.turn,
          playerNames: this.playerNames,
        });
      }
    }

    // CPU Logic
    if (this.cpu && this.turn !== 0) {
      this._play_cpu_turn(this.turn);
    }
  }

  /**
   * Handles Creating a Meld
   * @param {number} playerIndex - The player attempting to meld
   * @param {Card} card - The card to be melded
   */
  _process_meld(playerIndex, card) {
    let newMeld = this._create_new_meld(this.playerCards[playerIndex], card);

    if (newMeld.length >= 3) {
      //-> Create a new meld

      this._sortDeck(newMeld);

      for (let card of newMeld) {
        this.playerCards[playerIndex].splice(
          this.playerCards[playerIndex].indexOf(card),
          1
        );
      }
      this.melds.push(newMeld);

      // Notify all players
      for (let i = 0; i < 4; i++) {
        if (this.sockets[i]) {
          this._send(this.sockets[i], {
            cmd: "newmeld",
            player: i === playerIndex ? "me" : "op",
            actorIndex: playerIndex,
            meld: newMeld,
          });
        }
      }
    } else {
      //-> See if this card can be added to a meld

      let meld = this._create_similar_meld(card);
      if (meld.index >= 0) {
        this.playerCards[playerIndex].splice(
          this.playerCards[playerIndex].indexOf(card),
          1
        );
        this.melds[meld.index] = meld.meld;

        // Notify all players
        for (let i = 0; i < 4; i++) {
          if (this.sockets[i]) {
            this._send(this.sockets[i], {
              cmd: "addmeld",
              player: i === playerIndex ? "me" : "op",
              actorIndex: playerIndex,
              index: meld.index,
              card: card,
              meld: meld.meld,
            });
          }
        }
      }
    }
  }

  /**
   * Creates The Best Meld with Given Card
   * @param {Card[]} cards - The player's cards
   * @param {Card} targetCard - The card used to spawn a meld
   * @returns {Card[]} A meld
   */
  _create_new_meld(cards, targetCard) {
    // Helper: Check for duplicate cards in meld
    const hasDuplicates = (arr) => {
      const seen = new Set();
      for (const card of arr) {
        const key = card.suit + card.rank;
        if (seen.has(key)) return true;
        seen.add(key);
      }
      return false;
    };

    // Find longest run (same suit, sequential rank)
    let suitMeld = [targetCard];
    let index = targetCard.value,
      lowerIndex = index - 1,
      upperIndex = index + 1;

    while (
      lowerIndex >= 0 &&
      this._getCardByValue(cards, targetCard.suit, lowerIndex)
    ) {
      suitMeld.unshift(
        this._getCard(cards, {
          suit: targetCard.suit,
          rank: this.cardRanks[lowerIndex],
        })
      );
      lowerIndex--;
    }
    while (
      upperIndex < this.cardRanks.length &&
      this._getCardByValue(cards, targetCard.suit, upperIndex)
    ) {
      suitMeld.push(
        this._getCard(cards, {
          suit: targetCard.suit,
          rank: this.cardRanks[upperIndex],
        })
      );
      upperIndex++;
    }

    // Ace can be low or high
    if (targetCard.rank === "A" && targetCard.value === 0) {
      let aceHigh = Object.assign({}, targetCard, { value: 13 });
      let altMeld = [aceHigh];
      let altLower = 12,
        altUpper = 14;
      while (
        altLower >= 0 &&
        this._getCardByValue(cards, targetCard.suit, altLower)
      ) {
        altMeld.unshift(
          this._getCard(cards, {
            suit: targetCard.suit,
            rank: this.cardRanks[altLower],
          })
        );
        altLower--;
      }
      while (
        altUpper < this.cardRanks.length &&
        this._getCardByValue(cards, targetCard.suit, altUpper)
      ) {
        altMeld.push(
          this._getCard(cards, {
            suit: targetCard.suit,
            rank: this.cardRanks[altUpper],
          })
        );
        altUpper++;
      }
      if (altMeld.length > suitMeld.length) suitMeld = altMeld;
    }

    // Find set (same rank, different suits)
    let rankMeld = cards.filter((card) => card.rank == targetCard.rank);
    // Remove duplicate suits
    let uniqueRankMeld = [];
    let suitSet = new Set();
    for (let card of rankMeld) {
      if (!suitSet.has(card.suit)) {
        uniqueRankMeld.push(card);
        suitSet.add(card.suit);
      }
    }

    // Validate melds: minimum 3 cards, no duplicates
    let validSuitMeld = suitMeld.length >= 3 && !hasDuplicates(suitMeld);
    let validRankMeld =
      uniqueRankMeld.length >= 3 && !hasDuplicates(uniqueRankMeld);

    // Prefer valid suit meld, else valid rank meld
    if (validSuitMeld) {
      return suitMeld;
    } else if (validRankMeld) {
      return uniqueRankMeld;
    } else {
      return [];
    }
  }

  /**
   * Appends a Meld with Given Card
   * @param {Card} targetCard - The card to be melded
   * @returns {Object} The index of the meld and the new meld itself
   */
  _create_similar_meld(targetCard) {
    let index = targetCard.value;

    for (let i = 0; i < this.melds.length; i++) {
      let meld = this.melds[i].slice(0);

      if (meld[0].rank != meld[meld.length - 1].rank) {
        // Suit Meld

        if (meld[0].suit == targetCard.suit) {
          let firstRankIndex = meld[0].value,
            lastRankIndex = meld[meld.length - 1].value;

          if (firstRankIndex - 1 == index) {
            // Add to front
            meld.unshift(targetCard);
            return { index: i, meld: meld };
          } else if (lastRankIndex + 1 == index) {
            // Add to back
            meld.push(targetCard);
            return { index: i, meld: meld };
          }
        }
      } else if (meld[0].rank == targetCard.rank) {
        // Rank Meld

        meld.push(targetCard);
        this._sortDeck(meld);
        return { index: i, meld: meld };
      }
    }

    if (targetCard.value == 0) {
      // If it's an Ace try flipping its value
      targetCard.value = 14;
      return this._create_similar_meld(targetCard);
    }

    return { index: -1 };
  }

  /**
   * Generates a Deck of Cards
   */
  _genCards() {
    this.cardRanks = [
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
      "A",
    ];

    let cards = [];

    // Generate 2 Decks
    for (let d = 0; d < 2; d++) {
      for (let suit of ["spade", "heart", "diamond", "club"]) {
        for (let i = 2; i <= 10; i++) {
          cards.push({
            html: `.card._${i}.${suit}`,
            suit: suit,
            rank: "" + i,
            value: this.cardRanks.indexOf("" + i),
          });
        }

        for (let face of ["A", "J", "Q", "K"]) {
          cards.push({
            html: `.card._${face}.${suit}`,
            suit: suit,
            rank: face,
            value: this.cardRanks.indexOf(face),
          });
        }
      }
    }

    for (let i = cards.length - 1; i > 0; i--) {
      // Shuffle Cards
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    this.playerCards = [
      cards.splice(0, 14),
      cards.splice(0, 14),
      cards.splice(0, 14),
      cards.splice(0, 14),
    ];

    this.melds = [];

    this.draw = cards.splice(0, 1);
    this.deck = cards;
  }

  /**
   * Plays a Turn as the CPU
   * @param {number} playerIndex - The CPU player index (1, 2, or 3)
   */
  _play_cpu_turn(playerIndex) {
    // Ensure we are operating on a valid CPU index
    if (playerIndex < 1 || playerIndex > 3) return;

    let cpuCards = this.playerCards[playerIndex];

    // If both deck and draw are empty, skip CPU turn
    if (this.deck.length === 0 && this.draw.length === 0) return;

    setTimeout(() => {
      // Choose a card
      let canDrawDeck = this.deck.length > 0;
      let canDrawPile = this.draw.length > 0;
      let drawFromDeck = false;
      if (canDrawDeck && canDrawPile) {
        drawFromDeck = Math.random() > 0.5;
      } else if (canDrawDeck) {
        drawFromDeck = true;
      } else {
        drawFromDeck = false; // Must draw from pile
      }
      let data = { cmd: "click", button: "left" };
      if (drawFromDeck) {
        data.card = "deck";
      } else if (canDrawPile) {
        let card = this.draw[this.draw.length - 1];
        data.card = "notdeck";
        data.rank = card.rank;
        data.suit = card.suit;
      } else {
        // No cards to draw
        return;
      }
      this._process_choose_phase(playerIndex, data);
      // After drawing, set choosePhase to false so CPU can discard
      this.choosePhase = false;
    }, 1000);

    setTimeout(() => {
      // Discard a card
      if (cpuCards.length > 0) {
        let discardCard = cpuCards[Math.floor(Math.random() * cpuCards.length)];
        this._process_discard(playerIndex, discardCard);
        this._check_win();
      }
    }, 3000);
  }
};
