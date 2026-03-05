import { describe, it, expect } from 'vitest';
import { createGraph, addEdge, getDirtySet, serializeGraph, deserializeGraph, } from '@/cache/graph';
describe('DepGraph', () => {
    it('tracks forward and reverse dependencies', () => {
        var _a, _b;
        const g = createGraph();
        addEdge({ graph: g, from: 'a.tree', to: 'b.tree' });
        expect((_a = g.deps.get('a.tree')) === null || _a === void 0 ? void 0 : _a.has('b.tree')).toBe(true);
        expect((_b = g.rdeps.get('b.tree')) === null || _b === void 0 ? void 0 : _b.has('a.tree')).toBe(true);
    });
    it('computes dirty set from changed files', () => {
        const g = createGraph();
        // a depends on b, b depends on c
        addEdge({ graph: g, from: 'a.tree', to: 'b.tree' });
        addEdge({ graph: g, from: 'b.tree', to: 'c.tree' });
        // c changes: everything that depends on c is dirty
        const dirty = getDirtySet({ graph: g, changed: new Set(['c.tree']) });
        expect(dirty.has('c.tree')).toBe(true);
        expect(dirty.has('b.tree')).toBe(true);
        expect(dirty.has('a.tree')).toBe(true);
    });
    it('limits dirty set to actual dependents', () => {
        const g = createGraph();
        addEdge({ graph: g, from: 'a.tree', to: 'b.tree' });
        addEdge({ graph: g, from: 'c.tree', to: 'd.tree' });
        // b changes: only a is dirty (not c or d)
        const dirty = getDirtySet({ graph: g, changed: new Set(['b.tree']) });
        expect(dirty.has('b.tree')).toBe(true);
        expect(dirty.has('a.tree')).toBe(true);
        expect(dirty.has('c.tree')).toBe(false);
        expect(dirty.has('d.tree')).toBe(false);
    });
    it('serializes and deserializes round-trip', () => {
        var _a, _b, _c, _d;
        const g = createGraph();
        addEdge({ graph: g, from: 'x.tree', to: 'y.tree' });
        addEdge({ graph: g, from: 'y.tree', to: 'z.tree' });
        const json = serializeGraph({ graph: g });
        const g2 = deserializeGraph({ json });
        expect((_a = g2.deps.get('x.tree')) === null || _a === void 0 ? void 0 : _a.has('y.tree')).toBe(true);
        expect((_b = g2.deps.get('y.tree')) === null || _b === void 0 ? void 0 : _b.has('z.tree')).toBe(true);
        expect((_c = g2.rdeps.get('y.tree')) === null || _c === void 0 ? void 0 : _c.has('x.tree')).toBe(true);
        expect((_d = g2.rdeps.get('z.tree')) === null || _d === void 0 ? void 0 : _d.has('y.tree')).toBe(true);
    });
    it('handles empty graph', () => {
        const g = createGraph();
        const dirty = getDirtySet({ graph: g, changed: new Set(['a.tree']) });
        expect(dirty.size).toBe(1);
        expect(dirty.has('a.tree')).toBe(true);
    });
});
//# sourceMappingURL=graph.test.js.map