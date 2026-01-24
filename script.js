// ==================== STATE MANAGEMENT ====================
let currentRound = 1;
let teams = [];
let players = [];
let auctionData = {}; // { teamId: { selectedPlayers: [], budgetUsed: 0 } }
let unsoldPlayers = [];

const MIN_PER_PLAYER = 1_000_000; // 1 million
let nextPlayerIndex = -1;
let remainingPlayers = [];

// ==================== UTILITIES ====================
function formatMillion(amount) {
  return (amount / 1_000_000).toFixed(2) + 'M';
}

function autoSaveAuction() {
  localStorage.setItem(
    'auctionState',
    JSON.stringify({ 
      currentRound, 
      auctionData, 
      unsoldPlayers,
      playerStates: players.map(p => ({
        playerId: p.playerId,
        isSold: p.isSold,
        unsoldRound: p.unsoldRound
      }))
    })
  );
}

function loadSavedAuction() {
  const saved = localStorage.getItem('auctionState');
  if (!saved) return false;
  
  try {
    const state = JSON.parse(saved);
    currentRound = state.currentRound || 1;
    auctionData = state.auctionData || {};
    unsoldPlayers = state.unsoldPlayers || [];
    
    // Restore player states
    if (state.playerStates) {
      state.playerStates.forEach(ps => {
        const player = players.find(p => p.playerId === ps.playerId);
        if (player) {
          player.isSold = ps.isSold;
          player.unsoldRound = ps.unsoldRound;
        }
      });
    }
    
    return true;
  } catch (e) {
    console.error('Failed to load saved auction:', e);
    return false;
  }
}

// ==================== DATA LOADING ====================
async function loadData() {
  try {
    const [teamsResponse, playersResponse] = await Promise.all([
      fetch('teams.json'),
      fetch('players.json')
    ]);

    teams = await teamsResponse.json();
    players = await playersResponse.json();

    // Initialize player state
    players.forEach(p => {
      p.isSold = false;
      p.unsoldRound = null;
    });

    initAuction();
  } catch (error) {
    console.error('Error loading data:', error);
    alert('Failed to load auction data');
  }
}

function initAuction() {
  // Initialize auction data for each team
  teams.forEach(team => {
    if (!auctionData[team.teamId]) {
      auctionData[team.teamId] = { selectedPlayers: [], budgetUsed: 0 };
    }
  });

  renderTeams();
  renderPlayersSection();
  
  // Try to load saved state
  if (loadSavedAuction()) {
    updateAllUI();
  }

  // Initialize next player section
  initializeRound();
}

// ==================== RENDER TEAMS ====================
function renderTeams() {
  const teamsContainer = document.getElementById('teams-container');
  teamsContainer.innerHTML = '';

  teams.forEach(team => {
    // Ensure auctionData exists for this team
    if (!auctionData[team.teamId]) {
      auctionData[team.teamId] = { selectedPlayers: [], budgetUsed: 0 };
    }
    
    const data = auctionData[team.teamId];
    const remaining = team.maxBudget - data.budgetUsed;

    const div = document.createElement('div');
    div.className = 'team-card';
    div.id = `team-${team.teamId}`;
    div.innerHTML = `
      <img src="${team.bannerUrl}" alt="${team.teamName}">
      <h3>${team.teamName}</h3>
      <p>Captain: ${team.captainName}</p>
      <p>Budget: $${formatMillion(team.maxBudget)}</p>
      <p>Remaining Purse: $<span id="remaining-${team.teamId}">${formatMillion(remaining)}</span></p>
      <p>Players: ${data.selectedPlayers.length}/${team.maxPlayers}</p>
      <h4>Selected Players:</h4>
      <ul id="selected-players-${team.teamId}">
        ${data.selectedPlayers.map(p => `<li>${p.playerName} - $${formatMillion(p.bidAmount)}</li>`).join('')}
      </ul>
      <button onclick="resetTeam('${team.teamId}')">Reset Team</button>
    `;
    teamsContainer.appendChild(div);
  });
}

// ==================== RENDER PLAYERS ====================
function renderPlayersSection() {
  const playersContainer = document.getElementById('players-container');
  playersContainer.innerHTML = '';

  const roundPlayers = getPlayersForRound();

  roundPlayers.forEach(player => {
    const basePrice = getBasePriceForRound(player);
    const div = document.createElement('div');
    div.className = 'player-card';
    div.id = `player-${player.playerId}`;
    div.innerHTML = `
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${formatMillion(basePrice)}</p>
      <p>Availability: ${player.availabilityPercentage}% (${player.WNBOStatus})</p>
      <p>Comments: ${player.availabilityComments}</p>
      <input type="number" min="${basePrice}" placeholder="Enter bid (Min $${formatMillion(basePrice)})">
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <button onclick="placeBid('${player.playerId}')">Finalize / Sold</button>
      <p id="bid-status-${player.playerId}"></p>
    `;
    playersContainer.appendChild(div);
  });
}

