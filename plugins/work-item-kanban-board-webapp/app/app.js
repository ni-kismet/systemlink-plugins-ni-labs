import {
    getWorkItemTypes,
    queryWorkItems,
    updateWorkItems,
} from '@ni/systemlink-clients-ts/work-item';
import {
    createClient as createWorkItemClient,
    createConfig as createWorkItemConfig,
} from '@ni/systemlink-clients-ts/work-item/client';
import {
    getWorkspaces,
    queryUsers,
} from '@ni/systemlink-clients-ts/user';
import {
    createClient as createUserClient,
    createConfig as createUserConfig,
} from '@ni/systemlink-clients-ts/user/client';

// SystemLink SDK clients
const systemLinkOrigin = window.location.origin;
const workItemClient = createWorkItemClient(createWorkItemConfig({
    baseUrl: systemLinkOrigin,
    credentials: 'include',
}));
const userClient = createUserClient(createUserConfig({
    baseUrl: `${systemLinkOrigin}/niuser/v1`,
    credentials: 'include',
}));

const STATES = ['NEW', 'DEFINED', 'REVIEWED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED'];
const STATE_LABELS = {
    NEW: 'New',
    DEFINED: 'Defined',
    REVIEWED: 'Reviewed',
    SCHEDULED: 'Scheduled',
    IN_PROGRESS: 'In Progress',
    PENDING_APPROVAL: 'Pending Approval',
    CLOSED: 'Closed',
    CANCELED: 'Canceled',
};

const TYPE_LABELS = {
    testplan: 'Test Plan',
    workorder: 'Work Order',
    maintenance: 'Maintenance',
    calibration: 'Calibration',
    job: 'Job',
    reservation: 'Reservation',
    transportorder: 'Transport Order',
};

const TYPE_ICONS = {
    testplan: '<nimble-icon-rectangle-check-lines></nimble-icon-rectangle-check-lines>',
    workorder: '<nimble-icon-clipboard></nimble-icon-clipboard>',
    maintenance: '<nimble-icon-wrench-hammer></nimble-icon-wrench-hammer>',
    calibration: '<nimble-icon-calipers></nimble-icon-calipers>',
    job: '<nimble-icon-user-helmet-safety></nimble-icon-user-helmet-safety>',
    reservation: '<nimble-icon-calendar-week></nimble-icon-calendar-week>',
    transportorder: '<nimble-icon-forklift></nimble-icon-forklift>',
};

