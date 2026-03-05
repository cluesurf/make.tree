import { describe, it, expect } from 'vitest';
import { readMintFile } from '@/mill/mint/read';
/** Helper to create a minimal TreeLink. */
function makeLink(text, list = []) {
    return { form: 'link', text, list };
}
/** Helper to create a Tree. */
function makeTree(list) {
    return { form: 'tree', list };
}
describe('mill/mint/read', () => {
    describe('readMintFile', () => {
        it('parses an empty tree into an empty file', () => {
            const tree = makeTree([]);
            const file = readMintFile({ tree, file: 'test.note' });
            expect(file.load).toEqual([]);
            expect(file.formList).toEqual([]);
        });
        it('parses a mint definition', () => {
            const tree = makeTree([
                makeLink('mint', [
                    makeLink('make', [
                        makeLink('bind', []),
                        makeLink('turn', [
                            makeLink('seed', []),
                        ]),
                    ]),
                ]),
            ]);
            const file = readMintFile({ tree, file: 'test.note' });
            expect(file.formList.length).toBe(1);
            expect(file.formList[0].form).toBe('mint-def');
        });
    });
});
//# sourceMappingURL=read.test.js.map