// ==================== ROUND MANAGEMENT ====================
function getPlayersForRound() {
  if (currentRound === 1) {
    const available = players.filter(p => !p.isSold);
    console.log(`Round ${currentRound}: ${available.length} players available`);
    return available;
  }
  // Round 2 & 3: only unsold players from previous round
  const available = players.filter(p => !p.isSold && p.unsoldRound === currentRound - 1);
  console.log(`Round ${currentRound}: ${available.length} players available from unsold`);
  return available;
}

function getBasePriceForRound(player) {
  if (currentRound === 3) {
    return player.round3BasePrice || player.basePrice;
  }
  return player.basePrice;
}

function initializeRound() {
  remainingPlayers = getPlayersForRound();
  nextPlayerIndex = -1;
  
  // Only filter unsoldPlayers if not in first round
  if (currentRound > 1) {
    unsoldPlayers = unsoldPlayers.filter(p => p.unsoldRound === currentRound - 1);
  } else {
    unsoldPlayers = []; // No unsold players in first round
  }
  
  document.getElementById('round-number').textContent = currentRound;
  updateUnsoldPlayersUI();
  showNextPlayer();
}

// ==================== BIDDING ====================
function placeBid(playerId) {
  const player = players.find(p => p.playerId === playerId);
  const bidInput = document.querySelector(`#player-${playerId} input`);
  const teamSelect = document.querySelector(`#player-${playerId} select`);
  const teamId = teamSelect.value;
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];

  const statusEl = document.getElementById(`bid-status-${playerId}`);
  const finalizeBtn = document.querySelector(`#player-${playerId} button`);

  // Check if already sold
  if (player.isSold) {
    statusEl.textContent = "Player already sold.";
    return;
  }

  const bidAmount = Number(bidInput.value);
  const basePrice = getBasePriceForRound(player);

  // Validations
  if (!bidAmount || bidAmount < basePrice) {
    statusEl.textContent = `Bid must be at least $${formatMillion(basePrice)}.`;
    return;
  }

  if (data.selectedPlayers.length >= team.maxPlayers) {
    statusEl.textContent = "Team has reached maximum players.";
    return;
  }

  const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1;
  const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

  if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
    statusEl.textContent = `Bid too high. Must reserve $${formatMillion(MIN_PER_PLAYER)} per remaining spot.`;
    return;
  }

  if ((data.budgetUsed + bidAmount) > team.maxBudget) {
    statusEl.textContent = "Team budget exceeded.";
    return;
  }

  // Finalize sale
  finalizeSale(playerId, teamId, bidAmount);
  statusEl.textContent = `✓ Sold to ${team.teamName} for $${formatMillion(bidAmount)}`;
  
  // Disable this row
  bidInput.disabled = true;
  teamSelect.disabled = true;
  finalizeBtn.disabled = true;

  autoSaveAuction();
  updateAllUI();
}

function finalizeSale(playerId, teamId, bidAmount) {
  const player = players.find(p => p.playerId === playerId);
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];

  data.selectedPlayers.push({ ...player, bidAmount });
  data.budgetUsed += bidAmount;
  player.isSold = true;
}

// ==================== NEXT PLAYER SECTION ====================
function showNextPlayer() {
  if (remainingPlayers.length === 0) {
    document.getElementById('next-player-container').innerHTML = 
      '<p style="text-align: center; padding: 20px;">All available players are sold or skipped!</p>';
    return;
  }

  const randomIndex = Math.floor(Math.random() * remainingPlayers.length);
  const player = remainingPlayers[randomIndex];
  nextPlayerIndex = randomIndex;

  const basePrice = getBasePriceForRound(player);
  const container = document.getElementById('next-player-container');
  container.innerHTML = `
    <div class="player-card" id="next-player-card">
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${formatMillion(basePrice)}</p>
      <p>Availability: ${player.availabilityPercentage}% (${player.WNBOStatus})</p>
      <p>Comments: ${player.availabilityComments}</p>
      <input type="number" min="${basePrice}" placeholder="Enter bid">
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <button id="sell-player-btn">Finalize / Sold</button>
      <p id="next-bid-status"></p>
    </div>
  `;
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'sell-player-btn') {
    sellNextPlayer();
  }
});

function sellNextPlayer() {
  if (nextPlayerIndex < 0 || nextPlayerIndex >= remainingPlayers.length) return;

  const player = remainingPlayers[nextPlayerIndex];
  const bidInput = document.querySelector('#next-player-card input');
  const teamSelect = document.querySelector('#next-player-card select');
  const bidAmount = Number(bidInput.value);
  const teamId = teamSelect.value;
  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];
  const statusEl = document.getElementById('next-bid-status');

  const basePrice = getBasePriceForRound(player);

  if (!bidAmount || bidAmount < basePrice) {
    statusEl.textContent = `Bid must be at least $${formatMillion(basePrice)}.`;
    return;
  }

  if (data.selectedPlayers.length >= team.maxPlayers) {
    statusEl.textContent = "Team has reached maximum players.";
    return;
  }

  const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1;
  const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

  if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
    statusEl.textContent = `Bid too high. Must reserve $${formatMillion(MIN_PER_PLAYER)} per remaining spot.`;
    return;
  }

  if ((data.budgetUsed + bidAmount) > team.maxBudget) {
    statusEl.textContent = "Team budget exceeded.";
    return;
  }

  // Finalize sale
  finalizeSale(player.playerId, teamId, bidAmount);
  statusEl.textContent = `✓ Sold to ${team.teamName} for $${formatMillion(bidAmount)}`;

  remainingPlayers.splice(nextPlayerIndex, 1);
  autoSaveAuction();
  updateAllUI();

  setTimeout(showNextPlayer, 1000);
}

