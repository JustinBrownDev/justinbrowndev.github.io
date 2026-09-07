const TODO_SCHEMA = 'jweb.todo-list.v1';
const TODO_ITEM_SCHEMA = 'jweb.todo-item.v1';
export const SPAWN_TODO_SOURCE_URL = new URL('../TODO.md', import.meta.url);

function hashText(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function parseSpawnTodoText(text = '', { source = 'TODO.md' } = {}) {
    const items = [];
    const duplicateCounts = new Map();
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        // Flat v1 on purpose: indentation is not silently interpreted as parentage.
        const match = line.match(/^[-*+]\s+(?:\[([ xX])\]\s*)?(.+?)\s*$/);
        if (!match) continue;
        const checkbox = match[1];
        const body = match[2].trim();
        if (!body || body.startsWith('<!--')) continue;
        const state = checkbox && checkbox.toLowerCase() === 'x' ? 'done' : 'open';
        if (state !== 'open') continue;
        const normalized = body.replace(/\s+/g, ' ');
        const identityText = normalized.toLowerCase();
        const occurrence = (duplicateCounts.get(identityText) ?? 0) + 1;
        duplicateCounts.set(identityText, occurrence);
        items.push(Object.freeze({
            schema: TODO_ITEM_SCHEMA,
            id: `todo:${hashText(identityText)}:${occurrence}`,
            text: normalized,
            state,
            source: Object.freeze({ file: source, line: index + 1 }),
        }));
    }
    return Object.freeze({
        schema: TODO_SCHEMA,
        source,
        items: Object.freeze(items),
    });
}

function unavailableList() {
    return Object.freeze({
        schema: TODO_SCHEMA,
        source: 'TODO.md',
        items: Object.freeze([]),
        unavailable: true,
    });
}

export async function loadSpawnTodoList({ fetchImpl = globalThis.fetch, url = SPAWN_TODO_SOURCE_URL } = {}) {
    if (typeof fetchImpl !== 'function') return unavailableList();
    try {
        const response = await fetchImpl(url, { cache: 'no-store' });
        if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
        return parseSpawnTodoText(await response.text(), { source: 'TODO.md' });
    } catch (error) {
        console.warn?.('[spawn-todo] TODO.md unavailable; spawn remains playable', error);
        return unavailableList();
    }
}
