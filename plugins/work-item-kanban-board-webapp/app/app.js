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

const demoQueryValue = new URLSearchParams(window.location.search).get('demo');
const isDemoMode = demoQueryValue === null
    ? import.meta.env.DEV
    : !['0', 'false', 'off'].includes(demoQueryValue.toLowerCase());
const DEMO_USERS = [
    { id: 'demo-alex', firstName: 'Alex', lastName: 'Morgan', email: 'alex.morgan@example.com' },
    { id: 'demo-jordan', firstName: 'Jordan', lastName: 'Lee', email: 'jordan.lee@example.com' },
    { id: 'demo-priya', firstName: 'Priya', lastName: 'Shah', email: 'priya.shah@example.com' },
    { id: 'demo-sam', firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com' },
];
const DEMO_WORKSPACES = [
    { id: 'demo-lab', name: 'Demo Lab', enabled: true, default: true },
    { id: 'demo-production', name: 'Demo Production', enabled: true, default: false },
];

function createDemoWorkItems() {
    const now = Date.now();
    const daysAgo = days => new Date(now - days * 864e5).toISOString();
    const daysFromNow = days => new Date(now + days * 864e5).toISOString();

    return [
        {
            id: '1001', name: 'Prepare thermal chamber', type: 'workorder', state: 'NEW',
            assignedTo: 'demo-alex', workspace: 'demo-lab', partNumber: 'PX-4400',
            description: 'Verify the chamber is available and record the setup checklist.',
            createdAt: daysAgo(2), updatedAt: daysAgo(0.2), properties: { Priority: 'High', Area: 'Lab A' },
            timeline: { earliestStartDateTime: daysFromNow(1), dueDateTime: daysFromNow(5) },
        },
        {
            id: '1002', name: 'Create vibration test plan', type: 'testplan', state: 'DEFINED',
            assignedTo: 'demo-jordan', workspace: 'demo-lab', partNumber: 'PX-4400',
            description: 'Define the vibration profile and acceptance criteria for the next build.',
            createdAt: daysAgo(5), updatedAt: daysAgo(1), properties: { Priority: 'Medium' },
            parentId: '1001', schedule: { plannedStartDateTime: daysFromNow(2), plannedEndDateTime: daysFromNow(4) },
        },
        {
            id: '1003', name: 'Inspect calibration fixtures', type: 'calibration', state: 'REVIEWED',
            assignedTo: 'demo-priya', workspace: 'demo-production', partNumber: 'FX-102',
            description: 'Inspect fixture wear and confirm calibration stickers are current.',
            createdAt: daysAgo(7), updatedAt: daysAgo(2), properties: { Location: 'Calibration Bay' },
        },
        {
            id: '1004', name: 'Schedule environmental run', type: 'maintenance', state: 'SCHEDULED',
            assignedTo: 'demo-sam', workspace: 'demo-lab', partNumber: 'ENV-22',
            description: 'Reserve the environmental chamber for the qualification run.',
            createdAt: daysAgo(9), updatedAt: daysAgo(3), properties: { Shift: 'Night' },
            schedule: { plannedStartDateTime: daysFromNow(3), plannedEndDateTime: daysFromNow(6) },
        },
        {
            id: '1005', name: 'Run acoustic verification', type: 'job', state: 'IN_PROGRESS',
            assignedTo: 'demo-alex', workspace: 'demo-production', partNumber: 'AC-77',
            description: 'Collect the acoustic sweep and attach the measurement report.',
            createdAt: daysAgo(12), updatedAt: daysAgo(0.5), properties: { Priority: 'High' },
            timeline: { dueDateTime: daysFromNow(2) },
        },
        {
            id: '1006', name: 'Approve incoming inspection', type: 'workorder', state: 'PENDING_APPROVAL',
            assignedTo: 'demo-jordan', workspace: 'demo-production', partNumber: 'IN-908',
            description: 'Review inspection results and approve the lot for production.',
            createdAt: daysAgo(15), updatedAt: daysAgo(4), properties: { Reviewer: 'Jordan Lee' },
            timeline: { dueDateTime: daysAgo(1) },
        },
        {
            id: '1007', name: 'Close fixture repair', type: 'maintenance', state: 'CLOSED',
            assignedTo: 'demo-priya', workspace: 'demo-lab', partNumber: 'FX-102',
            description: 'Repair is complete and the fixture has passed the post-repair check.',
            createdAt: daysAgo(18), updatedAt: daysAgo(6), properties: { Result: 'Passed' },
        },
        {
            id: '1008', name: 'Move analyzer to Lab B', type: 'transportorder', state: 'NEW',
            assignedTo: null, workspace: 'demo-lab', partNumber: 'AN-12',
            description: 'Move the analyzer after the current run has finished.',
            createdAt: daysAgo(22), updatedAt: daysAgo(8), properties: { Destination: 'Lab B' },
        },
        {
            id: '1009', name: 'Reserve measurement system', type: 'reservation', state: 'DEFINED',
            assignedTo: 'demo-sam', workspace: 'demo-production', partNumber: 'MS-301',
            description: 'Reserve the measurement system for the production readiness review.',
            createdAt: daysAgo(28), updatedAt: daysAgo(10), properties: { Booking: 'Production review' },
        },
        {
            id: '1010', name: 'Archived reference item', type: 'job', state: 'CLOSED',
            assignedTo: 'demo-alex', workspace: 'demo-lab', partNumber: 'REF-01',
            description: 'Older item retained to demonstrate the time-range filter.',
            createdAt: daysAgo(45), updatedAt: daysAgo(40), properties: { Archive: 'Reference' },
        },
    ];
}

// DOM Elements
const kanbanBoard = document.getElementById('kanbanBoard');
const boardLoading = document.getElementById('boardLoading');
const refreshBtn = document.getElementById('refreshBtn');
const cardViewToggleBtn = document.getElementById('cardViewToggleBtn');
const searchFilter = document.getElementById('searchFilter');
const detailDrawer = document.getElementById('detailDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const drawerCancelBtn = document.getElementById('drawerCancelBtn');
const drawerTitle = document.getElementById('drawerTitle');
const drawerSubtitle = document.getElementById('drawerSubtitle');
const drawerBody = document.getElementById('drawerBody');
const drawerSaveBtn = document.getElementById('drawerSaveBtn');
const errorToast = document.getElementById('errorToast');
const successToast = document.getElementById('successToast');
const demoModeBadge = document.getElementById('demoModeBadge');

// State
let allWorkItems = [];
let workItemTypes = [];
let userDisplayNames = {};  // userId → display name cache
let userIdsByName = {};     // display name → userId (reverse lookup)
let allWorkspaces = [];     // { id, name, enabled, default }
let draggedItem = null;
let draggedCardEl = null;
let currentDrawerItem = null;
let demoWorkItems = null;
let workItemsLoadId = 0;
let drawerSessionId = 0;
let drawerSaveInProgress = false;
const workItemSaveTokens = new Map();
let lastFocusedElement = null;
let lastFocusedWorkItemId = null;
let drawerOriginalUpdatedAt = null;
let drawerOriginalPropertiesSnapshot = null;
const stateUpdateSequences = new Map();
const stateUpdateChains = new Map();
const CARD_CLICK_DELAY = 250;

// ─── Multi-select filter controls (MultiSelectControl instances) ─
const msControls = { type: null, workspace: null, assignee: null };

function getMsSelected(key) {
    return new Set(msControls[key] ? msControls[key].getSelected() : []);
}

const CARD_VIEW_MODES = {
    compressed: 'compressed',
    expanded: 'expanded',
};
let cardViewMode = CARD_VIEW_MODES.compressed;

const DEFAULT_CREATION_WINDOW = '30d';
let timeRangeControl = null;

// ─── Initialize ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const themeProvider = document.getElementById('theme');

    if (isDemoMode && demoModeBadge) {
        demoModeBadge.hidden = false;
    }

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

    try {
        const savedCardViewMode = localStorage.getItem('kanban_card_view_mode');
        if (savedCardViewMode === CARD_VIEW_MODES.expanded || savedCardViewMode === CARD_VIEW_MODES.compressed) {
            cardViewMode = savedCardViewMode;
        }
    } catch {}

    updateCardViewToggleButton();
    setupEventListeners();
    // Wire multi-select filter controls
    msControls.workspace = MultiSelectControl.create({
        mount: '#workspaceMsMount',
        label: 'Workspace',
        onChange: () => {
            populateTypeFilter();
            populateAssigneeFilter();
            void loadWorkItems();
        },
    });
    msControls.type = MultiSelectControl.create({
        mount: '#typeMsMount',
        label: 'Type',
        onChange: () => renderBoard(),
    });
    msControls.assignee = MultiSelectControl.create({
        mount: '#assigneeMsMount',
        label: 'Assigned To',
        onChange: () => renderBoard(),
    });
    void loadWorkItems();
    void loadWorkItemTypes();
    void loadAllUsers();
    void loadWorkspaces();
});