document.getElementById('skip-player-btn').addEventListener('click', () => {
  if (nextPlayerIndex >= 0 && nextPlayerIndex < remainingPlayers.length) {
    const skippedPlayer = remainingPlayers[nextPlayerIndex];
    skippedPlayer.unsoldRound = currentRound;
    unsoldPlayers.push(skippedPlayer);

    remainingPlayers.splice(nextPlayerIndex, 1);
    autoSaveAuction();
    updateAllUI();
    showNextPlayer();
  }
});

// ==================== UNSOLD PLAYERS ====================
function updateUnsoldPlayersUI() {
  const container = document.getElementById('unsold-players-container');
  container.innerHTML = '';

  unsoldPlayers.forEach(player => {
    const basePrice = getBasePriceForRound(player);
    const div = document.createElement('div');
    div.className = 'player-card';
    div.id = `unsold-${player.playerId}`;
    div.style.width = '150px';
    div.innerHTML = `
      <img src="${player.photoUrl}" alt="${player.playerName}">
      <h4>${player.playerName}</h4>
      <p>Base Price: $${formatMillion(basePrice)}</p>
      <select>
        ${teams.map(t => `<option value="${t.teamId}">${t.teamName}</option>`).join('')}
      </select>
      <input type="number" min="${basePrice}" placeholder="Enter bid">
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

  const basePrice = getBasePriceForRound(player);

  if (!bidAmount || bidAmount < basePrice) {
    statusEl.textContent = `Bid must be at least $${formatMillion(basePrice)}.`;
    return;
  }

  if (data.selectedPlayers.length >= team.maxPlayers) {
    statusEl.textContent = "Team has reached maximum players.";
    return;
  }

  const remainingSpots = team.maxPlayers - data.selectedPlayers.length - 1;
  const minRequiredBudget = remainingSpots * MIN_PER_PLAYER;

  if ((data.budgetUsed + bidAmount + minRequiredBudget) > team.maxBudget) {
    statusEl.textContent = `Bid too high. Must reserve $${formatMillion(MIN_PER_PLAYER)} per spot.`;
    return;
  }

  if ((data.budgetUsed + bidAmount) > team.maxBudget) {
    statusEl.textContent = "Team budget exceeded.";
    return;
  }

  // Finalize sale
  finalizeSale(playerId, teamId, bidAmount);
  statusEl.textContent = `✓ Sold to ${team.teamName} for $${formatMillion(bidAmount)}`;

  unsoldPlayers = unsoldPlayers.filter(p => p.playerId !== playerId);
  autoSaveAuction();
  updateAllUI();
}

// ==================== ROUND PROGRESSION ====================
function nextRound() {
  if (currentRound >= 3) {
    alert('Auction completed! All rounds finished.');
    return;
  }

  const remaining = remainingPlayers.filter(p => !p.isSold);
  if (remaining.length > 0) {
    alert(`Round ${currentRound} has ${remaining.length} unsold players. Please mark them as unsold first.`);
    return;
  }

  currentRound++;
  initializeRound();
  renderPlayersSection();
  autoSaveAuction();
}

function updateAllUI() {
  renderTeams();
  updateUnsoldPlayersUI();
}

// ==================== TEAM RESET ====================
function resetTeam(teamId) {
  if (!confirm(`Are you sure you want to reset ${teams.find(t => t.teamId === teamId).teamName}?`)) {
    return;
  }

  const team = teams.find(t => t.teamId === teamId);
  const data = auctionData[teamId];

  // Mark players as unsold
  data.selectedPlayers.forEach(p => {
    const player = players.find(pl => pl.playerId === p.playerId);
    if (player) {
      player.isSold = false;
    }
  });

  // Reset data
  data.selectedPlayers = [];
  data.budgetUsed = 0;

  autoSaveAuction();
  updateAllUI();
  renderPlayersSection();
}

// ==================== COLLAPSIBLE PLAYERS SECTION ====================
const playersHeader = document.getElementById('players-header');
const playersContainer = document.getElementById('players-container');
let isCollapsed = false;

playersHeader.addEventListener('click', () => {
  isCollapsed = !isCollapsed;
  if (isCollapsed) {
    playersContainer.style.display = 'none';
    playersHeader.innerHTML = 'Players &#9654;';
  } else {
    playersContainer.style.display = 'flex';
    playersHeader.innerHTML = 'Players &#9660;';
  }
});

// ==================== INITIALIZATION ====================
loadData();

window.onbeforeunload = () =>
  'Auction in progress. Leaving will lose unsaved data.';