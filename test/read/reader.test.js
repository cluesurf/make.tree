/**
 * Tests for the reader: parse .tree text → Surface AST.
 *
 * Verifies that all language constructs are correctly read into
 * the appropriate SurfCard nodes.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function read(text) {
    const lead = makeTree({ file: 'test.tree', text });
    if (!lead || !lead.tree)
        throw new Error('Parse failed');
    return readCard({ tree: lead.tree, file: 'test.tree' });
}
function find(card, form) {
    return card.list.find(n => n.form === form);
}
describe('book namespace', () => {
    it('reads book with nested definitions', () => {
        var _a;
        const card = read(`
book math
  task add
    take a, like u64
    take b, like u64
    send back, mark 0
`);
        const book = find(card, 'book');
        expect(book).toBeDefined();
        if ((book === null || book === void 0 ? void 0 : book.form) === 'book') {
            expect(book.name).toBe('math');
            expect(book.list.length).toBeGreaterThan(0);
            expect((_a = book.list[0]) === null || _a === void 0 ? void 0 : _a.form).toBe('task');
        }
    });
});
describe('beam statement', () => {
    it('reads beam with name and children', () => {
        const card = read(`
task example
  beam self
    save x, mark 1
`);
        const task = find(card, 'task');
        expect(task).toBeDefined();
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const beam = task.flow.find(n => n.form === 'beam');
            expect(beam).toBeDefined();
            if ((beam === null || beam === void 0 ? void 0 : beam.form) === 'beam') {
                expect(beam.name).toBe('self');
                expect(beam.flow.length).toBeGreaterThan(0);
            }
        }
    });
});
describe('slot statement', () => {
    it('reads slot with name', () => {
        const card = read(`
form example
  slot self
`);
        const form = find(card, 'form');
        expect(form).toBeDefined();
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            const slot = form.bond.find(n => n.form === 'slot');
            expect(slot).toBeDefined();
            if ((slot === null || slot === void 0 ? void 0 : slot.form) === 'slot') {
                expect(slot.name).toBe('self');
            }
        }
    });
});
describe('next statement', () => {
    it('reads next inside a loop', () => {
        const card = read(`
task example
  walk list
    read items
    hook tick
      take item
      next
`);
        const task = find(card, 'task');
        expect(task).toBeDefined();
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const walk = task.flow.find(n => n.form === 'walk');
            if ((walk === null || walk === void 0 ? void 0 : walk.form) === 'walk') {
                const hook = walk.hook[0];
                if (hook) {
                    const nextNode = hook.flow.find(n => n.form === 'next');
                    expect(nextNode).toBeDefined();
                }
            }
        }
    });
});
describe('halt with term', () => {
    it('reads halt flow with message', () => {
        const card = read(`
task example
  halt flow, text <stopped>
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const halt = task.flow.find(n => n.form === 'halt');
            expect(halt).toBeDefined();
            if ((halt === null || halt === void 0 ? void 0 : halt.form) === 'halt') {
                expect(halt.term).toBe('flow');
                expect(halt.sift).toBeDefined();
            }
        }
    });
    it('reads halt fork', () => {
        const card = read(`
task example
  halt fork
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const halt = task.flow.find(n => n.form === 'halt');
            if ((halt === null || halt === void 0 ? void 0 : halt.form) === 'halt') {
                expect(halt.term).toBe('fork');
            }
        }
    });
    it('reads halt kink', () => {
        const card = read(`
task example
  halt kink
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const halt = task.flow.find(n => n.form === 'halt');
            if ((halt === null || halt === void 0 ? void 0 : halt.form) === 'halt') {
                expect(halt.term).toBe('kink');
            }
        }
    });
    it('reads bare halt', () => {
        const card = read(`
task example
  halt
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const halt = task.flow.find(n => n.form === 'halt');
            if ((halt === null || halt === void 0 ? void 0 : halt.form) === 'halt') {
                expect(halt.term).toBeUndefined();
                expect(halt.sift).toBeUndefined();
            }
        }
    });
});
describe('firm modifier', () => {
    it('reads firm on task', () => {
        const card = read(`
task stable-api
  firm true
  send back, mark 0
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            expect(task.firm).toBe(true);
        }
    });
    it('reads firm on form', () => {
        const card = read(`
form public-type
  firm true
  link value, like u64
`);
        const form = find(card, 'form');
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            expect(form.firm).toBe(true);
        }
    });
});
describe('hide modifier', () => {
    it('reads hide on task', () => {
        const card = read(`
task internal
  hide true
  send back, mark 0
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            expect(task.hide).toBe(true);
        }
    });
    it('reads hide on form', () => {
        const card = read(`
form internal-type
  hide true
  link value, like u64
`);
        const form = find(card, 'form');
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            expect(form.hide).toBe(true);
        }
    });
});
describe('hold constraint', () => {
    it('reads hold on form', () => {
        const card = read(`
form positive
  link value, like u64
  hold
    call is-valid
`);
        const form = find(card, 'form');
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            expect(form.hold).toBeDefined();
            expect(form.hold.length).toBeGreaterThan(0);
        }
    });
});
describe('base default value', () => {
    it('reads base on take parameter', () => {
        var _a;
        const card = read(`
task example
  take x, like u64
    base mark 0
  send back, read x
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const param = task.base[0];
            expect(param).toBeDefined();
            if (param) {
                expect(param.name).toBe('x');
                expect(param.fall).toBeDefined();
                if (((_a = param.fall) === null || _a === void 0 ? void 0 : _a.form) === 'sift-mark') {
                    expect(param.fall.val).toBe(0);
                }
            }
        }
    });
});
describe('type-and intersection type', () => {
    it('reads like and with multiple types', () => {
        var _a;
        const card = read(`
form combined
  link value
    like and
      like readable
      like writable
`);
        const form = find(card, 'form');
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            const link = form.link[0];
            if (((_a = link === null || link === void 0 ? void 0 : link.like) === null || _a === void 0 ? void 0 : _a.form) === 'type-and') {
                expect(link.like.list.length).toBe(2);
            }
        }
    });
});
describe('generic type args', () => {
    it('reads like list with nested like', () => {
        var _a, _b;
        const card = read(`
form container
  link items
    like list
      like u64
`);
        const form = find(card, 'form');
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            const link = form.link[0];
            if (((_a = link === null || link === void 0 ? void 0 : link.like) === null || _a === void 0 ? void 0 : _a.form) === 'type-name') {
                expect(link.like.name).toBe('list');
                expect(link.like.args).toBeDefined();
                expect(link.like.args.length).toBe(1);
                if (((_b = link.like.args[0]) === null || _b === void 0 ? void 0 : _b.form) === 'type-name') {
                    expect(link.like.args[0].name).toBe('u64');
                }
            }
        }
    });
});
describe('fork roll', () => {
    it('reads fork roll with hook test and hook fall', () => {
        var _a, _b;
        const card = read(`
task classify
  take x, like u64
  fork roll
    hook test
      call gt
        bind a, read x
        bind b, mark 100
      send back, text <big>
    hook fall
      send back, text <small>
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const fork = task.flow.find(n => n.form === 'fork');
            if ((fork === null || fork === void 0 ? void 0 : fork.form) === 'fork') {
                expect(fork.mode).toBe('roll');
                expect(fork.hook.length).toBe(2);
                expect((_a = fork.hook[0]) === null || _a === void 0 ? void 0 : _a.name).toBe('test');
                expect((_b = fork.hook[1]) === null || _b === void 0 ? void 0 : _b.name).toBe('fall');
            }
        }
    });
});
describe('fork tree', () => {
    it('reads fork tree as scoped block', () => {
        const card = read(`
task example
  fork tree
    save x, mark 1
    save y, mark 2
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const fork = task.flow.find(n => n.form === 'fork');
            if ((fork === null || fork === void 0 ? void 0 : fork.form) === 'fork') {
                expect(fork.mode).toBe('tree');
            }
        }
    });
});
describe('walk size', () => {
    it('reads walk size with range and hook', () => {
        const card = read(`
task example
  walk size
    mark 0
    mark 10
    hook step
      take i
      show read i
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const walk = task.flow.find(n => n.form === 'walk');
            if ((walk === null || walk === void 0 ? void 0 : walk.form) === 'walk') {
                expect(walk.mode).toBe('size');
                expect(walk.hook.length).toBeGreaterThan(0);
            }
        }
    });
});
describe('walk site', () => {
    it('reads walk site with iterator', () => {
        const card = read(`
task example
  walk site
    read iter
    hook tick
      take item
      show read item
`);
        const task = find(card, 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            const walk = task.flow.find(n => n.form === 'walk');
            if ((walk === null || walk === void 0 ? void 0 : walk.form) === 'walk') {
                expect(walk.mode).toBe('site');
                expect(walk.hook.length).toBeGreaterThan(0);
            }
        }
    });
});
describe('test declaration', () => {
    it('reads test with name and body', () => {
        const card = read(`
test addition
  save result
    call add
      bind a, mark 1
      bind b, mark 2
`);
        const test = find(card, 'test');
        expect(test).toBeDefined();
        if ((test === null || test === void 0 ? void 0 : test.form) === 'test') {
            expect(test.name).toBe('addition');
            expect(test.flow.length).toBeGreaterThan(0);
        }
    });
});
//# sourceMappingURL=reader.test.js.map