function setupEventListeners() {
    refreshBtn.addEventListener('click', loadWorkItems);
    cardViewToggleBtn.addEventListener('click', () => {
        cardViewMode = cardViewMode === CARD_VIEW_MODES.compressed ? CARD_VIEW_MODES.expanded : CARD_VIEW_MODES.compressed;
        try {
            localStorage.setItem('kanban_card_view_mode', cardViewMode);
        } catch {}
        updateCardViewToggleButton();
        renderBoard();
    });
    timeRangeControl = TimeRangeControl.create({
        mount: '#timeRangeMount',
        nimble: true,
        label: 'Select creation time range',
        presets: {
            all: 'Any time',
            '24h': 'Last 24 hours',
            '7d': 'Last 7 days',
            '15d': 'Last 15 days',
            '30d': 'Last 30 days',
            '60d': 'Last 2 months',
            '180d': 'Last 6 months',
        },
        defaultValue: DEFAULT_CREATION_WINDOW,
        onChange: () => void loadWorkItems(),
    });
    searchFilter.addEventListener('input', debounce(renderBoard, 300));
    drawerBackdrop.addEventListener('click', closeDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    drawerCancelBtn.addEventListener('click', () => closeDrawer());
    drawerSaveBtn.addEventListener('click', saveDrawerChanges);

    // Close drawer on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailDrawer.hidden) {
            closeDrawer();
            return;
        }
        if (e.key !== 'Tab' || detailDrawer.hidden) return;

        const focusableElements = getFocusableElements(detailDrawer);
        if (focusableElements.length === 0) {
            e.preventDefault();
            drawerCloseBtn.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
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

function updateCardViewToggleButton() {
    if (!cardViewToggleBtn) return;

    const isExpanded = cardViewMode === CARD_VIEW_MODES.expanded;
    cardViewToggleBtn.title = isExpanded ? 'Compress details' : 'Expand details';
    cardViewToggleBtn.setAttribute('aria-label', isExpanded ? 'Compress details' : 'Expand details');
    cardViewToggleBtn.innerHTML = isExpanded
        ? '<nimble-icon-arrow-down-right-and-arrow-up-left slot="start"></nimble-icon-arrow-down-right-and-arrow-up-left>Compress details'
        : '<nimble-icon-arrow-up-left-and-arrow-down-right slot="start"></nimble-icon-arrow-up-left-and-arrow-down-right>Expand details';
}

function getSystemLinkErrorMessage(result) {
    return result.error?.error?.message || result.error?.message || `HTTP ${result.response?.status ?? 'error'}`;
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getWorkItemVersion(item) {
    return item?.updatedAt ?? item?.UPDATED_AT ?? item?.updated_at ?? null;
}

function getPropertiesSnapshot(properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        return '{}';
    }

    return JSON.stringify(Object.entries(properties).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)));
}

