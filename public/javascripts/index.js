/*
 * Functions for the Lobby/Index Page
 */

let joinGame = () => {
  // Joins/Creates regular game
  let name = $("#name").val().trim();
  if (name) localStorage.setItem("rummy_username", name);
  window.location.href = "/join/" + $("#code").val();
};

let joinCPU = () => {
  // Creates CPU game
  let name = $("#name").val().trim();
  if (name) localStorage.setItem("rummy_username", name);
  window.location.href = "/joincpu/" + $("#code").val();
};

handle.status = (data) => {
  // Handle getting the status of a lobby
  if (data.cmd === "status") {
    const lobbyBtn = $("#lobbybtn");
    const cpuBtn = $("#cpubtn");

    lobbyBtn.off("click");
    cpuBtn.off("click");

    if (data.status === "waiting") {
      // Existing multiplayer lobby waiting for players
      lobbyBtn.attr("class", "home-btn primary");
      lobbyBtn.html("Join Lobby");
      lobbyBtn.on("click", () => joinGame());
      cpuBtn.hide();
    } else if (data.status === "inprogress" || data.status === "closed") {
      // Lobby is full or game in progress
      lobbyBtn.attr("class", "home-btn disabled");
      lobbyBtn.html("Lobby Full");
      cpuBtn.hide();
    } else if (data.status === "open") {
      // No lobby exists - can create new
      lobbyBtn.attr("class", "home-btn primary");
      lobbyBtn.html("Create Multiplayer");
      lobbyBtn.on("click", () => joinGame());
      cpuBtn.show();
      cpuBtn.on("click", () => joinCPU());
    } else if (data.status === "invalid") {
      lobbyBtn.attr("class", "home-btn disabled");
      lobbyBtn.html("Invalid Code");
      cpuBtn.hide();
    }
  }
};

$("#code").on("keyup", () => {
  // As the user types...
  const lobbyBtn = $("#lobbybtn");
  const cpuBtn = $("#cpubtn");

  lobbyBtn.off("click");
  cpuBtn.off("click");

  let code = $("#code").val().replace(/\W/g, ""); // Replace invalid chars
  $("#code").val(code);

  if (/^\w{5,12}$/.test(code)) {
    lobbyBtn.attr("class", "home-btn primary");
    lobbyBtn.html("Checking...");

    send({
      cmd: "status",
      lobby: code,
    }); // Request status of currently typed lobby
  } else if (code.length > 0 && code.length < 5) {
    lobbyBtn.attr("class", "home-btn disabled");
    lobbyBtn.html("Code too short");
    cpuBtn.hide();
  } else if (code.length === 0) {
    lobbyBtn.attr("class", "home-btn primary");
    lobbyBtn.html("Enter a code");
    cpuBtn.hide();
  } else {
    lobbyBtn.attr("class", "home-btn disabled");
    lobbyBtn.html("Invalid Code");
    cpuBtn.hide();
  }
});

// Initialize buttons on load
$(function () {
  // Prefill name from localStorage
  let saved = localStorage.getItem("rummy_username");
  if (saved) $("#name").val(saved);

  $("#name").on("change blur", () => {
    let v = $("#name").val().trim();
    if (v) localStorage.setItem("rummy_username", v);
  });

  // Generate random code suggestion
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  $("#code").attr("placeholder", `e.g., ${randomCode}`);

  // Hide CPU button initially
  $("#cpubtn").hide();
});