// DOM Elements
const kanbanBoard = document.getElementById('kanbanBoard');
const boardLoading = document.getElementById('boardLoading');
const refreshBtn = document.getElementById('refreshBtn');
const typeFilter = document.getElementById('typeFilter');
const assigneeFilter = document.getElementById('assigneeFilter');
const workspaceFilter = document.getElementById('workspaceFilter');
const searchFilter = document.getElementById('searchFilter');
const detailDrawer = document.getElementById('detailDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const drawerTitle = document.getElementById('drawerTitle');
const drawerSubtitle = document.getElementById('drawerSubtitle');
const drawerBody = document.getElementById('drawerBody');
const drawerSaveBtn = document.getElementById('drawerSaveBtn');
const errorToast = document.getElementById('errorToast');
const successToast = document.getElementById('successToast');

// State
let allWorkItems = [];
let workItemTypes = [];
let userDisplayNames = {};  // userId → display name cache
let userIdsByName = {};     // display name → userId (reverse lookup)
let allWorkspaces = [];     // { id, name, enabled, default }
let draggedItem = null;
let draggedCardEl = null;
let currentDrawerItem = null;

// ─── Initialize ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const themeProvider = document.getElementById('theme');

    function detectInitialTheme() {
        try {
            const params = new URLSearchParams(window.location.search);
            const queryTheme = params.get('theme');
            if (queryTheme === 'light' || queryTheme === 'dark') {
                return { theme: queryTheme, followSystemTheme: false, watchParentTheme: false };
            }
        } catch {}
        try {
            if (window.parent !== window) {
                const parentProvider = window.parent.document.querySelector('nimble-theme-provider');
                const parentTheme = parentProvider?.getAttribute('theme');
                if (parentTheme === 'light' || parentTheme === 'dark') {
                    return { theme: parentTheme, followSystemTheme: false, watchParentTheme: true };
                }
            }
        } catch {}
        try {
            const saved = localStorage.getItem('sl_app_theme');
            if (saved === 'light' || saved === 'dark') {
                return { theme: saved, followSystemTheme: false, watchParentTheme: false };
            }
        } catch {}
        try {
            if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
                return { theme: 'dark', followSystemTheme: true, watchParentTheme: false };
            }
        } catch {}
        return { theme: 'light', followSystemTheme: true, watchParentTheme: false };
    }

    function applyTheme(theme) {
        themeProvider.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
    }

    function watchParentTheme() {
        try {
            if (window.parent === window) return;
            const parentProvider = window.parent.document.querySelector('nimble-theme-provider');
            if (!parentProvider) return;
            new MutationObserver(() => {
                const t = parentProvider.getAttribute('theme');
                if (t === 'light' || t === 'dark') applyTheme(t);
            }).observe(parentProvider, { attributes: true, attributeFilter: ['theme'] });
        } catch {}
    }

    const initialTheme = detectInitialTheme();

    customElements.whenDefined('nimble-theme-provider').then(() => {
        applyTheme(initialTheme.theme);
        if (initialTheme.watchParentTheme) {
            watchParentTheme();
        }
    });

    if (initialTheme.followSystemTheme) {
        try {
            window.matchMedia?.('(prefers-color-scheme: dark)')
                .addEventListener('change', e => applyTheme(e.matches ? 'dark' : 'light'));
        } catch {}
    }

    setupEventListeners();
    Promise.all([loadWorkItemTypes(), loadAllUsers(), loadWorkspaces()]).then(() => loadWorkItems());
});

function setupEventListeners() {
    refreshBtn.addEventListener('click', loadWorkItems);
    typeFilter.addEventListener('change', renderBoard);
    workspaceFilter.addEventListener('change', renderBoard);
    assigneeFilter.addEventListener('change', renderBoard);
    searchFilter.addEventListener('input', debounce(renderBoard, 300));
    drawerBackdrop.addEventListener('click', closeDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    document.getElementById('drawerCancelBtn').addEventListener('click', closeDrawer);
    drawerSaveBtn.addEventListener('click', saveDrawerChanges);

    // Close drawer on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailDrawer.hidden) {
            closeDrawer();
        }
    });

    // Setup drop zones on all columns
    for (const state of STATES) {
        const col = document.getElementById(`col-${state}`);
        col.addEventListener('dragover', onDragOver);
        col.addEventListener('dragenter', onDragEnter);
        col.addEventListener('dragleave', onDragLeave);
        col.addEventListener('drop', onDrop);
    }
}

function getSystemLinkErrorMessage(result) {
    return result.error?.error?.message || result.error?.message || `HTTP ${result.response?.status ?? 'error'}`;
}

function getFailedWorkItemsErrorMessage(data) {
    if (!data?.failedWorkItems?.length) {
        return null;
    }

    const failedIds = data.failedWorkItems
        .map(workItem => workItem.id)
        .filter(Boolean);
    if (data.error?.message) {
        return data.error.message;
    }
    if (failedIds.length > 0) {
        return `Failed to update work item${failedIds.length === 1 ? '' : 's'}: ${failedIds.join(', ')}`;
    }
    return 'Failed to update one or more work items.';
}

async function executeSystemLinkRequest(requestPromise) {
    const result = await requestPromise;

    if (result.error) {
        throw new Error(getSystemLinkErrorMessage(result));
    }

    return result.data;
}

async function persistWorkItemUpdates(workItems, { replace = false } = {}) {
    const data = await executeSystemLinkRequest(updateWorkItems({
        client: workItemClient,
        body: {
            workItems,
            replace,
        },
    }));

    const failedWorkItemsMessage = getFailedWorkItemsErrorMessage(data);
    if (failedWorkItemsMessage) {
        throw new Error(failedWorkItemsMessage);
    }

    return data;
}

// ─── API Calls ──────────────────────────────────────────────────

