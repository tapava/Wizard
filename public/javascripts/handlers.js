/**
 * Client-side handlers for Tunisian Rummy
 */

// Global Game State
let hand = [];
let ophands = [[], [], [], []]; // Opponent hands (by relative position)
let deck = [];
let melds = [];
let pile = [];
let playerNames = ["", "", "", ""];
let turn = -1;
let phase = ""; // "draw" or "discard"
let myIndex = -1;
let playerOpened = [false, false, false, false];
let isCPU = false;
let selectedCards = []; // For melding

/**
 * Update player name badges in the UI
 */
function updatePlayerNames(names, myIdx) {
  playerNames = names;
  for (let i = 0; i < 4; i++) {
    const relPos = (i - myIdx + 4) % 4;
    const badge = document.getElementById(`nameBadge${relPos}`);
    if (badge) {
      let displayName = names[i] || `Player ${i + 1}`;
      if (i === myIdx) displayName += " (You)";
      badge.textContent = displayName;

      // Highlight active player
      if (i === turn) {
        badge.classList.add("active");
      } else {
        badge.classList.remove("active");
      }
    }
  }
}

/**
 * Show a hint message
 */
let showHint = (msg, t = 3000) => {
  const hints = document.getElementById("hints");
  if (hints) {
    hints.textContent = msg;
    hints.style.display = "block";
    hints.style.opacity = "1";
    if (t > 0) {
      setTimeout(() => {
        hints.style.opacity = "0";
        setTimeout(() => {
          hints.style.display = "none";
        }, 400);
      }, t);
    }
  }
};

/**
 * Create fake cards for opponents (face-down)
 */
let createFakeCards = (className, n) => {
  let cards = [];
  for (let i = 0; i < n; i++) {
    cards.push({
      html: `<div class="card ${className} fake_${i} unknown"></div>`,
      suit: "none",
      rank: "none",
    });
  }
  return cards;
};

/**
 * Handle initial cards state
 */
handle.cards = (data) => {
  console.log("handle.cards:", data);

  myIndex = data.myIndex;
  hand = data.hand || [];
  pile = data.pile || [];
  const deckCount = data.deckCount || 0;
  melds = data.melds || [];
  playerNames = data.playerNames || ["", "", "", ""];
  turn = data.turn;
  phase = data.phase;
  playerOpened = data.playerOpened || [false, false, false, false];
  isCPU = data.isCPU || false;
  const opponentCardCounts = data.opponentCardCounts || [0, 0, 0, 0];

  // Store player token for reconnection
  if (data.playerToken) {
    try {
      sessionStorage.setItem("rummy_playerToken", data.playerToken);
    } catch (e) {}
  }

  // Update UI
  updatePlayerNames(playerNames, myIndex);
  $("#cards").empty();

  // Render my hand
  hand.forEach((card) => {
    const rank = String(card.rank);
    const suit = card.suit;
    card.html = `<div class="card _${rank} ${suit} myhand" data-rank="${rank}" data-suit="${suit}"></div>`;
  });
  renderHand(hand, 0);

  // Render pile
  pile.forEach((card, i) => {
    const rank = String(card.rank);
    const suit = card.suit;
    card.html = `<div class="card _${rank} ${suit} pile pile_${i}"></div>`;
  });
  renderDeck(pile, false);

  // Render deck
  deck = createFakeCards("deck", deckCount);
  renderDeck(deck, true);

  // Render opponent hands
  ophands = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    if (i === myIndex) continue;
    const relPos = (myIndex - i + 4) % 4;
    ophands[relPos] = createFakeCards(
      `opponent${relPos}`,
      opponentCardCounts[i]
    );
    renderHand(ophands[relPos], relPos);
  }

  // Render melds
  renderMelds(melds);

  // Set up click handlers
  setClickHandle();

  // Update turn display
  updateTurnDisplay();
};

/**
 * Handle connection
 */
handle.connected = () => {
  console.log("Connected to server");
};

/**
 * Handle player joined
 */
handle.playerJoined = (data) => {
  if (data.playerNames) {
    updatePlayerNames(data.playerNames, myIndex);
  }
  showHint(`${data.playerNames[data.playerIndex]} joined!`, 2000);
};

/**
 * Handle draw event
 */
handle.draw = (data) => {
  console.log("handle.draw:", data);

  phase = "discard";

  // Update deck/pile counts
  if (data.from === "deck") {
    if (deck.length > 0) {
      deck.pop();
      renderDeck(deck, true);
    }
  } else if (data.from === "pile") {
    if (pile.length > 0) {
      pile.pop();
      renderDeck(pile, false);
    }
  }

  // If someone else drew, add a fake card to their hand
  if (data.player !== myIndex) {
    const relPos = (myIndex - data.player + 4) % 4;
    const fakeCard = createFakeCards(`opponent${relPos}`, 1)[0];
    ophands[relPos].push(fakeCard);
    renderHand(ophands[relPos], relPos);
    showHint(`${playerNames[data.player]} drew a card`, 1500);
  }

  setClickHandle();
};

/**
 * Handle receiving the card you drew
 */
handle.yourDraw = (data) => {
  console.log("handle.yourDraw:", data);

  if (data.card) {
    const rank = String(data.card.rank);
    const suit = data.card.suit;
    data.card.rank = rank;
    data.card.html = `<div class="card _${rank} ${suit} myhand" data-rank="${rank}" data-suit="${suit}"></div>`;
    hand.push(data.card);
    renderHand(hand, 0);
    showHint("You drew a card. Now discard or meld.", 2000);
    if (window.RummySounds) RummySounds.play("draw");
  }

  setClickHandle();
};

