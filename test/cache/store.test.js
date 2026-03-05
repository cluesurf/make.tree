import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createStore } from '@/cache/store';
function tmpRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'seed-cache-test-'));
}
describe('CacheStore', () => {
    const roots = [];
    afterEach(() => {
        for (const root of roots) {
            fs.rmSync(root, { recursive: true, force: true });
        }
        roots.length = 0;
    });
    function makeStore() {
        const root = tmpRoot();
        roots.push(root);
        return createStore({ root });
    }
    it('reads and writes metadata', () => {
        const store = makeStore();
        expect(store.getMeta()).toBe(null);
        store.setMeta({ meta: { version: '1', created: 1000 } });
        const meta = store.getMeta();
        expect(meta === null || meta === void 0 ? void 0 : meta.version).toBe('1');
        expect(meta === null || meta === void 0 ? void 0 : meta.created).toBe(1000);
    });
    it('reads and writes index', () => {
        const store = makeStore();
        expect(store.getIndex().files).toEqual({});
        store.setIndex({ index: { files: { 'a.tree': 'abc123' } } });
        const idx = store.getIndex();
        expect(idx.files['a.tree']).toBe('abc123');
    });
    it('reads and writes cached data', () => {
        const store = makeStore();
        expect(store.has({ hash: 'abc', phase: 'card' })).toBe(false);
        expect(store.read({ hash: 'abc', phase: 'card' })).toBe(null);
        const data = { form: 'test', list: [1, 2, 3] };
        store.write({ hash: 'abc', phase: 'card', data });
        expect(store.has({ hash: 'abc', phase: 'card' })).toBe(true);
        expect(store.read({ hash: 'abc', phase: 'card' })).toEqual(data);
    });
    it('reads and writes raw strings', () => {
        const store = makeStore();
        expect(store.readRaw({ name: 'graph.json' })).toBe(null);
        store.writeRaw({ name: 'graph.json', data: '{"deps":{}}' });
        expect(store.readRaw({ name: 'graph.json' })).toBe('{"deps":{}}');
    });
    it('clears all cached data', () => {
        const store = makeStore();
        store.setMeta({ meta: { version: '1', created: 1000 } });
        store.write({ hash: 'abc', phase: 'card', data: { x: 1 } });
        store.clear();
        expect(store.getMeta()).toBe(null);
        expect(store.has({ hash: 'abc', phase: 'card' })).toBe(false);
    });
});
//# sourceMappingURL=store.test.js.map