async function loadWorkItemTypes() {
    try {
        const data = await executeSystemLinkRequest(getWorkItemTypes({
            client: workItemClient,
        }));
        workItemTypes = data?.workItemTypes || [];
        populateTypeFilter();
    } catch (err) {
        console.warn('Failed to load work item types:', err);
    }
}

function populateTypeFilter() {
    // Keep the "All Types" default option
    const seenTypes = new Set();
    for (const t of workItemTypes) {
        if (t.type && !seenTypes.has(t.type)) {
            seenTypes.add(t.type);
            const opt = document.createElement('nimble-list-option');
            opt.value = t.type;
            opt.textContent = TYPE_LABELS[t.type] || t.type;
            typeFilter.appendChild(opt);
        }
    }
}

async function loadWorkItems() {
    boardLoading.hidden = false;
    kanbanBoard.hidden = true;

    try {
        let allItems = [];
        let continuationToken = null;

        do {
            const body = {
                take: 500,
                returnCount: true,
                projection: [
                    'ID', 'NAME', 'TYPE', 'STATE', 'SUBSTATE',
                    'ASSIGNED_TO', 'REQUESTED_BY', 'PART_NUMBER',
                    'DESCRIPTION', 'UPDATED_AT', 'CREATED_AT',
                    'TIMELINE', 'SCHEDULE', 'WORKSPACE', 'PROPERTIES',
                ],
            };
            if (continuationToken) {
                body.continuationToken = continuationToken;
            }
            // Exclude CANCELED items from the board
            body.filter = 'state != "CANCELED"';

            const data = await executeSystemLinkRequest(queryWorkItems({
                client: workItemClient,
                body,
            }));
            allItems = allItems.concat(data?.workItems || []);
            continuationToken = data?.continuationToken || null;
        } while (continuationToken);

        allWorkItems = allItems;
        populateAssigneeFilter();
        renderBoard();
    } catch (err) {
        console.error('Failed to load work items:', err);
        showError(`Failed to load work items: ${err.message}`);
    } finally {
        boardLoading.hidden = true;
        kanbanBoard.hidden = false;
    }
}

async function updateWorkItemState(workItemId, newState) {
    try {
        const data = await persistWorkItemUpdates([{
            id: workItemId,
            state: newState,
        }]);

        // Update local state with the returned work item data
        if (data?.updatedWorkItems?.length > 0) {
            const updated = data.updatedWorkItems[0];
            const idx = allWorkItems.findIndex(w => w.id === workItemId);
            if (idx !== -1) {
                allWorkItems[idx] = { ...allWorkItems[idx], ...updated };
            }
        }

        showSuccess(`Moved to ${STATE_LABELS[newState] || newState}`);
        return true;
    } catch (err) {
        console.error('Failed to update work item:', err);
        showError(`Failed to update: ${err.message}`);
        return false;
    }
}

// ─── Workspaces ─────────────────────────────────────────────────

async function loadWorkspaces() {
    try {
        const data = await executeSystemLinkRequest(getWorkspaces({
            client: userClient,
        }));
        allWorkspaces = (data?.workspaces || []).filter(w => w.enabled !== false);
        // Populate workspace filter
        for (const ws of allWorkspaces.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
            const opt = document.createElement('nimble-list-option');
            opt.value = ws.id;
            opt.textContent = ws.name || ws.id;
            if (ws.default) opt.textContent += ' (default)';
            workspaceFilter.appendChild(opt);
        }
    } catch (err) {
        console.warn('Failed to load workspaces:', err);
    }
}

// ─── User Resolution ────────────────────────────────────────────

async function loadAllUsers() {
    try {
        let continuationToken = null;

        do {
            const body = { take: 1000 };
            if (continuationToken) {
                body.continuationToken = continuationToken;
            }

            const data = await executeSystemLinkRequest(queryUsers({
                client: userClient,
                body,
            }));
            const users = data?.users || [];
            for (const user of users) {
                const name = [user.firstName, user.lastName].filter(s => s && s !== '-').join(' ');
                const displayName = name || user.email || user.login || user.id;
                userDisplayNames[user.id] = displayName;
                userIdsByName[displayName] = user.id;
            }
            continuationToken = data?.continuationToken || null;
        } while (continuationToken);
    } catch (err) {
        console.warn('Failed to load users:', err);
    }
}

