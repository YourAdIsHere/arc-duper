const API_BASE = 'https://arcraiders-api.messaoudimahmoud665.workers.dev';
const MODIFICATION_ASSET_ID = 1440007245;
const BACKPACK_CONTAINER_IDS = [-900626342, -248702078, 202906145, -835379180];

class InventoryViewer {
  constructor() {
    this.apiToken = null;
    this.inventoryData = [];
    this.inventoryById = {};
    this.itemIcons = {};
    this.itemNames = {};
    this.itemCategories = {};
    this.itemBlacklist = new Set();
    this.backpackItems = [];
    this.backpackInfo = null;
    this.equippedData = null;
    this.selectedIds = new Set();
    this.stashCapacity = null;
    this.isLoading = false;

    this.init();
  }

  async init() {
    this.attachEventHandlers();
    this.loadSavedToken();
    await this.loadReferenceData();
    if (this.apiToken) {
      await this.refreshInventory();
    }
  }

  byId(...ids) {
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) {
        return element;
      }
    }
    return null;
  }

  attachEventHandlers() {
    const tokenInput = this.byId('token-input', 'tokenInput', 'bearerToken');
    const tokenButton = this.byId('getTokenBtn', 'get-token-btn', 'requestTokenBtn');
    const refreshButton = this.byId('refreshBtn', 'refresh-btn');
    const bulkRefreshButton = this.byId('bulkRefreshBtn', 'bulk-refresh-btn');
    const sendBackpackButton = this.byId('sendBackpackBtn', 'send-backpack-btn');
    const dupeButton = this.byId('dupeBackpackBtn', 'duplicateBackpackBtn', 'bulkDupeBtn');
    const searchInput = this.byId('searchInput', 'search', 'filterInput');
    const sortSelect = this.byId('sortSelect', 'sort');
    const selectAll = this.byId('selectAll', 'select-all', 'selectAllCheckbox');

    if (tokenInput) {
      tokenInput.addEventListener('change', () => this.saveToken(tokenInput.value.trim()));
    }
    if (tokenButton) {
      tokenButton.addEventListener('click', () => this.obtainAuthToken());
    }
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refreshInventory());
    }
    if (bulkRefreshButton) {
      bulkRefreshButton.addEventListener('click', () => this.batchRefreshIds());
    }
    if (sendBackpackButton) {
      sendBackpackButton.addEventListener('click', () => this.moveSelectedToOverflow());
    }
    if (dupeButton) {
      dupeButton.addEventListener('click', () => this.duplicateBackpackMultiple());
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderInventory());
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', () => this.renderInventory());
    }
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        const shouldSelect = selectAll.checked;
        this.selectedIds.clear();
        if (shouldSelect) {
          for (const item of this.backpackItems) {
            this.selectedIds.add(String(item.instanceId));
          }
        }
        this.renderInventory();
      });
    }
  }

  loadSavedToken() {
    const savedToken = localStorage.getItem('arc_token');
    if (!savedToken) {
      this.updateTokenStatus(false);
      return;
    }

    this.apiToken = savedToken;
    const tokenInput = this.byId('token-input', 'tokenInput', 'bearerToken');
    if (tokenInput) {
      tokenInput.value = savedToken;
    }
    this.updateTokenStatus(true);
    console.log('Loaded token from localStorage');
  }

  saveToken(token) {
    if (!token) {
      console.error('Attempted to save empty token');
      return;
    }

    this.apiToken = token;
    localStorage.setItem('arc_token', token);
    this.updateTokenStatus(true);
    console.log('Token saved to localStorage and UI updated');
  }

  updateTokenStatus(isValid, message = '') {
    const statusElement = this.byId('token-status', 'tokenStatus');
    if (!statusElement) {
      return;
    }

    if (isValid) {
      statusElement.textContent = message || 'Token loaded';
      statusElement.className = 'token-status valid';
    } else {
      statusElement.textContent = message || 'Please set your bearer token first';
      statusElement.className = 'token-status invalid';
    }
  }

  showLoading(isLoading) {
    this.isLoading = isLoading;
    const overlay = this.byId('loading', 'loadingOverlay', 'loading-spinner');
    if (overlay) {
      overlay.style.display = isLoading ? 'flex' : 'none';
    }
  }

  showError(message) {
    console.error(message);
    const target = this.byId('error-message', 'errorMessage', 'status-message');
    if (target) {
      target.textContent = message;
      target.className = 'message error';
    }
  }

  showTemporaryMessage(message, color = '#10b981') {
    const target = this.byId('temporary-message', 'tempMessage', 'status-message');
    if (!target) {
      console.log(message);
      return;
    }

    target.textContent = message;
    target.style.color = color;
    target.style.opacity = '1';
    setTimeout(() => {
      target.style.opacity = '0';
    }, 2500);
  }

  async obtainAuthToken() {
    try {
      this.showLoading(true);
      const response = await fetch(`${API_BASE}/api/get-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(data.error || 'Failed to obtain token');
      }

      this.saveToken(data.token);
      const tokenInput = this.byId('token-input', 'tokenInput', 'bearerToken');
      if (tokenInput) {
        tokenInput.value = data.token;
      }
      this.showTemporaryMessage('Token obtained successfully', '#10b981');

      setTimeout(() => this.refreshInventory(), 500);
    } catch (error) {
      console.error('Failed to get token:', error);
      this.showError(`Failed to obtain token: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async validateToken(token) {
    if (!token || token.trim() === '') {
      this.showError('Please enter a bearer token first');
      return false;
    }

    try {
      this.showLoading(true);
      const response = await fetch(`${API_BASE}/api/test-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || 'Token validation failed');
      }

      this.saveToken(token.trim());
      this.showTemporaryMessage('Token validated', '#10b981');
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      this.showError(`Failed to validate token: ${error.message}`);
      return false;
    } finally {
      this.showLoading(false);
    }
  }

  async loadReferenceData() {
    try {
      const stamp = Date.now();
      const [iconsResponse, namesResponse, categoriesResponse, blacklistResponse] = await Promise.all([
        fetch(`/data/item_icons.json?nocache=${stamp}`),
        fetch(`/data/item_names.json?nocache=${stamp}`),
        fetch(`/data/item_categories.json?nocache=${stamp}`),
        fetch(`/data/item_blacklist.json?nocache=${stamp}`)
      ]);

      this.itemIcons = await iconsResponse.json();
      this.itemNames = await namesResponse.json();
      this.itemCategories = await categoriesResponse.json();
      const blacklist = await blacklistResponse.json();
      this.itemBlacklist = new Set(blacklist.map(value => String(value)));
      console.log('Loaded reference data');
    } catch (error) {
      console.error('Failed to load reference data:', error);
    }
  }

  async refreshInventory() {
    if (this.isLoading) {
      return;
    }
    if (!this.apiToken) {
      this.showError('Please set your bearer token first');
      return;
    }

    this.showLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/inventory?nocache=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'X-User-Token': this.apiToken
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch inventory (${response.status})`);
      }

      const payload = await response.json();
      this.inventoryData = payload.items || [];
      this.stashCapacity = payload.stashCapacity || payload.capacity || payload.maxItems || null;
      this.rebuildLookups();
      this.parseBackpackAndEquipped();
      this.updateStats();
      this.renderInventory();
      this.showTemporaryMessage(`Refreshed! ${this.inventoryData.length} items`, '#10b981');
    } catch (error) {
      console.error('Inventory refresh failed:', error);
      this.showError(error.message);
    } finally {
      this.showLoading(false);
    }
  }

  rebuildLookups() {
    this.inventoryById = {};
    for (const item of this.inventoryData) {
      if (item && item.instanceId) {
        this.inventoryById[String(item.instanceId)] = item;
      }
    }
  }

  parseBackpackAndEquipped() {
    const equipped = {
      weapons: [],
      shield: null,
      augment: null
    };

    const backpackItems = [];
    let backpackInfo = null;

    for (const item of this.inventoryData) {
      const containerId = item.containerId ?? item.locationId ?? item.parentId;
      if (BACKPACK_CONTAINER_IDS.includes(containerId)) {
        backpackItems.push(item);
        backpackInfo = backpackInfo || item.container || null;
      }

      if (item.gameAssetId === MODIFICATION_ASSET_ID) {
        const slots = Array.isArray(item.slots) ? item.slots : [];
        if (slots.length > 0 && slots[0]) {
          const slotId = slots[0];
          const slotItem = this.inventoryById[String(slotId)];
          if (slotItem) {
            if (Array.isArray(slotItem.slots) && slotItem.slots.length > 0) {
              equipped.augment = {
                instanceId: item.instanceId,
                gameAssetId: item.gameAssetId,
                slotId,
                etag: item.etag
              };
            } else if (slotItem.gameAssetId === MODIFICATION_ASSET_ID) {
              equipped.shield = {
                instanceId: item.instanceId,
                gameAssetId: item.gameAssetId,
                slotId,
                etag: item.etag
              };
            } else {
              equipped.weapons.push({
                instanceId: item.instanceId,
                gameAssetId: item.gameAssetId,
                slotId,
                etag: item.etag
              });
            }
          }
        }
      }
    }

    this.backpackItems = backpackItems;
    this.backpackInfo = backpackInfo;
    this.equippedData = {
      equipped,
      hasEquippedMod: Boolean(equipped.shield || equipped.augment),
      extra: null
    };
  }

  getItemName(gameAssetId) {
    const key = String(gameAssetId);
    if (this.itemNames[key]) {
      return this.itemNames[key];
    }
    if (this.itemIcons[key]?.name) {
      return this.itemIcons[key].name;
    }
    return `Unknown (${gameAssetId})`;
  }

  getItemIcon(gameAssetId) {
    const key = String(gameAssetId);
    return this.itemIcons[key]?.icon || this.itemIcons[key]?.image || null;
  }

  getItemCategory(gameAssetId) {
    return this.itemCategories[String(gameAssetId)] || 'Unknown';
  }

  isBlacklisted(gameAssetId) {
    return this.itemBlacklist.has(String(gameAssetId));
  }

  isInBackpack(instanceId) {
    return this.backpackItems.some(item => String(item.instanceId) === String(instanceId));
  }

  isEquipped(instanceId) {
    if (!this.equippedData) {
      return false;
    }

    const equipped = this.equippedData.equipped || {};
    if (equipped.weapons?.some(item => item?.instanceId === instanceId)) {
      return true;
    }
    if (equipped.shield?.instanceId === instanceId) {
      return true;
    }
    if (equipped.augment?.instanceId === instanceId) {
      return true;
    }
    return false;
  }

  isUnequippedModification(item) {
    return item?.gameAssetId === MODIFICATION_ASSET_ID && !this.isEquipped(item.instanceId);
  }

  selectedBackpackItems() {
    const selected = this.backpackItems.filter(item => this.selectedIds.has(String(item.instanceId)));
    return selected.length > 0 ? selected : [...this.backpackItems];
  }

  updateStats() {
    const selectedCount = this.selectedIds.size;
    const inventoryCountElement = this.byId('inventoryCount', 'itemCount');
    const backpackCountElement = this.byId('backpackCount', 'stashCount');
    const selectedCountElement = this.byId('selectedCount');

    if (inventoryCountElement) {
      inventoryCountElement.textContent = String(this.inventoryData.length);
    }
    if (backpackCountElement) {
      const capacity = this.stashCapacity ? `/${this.stashCapacity}` : '';
      backpackCountElement.textContent = `${this.backpackItems.length}${capacity}`;
    }
    if (selectedCountElement) {
      selectedCountElement.textContent = String(selectedCount);
    }
  }

  renderInventory() {
    const container = this.byId('inventory-container', 'inventoryContainer', 'results');
    if (!container) {
      return;
    }

    const searchTerm = (this.byId('searchInput', 'search', 'filterInput')?.value || '').trim().toLowerCase();
    const sortMode = this.byId('sortSelect', 'sort')?.value || 'name';

    const items = [...this.inventoryData].filter(item => {
      const name = this.getItemName(item.gameAssetId).toLowerCase();
      return !searchTerm || name.includes(searchTerm) || String(item.instanceId).includes(searchTerm);
    });

    items.sort((left, right) => {
      if (sortMode === 'amount') {
        return (right.amount || 1) - (left.amount || 1);
      }
      if (sortMode === 'category') {
        return this.getItemCategory(left.gameAssetId).localeCompare(this.getItemCategory(right.gameAssetId));
      }
      return this.getItemName(left.gameAssetId).localeCompare(this.getItemName(right.gameAssetId));
    });

    const rows = items.map(item => {
      const itemId = String(item.instanceId);
      const checked = this.selectedIds.has(itemId) ? 'checked' : '';
      const icon = this.getItemIcon(item.gameAssetId);
      const name = this.getItemName(item.gameAssetId);
      const category = this.getItemCategory(item.gameAssetId);
      const selectedClass = this.selectedIds.has(itemId) ? 'row-selected' : '';
      return `
        <tr class="${selectedClass}" data-instance-id="${itemId}">
          <td><input type="checkbox" class="row-checkbox" data-instance-id="${itemId}" ${checked}></td>
          <td>${icon ? `<img src="${icon}" alt="" class="item-icon">` : ''}</td>
          <td>${this.escapeHtml(name)}</td>
          <td>${this.escapeHtml(category)}</td>
          <td>${this.escapeHtml(String(item.amount || 1))}</td>
          <td>${this.escapeHtml(itemId)}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="inventory-table">
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th>Name</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Instance ID</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    container.querySelectorAll('.row-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', event => {
        const instanceId = event.currentTarget.dataset.instanceId;
        if (event.currentTarget.checked) {
          this.selectedIds.add(instanceId);
        } else {
          this.selectedIds.delete(instanceId);
        }
        this.updateStats();
        this.renderInventory();
      });
    });
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = Math.floor(Math.random() * 16);
      const value = char === 'x' ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }

  buildProgressOverlay(totalRounds) {
    let overlay = document.getElementById('bulkProgressOverlay');
    if (overlay) {
      overlay.remove();
    }

    overlay = document.createElement('div');
    overlay.id = 'bulkProgressOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,18,0.8);z-index:5000;';
    overlay.innerHTML = `
      <div style="width:min(720px,92vw);padding:24px;border-radius:18px;background:#111827;border:1px solid rgba(255,255,255,0.08);color:#e5e7eb;font-family:ui-sans-serif,system-ui;box-shadow:0 24px 80px rgba(0,0,0,0.45)">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px">
          <div>
            <div style="font-size:18px;font-weight:700">Bulk operation</div>
            <div id="bulkBarCount">0/${totalRounds}</div>
          </div>
          <button id="bulkProgressClearBtn" style="padding:10px 14px;border:0;border-radius:999px;background:#374151;color:#fff;cursor:pointer">Clear</button>
        </div>
        <div style="height:12px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden">
          <div id="bulkProgressBar" style="height:100%;width:0;background:linear-gradient(90deg,#22c55e,#14b8a6);transition:width .2s ease"></div>
        </div>
        <div id="bulkProgressLog" style="margin-top:18px;max-height:280px;overflow:auto;font-size:13px;line-height:1.6"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#bulkProgressClearBtn').addEventListener('click', () => overlay.remove());

    let completed = 0;
    return {
      updateRound: (round, state, count = 0, detail = '') => {
        const progressBar = document.getElementById('bulkProgressBar');
        const countText = document.getElementById('bulkBarCount');
        const log = document.getElementById('bulkProgressLog');
        if (!progressBar || !countText || !log) {
          return;
        }

        const symbols = {
          starting: '⏳',
          building: '🔨',
          sending: '🚀',
          complete: '✅',
          error: '❌'
        };

        const labels = {
          starting: 'Starting...',
          building: count > 0 ? `Building ${count} mutations...` : 'Preparing...',
          sending: 'Sending request...',
          complete: `Complete: ${count} items`,
          error: `Error: ${detail}`
        };

        const symbol = symbols[state] || '⏳';
        const label = labels[state] || state;
        countText.textContent = `${completed}/${totalRounds}`;
        log.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:10px">Round ${round}: ${symbol} ${label}</div>`);

        if (state === 'complete') {
          completed += 1;
          progressBar.style.width = `${Math.floor((completed / totalRounds) * 100)}%`;
        }
      },
      finish: (successCount, errorCount) => {
        const progressBar = document.getElementById('bulkProgressBar');
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.background = errorCount > 0 ? '#f59e0b' : '#22c55e';
        }
        setTimeout(() => overlay.remove(), 8000);
      }
    };
  }

  async moveSelectedToOverflow() {
    if (!this.apiToken) {
      this.showError('Please set your bearer token first');
      return;
    }

    const selectedItems = this.selectedBackpackItems();
    if (selectedItems.length === 0) {
      alert('No items selected to move.');
      return;
    }

    this.showLoading(true);
    const progress = this.buildProgressOverlay(selectedItems.length);
    progress.updateRound(1, 'starting', selectedItems.length);

    try {
      const response = await fetch(`${API_BASE}/api/move-to-overflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Token': this.apiToken
        },
        body: JSON.stringify({
          targetIds: selectedItems.map(item => item.instanceId)
        })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to move selected items');
      }

      progress.updateRound(1, 'complete', selectedItems.length);
      this.showTemporaryMessage(`✅ Moved ${selectedItems.length} items to overflow`, '#10b981');
      await this.refreshInventory();
    } catch (error) {
      console.error('Overflow move error:', error);
      progress.updateRound(1, 'error', 0, error.message);
      this.showError(`Failed to move items: ${error.message}`);
    } finally {
      this.showLoading(false);
      progress.finish(selectedItems.length, 0);
    }
  }

  async refreshItemId(targetId) {
    const response = await fetch(`${API_BASE}/api/refresh-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Token': this.apiToken
      },
      body: JSON.stringify({ targetId })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Failed to refresh ${targetId}`);
    }
    return data.item;
  }

  async batchRefreshIds() {
    if (!this.apiToken) {
      this.showError('Please set your bearer token first');
      return;
    }

    const ids = this.selectedBackpackItems().map(item => item.instanceId);
    if (ids.length === 0) {
      alert('No items selected to refresh.');
      return;
    }

    this.showLoading(true);
    try {
      let successCount = 0;
      for (const id of ids) {
        await this.refreshItemId(id);
        successCount += 1;
      }
      this.showTemporaryMessage(`✅ Refreshed ${successCount} items`, '#10b981');
      await this.refreshInventory();
    } catch (error) {
      console.error('Batch refresh failed:', error);
      this.showError(`Batch refresh failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async duplicateBackpackMultiple() {
    if (!this.apiToken) {
      this.showError('Please set your bearer token first');
      return;
    }

    const multiplierInput = this.byId('duplicateCount', 'multiplier', 'copyCount');
    const rounds = parseInt(multiplierInput?.value || '1', 10) || 1;
    if (rounds <= 0) {
      alert('Please enter a positive number.');
      return;
    }
    if (rounds > 100) {
      alert('Please enter 100 or fewer rounds.');
      return;
    }

    const selectedItems = this.selectedBackpackItems();
    if (selectedItems.length === 0) {
      this.showError('No items available to duplicate.');
      return;
    }

    const progress = this.buildProgressOverlay(rounds);
    this.showLoading(true);

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let round = 1; round <= rounds; round += 1) {
        progress.updateRound(round, 'building', selectedItems.length, 'Preparing mutation payload');

        const mutations = [];
        for (const item of selectedItems) {
          mutations.push({
            action: 'duplicate',
            instanceId: item.instanceId,
            newInstanceId: this.generateUUID(),
            gameAssetId: item.gameAssetId,
            amount: item.amount || 1,
            slots: Array.isArray(item.slots) ? [...item.slots] : [],
            etag: item.etag
          });
        }

        if (mutations.length === 0) {
          throw new Error('No mutations were built');
        }

        progress.updateRound(round, 'sending', mutations.length, 'Sending request');
        const response = await fetch(`${API_BASE}/api/mutate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Token': this.apiToken
          },
          body: JSON.stringify({
            mutations,
            requestId: this.generateUUID()
          })
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Mutation request failed');
        }

        successCount += 1;
        progress.updateRound(round, 'complete', selectedItems.length);

        if (round < rounds) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      progress.finish(successCount, errorCount);
      this.showTemporaryMessage(`✅ Completed ${successCount}/${rounds} rounds`, '#10b981');
      await this.refreshInventory();
    } catch (error) {
      console.error('Duplicate error:', error);
      progress.updateRound(1, 'error', 0, error.message);
      this.showError(`Duplicate failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async runGetToken() {
    return this.obtainAuthToken();
  }

  async loadData() {
    return this.loadReferenceData();
  }

  async run() {
    return this.init();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.inventoryViewer = new InventoryViewer();
});