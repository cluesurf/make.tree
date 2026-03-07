// loop.kt - IO action interpreter for Android.

package surf.clue.hvm

typealias NativePrimFn = (MarshalContext, String, Long) -> HvmValue

data class IoNameIds(
    val ioDone: Int,
    val ioCall: Int,
    val ioBind: Int,
)

data class IoContext(
    val marshal: MarshalContext,
    val ids: IoNameIds,
    val prims: Map<String, NativePrimFn>,
)

fun runIo(input: Pair<IoContext, Long>): HvmValue {
    val (ctx, startTerm) = input
    val ids = ctx.ids

    var current = HvmNative.hvmWnf(startTerm)

    while (true) {
        val name = HvmNative.hvmTermExt(current)

        if (name == ids.ioDone) {
            val loc = HvmNative.hvmTermVal(current)
            // Skip magic field at loc+0, value is at loc+1
            val value = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + 1))
            return fromTerm(ctx.marshal to value)
        }

        if (name == ids.ioCall) {
            val loc = HvmNative.hvmTermVal(current)
            // Skip magic field at loc+0; func/argm/cont at loc+1/+2/+3
            val primNameTerm = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + 1))
            val primName = fromTerm(ctx.marshal to primNameTerm)

            require(primName is HvmValue.Str) {
                "IO.call: expected string prim name"
            }

            val arg = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + 2))
            val cont = HvmNative.hvmHeapRead(loc + 3)

            val handler = ctx.prims[primName.value]
                ?: error("Unknown native primitive: ${primName.value}")

            val result = handler(ctx.marshal, primName.value, arg)
            val hvmResult = toTerm(ctx.marshal to result)

            current = HvmNative.hvmWnf(HvmNative.hvmTermNewApp(cont, hvmResult))
            continue
        }

        if (name == ids.ioBind) {
            val loc = HvmNative.hvmTermVal(current)
            // Skip magic field at loc+0; action/cont at loc+1/+2
            val action = HvmNative.hvmHeapRead(loc + 1)
            val cont = HvmNative.hvmHeapRead(loc + 2)

            val actionResult = runIo(ctx to action)
            val hvmResult = toTerm(ctx.marshal to actionResult)

            current = HvmNative.hvmWnf(HvmNative.hvmTermNewApp(cont, hvmResult))
            continue
        }

        error("Unknown IO action: $name")
    }
}