function getUserDisplayName(userId) {
    if (!userId) return 'Unassigned';
    return userDisplayNames[userId] || 'Unknown User';
}

function populateAssigneeFilter() {
    const currentVal = assigneeFilter.value;
    // Remove all options except the first "All" option
    while (assigneeFilter.children.length > 1) {
        assigneeFilter.removeChild(assigneeFilter.lastChild);
    }
    // Collect user IDs that have at least one work item assigned
    const activeUserIds = new Set(allWorkItems.map(w => w.assignedTo).filter(Boolean));
    const sorted = [...activeUserIds]
        .map(id => [id, getUserDisplayName(id)])
        .sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, name] of sorted) {
        const opt = document.createElement('nimble-list-option');
        opt.value = id;
        opt.textContent = name;
        assigneeFilter.appendChild(opt);
    }
    // Restore previous selection if still valid
    if (currentVal && activeUserIds.has(currentVal)) {
        assigneeFilter.value = currentVal;
    }
}

// ─── Rendering ──────────────────────────────────────────────────

function getFilteredItems() {
    let items = allWorkItems;

    const typeVal = typeFilter.value;
    if (typeVal) {
        items = items.filter(w => w.type === typeVal);
    }

    const workspaceVal = workspaceFilter.value;
    if (workspaceVal) {
        items = items.filter(w => w.workspace === workspaceVal);
    }

    const assigneeVal = assigneeFilter.value;
    if (assigneeVal) {
        items = items.filter(w => w.assignedTo === assigneeVal);
    }

    const searchVal = (searchFilter.value || '').trim().toLowerCase();
    if (searchVal) {
        items = items.filter(w =>
            (w.name || '').toLowerCase().includes(searchVal) ||
            (w.id || '').toLowerCase().includes(searchVal) ||
            (w.partNumber || '').toLowerCase().includes(searchVal) ||
            (w.description || '').toLowerCase().includes(searchVal)
        );
    }

    return items;
}

const CARD_RENDER_LIMIT = 50;

function renderBoard() {
    const items = getFilteredItems();

    for (const state of STATES) {
        const col = document.getElementById(`col-${state}`);
        const countEl = document.getElementById(`count-${state}`);
        const stateItems = items.filter(w => w.state === state);

        countEl.textContent = stateItems.length;
        col.innerHTML = '';

        const sorted = [...stateItems].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        const visible = sorted.slice(0, CARD_RENDER_LIMIT);
        visible.forEach(item => col.appendChild(createCard(item)));

        if (sorted.length > CARD_RENDER_LIMIT) {
            const showMore = document.createElement('button');
            showMore.className = 'show-more-btn';
            showMore.textContent = `Show ${sorted.length - CARD_RENDER_LIMIT} more…`;
            showMore.addEventListener('click', () => {
                showMore.remove();
                sorted.slice(CARD_RENDER_LIMIT).forEach(item => col.appendChild(createCard(item)));
            });
            col.appendChild(showMore);
        }

        // Drop placeholder when empty
        if (stateItems.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'column-placeholder';
            placeholder.textContent = 'Drop here';
            col.appendChild(placeholder);
        }
    }
}

