// Simple handlers for new protocol
let showHint = (msg, t = 3000) => {
  $("#hints").text(msg).fadeIn(180);
  if (t > 0) setTimeout(() => $("#hints").fadeOut(300), t);
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

  // Update Name Badges
  updatePlayerNames(playerNames, myIndex);

  // Clear previous cards
  $("#cards").empty();

  // Add hand cards to DOM
  for (let card of hand) {
    $("#cards").append(
      `<div class="card _${card.rank} ${card.suit} myhand"></div>`
    );
    card.html = `.card._${card.rank}.${card.suit}.myhand`;
  }

  // Add pile cards to DOM
  for (let i = 0; i < pile.length; i++) {
    let card = pile[i];
    $("#cards").append(
      `<div class="card _${card.rank} ${card.suit} pile"></div>`
    );
    card.html = `.card._${card.rank}.${card.suit}.pile`; // Fix selector to be unique if possible, but pile is stack
    // Actually, to make them unique, we might need an index or just rely on the fact they are in order
    // But renderDeck uses index.
    // Let's add a unique class based on index to be safe for removal?
    // Actually, createFakeCards uses fake_i.
    // Let's add pile_i
    $(card.html).addClass(`pile_${i}`); // Wait, card.html is string selector.
    // Let's just rebuild the selector properly
    $(`.card._${card.rank}.${card.suit}.pile`).last().addClass(`pile_${i}`);
    card.html = `.card._${card.rank}.${card.suit}.pile.pile_${i}`;
  }

  // Add deck cards
  // createFakeCards returns array of objects {html, suit, rank}
  deck = createFakeCards("deck", deckCount);

  renderHand(hand, 0);
  renderDeck(pile, false);
  renderDeck(deck, true);
  
  setClickHandle();
  
  if(turn === myIndex) {
      showHint(`Your turn! (${phase})`);
  } else {
      showHint(`Waiting for ${playerNames[turn]}...`);
  }
};

handle.draw = (data) => {
  // Update Global State
  phase = "discard"; // After draw, it's always discard phase
  
  // Visual Updates for Deck/Pile
  if (data.from === "deck") {
    if (deck.length > 0) {
      let cardToRemove = deck.pop();
      $(cardToRemove.html).remove();
    }
  } else if (data.from === "pile") {
    if (pile.length > 0) {
      let cardToRemove = pile.pop();
      $(cardToRemove.html).remove();
    }
  }

  // If it's ME, add to hand
  if (data.player === myIndex) {
    hand.push(data.card);
    // Add drawn card to DOM
    $("#cards").append(
      `<div class="card _${data.card.rank} ${data.card.suit} myhand"></div>`
    );
    data.card.html = `.card._${data.card.rank}.${data.card.suit}.myhand`;
    renderHand(hand, 0);
    showHint("You drew a card. Now discard.");
  } else {
    showHint(`${playerNames[data.player]} drew a card.`);
  }

  // Re-render deck and pile to ensure positions are correct
  renderDeck(deck, true);
  renderDeck(pile, false);
  setClickHandle();
};

handle.discard = (data) => {
  // Global State Update
  // Turn passes to next player handled by 'phase' message usually, but here we can anticipate or wait for phase msg
  
  if (data.player === myIndex) {
    // Remove from hand
    let idx = hand.findIndex(
      (c) => c.suit === data.card.suit && c.rank === data.card.rank
    );
    if (idx !== -1) {
      let removed = hand.splice(idx, 1)[0];
      $(removed.html).remove(); // Remove my hand card visual
    }
  }

  // Add to pile (for everyone)
  pile.push(data.card);
  let pileIdx = pile.length - 1;
  $("#cards").append(
    `<div class="card _${data.card.rank} ${data.card.suit} pile pile_${pileIdx}"></div>`
  );
  data.card.html = `.card._${data.card.rank}.${data.card.suit}.pile.pile_${pileIdx}`;

  renderHand(hand, 0); // Re-render my hand (fill gap)
  renderDeck(pile, false);
  renderDeck(deck, true);
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