/**
 * Handle discard event
 */
handle.discard = (data) => {
  console.log("handle.discard:", data);

  if (data.player === myIndex) {
    // Remove from my hand
    const idx = hand.findIndex(
      (c) => c.suit === data.card.suit && c.rank === data.card.rank
    );
    if (idx !== -1) {
      hand.splice(idx, 1);
    }
    renderHand(hand, 0);
  } else {
    // Remove a fake card from opponent's hand
    const relPos = (myIndex - data.player + 4) % 4;
    if (ophands[relPos].length > 0) {
      ophands[relPos].pop();
    }
    renderHand(ophands[relPos], relPos);
  }

  // Add to pile
  const rank = String(data.card.rank);
  const suit = data.card.suit;
  data.card.html = `<div class="card _${rank} ${suit} pile"></div>`;
  pile.push(data.card);
  renderDeck(pile, false);

  if (data.player === myIndex) {
    showHint("You discarded. Waiting for next player...", 1500);
    if (window.RummySounds) RummySounds.play("discard");
  } else {
    showHint(`${playerNames[data.player]} discarded`, 1500);
  }

  setClickHandle();
};

/**
 * Handle phase/turn update
 */
handle.phase = (data) => {
  console.log("handle.phase:", data);

  turn = data.turn;
  phase = data.phase;
  if (data.playerNames) {
    playerNames = data.playerNames;
  }

  updateTurnDisplay();
  updatePlayerNames(playerNames, myIndex);

  if (turn === myIndex) {
    if (window.RummySounds) RummySounds.play("turn");
  }

  setClickHandle();
};

/**
 * Handle meld event
 */
handle.meld = (data) => {
  console.log("handle.meld:", data);

  melds = data.melds || [];
  if (data.playerOpened) {
    playerOpened = data.playerOpened;
  }

  // Update hand counts
  if (data.handCounts) {
    for (let i = 0; i < 4; i++) {
      if (i === myIndex) continue;
      const relPos = (myIndex - i + 4) % 4;
      const count = data.handCounts[i];
      ophands[relPos] = createFakeCards(`opponent${relPos}`, count);
      renderHand(ophands[relPos], relPos);
    }
  }

  // If I melded, update my hand
  if (data.player === myIndex) {
    // Hand is already updated on server, we need to recalculate
    // The server should send the updated hand or we figure it out from melds
    const myMelds = melds.filter((m) => m.owner === myIndex);
    // For now, just re-render what we have
    renderHand(hand, 0);
    showHint("Meld successful! Now discard.", 2000);
  } else {
    showHint(`${playerNames[data.player]} played a meld`, 2000);
  }

  renderMelds(melds);
  selectedCards = [];
  setClickHandle();
};

/**
 * Handle meld error
 */
handle.meldError = (data) => {
  showHint(data.message || "Invalid meld", 3000);
};

/**
 * Handle game over
 */
handle.gameOver = (data) => {
  console.log("handle.gameOver:", data);

  const winnerName = data.winnerName || playerNames[data.winner];
  const isWinner = data.winner === myIndex;

  // Show confetti for winner
  if (isWinner && typeof createConfetti === "function") {
    createConfetti();
  }

  // Build score display
  let scoreHtml =
    "<h2>" + (isWinner ? "🎉 You Win! 🎉" : `${winnerName} Wins!`) + "</h2>";
  scoreHtml += "<div class='scores'>";
  for (let i = 0; i < 4; i++) {
    const name = playerNames[i] || `Player ${i + 1}`;
    const score = data.scores[i] || 0;
    scoreHtml += `<div class="score-row ${i === data.winner ? "winner" : ""}">`;
    scoreHtml += `<span class="name">${name}</span>`;
    scoreHtml += `<span class="score">${score > 0 ? "+" : ""}${score}</span>`;
    scoreHtml += `</div>`;
  }
  scoreHtml += "</div>";
  scoreHtml +=
    "<button onclick=\"window.location.href='/'\" class='home-btn primary'>Back to Lobby</button>";

  // Show game over modal
  const modal = document.createElement("div");
  modal.className = "game-over-modal";
  modal.innerHTML = `<div class="game-over-content">${scoreHtml}</div>`;
  document.body.appendChild(modal);

  if (isWinner && window.RummySounds) {
    RummySounds.play("win");
  }
};

/**
 * Handle lobby full
 */
handle.full = () => {
  showHint("Lobby is full!", 3000);
  setTimeout(() => {
    window.location.href = "/";
  }, 2000);
};

/**
 * Handle exit command
 */
handle.exit = () => {
  window.location.href = "/";
};

/**
 * Update the turn tracker display
 */
function updateTurnDisplay() {
  const tracker = document.getElementById("turnTracker");
  if (tracker) {
    if (turn === myIndex) {
      tracker.textContent = `Your turn - ${
        phase === "draw" ? "Draw a card" : "Meld or Discard"
      }`;
      tracker.classList.add("my-turn");
      showHint(
        phase === "draw"
          ? "Click deck or pile to draw"
          : "Right-click cards to meld, or left-click to discard",
        0
      );
    } else {
      const name = playerNames[turn] || `Player ${turn + 1}`;
      tracker.textContent = `${name}'s turn`;
      tracker.classList.remove("my-turn");
      showHint(`Waiting for ${name}...`, 0);
    }
  }

  // Update player badges
  updatePlayerNames(playerNames, myIndex);
}