function createCard(item) {
    const card = document.createElement('div');
    card.className = `kanban-card type-${item.type || 'unknown'}`;
    card.draggable = true;
    card.dataset.workItemId = item.id;
    card.dataset.state = item.state;

    const assignee = getUserDisplayName(item.assignedTo);
    const dueDate = item.schedule?.plannedEndDateTime || item.timeline?.dueDateTime;
    const isOverdue = dueDate &&
        new Date(dueDate) < new Date() &&
        item.state !== 'CLOSED';
    const hasScheduleDates = item.schedule?.plannedStartDateTime || item.schedule?.plannedEndDateTime;
    const scheduledIndex = STATES.indexOf('SCHEDULED');
    const stateIndex = STATES.indexOf(item.state);
    const isPreScheduled = stateIndex >= 0 && stateIndex < scheduledIndex;

    card.innerHTML = `
        <div class="card-title">${escapeHtml(item.name || 'Untitled')}</div>
        ${!isPreScheduled && !hasScheduleDates
            ? `<span class="card-unscheduled" title="Not yet scheduled">Unscheduled</span>` : ''}
        <div class="card-footer">
            <span class="card-assignee" title="${escapeAttr(assignee)}">
                ${escapeHtml(assignee)}
            </span>
            ${dueDate && item.state !== 'CLOSED' ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${escapeHtml(formatRelativeDate(dueDate))}</span>` : ''}
        </div>
    `;

    // Click to open detail drawer
    card.addEventListener('click', (e) => {
        if (card.classList.contains('dragging')) return;
        if (card.classList.contains('inline-editing')) return;
        openDrawer(item);
    });

    // Inline edit: double-click title
    card.querySelector('.card-title').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEditTitle(card, item);
    });

    // Inline edit: double-click assignee
    card.querySelector('.card-assignee').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEditAssignee(card, item);
    });

    // Drag events
    card.addEventListener('dragstart', (e) => {
        if (card.classList.contains('inline-editing')) {
            e.preventDefault();
            return;
        }
        draggedItem = item;
        draggedCardEl = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedItem = null;
        draggedCardEl = null;
        // Remove all drop-target highlights
        document.querySelectorAll('.column-body').forEach(c => c.classList.remove('drop-target'));
    });

    return card;
}

// ─── Drag & Drop ────────────────────────────────────────────

// ─── Inline Editing ─────────────────────────────────────────

function startInlineEditTitle(card, item) {
    if (card.classList.contains('inline-editing')) return;
    card.classList.add('inline-editing');
    card.draggable = false;

    const titleEl = card.querySelector('.card-title');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = item.name || '';
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    async function save() {
        if (saved) return;
        saved = true;
        const newName = input.value.trim();
        if (newName && newName !== (item.name || '')) {
            await saveInlineField(item, { name: newName });
        } else {
            restoreCard(card, item);
        }
    }
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { saved = true; restoreCard(card, item); }
    });
    input.addEventListener('blur', () => save());
}

function startInlineEditAssignee(card, item) {
    if (card.classList.contains('inline-editing')) return;
    card.classList.add('inline-editing');
    card.draggable = false;

    const assigneeEl = card.querySelector('.card-assignee');
    const select = document.createElement('nimble-select');
    select.className = 'inline-edit-select';
    select.setAttribute('appearance', 'outline');
    select.setAttribute('filter-mode', 'standard');

    const unassignedOpt = document.createElement('nimble-list-option');
    unassignedOpt.value = '';
    unassignedOpt.textContent = 'Unassigned';
    if (!item.assignedTo) unassignedOpt.setAttribute('selected', '');
    select.appendChild(unassignedOpt);

    const sorted = Object.entries(userDisplayNames).sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, name] of sorted) {
        const opt = document.createElement('nimble-list-option');
        opt.value = id;
        opt.textContent = name;
        if (id === item.assignedTo) opt.setAttribute('selected', '');
        select.appendChild(opt);
    }

    assigneeEl.replaceWith(select);

    let saved = false;
    async function save() {
        if (saved) return;
        saved = true;
        const newAssigneeId = select.value || null;
        if (newAssigneeId !== (item.assignedTo || null)) {
            await saveInlineField(item, { assignedTo: newAssigneeId });
        } else {
            restoreCard(card, item);
        }
    }
    select.addEventListener('change', () => save());
    select.addEventListener('blur', () => setTimeout(() => save(), 150));
}

async function saveInlineField(item, updates) {
    try {
        const data = await persistWorkItemUpdates([{ id: item.id, ...updates }]);
        if (data?.updatedWorkItems?.length > 0) {
            const updated = data.updatedWorkItems[0];
            const idx = allWorkItems.findIndex(w => w.id === item.id);
            if (idx !== -1) {
                allWorkItems[idx] = { ...allWorkItems[idx], ...updated };
            }
        }
        showSuccess('Work item updated');
        populateAssigneeFilter();
        renderBoard();
    } catch (err) {
        console.error('Failed to save inline edit:', err);
        showError(`Failed to save: ${err.message}`);
        renderBoard();
    }
}

function restoreCard(card, item) {
    // Re-render the card in place by rebuilding it
    const newCard = createCard(item);
    card.replaceWith(newCard);
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
    e.preventDefault();
    const colBody = e.currentTarget;
    colBody.classList.add('drop-target');
}

function onDragLeave(e) {
    const colBody = e.currentTarget;
    // Only remove if we're actually leaving the column (not entering a child)
    if (!colBody.contains(e.relatedTarget)) {
        colBody.classList.remove('drop-target');
    }
}

async function onDrop(e) {
    e.preventDefault();
    const colBody = e.currentTarget;
    colBody.classList.remove('drop-target');

    if (!draggedItem) return;

    const newState = colBody.closest('.kanban-column').dataset.state;
    if (newState === draggedItem.state) return;

    const oldState = draggedItem.state;
    const itemId = draggedItem.id;

    // Optimistic move: update local data and re-render immediately
    const idx = allWorkItems.findIndex(w => w.id === itemId);
    if (idx !== -1) {
        allWorkItems[idx].state = newState;
    }
    renderBoard();

    // Fire API update
    const success = await updateWorkItemState(itemId, newState);
    if (!success) {
        // Rollback on failure
        if (idx !== -1) {
            allWorkItems[idx].state = oldState;
        }
        renderBoard();
    }
}

// ─── Detail Drawer ──────────────────────────────────────────────

function getSystemLinkBaseUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const basePath = params.get('slBasePath');
        if (basePath) {
            const normalizedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
            return `${window.location.origin}${normalizedBasePath}`;
        }
    } catch {}

    const candidateWindows = [window];
    if (window.parent !== window) {
        candidateWindows.unshift(window.parent);
    }

    for (const candidateWindow of candidateWindows) {
        try {
            const { origin, pathname } = candidateWindow.location;
            const webappsIndex = pathname.indexOf('/webapps/');
            if (webappsIndex >= 0) {
                return `${origin}${pathname.slice(0, webappsIndex)}`;
            }
            return origin;
        } catch {}
    }

    return window.location.origin;
}

function getWorkItemDetailsUrl(workItemId) {
    const baseUrl = getSystemLinkBaseUrl();
    return `${baseUrl}/labmanagement/workitems/workitem/${encodeURIComponent(workItemId)}/assets`;
}

function openDrawer(item) {
    currentDrawerItem = item;
    drawerTitle.textContent = item.name || 'Work Item';
    if (item.id) {
        drawerSubtitle.textContent = `#${item.id}`;
        drawerSubtitle.href = getWorkItemDetailsUrl(item.id);
        drawerSubtitle.hidden = false;
    } else {
        drawerSubtitle.textContent = '';
        drawerSubtitle.href = '#';
        drawerSubtitle.hidden = true;
    }
    drawerBody.innerHTML = renderDrawerContent(item);
    wirePropertyButtons();
    detailDrawer.hidden = false;
    document.body.style.overflow = 'hidden';
}

