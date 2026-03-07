// loop.swift - IO action interpreter for iOS.
//
// Reduces HVM IO actions, dispatches native primitives,
// and feeds results back as continuations.

typealias NativePrimFn = (MarshalContext, String, UInt64) -> HvmValue

struct IoNameIds {
    let ioDone: UInt32
    let ioCall: UInt32
    let ioBind: UInt32
}

struct IoContext {
    let marshal: MarshalContext
    let ids: IoNameIds
    let prims: [String: NativePrimFn]
}

func runIo(input: (ctx: IoContext, term: UInt64)) -> HvmValue {
    let ctx = input.ctx
    let api = ctx.marshal.api
    let ids = ctx.ids

    var current = api.wnf(input.term)

    while true {
        let name = api.termExt(current)

        if name == ids.ioDone {
            let loc = api.termVal(current)
            // Skip magic field at loc+0, value is at loc+1
            let value = api.wnf(api.heapRead(loc + 1))
            return fromTerm(input: (ctx: ctx.marshal, term: value))
        }

        if name == ids.ioCall {
            let loc = api.termVal(current)
            // Skip magic field at loc+0; func/argm/cont at loc+1/+2/+3
            let primNameTerm = api.wnf(api.heapRead(loc + 1))
            let primName = fromTerm(input: (ctx: ctx.marshal, term: primNameTerm))

            guard case .str(let primStr) = primName else {
                fatalError("IO.call: expected string prim name")
            }

            let arg = api.wnf(api.heapRead(loc + 2))
            let cont = api.heapRead(loc + 3)

            guard let handler = ctx.prims[primStr] else {
                fatalError("Unknown native primitive: \(primStr)")
            }

            let result = handler(ctx.marshal, primStr, arg)
            let hvmResult = toTerm(input: (ctx: ctx.marshal, value: result))

            current = api.wnf(api.termNewApp(input: AppInput(f: cont, x: hvmResult)))
            continue
        }

        if name == ids.ioBind {
            let loc = api.termVal(current)
            // Skip magic field at loc+0; action/cont at loc+1/+2
            let action = api.heapRead(loc + 1)
            let cont = api.heapRead(loc + 2)

            let actionResult = runIo(input: (ctx: ctx, term: action))
            let hvmResult = toTerm(input: (ctx: ctx.marshal, value: actionResult))

            current = api.wnf(api.termNewApp(input: AppInput(f: cont, x: hvmResult)))
            continue
        }

        fatalError("Unknown IO action: \(name)")
    }
}
