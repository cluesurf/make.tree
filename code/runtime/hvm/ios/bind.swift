// bind.swift - Swift wrapper around the HVM C API (hvm_lib.h).
//
// Imports the HVM module via C interop (module.modulemap + hvm_lib.h)
// and provides a typed Swift API.

import HVM

struct HvmApi {
    func initialize(input: InitInput) {
        hvm_init(input.threads, input.debug ? 1 : 0, input.silent ? 1 : 0, Int32(input.steps))
    }

    func shutdown() {
        hvm_free()
    }

    func prepareText(input: PrepareTextInput) -> (mainId: UInt32, success: Bool) {
        var mainId: UInt32 = 0
        let result = hvm_prepare_text(&mainId, input.srcPath, input.srcText)
        return (mainId, result != 0)
    }

    func wnf(_ term: UInt64) -> UInt64 {
        return hvm_wnf(term)
    }

    func normalize(_ term: UInt64) -> UInt64 {
        return hvm_normalize(term)
    }

    // Term constructors

    func termNewNum(_ n: UInt32) -> UInt64 {
        return hvm_term_new_num(n)
    }

    func termNewCtr(input: CtrInput) -> UInt64 {
        var args = input.args
        return args.withUnsafeMutableBufferPointer { buf in
            hvm_term_new_ctr(input.name, input.arity, buf.baseAddress)
        }
    }

    func termNewSup(input: SupInput) -> UInt64 {
        return hvm_term_new_sup(input.label, input.a, input.b)
    }

    func termNewDup(input: DupInput) -> UInt64 {
        return hvm_term_new_dup(input.label, input.expr, input.body)
    }

    func termNewApp(input: AppInput) -> UInt64 {
        return hvm_term_new_app(input.f, input.x)
    }

    func termNewLam(_ body: UInt64) -> UInt64 {
        return hvm_term_new_lam(body)
    }

    func termNewLamAt(input: LamAtInput) -> UInt64 {
        return hvm_term_new_lam_at(input.loc, input.body)
    }

    func termNewVar(_ loc: UInt64) -> UInt64 {
        return hvm_term_new_var(loc)
    }

    func termNewRef(_ id: UInt32) -> UInt64 {
        return hvm_term_new_ref(id)
    }

    // Term accessors

    func termTag(_ term: UInt64) -> UInt8 {
        return hvm_term_tag(term)
    }

    func termExt(_ term: UInt64) -> UInt32 {
        return hvm_term_ext(term)
    }

    func termVal(_ term: UInt64) -> UInt64 {
        return hvm_term_val(term)
    }

    // Heap

    func heapRead(_ loc: UInt64) -> UInt64 {
        return hvm_heap_read(loc)
    }

    func heapSet(input: HeapSetInput) {
        hvm_heap_set(input.loc, input.term)
    }

    func heapAlloc(_ words: UInt64) -> UInt64 {
        return hvm_heap_alloc(words)
    }

    // Symbol table

    func tableFind(input: TableFindInput) -> UInt32 {
        return input.name.withCString { ptr in
            hvm_table_find(ptr, UInt32(input.name.utf8.count))
        }
    }
}

// Input types

struct InitInput {
    let threads: UInt32
    let debug: Bool
    let silent: Bool
    let steps: Int

    init(threads: UInt32, debug: Bool = false, silent: Bool = true, steps: Int = 0) {
        self.threads = threads
        self.debug = debug
        self.silent = silent
        self.steps = steps
    }
}

struct PrepareTextInput {
    let srcPath: String
    let srcText: String
}

struct CtrInput {
    let name: UInt32
    let arity: UInt32
    var args: [UInt64]
}

struct SupInput {
    let label: UInt32
    let a: UInt64
    let b: UInt64
}

struct DupInput {
    let label: UInt32
    let expr: UInt64
    let body: UInt64
}

struct AppInput {
    let f: UInt64
    let x: UInt64
}

struct LamAtInput {
    let loc: UInt64
    let body: UInt64
}

struct HeapSetInput {
    let loc: UInt64
    let term: UInt64
}

struct TableFindInput {
    let name: String
}
