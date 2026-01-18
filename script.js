// Format number in Millions with "M"
function formatMillion(amount) {
  return (amount / 1_000_000).toFixed(2) + 'M';
}

let teams = [];
let players = [];
let auctionData = {}; // { teamId: { selectedPlayers: [], budgetUsed: 0 } }
let unsoldPlayers = [];
const MIN_PER_PLAYER = 1_000_000; // 1 million

// Load JSON data
async function loadData() {
  const teamsResponse = await fetch('teams.json');
  teams = await teamsResponse.json();

  const playersResponse = await fetch('players.json');
  players = await playersResponse.json();

  initAuction();
}

function initAuction() {
  const teamsContainer = document.getElementById('teams-container');
  teamsContainer.innerHTML = '';
  teams.forEach(team => {
    auctionData[team.teamId] = { selectedPlayers: [], budgetUsed: 0 };

    const div = document.createElement('div');
    div.className = 'team-card';
    div.id = `team-${team.teamId}`;
    div.innerHTML = `
      <img src="${team.bannerUrl}" alt="${team.teamName}">
      <h3>${team.teamName}</h3>
      <p>Captain: ${team.captainName}</p>
      <p>Budget: $${formatMillion(team.maxBudget)}</p>
      <p>Remaining Purse: $<span id="remaining-${team.teamId}">${formatMillion(team.maxBudget)}</span></p>
      <p>Players: ${team.minPlayers} - ${team.maxPlayers}</p>
      <h4>Selected Players:</h4>
      <ul id="selected-players-${team.teamId}"></ul>
      <button onclick="resetTeam('${team.teamId}')">Reset</button>
    `;

    teamsContainer.appendChild(div);
  });

  const playersContainer = document.getElementById('players-container');
  playersContainer.innerHTML = '';
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player-card';
    div.id = `player-${player.playerId}`;
    div.innerHTML = `
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${player.basePrice}</p>
      <p>Availability: ${player.availabilityPercentage}% (${player.WNBOStatus})</p>
      <p>Comments: ${player.availabilityComments}</p>
      <input type="number" min="${player.basePrice}" placeholder="Enter bid (Min $${formatMillion(player.basePrice)})">
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <button onclick="placeBid('${player.playerId}')">Finalize / Sold</button>
      <p id="bid-status-${player.playerId}"></p>
    `;
    playersContainer.appendChild(div);
  });
}

function placeBid(playerId) {
  const player = players.find(p => p.playerId === playerId);
  const bidInput = document.querySelector(`#player-${playerId} input`);
  const teamSelect = document.querySelector(`#player-${playerId} select`);
  const teamId = teamSelect.value;
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];

  const statusEl = document.getElementById(`bid-status-${playerId}`);
  const finalizeBtn = document.querySelector(`#player-${playerId} button`);

  // Check if player is already sold
  if (finalizeBtn.disabled) {
    statusEl.textContent = "Player already sold.";
    return;
  }

  // Calculate remaining players allowed to buy
  const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1; // after this bid
  const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

  if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
    statusEl.textContent = `Bid too high. Team must have at least ${formatMillion(MIN_PER_PLAYER)} per remaining player.`;
    return;
  }

  // Validation
  const bidAmount = Number(bidInput.value);
  if (!bidAmount || bidAmount < player.basePrice) {
    statusEl.textContent = "Bid must be at least base price.";
    return;
  }
  if (data.selectedPlayers.length >= team.maxPlayers) {
    statusEl.textContent = "Team has reached maximum players.";
    return;
  }
  if ((data.budgetUsed + bidAmount) > team.maxBudget) {
    statusEl.textContent = "Team budget exceeded.";
    return;
  }

  // Finalize selection
  data.selectedPlayers.push({ ...player, bidAmount });
  data.budgetUsed += bidAmount;

  // Disable inputs so player cannot be sold again
  bidInput.disabled = true;
  teamSelect.disabled = true;
  finalizeBtn.disabled = true;

  statusEl.textContent = `Player sold to ${team.teamName} for $${bidAmount}`;

  // Update remaining purse
  const remaining = team.maxBudget - data.budgetUsed;
  document.getElementById(`remaining-${team.teamId}`).textContent = formatMillion(remaining);

  // Update selected players list
  const selectedList = document.getElementById(`selected-players-${team.teamId}`);
  selectedList.innerHTML = data.selectedPlayers
    .map(p => `<li>${p.playerName} - $${formatMillion(p.bidAmount)}</li>`)
    .join('');

  // Update remainingBudget in teams array (optional)
  team.remainingBudget = remaining; 
}
// Initialize
loadData();

