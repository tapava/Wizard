/*
 * Rummy Game - Combined JS File
 * Contains: main.js, handlers.js, render.js, socket.js, index.js, confetti.js
 */

// --- main.js ---
// ...existing code from main.js...
let params = window.location.href.split("/");
let code = params[4],
  token = params[5];
let getRelativePos = (actorIndex) => {
  let diff = (myIndex - actorIndex + 4) % 4;
  return diff;
};
let sendData = (data) => {
  data.lobby = code;
  data.token = token;
  send(data);
};
let setClickHandle = () => {
  $(".card").off("click");
  $(".card").off("contextmenu");
  $(".card").on("click", function () {
    let classes = $(this).attr("class");
    if (turn !== myIndex) {
      console.log("Not my turn");
      return;
    }
    if (phase === "draw") {
      if (classes.includes("deck")) {
        if (window.RummySounds) RummySounds.play("draw");
        sendData({ cmd: "draw", from: "deck" });
      } else if (classes.includes("pile")) {
        if (window.RummySounds) RummySounds.play("draw");
        sendData({ cmd: "draw", from: "pile" });
      }
    } else if (phase === "discard") {
      if (classes.includes("myhand")) {
        let [_, rank, suit] = classes.split(" ");
        rank = rank.replace("_", "");
        if (window.RummySounds) RummySounds.play("discard");
        sendData({ cmd: "discard", card: { rank, suit } });
      }
    }
  });
  $(".card").on("contextmenu", function () {
    return false;
  });
  $("body").on("contextmenu", function () {
    return false;
  });
};
let getCard = (collection, targetCard) => {
  for (let card of collection) {
    if (card.suit == targetCard.suit && card.rank == targetCard.rank) {
      return card;
    }
  }
  return null;
};
let sortDeck = (cards) => {
  cards.sort((a, b) => {
    if (a.rank != b.rank) {
      return a.rank - b.rank;
    } else {
      return a.suit - b.suit;
    }
  });
};
let beginLeave = () => {
  window.secs = 60;
  setInterval(() => {
    if (window.secs == 0) {
      window.location.href = "/";
    }
    $("#exitmsg").html(`Exiting match in ${window.secs--}s...`);
  }, 1000);
};
$(window).on("resize", () => {
  renderHand(hand, 0);
  renderHand(ophands[1], 1);
  renderHand(ophands[2], 2);
  renderHand(ophands[3], 3);
  renderDeck(deck, true);
  renderDeck(pile, false);
  renderMelds(melds);
});
$(function () {
  let name = "Player";
  try {
    name = localStorage.getItem("rummy_username") || "Player";
  } catch (e) {}
  sendData({ cmd: "join", name });
  $("#showTips").on("click", () => $("#tipsModal").fadeIn(120));
  $("#closeTips").on("click", () => $("#tipsModal").fadeOut(120));
  $("#tipsModal").on("click", function (e) {
    if (e.target === this) $("#tipsModal").fadeOut(120);
  });
  $("#quitGameBtn").on("click", () => {
    window.location.href = "/";
  });
});

// --- handlers.js ---
let showHint = (msg, t = 3000) => {
  $("#hints").text(msg).fadeIn(180);
  if (t > 0) setTimeout(() => $("#hints").fadeOut(300), t);
};
let hand = [],
  ophands = [[], [], [], []],
  deck = [],
  draw = [],
  melds = [],
  pile = [],
  playerNames = [],
  turn = -1,
  phase = "";
