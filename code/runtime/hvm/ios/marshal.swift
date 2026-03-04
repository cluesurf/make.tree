// marshal.swift - Convert between Swift values and HVM terms.

// Tag constants (must match hvm.c)
let TAG_NUM: UInt8 = 30
let TAG_ERA: UInt8 = 11
let TAG_C00: UInt8 = 13
let TAG_C16: UInt8 = 29

// HVM value type for marshaling.
enum HvmValue {
    case num(Int)
    case str(String)
    case bool(Bool)
    case list([HvmValue])
    case handle(UInt32)
    case null
}

// Well-known constructor name IDs. Resolved at init time.
struct NameIds {
    let boolTrue: UInt32
    let boolFalse: UInt32
    let listCons: UInt32
    let listNil: UInt32
    let stringCons: UInt32
    let stringNil: UInt32
}

struct MarshalContext {
    let api: HvmApi
    let handles: HandleTable
    let ids: NameIds
}

func toTerm(input: (ctx: MarshalContext, value: HvmValue)) -> UInt64 {
    let ctx = input.ctx
    let api = ctx.api
    let ids = ctx.ids

    switch input.value {
    case .num(let n):
        return api.termNewNum(UInt32(n))

    case .str(let s):
        var term = api.termNewCtr(input: CtrInput(name: ids.stringNil, arity: 0, args: []))
        for ch in s.unicodeScalars.reversed() {
            let chTerm = api.termNewNum(UInt32(ch.value))
            let loc = api.heapAlloc(2)
            api.heapSet(input: HeapSetInput(loc: loc, term: chTerm))
            api.heapSet(input: HeapSetInput(loc: loc + 1, term: term))
            term = api.termNewCtr(input: CtrInput(name: ids.stringCons, arity: 2, args: [chTerm, term]))
        }
        return term

    case .bool(let b):
        let name = b ? ids.boolTrue : ids.boolFalse
        return api.termNewCtr(input: CtrInput(name: name, arity: 0, args: []))

    case .list(let items):
        var term = api.termNewCtr(input: CtrInput(name: ids.listNil, arity: 0, args: []))
        for item in items.reversed() {
            let elem = toTerm(input: (ctx: ctx, value: item))
            let loc = api.heapAlloc(2)
            api.heapSet(input: HeapSetInput(loc: loc, term: elem))
            api.heapSet(input: HeapSetInput(loc: loc + 1, term: term))
            term = api.termNewCtr(input: CtrInput(name: ids.listCons, arity: 2, args: [elem, term]))
        }
        return term

    case .handle(let id):
        return api.termNewNum(id)

    case .null:
        // ERA term: tag=11, ext=0, val=0
        return UInt64(TAG_ERA) << 56
    }
}

func fromTerm(input: (ctx: MarshalContext, term: UInt64)) -> HvmValue {
    let ctx = input.ctx
    let api = ctx.api
    let ids = ctx.ids
    let tag = api.termTag(input.term)

    if tag == TAG_NUM {
        return .num(Int(api.termExt(input.term)))
    }

    if tag == TAG_ERA {
        return .null
    }

    if tag >= TAG_C00 && tag <= TAG_C16 {
        let name = api.termExt(input.term)
        let arity = Int(tag) - Int(TAG_C00)

        if name == ids.boolTrue { return .bool(true) }
        if name == ids.boolFalse { return .bool(false) }

        if name == ids.stringCons || name == ids.stringNil {
            return .str(readString(input: (ctx: ctx, term: input.term)))
        }

        if name == ids.listCons || name == ids.listNil {
            return .list(readList(input: (ctx: ctx, term: input.term)))
        }

        // Generic constructor: read fields.
        var fields: [HvmValue] = []
        let loc = api.termVal(input.term)
        for i in 0..<arity {
            let field = api.wnf(api.heapRead(loc + UInt64(i)))
            fields.append(fromTerm(input: (ctx: ctx, term: field)))
        }
        return .list(fields)
    }

    return .null
}

private func readString(input: (ctx: MarshalContext, term: UInt64)) -> String {
    let ctx = input.ctx
    let api = ctx.api
    let ids = ctx.ids
    var chars: [Character] = []
    var current = input.term

    while true {
        let tag = api.termTag(current)
        guard tag >= TAG_C00 && tag <= TAG_C16 else { break }

        let name = api.termExt(current)
        if name == ids.stringNil { break }
        guard name == ids.stringCons else { break }

        let loc = api.termVal(current)
        let ch = api.wnf(api.heapRead(loc))
        chars.append(Character(UnicodeScalar(api.termExt(ch))!))
        current = api.wnf(api.heapRead(loc + 1))
    }

    return String(chars)
}

private func readList(input: (ctx: MarshalContext, term: UInt64)) -> [HvmValue] {
    let ctx = input.ctx
    let api = ctx.api
    let ids = ctx.ids
    var items: [HvmValue] = []
    var current = input.term

    while true {
        let tag = api.termTag(current)
        guard tag >= TAG_C00 && tag <= TAG_C16 else { break }

        let name = api.termExt(current)
        if name == ids.listNil { break }
        guard name == ids.listCons else { break }

        let loc = api.termVal(current)
        let head = api.wnf(api.heapRead(loc))
        items.append(fromTerm(input: (ctx: ctx, term: head)))
        current = api.wnf(api.heapRead(loc + 1))
    }

    return items
}
