// Simple handlers for new protocol
let showHint = (msg, t = 3000) => {
  $("#hints").text(msg).fadeIn(180);
  if (t > 0) setTimeout(() => $("#hints").fadeOut(300), t);
};

// Global Game Objects - Moved from main.js
let hand = [],
  ophands = [[], [], [], []], // Array of opponent hands
  deck = [],
  draw = [],
  melds = [],
  pile = [], // Discard pile
  playerNames = [],
  turn = -1,
  phase = ""; // "draw" or "discard"

let myIndex = -1;

// createFakeCards function - MOVED FROM main.js
let createFakeCards = (name, n) => {
  // Creates fake cards (to mask true identity until played/drawn)
  let cards = [];
  for (let i = 0; i < n; i++) {
    let cardHtml = `<div class="card ${name} fake_${i} unknown"></div>`;
    cards.push({
      html: cardHtml, // Store raw HTML string
      suit: "none",
      rank: "none",
    });
  }
  return cards;
};

handle.cards = (data) => {
  myIndex = data.myIndex;
  hand = data.hand;
  pile = data.pile;
  deckCount = data.deckCount;
  melds = data.melds || [];
  playerNames = data.playerNames;
  turn = data.turn;
  phase = data.phase;
  let opponentCardCounts = Array.isArray(data.opponentCardCounts)
    ? data.opponentCardCounts
    : [0, 0, 0, 0];

  console.log("handle.cards received:", data);

  // Update Name Badges
  updatePlayerNames(playerNames, myIndex);

  // Clear previous cards and containers
  $("#cards").empty();

  // Prepare cards for my hand
  if (hand && hand.length) {
    hand.forEach((card) => {
      card.html = `<div class="card _${card.rank} ${card.suit} myhand"></div>`;
    });
    renderHand(hand, 0);
  }

  // Prepare cards for pile
  if (pile && pile.length) {
    pile.forEach((card, i) => {
      card.html = `<div class="card _${card.rank} ${card.suit} pile pile_${i}"></div>`;
    });
    renderDeck(pile, false);
  }

  // Prepare cards for deck
  deck = createFakeCards("deck", deckCount);
  if (deck && deck.length) {
    renderDeck(deck, true);
  }

  // Prepare opponent hands
  ophands = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    if (i === myIndex) continue;
    let relPos = (myIndex - i + 4) % 4;
    let count = opponentCardCounts[i];
    ophands[relPos] = createFakeCards(`opponent${relPos}`, count);
    if (ophands[relPos] && ophands[relPos].length) {
      renderHand(ophands[relPos], relPos);
    }
  }

  setClickHandle();

  if (turn === myIndex) {
    showHint(`Your turn! (${phase})`);
  } else {
    showHint(`Waiting for ${playerNames[turn]}...`);
  }
};

handle.draw = (data) => {
  console.log("handle.draw received:", data);
  // Update Global State
  phase = "discard"; // After draw, it's always discard phase

  // Visual Updates for Deck/Pile
  if (data.from === "deck") {
    if (deck.length > 0) {
      deck.pop(); // Remove from data array
      renderDeck(deck, true); // Re-render to update count/position
    }
  } else if (data.from === "pile") {
    if (pile.length > 0) {
      pile.pop(); // Remove from data array
      renderDeck(pile, false); // Re-render to update count/position
    }
  }

  // If it's ME, add to hand
  if (data.player === myIndex) {
    data.card.html = `<div class="card _${data.card.rank} ${data.card.suit} myhand"></div>`;
    hand.push(data.card);
    renderHand(hand, 0);
    showHint("You drew a card. Now discard.");
  } else {
    showHint(`${playerNames[data.player]} drew a card.`);
    let relPos = (myIndex - data.player + 4) % 4;
    // Add a fake card to opponent's hand
    let newFakeCard = createFakeCards(`opponent${relPos}`, 1)[0]; // returns {html: string}
    ophands[relPos].push(newFakeCard);
    renderHand(ophands[relPos], relPos);
    console.log(
      `Opponent ${data.player} (relPos ${relPos}) drew. New hand:`,
      ophands[relPos]
    );
  }

  setClickHandle();
};

handle.discard = (data) => {
  console.log("handle.discard received:", data);
  // Global State Update
  // Turn passes to next player handled by 'phase' message usually, but here we can anticipate or wait for phase msg

  if (data.player === myIndex) {
    // Remove from hand
    let idx = hand.findIndex(
      (c) => c.suit === data.card.suit && c.rank === data.card.rank
    );
    if (idx !== -1) {
      hand.splice(idx, 1); // Remove from data array
    }
    renderHand(hand, 0); // Re-render my hand (fill gap)
  } else {
    let relPos = (myIndex - data.player + 4) % 4;
    // Remove a fake card from opponent's hand
    if (ophands[relPos].length > 0) {
      ophands[relPos].pop(); // Remove from data array
    }
    renderHand(ophands[relPos], relPos);
  }

  // Add to pile (for everyone)
  data.card.html = `<div class="card _${data.card.rank} ${data.card.suit} pile"></div>`;
  pile.push(data.card);
  renderDeck(pile, false); // Re-render to show new top card

  setClickHandle();

  if (data.player === myIndex) {
    showHint("You discarded. Next player turn.");
  } else {
    showHint(`${playerNames[data.player]} discarded.`);
  }
};

handle.phase = (data) => {
  turn = data.turn;
  phase = data.phase;
  let name = playerNames ? playerNames[turn] : `Player ${turn}`;
  $("#turnTracker").text(`Turn: ${name}`);

  if (turn === myIndex) {
    showHint(`Your turn! (${phase})`);
    if (window.RummySounds) RummySounds.play("turn");
  } else {
    showHint(`${name}'s turn`);
  }
};

handle.exit = () => {
  window.location.href = "/";
};