// Collapsible Players Section
const playersHeader = document.getElementById('players-header');
const playersContainer = document.getElementById('players-container');
let isCollapsed = false;

playersHeader.addEventListener('click', () => {
  isCollapsed = !isCollapsed;
  if (isCollapsed) {
    playersContainer.style.display = 'none';
    playersHeader.innerHTML = 'Players &#9654;'; // right arrow
  } else {
    playersContainer.style.display = 'flex'; // maintain flex layout
    playersHeader.innerHTML = 'Players &#9660;'; // down arrow
  }
});

function resetTeam(teamId) {
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];

  // Reset auction data
  data.selectedPlayers = [];
  data.budgetUsed = 0;

  // Reset remaining purse
  team.remainingBudget = team.maxBudget;
  document.getElementById(`remaining-${teamId}`).textContent = team.maxBudget;

  // Re-enable any disabled player inputs for this team
  players.forEach(player => {
    const playerDiv = document.getElementById(`player-${player.playerId}`);
    const teamSelect = playerDiv.querySelector('select');
    const bidInput = playerDiv.querySelector('input');
    const finalizeBtn = playerDiv.querySelector('button');
    const statusEl = playerDiv.querySelector(`#bid-status-${player.playerId}`);

    if (teamSelect.value === teamId) {
      bidInput.disabled = false;
      teamSelect.disabled = false;
      finalizeBtn.disabled = false;
      statusEl.textContent = '';
    }
  });
}
let nextPlayerIndex = -1;
let remainingPlayers = [];

function showNextPlayer() {
  // Initialize remaining players if first time
  if (remainingPlayers.length === 0) {
    remainingPlayers = players.filter(p => {
      const btn = document.querySelector(`#player-${p.playerId} button`);
      return btn && !btn.disabled; // only unsold players
    });
  }

  if (remainingPlayers.length === 0) {
    document.getElementById('next-player-container').innerHTML = '<p>All players are sold!</p>';
    return;
  }

  // Pick random player
  const randomIndex = Math.floor(Math.random() * remainingPlayers.length);
  const player = remainingPlayers[randomIndex];
  nextPlayerIndex = randomIndex;

  // Render player card in next-player-container
  const container = document.getElementById('next-player-container');
  container.innerHTML = `
    <div class="player-card" id="next-player-card">
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${formatMillion(player.basePrice)}</p>
      <p>Availability: ${player.availabilityPercentage}% (${player.WNBOStatus})</p>
      <p>Comments: ${player.availabilityComments}</p>
      <input type="number" min="${player.basePrice}" placeholder="Enter bid">
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <button id="sell-player-btn">Finalize / Sold</button>
      <p id="next-bid-status"></p>
    </div>
  `;
}

