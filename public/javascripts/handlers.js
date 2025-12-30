/*
 * Handlers for Incoming Socket Data
 */

// Small helper to display non-blocking hints in the top-right
let showHint = (html, timeout = 5000) => {
  $("#hints").stop(true, true).html(html).fadeIn(180);
  if (timeout > 0) {
    setTimeout(() => {
      $("#hints").fadeOut(300);
    }, timeout);
  }
};

// Top-level turn handler (keeps out of other handlers)
handle.turn = (data) => {
  // Update turn tracker UI and show small hint
  // data: { index: 0..3, playerNames: [...] }
  let names = data.playerNames || [];
  let name = names[data.index] || `Player ${data.index}`;
  $("#turnTracker").text(`Turn: ${name}`);
  showHint(`${name}'s Turn`, 3000);
  // highlight active badge
  for (let i = 0; i < 4; i++) {
    $(`#nameBadge${i}`).toggleClass("active", i === data.index);
  }
};

handle.connected = (data) => {
  // Handle join - include username if present in localStorage
  let name = null;
  try {
    name = localStorage.getItem("rummy_username");
  } catch (e) {}
  let payload = { cmd: "join" };
  if (name) payload.name = name;
  sendData(payload);
};

handle.exit = (data) => {
  // Handle Exir
  window.location.href = "/";
};

handle.cards = (data) => {
  // Handle initial cards/layout

  myIndex = data.myIndex; // Set global myIndex

  for (let card of data.cards) {
    $("#cards").append(
      `<div class="card _${card.rank} ${card.suit} myhand"></div>`
    );
    hand.push(card);
  }

  for (let card of data.draw) {
    $("#cards").append(`<div class="card _${card.rank} ${card.suit}"></div>`);
    draw.push(card);
  }

  for (let meld of data.melds) {
    for (let card of meld) {
      $("#cards").append(`<div class="card _${card.rank} ${card.suit}"></div>`);
    }
    melds.push(meld);
  }

  // Create fake cards for opponents
  // data.opcards is [countNext, countOpposite, countPrevious] (relative to me)
  // But wait, my lobby.js logic was:
  // opCardsCounts.push(this.playerCards[opIndex].length);
  // where opIndex = (myIndex + i) % 4 for i=1,2,3.
  // So index 0 of opcards is Relative Pos 1 (Left/Next).
  // Index 1 is Relative Pos 2 (Top/Opposite).
  // Index 2 is Relative Pos 3 (Right/Previous).

  // Clear ophands
  ophands = [[], [], [], []]; // 0 is unused/null

  for (let i = 0; i < 3; i++) {
    let relPos = i + 1; // 1, 2, 3
    let count = data.opcards[i];
    ophands[relPos] = createFakeCards(`ophand_${relPos}`, count);
    // Note: createFakeCards appends to #cards with class `ophand_${relPos}`
  }

  // Also create deck
  deck = createFakeCards("deck", data.deck);

  renderHand(hand, 0);
  renderHand(ophands[1], 1);
  renderHand(ophands[2], 2);
  renderHand(ophands[3], 3);

  renderDeck(deck, (left = true));
  renderDeck(draw);
  renderMelds(melds);
  renderHint();

  // Glows
  // setGlow($('.ophand'), 15, '#fa001e'); // Need to target specific ophands?
  // Let's just glow all 'unknown' cards? Or per class.
  // setGlow($('.myhand'), 15, '#005bf9');

  setClickHandle();

  // Initialize turn tracker and non-blocking hint
  if (data.playerNames) {
    $("#turnTracker").text(
      `Turn: ${data.playerNames[data.turn] || "Waiting..."}`
    );
    // Populate name badges
    for (let i = 0; i < 4; i++) {
      const nm = data.playerNames[i] || (i == 0 ? "You" : `Player ${i + 1}`);
      $(`#nameBadge${i}`).text(nm);
      $(`#nameBadge${i}`).removeClass("active");
    }
  }
  if (data.myturn) {
    showHint("<h5>Left Click to select <br> a card from the middle</h5>", 6000);
  } else {
    showHint("<h5>Opponents Turn...</h5>", 3000);
  }
};

