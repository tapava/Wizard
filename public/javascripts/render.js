/*
 * Several Methods for Drawing Things
 */

let setElementPos = (element, x, y, z = 2, degs = 0) => {
  // Sets an elements position via CSS
  // `element` is now a jQuery object or a DOM element
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
  // Adds a colored glow
  selector.css({
    "-moz-box-shadow": `0 0 ${amt}px ${color}`,
    "-webkit-box-shadow": `0 0 ${amt}px ${color}`,
    "box-shadow": `0px 0px ${amt}px ${color}`,
  });
};

let renderHand = (handCards, position = 0) => {
  // Renders hand (0=Bottom, 1=Left, 2=Top, 3=Right)
  // Each hand now has its own container within #cards, e.g., #hand-pos-0

  let handContainerId = `#hand-pos-${position}`;
  if ($(handContainerId).length === 0) {
    $("#cards").append(
      `<div id="hand-pos-${position}" class="hand-container"></div>`
    );
  }
  $(handContainerId).empty(); // Clear existing cards in this container

  if (position === 0) {
    sortDeck(handCards);
  } // Sort my cards

  let width = $(window).width();
  let height = $(window).height();
  let cardSpacing = 25;
  let half = Math.floor(handCards.length / 2);
  let baseRot = 0;
  // For anticlockwise: 1=Right, 2=Top, 3=Left
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

  // Append new cards to the container first
  let appendedCardElements = [];
  for (let card of handCards) {
    let $cardElement = $(card.html);
    $(handContainerId).append($cardElement);
    appendedCardElements.push($cardElement);
  }

  // Then position them
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
  // Renders deck (isDeck=true for main deck, isDeck=false for discard pile)
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
  // Renders Melds
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
