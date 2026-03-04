// bind.kt - JNI declarations for the HVM native library.
//
// Each external fun maps to a JNI native method implemented in bind.c,
// which calls the corresponding hvm_* function from libhvm.so.

package surf.clue.hvm

object HvmNative {
    init {
        System.loadLibrary("hvm")
    }

    // Lifecycle
    external fun hvmInit(threads: Int, debug: Int, silent: Int, steps: Int)
    external fun hvmFree()

    // Program loading
    external fun hvmPrepareText(srcPath: String, srcText: String): Long

    // Evaluation
    external fun hvmWnf(term: Long): Long
    external fun hvmNormalize(term: Long): Long

    // Term constructors
    external fun hvmTermNewNum(n: Int): Long
    external fun hvmTermNewCtr(name: Int, arity: Int, args: LongArray): Long
    external fun hvmTermNewSup(label: Int, a: Long, b: Long): Long
    external fun hvmTermNewDup(label: Int, expr: Long, body: Long): Long
    external fun hvmTermNewApp(f: Long, x: Long): Long
    external fun hvmTermNewLam(body: Long): Long
    external fun hvmTermNewLamAt(loc: Long, body: Long): Long
    external fun hvmTermNewVar(loc: Long): Long
    external fun hvmTermNewRef(id: Int): Long

    // Term accessors
    external fun hvmTermTag(term: Long): Int
    external fun hvmTermExt(term: Long): Int
    external fun hvmTermVal(term: Long): Long

    // Heap
    external fun hvmHeapRead(loc: Long): Long
    external fun hvmHeapSet(loc: Long, term: Long)
    external fun hvmHeapAlloc(words: Long): Long

    // Symbol table
    external fun hvmTableFind(name: String, len: Int): Int
}