function getDemoUpdatedWorkItems(workItems, replace) {
    const updatedWorkItems = [];
    for (const workItemUpdate of workItems) {
        const index = allWorkItems.findIndex(workItem => workItem.id === workItemUpdate.id);
        if (index === -1) {
            continue;
        }

        const current = allWorkItems[index];
        const updated = { ...current };
        for (const [key, value] of Object.entries(workItemUpdate)) {
            if (key !== 'id' && !(key === 'properties' && replace)) {
                updated[key] = value;
            }
        }
        if (replace && Object.hasOwn(workItemUpdate, 'properties')) {
            updated.properties = workItemUpdate.properties;
        }
        updated.updatedAt = new Date().toISOString();
        allWorkItems[index] = updated;
        updatedWorkItems.push(updated);
    }
    return updatedWorkItems;
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
    if (isDemoMode) {
        await delay(180);
        return { updatedWorkItems: getDemoUpdatedWorkItems(workItems, replace) };
    }

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
        if (isDemoMode) {
            workItemTypes = Object.keys(TYPE_LABELS).map(type => ({ type }));
            populateTypeFilter();
            return;
        }

        const data = await executeSystemLinkRequest(getWorkItemTypes({
            client: workItemClient,
        }));
        workItemTypes = data?.workItemTypes || [];
        populateTypeFilter();
    } catch (err) {
        console.warn('Failed to load work item types:', err);
    }
}

function getWorkspaceScopedItems() {
    const wsSelected = getMsSelected('workspace');
    if (wsSelected.size === 0) {
        return allWorkItems;
    }
    return allWorkItems.filter(w => wsSelected.has(w.workspace));
}

function populateTypeFilter() {
    if (!msControls.type) return;
    const scopedItems = getWorkspaceScopedItems();
    const availableTypes = new Set([
        ...workItemTypes.map(workItemType => workItemType.type),
        ...scopedItems.map(workItem => workItem.type),
    ].filter(Boolean));
    const typeOptions = [...availableTypes]
        .map(type => ({ value: type, label: TYPE_LABELS[type] || type }))
        .sort((a, b) => a.label.localeCompare(b.label));
    msControls.type.setOptions(typeOptions);
}