function wirePropertyButtons() {
    const addBtn = document.getElementById('addPropertyBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const container = document.getElementById('drawer-properties');
            const row = document.createElement('div');
            row.className = 'prop-row';
            row.innerHTML = `<nimble-text-field class="prop-edit-key" data-original-key="" appearance="underline" placeholder="Key"></nimble-text-field><nimble-text-field class="prop-edit-value" appearance="underline" placeholder="Value"></nimble-text-field><nimble-button class="prop-remove-btn" appearance="ghost" content-hidden title="Remove property" aria-label="Remove property"><nimble-icon-times slot="start"></nimble-icon-times>Remove</nimble-button>`;
            container.appendChild(row);
            row.querySelector('.prop-remove-btn').addEventListener('click', () => row.remove());
            row.querySelector('.prop-edit-key').focus();
        });
    }
    for (const btn of document.querySelectorAll('.prop-remove-btn')) {
        btn.addEventListener('click', () => btn.closest('.prop-row').remove());
    }
}

function closeDrawer() {
    detailDrawer.hidden = true;
    document.body.style.overflow = '';
    currentDrawerItem = null;
    drawerSubtitle.textContent = '';
    drawerSubtitle.href = '#';
    drawerSubtitle.hidden = true;
}

async function saveDrawerChanges() {
    if (!currentDrawerItem) return;

    const nameInput = document.getElementById('edit-name');
    const stateSelect = document.getElementById('edit-state');
    const assigneeSelect = document.getElementById('edit-assignee');
    const partNumberInput = document.getElementById('edit-partNumber');
    const descriptionInput = document.getElementById('edit-description');

    const updates = { id: currentDrawerItem.id };
    let changed = false;

    if (nameInput && nameInput.value !== (currentDrawerItem.name || '')) {
        updates.name = nameInput.value;
        changed = true;
    }
    if (stateSelect && stateSelect.value !== currentDrawerItem.state) {
        updates.state = stateSelect.value;
        changed = true;
    }
    if (assigneeSelect) {
        const newAssigneeId = assigneeSelect.value || null;
        if (newAssigneeId !== (currentDrawerItem.assignedTo || '')) {
            updates.assignedTo = newAssigneeId || null;
            changed = true;
        }
    }
    if (partNumberInput && partNumberInput.value !== (currentDrawerItem.partNumber || '')) {
        updates.partNumber = partNumberInput.value || null;
        changed = true;
    }
    if (descriptionInput && descriptionInput.value !== (currentDrawerItem.description || '')) {
        updates.description = descriptionInput.value;
        changed = true;
    }

    // Check for property changes
    const propRows = document.querySelectorAll('.prop-row');
    const newProperties = {};
    const originalProperties = currentDrawerItem.properties || {};
    let propsChanged = false;
    for (const row of propRows) {
        const keyField = row.querySelector('.prop-edit-key');
        const valField = row.querySelector('.prop-edit-value');
        const newKey = keyField.value.trim();
        const newVal = valField.value;
        const originalKey = keyField.dataset.originalKey;
        if (!newKey) continue; // skip empty keys
        newProperties[newKey] = newVal;
        if (newKey !== originalKey || newVal !== (originalProperties[originalKey] ?? '')) {
            propsChanged = true;
        }
    }
    const removedPropertyKeys = Object.keys(originalProperties).filter(origKey => !(origKey in newProperties));
    // Check if any original keys were removed
    if (!propsChanged && Object.keys(originalProperties).length > 0) {
        for (const origKey of Object.keys(originalProperties)) {
            if (!(origKey in newProperties)) {
                propsChanged = true;
                break;
            }
        }
    }
    if (propsChanged) {
        updates.properties = Object.keys(newProperties).length > 0 ? newProperties : null;
        changed = true;
    }

    if (!changed) {
        closeDrawer();
        return;
    }

    try {
        const data = await persistWorkItemUpdates([updates], {
            replace: removedPropertyKeys.length > 0,
        });
        if (data?.updatedWorkItems?.length > 0) {
            const updated = data.updatedWorkItems[0];
            const idx = allWorkItems.findIndex(w => w.id === currentDrawerItem.id);
            if (idx !== -1) {
                allWorkItems[idx] = { ...allWorkItems[idx], ...updated };
            }
        }

        showSuccess('Work item updated');
        closeDrawer();
        renderBoard();
    } catch (err) {
        console.error('Failed to save work item:', err);
        showError(`Failed to save: ${err.message}`);
    }
}

