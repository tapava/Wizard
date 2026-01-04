/**
 * Main Script for Tunisian Rummy Front-End
 */

// Extract Code and Token from URL
let params = window.location.href.split("/");
let code = params[4];
let token = params[5];

/**
 * Send data to server with lobby credentials
 */
let sendData = (data) => {
  data.lobby = code;
  data.token = token;
  send(data);
};

/**
 * Join the game
 */
let joinGame = () => {
  let name = "Player";
  try {
    name = localStorage.getItem("rummy_username") || "Player";
  } catch (e) {}

  // Check for player token (for reconnection)
  let playerToken = null;
  try {
    playerToken = sessionStorage.getItem("rummy_playerToken");
  } catch (e) {}

  sendData({
    cmd: "join",
    name: name,
    playerToken: playerToken,
  });
};

/**
 * Set up click handlers for cards
 */
let setClickHandle = () => {
  // Remove existing handlers to prevent duplicates
  $(".card").off("click");
  $(".card").off("contextmenu");

  // Main Card Click Logic (Left Click)
  $(".card").on("click", function (e) {
    let $card = $(this);
    let classes = $card.attr("class") || "";

    // Check if it's my turn
    if (turn !== myIndex) {
      showHint("Not your turn!", 1500);
      return;
    }

    // DRAW PHASE
    if (phase === "draw") {
      if (classes.includes("deck")) {
        // Draw from Deck
        console.log("Drawing from deck");
        if (window.RummySounds) RummySounds.play("draw");
        sendData({ cmd: "draw", from: "deck" });
      } else if (classes.includes("pile")) {
        // Draw from Discard Pile
        console.log("Drawing from pile");
        if (window.RummySounds) RummySounds.play("draw");
        sendData({ cmd: "draw", from: "pile" });
      } else if (classes.includes("myhand")) {
        showHint("Draw a card first!", 1500);
      }
    }
    // DISCARD PHASE
    else if (phase === "discard") {
      if (classes.includes("myhand")) {
        // Check if card is selected (for melding)
        if ($card.hasClass("selected")) {
          // Deselect
          $card.removeClass("selected");
          let cardData = {
            rank: $card.data("rank"),
            suit: $card.data("suit"),
          };
          selectedCards = selectedCards.filter(
            (c) => !(c.rank === cardData.rank && c.suit === cardData.suit)
          );
          updateSelectedDisplay();
        } else {
          // Discard this card
          let rank = $card.data("rank");
          let suit = $card.data("suit");

          // Fallback: try to parse from class
          if (!rank || !suit) {
            let parts = classes.split(" ");
            for (let p of parts) {
              if (p.startsWith("_")) rank = p.replace("_", "");
              if (["spade", "heart", "diamond", "club", "joker"].includes(p))
                suit = p;
            }
          }

          // Ensure rank is string
          rank = String(rank);

          console.log("Discarding", rank, suit);
          if (window.RummySounds) RummySounds.play("discard");
          sendData({
            cmd: "discard",
            card: { rank, suit },
          });
        }
      }
    }
  });

  // Right Click for Meld Selection
  $(".card.myhand").on("contextmenu", function (e) {
    e.preventDefault();

    if (turn !== myIndex || phase !== "discard") {
      showHint("Can only meld during discard phase on your turn!", 1500);
      return false;
    }

    let $card = $(this);
    let rank = $card.data("rank");
    let suit = $card.data("suit");

    if (!rank || !suit) {
      // Try to parse from class
      let classes = $card.attr("class") || "";
      let parts = classes.split(" ");
      for (let p of parts) {
        if (p.startsWith("_")) rank = p.replace("_", "");
        if (["spade", "heart", "diamond", "club", "joker"].includes(p))
          suit = p;
      }
    }

    if ($card.hasClass("selected")) {
      // Deselect
      $card.removeClass("selected");
      selectedCards = selectedCards.filter(
        (c) => !(c.rank === rank && c.suit === suit)
      );
    } else {
      // Select
      $card.addClass("selected");
      selectedCards.push({ rank, suit });
    }

    updateSelectedDisplay();
    return false;
  });

  // Prevent context menu on body
  $("body").on("contextmenu", function (e) {
    if ($(e.target).hasClass("myhand")) {
      return false;
    }
  });
};

/**
 * Update the display showing selected cards for melding
 */
function updateSelectedDisplay() {
  let display = $("#meldDisplay");
  if (display.length === 0) {
    $("body").append('<div id="meldDisplay" class="meld-display"></div>');
    display = $("#meldDisplay");
  }

  if (selectedCards.length === 0) {
    display.hide();
    return;
  }

  let html = `<span>Selected: ${selectedCards.length} cards</span>`;
  html += `<button id="meldBtn" class="meld-btn">Meld</button>`;
  html += `<button id="clearMeldBtn" class="clear-btn">Clear</button>`;

  display.html(html).show();

  // Meld button handler
  $("#meldBtn")
    .off("click")
    .on("click", function () {
      if (selectedCards.length >= 3) {
        console.log("Attempting to meld:", selectedCards);
        sendData({
          cmd: "meld",
          melds: [selectedCards],
        });

        // Remove selected cards from local hand (will be confirmed by server)
        for (let sc of selectedCards) {
          let idx = hand.findIndex(
            (c) => c.rank === sc.rank && c.suit === sc.suit
          );
          if (idx !== -1) {
            hand.splice(idx, 1);
          }
        }

        selectedCards = [];
        $(".card.selected").removeClass("selected");
        updateSelectedDisplay();
        renderHand(hand, 0);
        setClickHandle();
      } else {
        showHint("Need at least 3 cards to meld!", 2000);
      }
    });

  // Clear button handler
  $("#clearMeldBtn")
    .off("click")
    .on("click", function () {
      selectedCards = [];
      $(".card.selected").removeClass("selected");
      updateSelectedDisplay();
    });
}

/**
 * Get a card from a collection by suit and rank
 */
let getCard = (collection, targetCard) => {
  for (let card of collection) {
    if (card.suit === targetCard.suit && card.rank === targetCard.rank) {
      return card;
    }
  }
  return null;
};

/**
 * Sort cards in hand by suit then rank
 */
let sortDeck = (cards) => {
  const suitOrder = { spade: 0, heart: 1, diamond: 2, club: 3, joker: 4 };
  const rankOrder = {
    A: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    J: 11,
    Q: 12,
    K: 13,
    Joker: 14,
  };

  cards.sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return rankOrder[a.rank] - rankOrder[b.rank];
  });
};

/**
 * Handle window resize
 */
$(window).on("resize", () => {
  renderHand(hand, 0);
  for (let i = 1; i < 4; i++) {
    if (ophands[i] && ophands[i].length > 0) {
      renderHand(ophands[i], i);
    }
  }
  renderDeck(deck, true);
  renderDeck(pile, false);
  renderMelds(melds);
});

/**
 * Initialize the game on page load
 */
$(function () {
  // UI setup for tips modal
  $("#showTips").on("click", () => $("#tipsModal").fadeIn(120));
  $("#closeTips").on("click", () => $("#tipsModal").fadeOut(120));
  $("#tipsModal").on("click", function (e) {
    if (e.target === this) $("#tipsModal").fadeOut(120);
  });

  // Quit button
  $("#quitGameBtn").on("click", () => {
    if (confirm("Are you sure you want to quit the game?")) {
      window.location.href = "/";
    }
  });

  // Join game when socket is ready
  if (socket.readyState === WebSocket.OPEN) {
    joinGame();
  } else {
    socket.addEventListener("open", joinGame);
  }
});
