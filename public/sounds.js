// Simple sound manager for Rummy
const RummySounds = {
  shuffle: new Audio("/sounds/shuffle.wav"),
  draw: new Audio("/sounds/draw.mp3"),
  discard: new Audio("/sounds/discard.mp3"),
  win: new Audio("/sounds/win.mp3"),
  lose: new Audio("/sounds/lose.mp3"),
  click: new Audio("/sounds/click.mp3"),
  play(name) {
    if (this[name]) {
      try {
        this[name].currentTime = 0;
        this[name].play();
      } catch (e) {
        console.warn("Sound play error:", name, e);
      }
    }
  },
};
window.RummySounds = RummySounds;
