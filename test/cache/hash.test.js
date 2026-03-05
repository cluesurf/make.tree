import { describe, it, expect } from 'vitest';
import { hashContent } from '@/cache/hash';
describe('hashContent', () => {
    it('returns a 16-char hex string', () => {
        const hash = hashContent({ content: 'hello world' });
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
    it('returns the same hash for the same content', () => {
        const a = hashContent({ content: 'test content' });
        const b = hashContent({ content: 'test content' });
        expect(a).toBe(b);
    });
    it('returns different hashes for different content', () => {
        const a = hashContent({ content: 'file a' });
        const b = hashContent({ content: 'file b' });
        expect(a).not.toBe(b);
    });
    it('handles empty string', () => {
        const hash = hashContent({ content: '' });
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
});
//# sourceMappingURL=hash.test.js.map