// draw handler
handle.draw = (data) => {
  let relPos = getRelativePos(data.actorIndex); // 0, 1, 2, 3

  if (relPos === 0) {
    // Me
    $(nextCard.html).attr(
      "class",
      `card _${data.card.rank} ${data.card.suit} myhand`
    );
    hand.push(data.card);
    renderHand(hand, 0);
    showHint(
      "<h5>Right Click your hand <br> to create a meld or <br> Left Click to discard <br> a card and end your turn</h5>",
      6000
    );
  } else {
    // Determine class for opponent
    let className = `ophand_${relPos}`;
    let fakeIdx = ophands[relPos].length;

    $(nextCard.html).attr("class", `card ${className} fake_${fakeIdx} unknown`);

    ophands[relPos].push({
      html: `.card.fake_${fakeIdx}.${className}`,
      suit: "none",
      rank: "none",
    });
    renderHand(ophands[relPos], relPos);
  }

  // setGlow($('.ophand'), 15, '#fa001e');
  // setGlow($('.myhand'), 15, '#005bf9');
};

handle.discard = (data) => {
  // Handle discard

  let relPos = getRelativePos(data.actorIndex);

  if (relPos === 0) {
    // Me
    hand.splice(hand.indexOf(getCard(hand, data.card)), 1);
    $(data.card.html).attr(
      "class",
      `card _${data.card.rank} ${data.card.suit}`
    );
    draw.push(data.card);
    renderHand(hand, 0);
    renderDeck(draw);
    showHint("<h5>Opponents Turn...</h5>", 3000);
    // Check if hand is empty (shouldn't happen in normal flow but prevents crash)
    if (ophands[relPos].length === 0) {
      // Just create a dummy card for visual consistency if needed, or return
      console.warn("Opponent hand empty during discard processing", relPos);
      // We can't pop. But we need to show the discarded card.
      // Let's fake it.
      let fakeCard = {
        html: `<div class=\"card _${data.card.rank} ${data.card.suit}\"></div>`,
      };
      $("#cards").append(fakeCard.html); // Add to DOM
      // Update class/pos
      let lastCard = $("#cards div:last-child");
      lastCard.attr("class", `card _${data.card.rank} ${data.card.suit}`);

      // Add to draw pile
      draw.push(data.card);
      renderDeck(draw);
    } else {
      let nextCard = ophands[relPos].pop(); // Pop from specific op hand
      $(nextCard.html).attr(
        "class",
        `card _${data.card.rank} ${data.card.suit}`
      );
      draw.push(data.card);
      renderHand(ophands[relPos], relPos);
      renderDeck(draw);
    }

    // setGlow($('.ophand'), 15, '#fa001e');
    // setGlow($('.myhand'), 15, '#005bf9');
  }
};

handle.newmeld = (data) => {
  // Handles creation of a new meld

  let relPos = getRelativePos(data.actorIndex);

  if (relPos === 0) {
    // Me
    for (let card of data.meld) {
      hand.splice(hand.indexOf(getCard(hand, card)), 1);
    }
    melds.push(data.meld);
    renderHand(hand, 0);
    renderMelds(melds);
  } else {
    for (let card of data.meld) {
      let nextCard = ophands[relPos].pop();
      $(nextCard.html).attr("class", `card _${card.rank} ${card.suit}`);
    }
    melds.push(data.meld);
    renderHand(ophands[relPos], relPos);
    renderMelds(melds);
  }
};

handle.addmeld = (data) => {
  // Handles the edit of a previous meld

  let relPos = getRelativePos(data.actorIndex);

  if (relPos === 0) {
    // Me
    hand.splice(hand.indexOf(getCard(hand, data.card)), 1);
    melds[data.index] = data.meld;
    renderHand(hand, 0);
    renderMelds(melds);
  } else {
    let nextCard = ophands[relPos].pop();
    $(nextCard.html).attr("class", `card _${data.card.rank} ${data.card.suit}`);
    melds[data.index] = data.meld;
    renderHand(ophands[relPos], relPos);
    renderMelds(melds);
  }
};

handle.win = (data) => {
  // Handle win
  $("#alert").attr("class", "alert alert-success");
  $("#alert").html(
    `<h4 class="alert-heading">You Won! Score: ${data.score}</h4><p id="exitmsg"></p>`
  );
  $("#alert").fadeToggle();
  $(".card").unbind("click");
  showConfetti();
  beginLeave();
};

handle.loss = (data) => {
  // Handle loss
  $("#alert").attr("class", "alert alert-danger");
  $("#alert").html(
    '<h4 class="alert-heading">You Lost!</h4><p id="exitmsg"></p>'
  );
  $("#alert").fadeToggle();
  $(".card").unbind("click");
  beginLeave();
};