function quoteFilterValue(value) {
    return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function getWorkItemQueryFilter() {
    const filters = ['state != "CANCELED"'];
    const createdRange = timeRangeControl ? timeRangeControl.getRange() : null;
    if (createdRange?.start) {
        filters.push(`createdAt >= ${quoteFilterValue(createdRange.start.toISOString())}`);
    }
    if (createdRange?.end) {
        filters.push(`createdAt <= ${quoteFilterValue(createdRange.end.toISOString())}`);
    }

    const workspaceValues = [...getMsSelected('workspace')];
    if (workspaceValues.length > 0) {
        const workspaceFilter = workspaceValues
            .map(workspace => `workspace == ${quoteFilterValue(workspace)}`)
            .join(' or ');
        filters.push(`(${workspaceFilter})`);
    }

    return filters.join(' and ');
}

async function loadWorkItems() {
    const requestId = ++workItemsLoadId;
    boardLoading.hidden = false;
    kanbanBoard.hidden = true;
    refreshBtn.setAttribute('disabled', '');

    try {
        if (isDemoMode) {
            if (!demoWorkItems) {
                demoWorkItems = createDemoWorkItems();
            }
            allWorkItems = demoWorkItems;
            populateTypeFilter();
            populateAssigneeFilter();
            renderBoard();
            return;
        }

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
                    'TIMELINE', 'SCHEDULE', 'PARENT_ID', 'WORKSPACE', 'PROPERTIES',
                ],
            };
            if (continuationToken) {
                body.continuationToken = continuationToken;
            }
            body.filter = getWorkItemQueryFilter();

            const data = await executeSystemLinkRequest(queryWorkItems({
                client: workItemClient,
                body,
            }));
            allItems = allItems.concat(data?.workItems || []);
            continuationToken = data?.continuationToken || null;
            if (requestId !== workItemsLoadId) {
                return;
            }
        } while (continuationToken);

        allWorkItems = allItems;
        populateTypeFilter();
        populateAssigneeFilter();
        renderBoard();
    } catch (err) {
        if (requestId !== workItemsLoadId) {
            return;
        }
        console.error('Failed to load work items:', err);
        showError(`Failed to load work items: ${err.message}`);
    } finally {
        if (requestId === workItemsLoadId) {
            boardLoading.hidden = true;
            kanbanBoard.hidden = false;
            refreshBtn.removeAttribute('disabled');
        }
    }
}

async function updateWorkItemState(workItemId, newState, updateSequence) {
    const isLatestUpdate = () => stateUpdateSequences.get(workItemId) === updateSequence;

    try {
        const data = await persistWorkItemUpdates([{
            id: workItemId,
            state: newState,
        }]);

        if (!isLatestUpdate()) {
            return true;
        }

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
        if (isLatestUpdate()) {
            console.error('Failed to update work item:', err);
            showError(`Failed to update: ${err.message}`);
        } else {
            console.warn('Stale work item update failed:', err);
        }
        return false;
    }
}

// ─── Workspaces ─────────────────────────────────────────────────

async function loadWorkspaces() {
    try {
        if (isDemoMode) {
            allWorkspaces = DEMO_WORKSPACES;
            msControls.workspace?.setOptions(allWorkspaces.map(workspace => ({
                value: workspace.id,
                label: `${workspace.name}${workspace.default ? ' (default)' : ''}`,
            })));
            return;
        }

        const data = await executeSystemLinkRequest(getWorkspaces({
            client: userClient,
        }));
        allWorkspaces = (data?.workspaces || []).filter(w => w.enabled !== false);
        // Populate workspace filter
        const workspaceOptions = allWorkspaces
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(ws => ({ value: ws.id, label: (ws.name || ws.id) + (ws.default ? ' (default)' : '') }));
        msControls.workspace?.setOptions(workspaceOptions);
    } catch (err) {
        console.warn('Failed to load workspaces:', err);
    }
}

// ─── User Resolution ────────────────────────────────────────────

async function loadAllUsers() {
    try {
        if (isDemoMode) {
            for (const user of DEMO_USERS) {
                const displayName = `${user.firstName} ${user.lastName}`;
                userDisplayNames[user.id] = displayName;
                userIdsByName[displayName] = user.id;
            }
            populateAssigneeFilter();
            renderBoard();
            return;
        }

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

        if (allWorkItems.length > 0) {
            populateAssigneeFilter();
            renderBoard();
        }
    } catch (err) {
        console.warn('Failed to load users:', err);
    }
}

function getUserDisplayName(userId) {
    if (!userId) return 'Unassigned';
    return userDisplayNames[userId] || 'Unknown User';
}