let myIndex = -1;
let createFakeCards = (name, n) => {
  let cards = [];
  for (let i = 0; i < n; i++) {
    let cardHtml = `<div class=\"card ${name} fake_${i} unknown\"></div>`;
    cards.push({ html: cardHtml, suit: "none", rank: "none" });
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
  updatePlayerNames(playerNames, myIndex);
  $("#cards").empty();
  if (hand && hand.length) {
    hand.forEach((card) => {
      card.html = `<div class=\"card _${card.rank} ${card.suit} myhand\"></div>`;
    });
    renderHand(hand, 0);
  }
  if (pile && pile.length) {
    pile.forEach((card, i) => {
      card.html = `<div class=\"card _${card.rank} ${card.suit} pile pile_${i}\"></div>`;
    });
    renderDeck(pile, false);
  }
  deck = createFakeCards("deck", deckCount);
  if (deck && deck.length) {
    renderDeck(deck, true);
  }
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
  phase = "discard";
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
  if (data.player === myIndex) {
    data.card.html = `<div class=\"card _${data.card.rank} ${data.card.suit} myhand\"></div>`;
    hand.push(data.card);
    renderHand(hand, 0);
    showHint("You drew a card. Now discard.");
  } else {
    showHint(`${playerNames[data.player]} drew a card.`);
    let relPos = (myIndex - data.player + 4) % 4;
    let newFakeCard = createFakeCards(`opponent${relPos}`, 1)[0];
    ophands[relPos].push(newFakeCard);
    renderHand(ophands[relPos], relPos);
  }
  setClickHandle();
};
handle.discard = (data) => {
  if (data.player === myIndex) {
    let idx = hand.findIndex(
      (c) => c.suit === data.card.suit && c.rank === data.card.rank
    );
    if (idx !== -1) {
      hand.splice(idx, 1);
    }
    renderHand(hand, 0);
  } else {
    let relPos = (myIndex - data.player + 4) % 4;
    if (ophands[relPos].length > 0) {
      ophands[relPos].pop();
    }
    renderHand(ophands[relPos], relPos);
  }
  data.card.html = `<div class=\"card _${data.card.rank} ${data.card.suit} pile\"></div>`;
  pile.push(data.card);
  renderDeck(pile, false);
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

// --- render.js ---
let setElementPos = (element, x, y, z = 2, degs = 0) => {
  let scale = 0.6;
  $(element).css({
    transform: `translateX(${x}px) translateY(${y}px) rotateZ(${degs}deg) scale(${scale})`,
    MozTransform: `translateX(${x}px) translateY(${y}px) rotateZ(${degs}deg) scale(${scale})`,
    WebkitTransform: `translateX(${x}px) translateY(${y}px) rotateZ(${degs}deg) scale(${scale})`,
    msTransform: `translateX(${x}px) translateY(${y}px) rotateZ(${degs}deg) scale(${scale})`,
    "z-index": z,
  });
};
let setGlow = (selector, amt, color) => {
  selector.css({
    "-moz-box-shadow": `0 0 ${amt}px ${color}`,
    "-webkit-box-shadow": `0 0 ${amt}px ${color}`,
    "box-shadow": `0px 0px ${amt}px ${color}`,
  });
};
let renderHand = (handCards, position = 0) => {
  let handContainerId = `#hand-pos-${position}`;
  if ($(handContainerId).length === 0) {
    $("#cards").append(
      `<div id="hand-pos-${position}" class="hand-container"></div>`
    );
  }
  $(handContainerId).empty();
  if (position === 0) {
    sortDeck(handCards);
  }
  let width = $(window).width();
  let height = $(window).height();
  let cardSpacing = 25;
  let half = Math.floor(handCards.length / 2);
  let baseRot = 0;
  if (position === 1) baseRot = -90;
  else if (position === 2) baseRot = 180;
  else if (position === 3) baseRot = 90;
  let edgeOffset = 80;
  let bottomOffset = 100;
  let cx, cy;
  if (position === 0) {
    cx = width / 2;
    cy = height - bottomOffset;
  } else if (position === 1) {
    cx = width - edgeOffset;
    cy = height / 2;
  } else if (position === 2) {
    cx = width / 2;
    cy = edgeOffset;
  } else if (position === 3) {
    cx = edgeOffset;
    cy = height / 2;
  }
  let i = 1;
  let leftIndex, rightIndex;
  let dangle = position === 0 || position === 1 ? -4 : 4;
  if (position === 1) dangle = -4;
  if (position === 3) dangle = 4;
  let appendedCardElements = [];
  for (let card of handCards) {
    let $cardElement = $(card.html);
    $(handContainerId).append($cardElement);
    appendedCardElements.push($cardElement);
  }
  if (handCards.length % 2 == 1) {
    leftIndex = half - 1;
    rightIndex = half + 1;
    setElementPos(appendedCardElements[half], cx, cy, half + 100, baseRot);
  } else {
    leftIndex = half - 1;
    rightIndex = half;
  }
  while (leftIndex >= 0) {
    if (position === 0 || position === 2) {
      setElementPos(
        appendedCardElements[leftIndex],
        cx - (half - leftIndex) * cardSpacing,
        cy,
        leftIndex + 100,
        baseRot + i * dangle
      );
      setElementPos(
        appendedCardElements[rightIndex],
        cx + (rightIndex - half) * cardSpacing,
        cy,
        rightIndex + 100,
        baseRot - i * dangle
      );
    } else {
      setElementPos(
        appendedCardElements[leftIndex],
        cx,
        cy - (half - leftIndex) * cardSpacing,
        leftIndex + 100,
        baseRot + i * dangle
      );
      setElementPos(
        appendedCardElements[rightIndex],
        cx,
        cy + (rightIndex - half) * cardSpacing,
        rightIndex + 100,
        baseRot - i * dangle
      );
    }
    leftIndex--;
    rightIndex++;
    i++;
  }
};
let renderDeck = (cards, isDeck = false) => {
  let containerId = isDeck ? "#deck-container" : "#pile-container";
  if ($(containerId).length === 0) {
    $("#cards").append(
      `<div id="${
        isDeck ? "deck-container" : "pile-container"
      }" class="card-stack-container"></div>`
    );
  }
  $(containerId).empty();
  let offset = isDeck
    ? $(window).width() / 2 - 200
    : $(window).width() / 2 + 40;
  let appendedCardElements = [];
  for (let card of cards) {
    let $cardElement = $(card.html);
    $(containerId).append($cardElement);
    appendedCardElements.push($cardElement);
  }
  for (let i = 0; i < appendedCardElements.length; i++) {
    setElementPos(
      appendedCardElements[i],
      offset,
      $(window).height() / 2 - 99,
      i + 2,
      0
    );
  }
};
let renderMelds = (melds) => {
  let meldsContainerId = "#melds-container";
  if ($(meldsContainerId).length === 0) {
    $("#cards").append(`<div id="melds-container"></div>`);
  }
  $(meldsContainerId).empty();
  let yOffset = 10;
  let xOffset = 10;
  let meldSpacing = 120;
  let cardSpacing = 30;
  for (let i = 0; i < melds.length; i++) {
    let meld = melds[i];
    for (let j = 0; j < meld.length; j++) {
      let card = meld[j];
      let $cardElement = $(card.html);
      $(meldsContainerId).append($cardElement);
      setElementPos(
        $cardElement,
        xOffset + i * meldSpacing + j * cardSpacing,
        yOffset + i * 50,
        10 + j,
        0
      );
    }
  }
};

// --- socket.js ---
let socket = new WebSocket(window.location.href.replace("http", "ws"));
let handle = {};
socket.onopen = (event) => {
  try {
    const saved = localStorage.getItem("rummy_username");
    if (saved) socket._pendingName = saved;
  } catch (e) {}
  window.addEventListener("beforeunload", () => {
    socket.close();
  });
};
socket.onmessage = (message) => {
  let data = JSON.parse(message.data);
  if (data.cmd in handle) {
    handle[data.cmd](data);
  }
};
let send = (data) => {
  socket.send(JSON.stringify(data));
};

// --- index.js ---
let joinGame = () => {
  let name = $("#name").val().trim();
  if (name) localStorage.setItem("rummy_username", name);
  window.location.href = "/join/" + $("#code").val();
};
let joinCPU = () => {
  let name = $("#name").val().trim();
  if (name) localStorage.setItem("rummy_username", name);
  window.location.href = "/joincpu/" + $("#code").val();
};
handle.status = (data) => {
  if (data.cmd == "status") {
    if (data.status == "waiting") {
      $("#lobbybtn").attr("class", "btn btn-success");
      $("#lobbybtn").html("Join");
      $("#lobbybtn").on("click", () => joinGame());
    } else if (data.status == "closed") {
      $("#lobbybtn").attr("class", "btn btn-danger");
      $("#lobbybtn").html("Full");
    } else if (data.status == "open") {
      $("#lobbybtn").attr("class", "btn btn-info");
      $("#cpubtn").css({ display: "inline" });
      $("#lobbybtn").html("Create");
      $("#lobbybtn").on("click", () => joinGame());
      $("#cpubtn").on("click", () => joinCPU());
    }
  }
};
$("#code").on("keyup", () => {
  $("#lobbybtn").unbind("click");
  $("#cpubtn").unbind("click");
  $("#cpubtn").css({ display: "none" });
  let code = $("#code").val().replace(/\W/, "");
  $("#code").val(code);
  if (/^\w{5,12}$/.test(code)) {
    $("#lobbybtn").attr("class", "btn btn-default");
    $("#lobbybtn").html("....");
    $("#lobbybtn").on("click", () => {});
    send({ cmd: "status", lobby: code });
  }
});

// --- confetti.js ---
let confettiContext = $("#confetti").get(0).getContext("2d");
let confettiDimensions = {};
let setConfettiCanvasSize = () => {
  confettiDimensions = { width: $(window).width(), height: $(window).height() };
  $("#confetti").width(confettiDimensions.width);
  $("#confetti").height(confettiDimensions.height);
};
setConfettiCanvasSize();
$(window).on("resize", setConfettiCanvasSize);
let numConfetti = 2000,
  confetti = [];
class Confetti {
  constructor() {
    this.setPos();
    this.vx = Math.random() * 1.2 - 0.6;
    this.vy = Math.random() * 1 + 1;
    this.r = Math.random() * 2 + 0.1;
    this.color = {
      r: Math.random() * 70 + 120,
      g: Math.random() * 70 + 120,
      b: Math.random() * 70 + 120,
      a: Math.random() * 0.5 + 0.5,
    };
  }
  setPos() {
    this.x = Math.random() * confettiDimensions.width;
    this.y = Math.random() * confettiDimensions.height;
  }
  draw() {
    confettiContext.beginPath();
    confettiContext.fillStyle = `rgba(${~~this.color.r}, ${~~this.color
      .g}, ${~~this.color.b}, ${this.color.a})`;
    confettiContext.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
    confettiContext.fill();
    this.update();
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x > confettiDimensions.width) {
      this.setPos();
    } else if (this.x < 0) {
      this.setPos();
    }
    if (this.y > confettiDimensions.height) {
      this.y = 0;
    }
  }
}
let showConfetti = () => {
  $("#confetti").show();
  for (let i = 0; i < numConfetti; i++) {
    confetti.push(new Confetti());
  }
  requestAnimationFrame(renderConfetti);
};
let renderConfetti = () => {
  confettiContext.clearRect(
    0,
    0,
    confettiDimensions.width,
    confettiDimensions.height
  );
  for (let conf of confetti) {
    conf.draw();
  }
  requestAnimationFrame(renderConfetti);
};

// End Combined File
