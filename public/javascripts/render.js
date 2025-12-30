/*
 * Several Methods for Drawing Things
 */

let setElementPos = (element, x, y, z = 2, degs = 0) => {
  // Sets an elements position via CSS
  // Scale down cards to fit 4 players
  let scale = 0.6;
  $(element.html).css({
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
  if (handCards.length % 2 == 1) {
    leftIndex = half - 1;
    rightIndex = half + 1;
    setElementPos(handCards[half], cx, cy, half + 100, baseRot);
  } else {
    leftIndex = half - 1;
    rightIndex = half;
  }
  while (leftIndex >= 0) {
    if (position === 0 || position === 2) {
      setElementPos(
        handCards[leftIndex],
        cx - (half - leftIndex) * cardSpacing,
        cy,
        leftIndex + 100,
        baseRot + i * dangle
      );
      setElementPos(
        handCards[rightIndex],
        cx + (rightIndex - half) * cardSpacing,
        cy,
        rightIndex + 100,
        baseRot - i * dangle
      );
    } else {
      setElementPos(
        handCards[leftIndex],
        cx,
        cy - (half - leftIndex) * cardSpacing,
        leftIndex + 100,
        baseRot + i * dangle
      );
      setElementPos(
        handCards[rightIndex],
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

let renderDeck = (cards, left = false) => {
  // Renders deck (for both deck and face up draw pile)

  let offset = left ? $(window).width() / 2 - 200 : $(window).width() / 2 + 40;

  for (let i in cards) {
    setElementPos(cards[i], offset, $(window).height() / 2 - 99, i + 2, 0);
  }
};

let renderMelds = (melds) => {
  // Renders Melds

  let height = 10,
    offset = 10;

  for (let i in melds) {
    for (let j in melds[i]) {
      setElementPos(melds[i][j], offset + j * 20, height, i + j + 100, 0);
    }

    height += 220;
    if (height + 200 > $(window).height()) {
      // Start a new column if they go off screen
      height = 10;
      offset += 240;
    }
  }
};

let renderHint = () => {
  // Render hint msg in the top right

  setElementPos({ html: "#hints" }, $(window).width() - 200, 10, 9999);
};

let updatePlayerNames = (names, myIdx) => {
  // Map absolute player indices to relative positions
  // 0=Me, 1=Right, 2=Top, 3=Left (Anti-clockwise from my perspective)
  
  // Logic from main.js getRelativePos:
  // let getRelativePos = (actorIndex) => {
  //   let diff = (myIndex - actorIndex + 4) % 4;
  //   return diff;
  // };
  
  // And matching with UI:
  // relPos 0 -> #nameBadge0 (Bottom/Me)
  // relPos 1 -> #nameBadge3 (Right)
  // relPos 2 -> #nameBadge2 (Top)
  // relPos 3 -> #nameBadge1 (Left)

  for (let i = 0; i < 4; i++) {
    let name = names[i];
    // Default to "CPU" if name is empty or just "Player X"
    if (!name) name = `CPU ${i}`;
    
    let relPos = (myIdx - i + 4) % 4; // 0, 1, 2, 3
    
    // Assign to correct badge
    if (relPos === 0) {
      $("#nameBadge0").text(name);
    } else if (relPos === 1) {
      $("#nameBadge3").text(name);
    } else if (relPos === 2) {
      $("#nameBadge2").text(name);
    } else if (relPos === 3) {
      $("#nameBadge1").text(name);
    }
  }
};