function populateAssigneeFilter() {
    if (!msControls.assignee) return;
    const scopedItems = getWorkspaceScopedItems();
    const options = [{ value: '', label: 'Unassigned' }];
    const activeUserIds = new Set(scopedItems.map(w => w.assignedTo).filter(Boolean));
    const sorted = [...activeUserIds]
        .map(id => ({ value: id, label: getUserDisplayName(id) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    options.push(...sorted);
    msControls.assignee.setOptions(options);
}

function getAssigneeEntries(currentAssigneeId) {
    const entries = new Map(Object.entries(userDisplayNames));
    if (currentAssigneeId && !entries.has(currentAssigneeId)) {
        entries.set(currentAssigneeId, `Unknown User (${currentAssigneeId})`);
    }
    return [...entries.entries()];
}

// ─── Rendering ──────────────────────────────────────────────────

function getFilteredItems() {
    let items = allWorkItems;

    const createdRange = timeRangeControl ? timeRangeControl.getRange() : null;
    if (createdRange) {
        items = items.filter(w => {
            const createdAt = getWorkItemCreatedAt(w);
            return createdAt && createdAt >= createdRange.start && createdAt <= createdRange.end;
        });
    }

    const typeSel = getMsSelected('type');
    if (typeSel.size > 0) {
        items = items.filter(w => typeSel.has(w.type));
    }

    const wsSel = getMsSelected('workspace');
    if (wsSel.size > 0) {
        items = items.filter(w => wsSel.has(w.workspace));
    }

    const assigneeSel = getMsSelected('assignee');
    if (assigneeSel.size > 0) {
        items = items.filter(w => assigneeSel.has(w.assignedTo || ''));
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

function getWorkItemCreatedAt(item) {
    const rawCreatedAt = item?.createdAt || item?.CREATED_AT || item?.created_at;
    if (!rawCreatedAt) {
        return null;
    }

    const createdAt = new Date(rawCreatedAt);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
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
    card.className = `kanban-card type-${item.type || 'unknown'} ${cardViewMode === CARD_VIEW_MODES.expanded ? 'expanded' : 'compressed'}`;
    card.draggable = true;
    card.setAttribute('role', 'group');
    card.dataset.workItemId = item.id;
    card.dataset.state = item.state;

    const assignee = getUserDisplayName(item.assignedTo);
    card.setAttribute('aria-label', `${item.name || 'Untitled'}, ${STATE_LABELS[item.state] || item.state}, assigned to ${assignee}`);
    const dueDate = item.schedule?.plannedEndDateTime || item.timeline?.dueDateTime;
    const isOverdue = dueDate &&
        new Date(dueDate) < new Date() &&
        item.state !== 'CLOSED';
    const hasScheduleDates = item.schedule?.plannedStartDateTime || item.schedule?.plannedEndDateTime;
    const plannedStartDate = item.schedule?.plannedStartDateTime;
    const plannedEndDate = item.schedule?.plannedEndDateTime;
    const earliestStartDate = item.timeline?.earliestStartDateTime;
    const dueTimelineDate = item.timeline?.dueDateTime;
    const cardStartLabel = plannedStartDate ? 'Start' : (earliestStartDate ? 'Earliest' : 'Start');
    const cardEndLabel = plannedEndDate ? 'End' : (dueTimelineDate ? 'Due' : 'End');
    const cardStartValue = plannedStartDate || earliestStartDate;
    const cardEndValue = plannedEndDate || dueTimelineDate;
    const scheduledIndex = STATES.indexOf('SCHEDULED');
    const stateIndex = STATES.indexOf(item.state);
    const isPreScheduled = stateIndex >= 0 && stateIndex < scheduledIndex;
    const partNumber = item.partNumber || '—';
    const parentWorkItem = getParentWorkItemSummary(item);
    const description = (item.description || '').trim();
    const descriptionPreview = description ? truncateText(description, 120) : '—';
    const parentWorkItemDetail = parentWorkItem
        ? `
            <div class="card-detail-item card-detail-item-wide">
                <span class="card-detail-label">Parent</span>
                <span class="card-detail-value" title="${escapeAttr(parentWorkItem.label)}"><a href="${escapeAttr(getParentWorkItemUrl(parentWorkItem.id))}" target="_blank" rel="noopener noreferrer">${escapeHtml(parentWorkItem.label)}</a></span>
            </div>`
        : '';
    const expandedDetails = cardViewMode === CARD_VIEW_MODES.expanded
        ? `
        <div class="card-detail-grid">
            <div class="card-detail-item">
                <span class="card-detail-label">${cardStartLabel}</span>
                <span class="card-detail-value" title="${escapeAttr(formatCardDateTime(cardStartValue))}">${escapeHtml(formatCardDateTime(cardStartValue))}</span>
            </div>
            <div class="card-detail-item">
                <span class="card-detail-label">${cardEndLabel}</span>
                <span class="card-detail-value" title="${escapeAttr(formatCardDateTime(cardEndValue))}">${escapeHtml(formatCardDateTime(cardEndValue))}</span>
            </div>
            <div class="card-detail-item card-detail-item-wide">
                <span class="card-detail-label">Part Number</span>
                <span class="card-detail-value" title="${escapeAttr(partNumber)}">${escapeHtml(partNumber)}</span>
            </div>
            ${parentWorkItemDetail}
        </div>
        <div class="card-description-block" title="${escapeAttr(description || 'No description')}">
            <span class="card-detail-label">Description</span>
            <span class="card-description-text">${escapeHtml(descriptionPreview)}</span>
        </div>`
        : '';

    card.innerHTML = `
        <button type="button" class="card-title card-open-button" aria-label="Open details for ${escapeAttr(item.name || 'Untitled')}">${escapeHtml(item.name || 'Untitled')}</button>
        ${!isPreScheduled && !hasScheduleDates
            ? `<span class="card-unscheduled" title="Not yet scheduled">Unscheduled</span>` : ''}
        ${expandedDetails}
        <div class="card-footer">
            <span class="card-assignee" title="${escapeAttr(assignee)}">
                ${escapeHtml(assignee)}
            </span>
            ${dueDate && item.state !== 'CLOSED' ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${escapeHtml(formatRelativeDate(dueDate))}</span>` : ''}
        </div>
    `;

    let drawerOpenTimer = null;

    // Delay single-click activation so a double-click can enter inline editing.
    card.addEventListener('click', (e) => {
        if (card.classList.contains('dragging')) return;
        if (card.classList.contains('inline-editing')) return;
        const interactiveTarget = e.target instanceof Element
            ? e.target.closest('a, button, input, nimble-select, nimble-text-field')
            : null;
        if (interactiveTarget && !interactiveTarget.classList.contains('card-open-button')) return;
        if (e.detail > 1) return;
        drawerOpenTimer = window.setTimeout(() => {
            drawerOpenTimer = null;
            if (!card.isConnected || card.classList.contains('dragging') || card.classList.contains('inline-editing')) return;
            openDrawer(item);
        }, CARD_CLICK_DELAY);
    });

    // Inline edit: double-click title
    card.querySelector('.card-title').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        window.clearTimeout(drawerOpenTimer);
        startInlineEditTitle(card, item);
    });

    // Inline edit: double-click assignee
    card.querySelector('.card-assignee').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        window.clearTimeout(drawerOpenTimer);
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

    const sorted = getAssigneeEntries(item.assignedTo).sort((a, b) => a[1].localeCompare(b[1]));
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
    const updateSequence = (stateUpdateSequences.get(itemId) || 0) + 1;
    stateUpdateSequences.set(itemId, updateSequence);

    // Optimistic move: update local data and re-render immediately
    const item = allWorkItems.find(workItem => workItem.id === itemId);
    if (item) {
        item.state = newState;
    }
    renderBoard();

    // Fire API update
    const previousStateUpdate = stateUpdateChains.get(itemId) || Promise.resolve();
    const stateUpdate = previousStateUpdate
        .catch(() => {})
        .then(() => updateWorkItemState(itemId, newState, updateSequence));
    stateUpdateChains.set(itemId, stateUpdate);
    const success = await stateUpdate;
    if (stateUpdateSequences.get(itemId) !== updateSequence) {
        return;
    }
    stateUpdateSequences.delete(itemId);
    stateUpdateChains.delete(itemId);
    if (!success) {
        // Rollback on failure
        const currentItem = allWorkItems.find(workItem => workItem.id === itemId);
        if (currentItem && currentItem.state === newState) {
            currentItem.state = oldState;
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

function getParentWorkItemUrl(workItemId) {
    const baseUrl = getSystemLinkBaseUrl();
    return `${baseUrl}/labmanagement/workorders/workorder/${encodeURIComponent(workItemId)}/workitems`;
}

function openDrawer(item) {
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedWorkItemId = item.id || null;
    drawerOriginalUpdatedAt = getWorkItemVersion(item);
    drawerOriginalPropertiesSnapshot = getPropertiesSnapshot(item.properties);
    drawerSessionId += 1;
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
    // Nimble custom elements need value set imperatively after insertion into DOM
    const assigneeSelect = document.getElementById('edit-assignee');
    if (assigneeSelect) assigneeSelect.value = item.assignedTo || '';
    const descriptionArea = document.getElementById('edit-description');
    if (descriptionArea) descriptionArea.value = item.description || '';
    detailDrawer.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        const firstField = getFocusableElements(detailDrawer)[0] || drawerCloseBtn;
        firstField.focus();
    });
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
    if (drawerSaveInProgress) return;

    drawerSessionId += 1;
    detailDrawer.hidden = true;
    document.body.style.overflow = '';
    currentDrawerItem = null;
    drawerSaveInProgress = false;
    drawerOriginalUpdatedAt = null;
    drawerOriginalPropertiesSnapshot = null;
    drawerCloseBtn.removeAttribute('disabled');
    drawerCancelBtn.removeAttribute('disabled');
    drawerSaveBtn.removeAttribute('disabled');
    drawerSubtitle.textContent = '';
    drawerSubtitle.href = '#';
    drawerSubtitle.hidden = true;
    if (lastFocusedElement?.isConnected) {
        lastFocusedElement.focus();
    } else {
        const cardToFocus = [...document.querySelectorAll('.kanban-card')]
            .find(card => card.dataset.workItemId === lastFocusedWorkItemId)
            ?.querySelector('.card-open-button')
            || document.querySelector('.kanban-card .card-open-button');
        (cardToFocus || kanbanBoard || refreshBtn).focus();
    }
    lastFocusedElement = null;
    lastFocusedWorkItemId = null;
}

async function saveDrawerChanges() {
    if (!currentDrawerItem || drawerSaveInProgress) return;

    const drawerItem = currentDrawerItem;
    const itemId = drawerItem.id;
    const saveSessionId = drawerSessionId;

    const nameInput = document.getElementById('edit-name');
    const stateSelect = document.getElementById('edit-state');
    const assigneeSelect = document.getElementById('edit-assignee');
    const partNumberInput = document.getElementById('edit-partNumber');
    const descriptionInput = document.getElementById('edit-description');

    const updates = { id: itemId };
    let changed = false;

    const newName = nameInput ? nameInput.value.trim() : drawerItem.name || '';
    if (nameInput && !newName) {
        showError('Name cannot be blank.');
        nameInput.focus();
        return;
    }
    if (nameInput && newName !== (drawerItem.name || '')) {
        updates.name = newName;
        changed = true;
    }
    if (stateSelect && stateSelect.value !== drawerItem.state) {
        updates.state = stateSelect.value;
        changed = true;
    }
    if (assigneeSelect) {
        const newAssigneeId = assigneeSelect.value || null;
        if (newAssigneeId !== (drawerItem.assignedTo || null)) {
            updates.assignedTo = newAssigneeId || null;
            changed = true;
        }
    }
    if (partNumberInput && partNumberInput.value !== (drawerItem.partNumber || '')) {
        updates.partNumber = partNumberInput.value || null;
        changed = true;
    }
    if (descriptionInput && descriptionInput.value !== (drawerItem.description || '')) {
        updates.description = descriptionInput.value;
        changed = true;
    }

    // Check for property changes
    const propRows = document.querySelectorAll('.prop-row');
    const newProperties = {};
    const originalProperties = drawerItem.properties || {};
    const propertyKeys = new Set();
    let propsChanged = false;
    for (const row of propRows) {
        const keyField = row.querySelector('.prop-edit-key');
        const valField = row.querySelector('.prop-edit-value');
        const newKey = keyField.value.trim();
        const newVal = valField.value;
        const originalKey = keyField.dataset.originalKey;
        if (!newKey) {
            if (originalKey) {
                showError('Property keys cannot be blank. Remove the property instead.');
                keyField.focus();
                return;
            }
            continue;
        }
        if (propertyKeys.has(newKey)) {
            showError(`Property key "${newKey}" is duplicated.`);
            keyField.focus();
            return;
        }
        propertyKeys.add(newKey);
        newProperties[newKey] = newVal;
        if (newKey !== originalKey || newVal !== (originalProperties[originalKey] ?? '')) {
            propsChanged = true;
        }
    }
    const removedPropertyKeys = Object.keys(originalProperties).filter(originalKey => !(originalKey in newProperties));
    if (removedPropertyKeys.length > 0) {
        propsChanged = true;
    }
    if (propsChanged) {
        // Replace the key-value pair field so removed properties are deleted by omission.
        updates.properties = Object.keys(newProperties).length > 0 ? newProperties : null;
        changed = true;
    }

    if (!changed) {
        closeDrawer();
        return;
    }

    const currentItem = allWorkItems.find(workItem => workItem.id === itemId);
    const currentVersion = getWorkItemVersion(currentItem);
    const hasVersionConflict = !currentItem || (
        drawerOriginalUpdatedAt !== null
        && currentVersion !== drawerOriginalUpdatedAt
    );
    const hasPropertyConflict = currentItem
        && propsChanged
        && getPropertiesSnapshot(currentItem.properties) !== drawerOriginalPropertiesSnapshot;
    if (hasVersionConflict || hasPropertyConflict) {
        showError('This work item changed while it was open. Close and reopen it before saving.');
        return;
    }

    drawerSaveInProgress = true;
    drawerCloseBtn.setAttribute('disabled', '');
    drawerCancelBtn.setAttribute('disabled', '');
    drawerSaveBtn.setAttribute('disabled', '');
    const saveToken = Symbol(itemId);
    workItemSaveTokens.set(itemId, saveToken);
    try {
        const data = await persistWorkItemUpdates([updates], { replace: removedPropertyKeys.length > 0 });
        if (workItemSaveTokens.get(itemId) !== saveToken) {
            return;
        }

        if (data?.updatedWorkItems?.length > 0) {
            const updated = data.updatedWorkItems[0];
            const idx = allWorkItems.findIndex(w => w.id === itemId);
            if (idx !== -1) {
                allWorkItems[idx] = {
                    ...allWorkItems[idx],
                    ...updated,
                    ...(propsChanged ? { properties: updates.properties ?? null } : {}),
                };
            }
        }

        showSuccess('Work item updated');
        populateAssigneeFilter();
        renderBoard();
        if (drawerSessionId === saveSessionId && currentDrawerItem?.id === itemId) {
            drawerSaveInProgress = false;
            closeDrawer();
        }
    } catch (err) {
        console.error('Failed to save work item:', err);
        showError(`Failed to save: ${err.message}`);
    } finally {
        if (workItemSaveTokens.get(itemId) === saveToken) {
            workItemSaveTokens.delete(itemId);
        }
        if (drawerSessionId === saveSessionId) {
            drawerSaveInProgress = false;
            drawerCloseBtn.removeAttribute('disabled');
            drawerCancelBtn.removeAttribute('disabled');
            drawerSaveBtn.removeAttribute('disabled');
        }
    }
}

function renderDrawerContent(item) {
    const typeLabel = TYPE_LABELS[item.type] || item.type || 'Unknown';
    const typeIcon = TYPE_ICONS[item.type] || '📄';
    const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : '—';
    const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
    const plannedStartDate = item.schedule?.plannedStartDateTime;
    const plannedEndDate = item.schedule?.plannedEndDateTime;
    const earliestStartDate = item.timeline?.earliestStartDateTime;
    const dueTimelineDate = item.timeline?.dueDateTime;
    const plannedStartDisplay = plannedStartDate ? new Date(plannedStartDate).toLocaleString() : '—';
    const plannedEndDisplay = plannedEndDate ? new Date(plannedEndDate).toLocaleString() : '—';
    const earliestStartDisplay = earliestStartDate ? new Date(earliestStartDate).toLocaleString() : '—';
    const dueDateDisplay = dueTimelineDate ? new Date(dueTimelineDate).toLocaleString() : '—';
    const parentWorkItem = getParentWorkItemSummary(item);
    const parentWorkItemField = parentWorkItem
        ? `
        <div class="drawer-field">
            <span class="drawer-label">Parent</span>
            <span class="drawer-value"><a class="drawer-parent-link" href="${escapeAttr(getParentWorkItemUrl(parentWorkItem.id))}" target="_blank" rel="noopener noreferrer">${escapeHtml(parentWorkItem.label)}</a></span>
        </div>`
        : '';

    // Build assignee options
    const sortedUsers = getAssigneeEntries(item.assignedTo)
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
        ${parentWorkItemField}
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
            <span class="drawer-value">${escapeHtml(plannedStartDisplay)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Planned End</span>
            <span class="drawer-value">${escapeHtml(plannedEndDisplay)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Earliest Start</span>
            <span class="drawer-value">${escapeHtml(earliestStartDisplay)}</span>
        </div>
        <div class="drawer-field">
            <span class="drawer-label">Due Date</span>
            <span class="drawer-value">${escapeHtml(dueDateDisplay)}</span>
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
            <nimble-text-area id="edit-description" appearance="outline" rows="5"></nimble-text-area>
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

function getFocusableElements(container) {
    return [...container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), nimble-button:not([disabled]), nimble-select:not([disabled]), nimble-text-field:not([disabled]), nimble-text-area:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

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

function formatCardDateTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

function getParentWorkItemSummary(item) {
    if (!item) return null;

    const candidates = [];
    const pushCandidate = (value) => {
        if (!value) return;
        const text = String(value).trim();
        if (!text) return;
        if (!candidates.includes(text)) {
            candidates.push(text);
        }
    };

    // Common direct parent fields.
    pushCandidate(item.parentId);
    pushCandidate(item.parentID);
    pushCandidate(item.parentWorkItemId);
    pushCandidate(item.parent?.id);
    pushCandidate(item.parent?.workItemId);
    pushCandidate(item.parentWorkItem?.id);

    // Heuristic match for parent-related custom properties.
    if (item.properties && typeof item.properties === 'object') {
        for (const [key, value] of Object.entries(item.properties)) {
            if (!key) continue;
            if (/parent|work\s*order/i.test(String(key))) {
                pushCandidate(value);
            }
        }
    }

    for (const candidate of candidates) {
        const parent = allWorkItems.find(w => w.id === candidate);
        if (parent) {
            const label = (parent.name || '').trim();
            return { id: candidate, label: label ? `${label} (${candidate})` : candidate };
        }
    }

    if (candidates[0]) {
        return { id: candidates[0], label: candidates[0] };
    }

    return null;
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
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
