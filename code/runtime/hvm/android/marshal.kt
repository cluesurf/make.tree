// marshal.kt - Convert between Kotlin values and HVM terms.

package surf.clue.hvm

// Tag constants (must match hvm.c)
const val TAG_NUM: Int = 30
const val TAG_ERA: Int = 11
const val TAG_C00: Int = 13
const val TAG_C16: Int = 29

sealed class HvmValue {
    data class Num(val value: Int) : HvmValue()
    data class Str(val value: String) : HvmValue()
    data class Bool(val value: Boolean) : HvmValue()
    data class HvmList(val value: List<HvmValue>) : HvmValue()
    data class Handle(val id: Int) : HvmValue()
    data object Null : HvmValue()
}

data class NameIds(
    val boolTrue: Int,
    val boolFalse: Int,
    val listCons: Int,
    val listNil: Int,
    val stringCons: Int,
    val stringNil: Int,
)

data class MarshalContext(
    val handles: HandleTable,
    val ids: NameIds,
)

fun toTerm(input: Pair<MarshalContext, HvmValue>): Long {
    val (ctx, value) = input
    val ids = ctx.ids

    return when (value) {
        is HvmValue.Num ->
            HvmNative.hvmTermNewNum(value.value)

        is HvmValue.Str -> {
            var term = HvmNative.hvmTermNewCtr(ids.stringNil, 0, longArrayOf())
            for (ch in value.value.reversed()) {
                val chTerm = HvmNative.hvmTermNewNum(ch.code)
                val loc = HvmNative.hvmHeapAlloc(2)
                HvmNative.hvmHeapSet(loc, chTerm)
                HvmNative.hvmHeapSet(loc + 1, term)
                term = HvmNative.hvmTermNewCtr(ids.stringCons, 2, longArrayOf(chTerm, term))
            }
            term
        }

        is HvmValue.Bool -> {
            val name = if (value.value) ids.boolTrue else ids.boolFalse
            HvmNative.hvmTermNewCtr(name, 0, longArrayOf())
        }

        is HvmValue.HvmList -> {
            var term = HvmNative.hvmTermNewCtr(ids.listNil, 0, longArrayOf())
            for (item in value.value.reversed()) {
                val elem = toTerm(ctx to item)
                val loc = HvmNative.hvmHeapAlloc(2)
                HvmNative.hvmHeapSet(loc, elem)
                HvmNative.hvmHeapSet(loc + 1, term)
                term = HvmNative.hvmTermNewCtr(ids.listCons, 2, longArrayOf(elem, term))
            }
            term
        }

        is HvmValue.Handle ->
            HvmNative.hvmTermNewNum(value.id)

        is HvmValue.Null ->
            (TAG_ERA.toLong()) shl 56
    }
}

fun fromTerm(input: Pair<MarshalContext, Long>): HvmValue {
    val (ctx, term) = input
    val ids = ctx.ids
    val tag = HvmNative.hvmTermTag(term)

    if (tag == TAG_NUM) {
        return HvmValue.Num(HvmNative.hvmTermExt(term))
    }

    if (tag == TAG_ERA) {
        return HvmValue.Null
    }

    if (tag in TAG_C00..TAG_C16) {
        val name = HvmNative.hvmTermExt(term)
        val arity = tag - TAG_C00

        if (name == ids.boolTrue) return HvmValue.Bool(true)
        if (name == ids.boolFalse) return HvmValue.Bool(false)

        if (name == ids.stringCons || name == ids.stringNil) {
            return HvmValue.Str(readString(ctx to term))
        }

        if (name == ids.listCons || name == ids.listNil) {
            return HvmValue.HvmList(readList(ctx to term))
        }

        val fields = mutableListOf<HvmValue>()
        val loc = HvmNative.hvmTermVal(term)
        for (i in 0 until arity) {
            val field = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + i))
            fields.add(fromTerm(ctx to field))
        }
        return HvmValue.HvmList(fields)
    }

    return HvmValue.Null
}

private fun readString(input: Pair<MarshalContext, Long>): String {
    val (ctx, startTerm) = input
    val ids = ctx.ids
    val chars = StringBuilder()
    var current = startTerm

    while (true) {
        val tag = HvmNative.hvmTermTag(current)
        if (tag !in TAG_C00..TAG_C16) break

        val name = HvmNative.hvmTermExt(current)
        if (name == ids.stringNil) break
        if (name != ids.stringCons) break

        val loc = HvmNative.hvmTermVal(current)
        val ch = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc))
        chars.append(HvmNative.hvmTermExt(ch).toChar())
        current = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + 1))
    }

    return chars.toString()
}

private fun readList(input: Pair<MarshalContext, Long>): List<HvmValue> {
    val (ctx, startTerm) = input
    val ids = ctx.ids
    val items = mutableListOf<HvmValue>()
    var current = startTerm

    while (true) {
        val tag = HvmNative.hvmTermTag(current)
        if (tag !in TAG_C00..TAG_C16) break

        val name = HvmNative.hvmTermExt(current)
        if (name == ids.listNil) break
        if (name != ids.listCons) break

        val loc = HvmNative.hvmTermVal(current)
        val head = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc))
        items.add(fromTerm(ctx to head))
        current = HvmNative.hvmWnf(HvmNative.hvmHeapRead(loc + 1))
    }

    return items
}
