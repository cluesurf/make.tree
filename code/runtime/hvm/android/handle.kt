// handle.kt - Handle table for bridging Kotlin objects into HVM.
//
// Maps integer IDs to JVM objects. Prevents garbage collection
// while HVM holds a reference.

package surf.clue.hvm

class HandleTable {
    private var nextId: Int = 1
    private val objects: HashMap<Int, Any> = HashMap()

    fun register(obj: Any): Int {
        val id = nextId
        nextId += 1
        objects[id] = obj
        return id
    }

    fun get(id: Int): Any? {
        return objects[id]
    }

    fun release(id: Int) {
        objects.remove(id)
    }

    fun has(id: Int): Boolean {
        return objects.containsKey(id)
    }

    fun clear() {
        objects.clear()
        nextId = 1
    }

    val size: Int
        get() = objects.size
}
