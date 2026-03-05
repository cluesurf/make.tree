import { describe, it, expect } from 'vitest';
import { makeSite, joinSite, VOID_SITE, testBrewSite, testCardSite, } from '@/kink/site';
describe('kink/site', () => {
    describe('makeSite', () => {
        it('creates a card-site with correct positions', () => {
            const site = makeSite({
                link: 'code/math.tree',
                base: { line: 5, mark: 10 },
                head: { line: 5, mark: 22 },
            });
            expect(site.form).toBe('card-site');
            expect(site.link).toBe('code/math.tree');
            expect(site.base).toEqual({ line: 5, mark: 10 });
            expect(site.head).toEqual({ line: 5, mark: 22 });
        });
    });
    describe('joinSite', () => {
        it('spans from base of first to head of second', () => {
            const a = makeSite({
                link: 'code/app.tree',
                base: { line: 1, mark: 1 },
                head: { line: 1, mark: 5 },
            });
            const b = makeSite({
                link: 'code/app.tree',
                base: { line: 3, mark: 1 },
                head: { line: 3, mark: 20 },
            });
            const joined = joinSite({ base: a, head: b });
            expect(joined.form).toBe('card-site');
            expect(joined.link).toBe('code/app.tree');
            expect(joined.base).toEqual({ line: 1, mark: 1 });
            expect(joined.head).toEqual({ line: 3, mark: 20 });
        });
    });
    describe('VOID_SITE', () => {
        it('is a brew-site', () => {
            expect(VOID_SITE.form).toBe('brew-site');
        });
        it('has no link, base, or head', () => {
            const site = VOID_SITE;
            expect('link' in site).toBe(false);
            expect('base' in site).toBe(false);
            expect('head' in site).toBe(false);
        });
    });
    describe('testBrewSite', () => {
        it('returns true for brew-site', () => {
            expect(testBrewSite(VOID_SITE)).toBe(true);
        });
        it('returns false for card-site', () => {
            const site = makeSite({
                link: 'test.tree',
                base: { line: 1, mark: 1 },
                head: { line: 1, mark: 5 },
            });
            expect(testBrewSite(site)).toBe(false);
        });
    });
    describe('testCardSite', () => {
        it('returns true for card-site', () => {
            const site = makeSite({
                link: 'test.tree',
                base: { line: 1, mark: 1 },
                head: { line: 1, mark: 5 },
            });
            expect(testCardSite(site)).toBe(true);
        });
        it('returns false for brew-site', () => {
            expect(testCardSite(VOID_SITE)).toBe(false);
        });
    });
});
//# sourceMappingURL=site.test.js.map