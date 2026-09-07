import { SPAWN_TODO_ITEMS } from './spawn-todo-source.js';

const TODO_SCHEMA = 'jweb.todo-list.v1';
const TODO_ITEM_SCHEMA = 'jweb.todo-item.v1';

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
        source: 'spawn-todo-source.js',
        items: Object.freeze([]),
        unavailable: true,
    });
}

// Same normalized shape as parseSpawnTodoText, but for the inline data
// source instead of Markdown text: an entry is a bare string (an open
// task) or { text, state } if you want to mark one done without deleting it.
function normalizeSpawnTodoItems(rawItems = [], { source = 'spawn-todo-source.js' } = {}) {
    const items = [];
    const duplicateCounts = new Map();
    rawItems.forEach((raw, index) => {
        const entry = typeof raw === 'string' ? { text: raw } : (raw ?? {});
        const text = String(entry.text ?? '').trim().replace(/\s+/g, ' ');
        if (!text) return;
        const state = entry.state === 'done' ? 'done' : 'open';
        if (state !== 'open') return;
        const identityText = text.toLowerCase();
        const occurrence = (duplicateCounts.get(identityText) ?? 0) + 1;
        duplicateCounts.set(identityText, occurrence);
        items.push(Object.freeze({
            schema: TODO_ITEM_SCHEMA,
            id: `todo:${hashText(identityText)}:${occurrence}`,
            text,
            state,
            source: Object.freeze({ file: source, line: index + 1 }),
        }));
    });
    return Object.freeze({
        schema: TODO_SCHEMA,
        source,
        items: Object.freeze(items),
    });
}

export async function loadSpawnTodoList() {
    try {
        return normalizeSpawnTodoItems(SPAWN_TODO_ITEMS);
    } catch (error) {
        console.warn?.('[spawn-todo] inline TODO source unavailable; spawn remains playable', error);
        return unavailableList();
    }
}
