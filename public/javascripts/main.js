/*
 * The Main Script for Rummy Front-End
 */

let params = window.location.href.split("/"); // Extract Code and Token from URL
let code = params[4],
  token = params[5];

// Local Game Objects
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

// Helper to get relative position (0=Me, 1=Right, 2=Top, 3=Left) for anticlockwise Tunisian Rummy
let getRelativePos = (actorIndex) => {
  let diff = (myIndex - actorIndex + 4) % 4;
  return diff;
};

let sendData = (data) => {
  // Sends data with token attached
  data.lobby = code;
  data.token = token;
  send(data);
};

// ... inside setClickHandle
let setClickHandle = () => {
  // Remove existing handlers to prevent duplicates
  $(".card").off("click");
  $(".card").off("contextmenu");
  // Quit game button handler moved to global init

  // Main Card Click Logic
  $(".card").on("click", function () {
    let classes = $(this).attr("class");
    
    // Check if it's my turn
    if (turn !== myIndex) {
      console.log("Not my turn");
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
        // Only allow drawing the top card (visually the last one appended or highest z-index)
        // For simplicity, any click on the pile triggers draw from pile
        console.log("Drawing from pile");
        if (window.RummySounds) RummySounds.play("draw");
        sendData({ cmd: "draw", from: "pile" });
      }
    } 
    // DISCARD PHASE
    else if (phase === "discard") {
      if (classes.includes("myhand")) {
        // Discard a card from hand
        let [_, rank, suit] = classes.split(" ");
        // Class format is usually "card _RANK SUIT myhand"
        // rank is like "_7", so remove _
        rank = rank.replace("_", "");
        
        console.log("Discarding", rank, suit);
        if (window.RummySounds) RummySounds.play("discard");
        sendData({ 
          cmd: "discard", 
          card: { rank, suit } 
        });
      }
    }
  });

  // Prevent context menu
  $(".card").on("contextmenu", function () {
    return false;
  });

  $("body").on("contextmenu", function () {
    return false;
  });
};

// ... (existing code for getCard, createFakeCards, sortDeck, beginLeave, window resize) ...

let getCard = (collection, targetCard) => {
  // Find Card
  for (let card of collection) {
    if (card.suit == targetCard.suit && card.rank == targetCard.rank) {
      return card;
    }
  }
  return null;
};

let createFakeCards = (name, n) => {
  // Creates fake cards (to mask true identity until played/drawn)
  let cards = [];
  for (let i = 0; i < n; i++) {
    $("#cards").append(`<div class="card ${name} fake_${i} unknown"></div>`);
    cards.push({
      html: `.card.fake_${i}.${name}`,
      suit: "none",
      rank: "none",
    });
  }
  return cards;
};

let sortDeck = (cards) => {
  // In-place sorts cards
  cards.sort((a, b) => {
    if (a.rank != b.rank) {
      return a.rank - b.rank;
    } else {
      return a.suit - b.suit;
    }
  });
};

let beginLeave = () => {
  // Start a countdown to automatically leave

  window.secs = 60;

  setInterval(() => {
    if (window.secs == 0) {
      window.location.href = "/";
    }
    $("#exitmsg").html(`Exiting match in ${window.secs--}s...`);
  }, 1000);
};

$(window).on("resize", () => {
  // Re-render all elements when the window size changes
  renderHand(hand, 0);
  if (ophands[1]) renderHand(ophands[1], 1);
  if (ophands[2]) renderHand(ophands[2], 2);
  if (ophands[3]) renderHand(ophands[3], 3);
  renderDeck(deck, (left = true));
  renderDeck(draw);
  renderMelds(melds);
  renderHint();
});

// Tips modal logic and Quit Button
$(function () {
  // Show Tips Button
  $("#showTips").on("click", function () {
    $("#tipsModal").fadeIn(120);
  });
  
  // Close Tips Button
  $("#closeTips").on("click", function () {
    $("#tipsModal").fadeOut(120);
  });
  
  // Click outside modal to close
  $("#tipsModal").on("click", function (e) {
    if (e.target === this) $("#tipsModal").fadeOut(120);
  });

  // Quit Game Button
  $("#quitGameBtn").on("click", function () {
    if (confirm("Are you sure you want to quit the game?")) {
      window.location.href = "/";
    }
  });

  // Join the Game
  let joinGame = () => {
    let name = "Player";
    try {
        name = localStorage.getItem("rummy_username") || "Player";
    } catch(e) {}
    
    sendData({ 
        cmd: "join", 
        name: name 
    });
  };

  if (socket.readyState === WebSocket.OPEN) {
    joinGame();
  } else {
    socket.addEventListener("open", joinGame);
  }
});