function renderDrawerContent(item) {
    const typeLabel = TYPE_LABELS[item.type] || item.type || 'Unknown';
    const typeIcon = TYPE_ICONS[item.type] || '📄';
    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : '—';
    const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
    const plannedStartAt = item.schedule?.plannedStartDateTime ? new Date(item.schedule.plannedStartDateTime).toLocaleString() : '—';
    const plannedEndAt = item.schedule?.plannedEndDateTime ? new Date(item.schedule.plannedEndDateTime).toLocaleString() : '—';

    // Build assignee options
    const sortedUsers = Object.entries(userDisplayNames)
        .sort((a, b) => a[1].localeCompare(b[1]));
    const assigneeOptions = sortedUsers.map(([id, name]) =>
        `<nimble-list-option value="${escapeAttr(id)}" ${id === item.assignedTo ? 'selected' : ''}>${escapeHtml(name)}</nimble-list-option>`
    ).join('');

    // Build state options
    const stateOptions = STATES.map(s =>
        `<nimble-list-option value="${s}" ${s === item.state ? 'selected' : ''}>${STATE_LABELS[s]}</nimble-list-option>`
    ).join('');

    return `
        <div class="drawer-field">
            <span class="drawer-label">Type</span>
            <span class="drawer-value">${typeIcon} ${escapeHtml(typeLabel)}</span>
        </div>
        <div class="drawer-edit-field">
            <label class="drawer-label" for="edit-name">Name</label>
            <nimble-text-field id="edit-name" appearance="underline" value="${escapeAttr(item.name || '')}"></nimble-text-field>
        </div>
        <div class="drawer-edit-field">
            <label class="drawer-label" for="edit-state">State</label>
            <nimble-select id="edit-state" appearance="underline">
                ${stateOptions}
            </nimble-select>
        </div>
        <div class="drawer-edit-field">
            <label class="drawer-label" for="edit-assignee">Assigned To</label>
            <nimble-select id="edit-assignee" appearance="underline" filter-mode="standard">
                <nimble-list-option value="" ${!item.assignedTo ? 'selected' : ''}>Unassigned</nimble-list-option>
                ${assigneeOptions}
            </nimble-select>
        </div>
        <div class="drawer-edit-field">
            <label class="drawer-label" for="edit-partNumber">Part Number</label>
            <nimble-text-field id="edit-partNumber" appearance="underline" value="${escapeAttr(item.partNumber || '')}" placeholder="Enter part number..."></nimble-text-field>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Planned Start</span>
            <span class="drawer-value">${escapeHtml(plannedStartAt)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Planned End</span>
            <span class="drawer-value">${escapeHtml(plannedEndAt)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Created</span>
            <span class="drawer-value">${escapeHtml(createdAt)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Updated</span>
            <span class="drawer-value">${escapeHtml(updatedAt)}</span>
        </div>
        <div class="drawer-edit-field full-width">
            <label class="drawer-label" for="edit-description">Description</label>
            <nimble-text-area id="edit-description" appearance="outline" rows="5">${escapeHtml(item.description || '')}</nimble-text-area>
        </div>
        ${item.properties && Object.keys(item.properties).length > 0 ? `
        <div class="drawer-edit-field full-width">
            <span class="drawer-label">Properties</span>
            <div class="drawer-properties" id="drawer-properties">
                ${Object.entries(item.properties).map(([k, v]) =>
                    `<div class="prop-row"><nimble-text-field class="prop-edit-key" data-original-key="${escapeAttr(k)}" appearance="underline" value="${escapeAttr(k)}"></nimble-text-field><nimble-text-field class="prop-edit-value" appearance="underline" value="${escapeAttr(v)}"></nimble-text-field><nimble-button class="prop-remove-btn" appearance="ghost" content-hidden title="Remove property" aria-label="Remove property"><nimble-icon-times slot="start"></nimble-icon-times>Remove</nimble-button></div>`
                ).join('')}
            </div>
            <nimble-button id="addPropertyBtn" appearance="ghost"><nimble-icon-add slot="start"></nimble-icon-add>Add property</nimble-button>
        </div>` : `
        <div class="drawer-edit-field full-width">
            <span class="drawer-label">Properties</span>
            <div class="drawer-properties" id="drawer-properties"></div>
            <nimble-button id="addPropertyBtn" appearance="ghost"><nimble-icon-add slot="start"></nimble-icon-add>Add property</nimble-button>
        </div>`}
    `;
}

// ─── Utilities ──────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRelativeDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays}d`;
    return date.toLocaleDateString();
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

function showError(message) {
    successToast.open = false;
    errorToast.textContent = message;
    errorToast.open = true;
    setTimeout(() => { errorToast.open = false; }, 5000);
}

function showSuccess(message) {
    errorToast.open = false;
    successToast.textContent = message;
    successToast.open = true;
    setTimeout(() => { successToast.open = false; }, 5000);
}
