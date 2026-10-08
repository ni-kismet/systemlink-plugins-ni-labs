import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as i18n from '../app/i18n.js';

const source = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8')
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/gm, '')
    .replace('import.meta.env.DEV', 'false');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createHarness() {
    const elements = new Map();
    const cards = [];
    const renders = [];
    const pendingUpdates = [];
    const context = vm.createContext({
        URLSearchParams,
        Intl,
        ...i18n,
        window: { location: { origin: 'http://localhost', search: '?demo=0' } },
        document: {
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, { setAttribute() {}, removeAttribute() {} });
                }
                return elements.get(id);
            },
            querySelectorAll() { return cards; },
        },
        console: { warn() {}, error() {} },
        createWorkItemClient: config => config,
        createWorkItemConfig: config => config,
        createUserClient: config => config,
        createUserConfig: config => config,
        queryWorkItems: async () => ({ data: { workItems: [{ id: 'probe', state: 'NEW' }] } }),
        queryUsers: async () => ({ data: { users: [{ id: 'user', firstName: 'Alex', lastName: 'Morgan' }] } }),
        updateWorkItems() {
            const request = deferred();
            pendingUpdates.push(request);
            return request.promise;
        },
        recordRender(items) { renders.push(items.map(item => ({ ...item }))); },
    });
    vm.runInContext(source, context);
    vm.runInContext(`
        allWorkItems = [{ id: 'probe', name: 'Probe', state: 'NEW', assignedTo: 'user' }];
        renderBoard = () => recordRender(allWorkItems);
        populateTypeFilter = () => {};
        populateAssigneeFilter = () => {};
        showSuccess = () => {};
        showError = () => {};
    `, context);

    return {
        context, cards, renders, pendingUpdates,
        state: () => vm.runInContext('allWorkItems[0].state', context),
        async drop(state) {
            vm.runInContext('draggedItem = allWorkItems[0]', context);
            const completion = context.onDrop({
                preventDefault() {},
                currentTarget: {
                    classList: { remove() {} },
                    closest: () => ({ dataset: { state } }),
                },
            });
            return { completion };
        },
    };
}

async function waitForUpdates(harness, count) {
    for (let attempt = 0; attempt < 20 && harness.pendingUpdates.length < count; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(harness.pendingUpdates.length, count);
}

for (const firstSucceeds of [false, true]) {
    test(`queued move failure rolls back to the confirmed state (first succeeds: ${firstSucceeds})`, async () => {
        const harness = createHarness();
        const first = await harness.drop('DEFINED');
        await waitForUpdates(harness, 1);
        const second = await harness.drop('REVIEWED');
        if (firstSucceeds) {
            harness.pendingUpdates[0].resolve({ data: { updatedWorkItems: [{ id: 'probe', state: 'DEFINED' }] } });
        } else {
            harness.pendingUpdates[0].reject(new Error('Rejected move'));
        }
        await waitForUpdates(harness, 2);
        harness.pendingUpdates[1].reject(new Error('Rejected move'));
        await Promise.all([first.completion, second.completion]);
        assert.equal(harness.state(), firstSucceeds ? 'DEFINED' : 'NEW');
        assert.equal(harness.renders.at(-1)[0].state, harness.state());
    });
}

for (const succeeds of [false, true]) {
    test(`refresh preserves a pending move and renders its outcome (succeeds: ${succeeds})`, async () => {
        const harness = createHarness();
        const move = await harness.drop('DEFINED');
        await waitForUpdates(harness, 1);
        await harness.context.loadWorkItems();
        assert.equal(harness.state(), 'DEFINED');
        if (succeeds) {
            harness.pendingUpdates[0].resolve({ data: { updatedWorkItems: [{ id: 'probe', state: 'DEFINED' }] } });
        } else {
            harness.pendingUpdates[0].reject(new Error('Rejected move'));
        }
        await move.completion;
        assert.equal(harness.state(), succeeds ? 'DEFINED' : 'NEW');
        assert.equal(harness.renders.at(-1)[0].state, harness.state());
    });
}

test('a successful move renders the returned server state', async () => {
    const harness = createHarness();
    const move = await harness.drop('DEFINED');
    await waitForUpdates(harness, 1);
    harness.pendingUpdates[0].resolve({ data: { updatedWorkItems: [{ id: 'probe', state: 'REVIEWED' }] } });
    await move.completion;
    assert.equal(harness.renders.at(-1)[0].state, 'REVIEWED');
});

test('user loading updates labels without rebuilding active inline editors', async () => {
    const harness = createHarness();
    const label = { textContent: 'Unknown User', title: 'Unknown User' };
    const card = {
        dataset: { workItemId: 'probe' },
        querySelector: () => label,
        setAttribute(name, value) { this[name] = value; },
    };
    const editingCard = { ...card, querySelector: () => null };
    harness.cards.push(card, editingCard);
    await harness.context.loadAllUsers();
    assert.equal(harness.renders.length, 0);
    assert.equal(label.textContent, 'Alex Morgan');
    assert.equal(label.title, 'Alex Morgan');
    assert.match(card['aria-label'], /Alex Morgan/);
});