// Sell Next Player button logic
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'sell-player-btn') {
    const player = remainingPlayers[nextPlayerIndex];
    const bidInput = document.querySelector('#next-player-card input');
    const teamSelect = document.querySelector('#next-player-card select');
    const bidAmount = Number(bidInput.value);
    const teamId = teamSelect.value;
    const team = teams.find(t => t.teamId === teamId);
    const data = auctionData[teamId];
    const statusEl = document.getElementById('next-bid-status');

    // Calculate remaining players allowed to buy
    const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1; // after this bid
    const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

    if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
      statusEl.textContent = `Bid too high. Team must have at least ${formatMillion(MIN_PER_PLAYER)} per remaining player.`;
      return;
    }

    // Validation
    if (!bidAmount || bidAmount < player.basePrice) {
      statusEl.textContent = "Bid must be at least base price.";
      return;
    }
    if (data.selectedPlayers.length >= team.maxPlayers) {
      statusEl.textContent = "Team has reached maximum players.";
      return;
    }
    if ((data.budgetUsed + bidAmount) > team.maxBudget) {
      statusEl.textContent = "Team budget exceeded.";
      return;
    }

    // Finalize player
    data.selectedPlayers.push({ ...player, bidAmount });
    data.budgetUsed += bidAmount;

    // Update remaining purse & selected players in team card
    document.getElementById(`remaining-${teamId}`).textContent = formatMillion(team.maxBudget - data.budgetUsed);
    const selectedList = document.getElementById(`selected-players-${teamId}`);
    selectedList.innerHTML = data.selectedPlayers
      .map(p => `<li>${p.playerName} - $${formatMillion(p.bidAmount)}</li>`)
      .join('');

    // Remove player from remainingPlayers
    remainingPlayers.splice(nextPlayerIndex, 1);

    statusEl.textContent = `Player sold to ${team.teamName} for $${formatMillion(bidAmount)}`;

    // Show next player automatically
    setTimeout(showNextPlayer, 1000);
  }
});

// Skip Player button logic
document.getElementById('skip-player-btn').addEventListener('click', () => {
  if (nextPlayerIndex >= 0) {
    const skippedPlayer = remainingPlayers.splice(nextPlayerIndex, 1)[0]; // remove from remaining
    unsoldPlayers.push(skippedPlayer); // add to unsold list
    updateUnsoldPlayersUI();
  }
  showNextPlayer();
});

function updateUnsoldPlayersUI() {
  const container = document.getElementById('unsold-players-container');
  container.innerHTML = '';

  unsoldPlayers.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player-card';
    div.id = `unsold-${player.playerId}`;
    div.style.width = '150px'; // smaller card for unsold list
    div.innerHTML = `
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${formatMillion(player.basePrice)}</p>
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <input type="number" min="${player.basePrice}" placeholder="Enter bid">
      <button onclick="sellUnsoldPlayer('${player.playerId}')">Sell</button>
      <p id="unsold-bid-status-${player.playerId}"></p>
    `;
    container.appendChild(div);
  });
}

function sellUnsoldPlayer(playerId) {
  const player = unsoldPlayers.find(p => p.playerId === playerId);
  const div = document.getElementById(`unsold-${playerId}`);
  const bidInput = div.querySelector('input');
  const teamSelect = div.querySelector('select');
  const bidAmount = Number(bidInput.value);
  const teamId = teamSelect.value;
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];
  const statusEl = div.querySelector(`#unsold-bid-status-${playerId}`);

  const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1; // after this bid
  const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

  if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
    statusEl.textContent = `Bid too high. Team must have at least ${formatMillion(MIN_PER_PLAYER)} per remaining player.`;
    return;
  }


  // Validation
  if (!bidAmount || bidAmount < player.basePrice) {
    statusEl.textContent = "Bid must be at least base price.";
    return;
  }
  if (data.selectedPlayers.length >= team.maxPlayers) {
    statusEl.textContent = "Team has reached maximum players.";
    return;
  }
  if ((data.budgetUsed + bidAmount) > team.maxBudget) {
    statusEl.textContent = "Team budget exceeded.";
    return;
  }

  // Finalize
  data.selectedPlayers.push({ ...player, bidAmount });
  data.budgetUsed += bidAmount;

  // Update team card
  document.getElementById(`remaining-${teamId}`).textContent = formatMillion(team.maxBudget - data.budgetUsed);
  const selectedList = document.getElementById(`selected-players-${teamId}`);
  selectedList.innerHTML = data.selectedPlayers
    .map(p => `<li>${p.playerName} - $${formatMillion(p.bidAmount)}</li>`)
    .join('');

  // Remove from unsold players
  unsoldPlayers = unsoldPlayers.filter(p => p.playerId !== playerId);
  updateUnsoldPlayersUI();
}

function autoSaveAuction() {
  localStorage.setItem(
    'auctionState',
    JSON.stringify({ auctionData, unsoldPlayers })
  );
}

// Call after every successful sale or skip
autoSaveAuction();

window.onbeforeunload = () =>
  'Auction in progress. Leaving will lose unsaved data.';
