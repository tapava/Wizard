/*
 * The Main Script for Rummy Front-End
 */

let params = window.location.href.split("/"); // Extract Code and Token from URL
let code = params[4],
  token = params[5];

// Local Game Objects
// Note: The server verifies their integrity to prevent Front-End tampering/cheating
let hand = [],
  ophands = [[], [], [], []], // Array of opponent hands (mapped by relative index 1, 2, 3)
  // Actually, simpler to just map by index?
  // Let's store by relative index: 1 (Left), 2 (Top), 3 (Right)
  // So ophands[1] = Left Player's cards, etc.
  deck = [],
  draw = [],
  melds = [];

let myIndex = -1;

// Helper to get relative position (0=Me, 1=Left, 2=Top, 3=Right)
let getRelativePos = (actorIndex) => {
  let diff = (actorIndex - myIndex + 4) % 4;
  return diff;
};

let sendData = (data) => {
  // Sends data with token attached
  data.lobby = code;
  data.token = token;
  send(data);
};
// ... (rest of file) ...

// Inside socket.onmessage (which is usually inside connect() or similar, wait, main.js doesn't show socket setup)
// socket.js handles the connection and calls handlers?
// Let's check socket.js or index.js.
// 'main.js' seems to define global vars.
// 'index.js' probably sets up the socket.

let setClickHandle = () => {
  // Set the onClick handler for all cards

  let sendClick = (name, left = true) => {
    if (name.includes("unknown")) {
      if (name.includes("deck")) {
        sendData({
          cmd: "click",
          button: left ? "left" : "right",
          card: "deck",
        });
      }
    } else {
      [_, rank, suit] = name.split(" ");
      sendData({
        cmd: "click",
        button: left ? "left" : "right",
        card: "notdeck",
        rank: rank.replace("_", ""),
        suit: suit,
      });
    }
  };

  $(".card").on("click", function () {
    sendClick(this.className, (left = true));
  });

  $(".card").on("contextmenu", function () {
    sendClick(this.className, (left = false));
    return false;
  });

  $("body").on("contextmenu", function () {
    // Prevent accedental right click
    return false;
  });
};

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

// Tips modal logic
$(function () {
  $("#showTips").on("click", function () {
    // If there's a dynamic hint set (by handlers), show it compactly, otherwise open the full tips modal
    const hintContent = $("#hints").html().trim();
    if (hintContent) {
      // `showHint` is defined in handlers.js and will display the compact hint
      try {
        showHint(hintContent, 7000);
      } catch (e) {
        $("#tipsModal").fadeIn(120);
      }
    } else {
      $("#tipsModal").fadeIn(120);
    }
  });
  $("#closeTips").on("click", function () {
    $("#tipsModal").fadeOut(120);
  });
  $("#tipsModal").on("click", function (e) {
    if (e.target === this) $("#tipsModal").fadeOut(120);
  });
});
