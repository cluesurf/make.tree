// handle.swift - Handle table for bridging Swift objects into HVM.
//
// Maps integer IDs to AnyObject references. ARC manages lifetime.
// When HVM fires ERA on a handle, call release to remove it from
// the table. If no other Swift code holds a reference, ARC
// deallocates the object.

final class HandleTable {
    private var nextId: UInt32 = 1
    private var objects: [UInt32: AnyObject] = [:]

    func register(_ obj: AnyObject) -> UInt32 {
        let id = nextId
        nextId += 1
        objects[id] = obj
        return id
    }

    func get(_ id: UInt32) -> AnyObject? {
        return objects[id]
    }

    func release(_ id: UInt32) {
        objects.removeValue(forKey: id)
    }

    func has(_ id: UInt32) -> Bool {
        return objects[id] != nil
    }

    func clear() {
        objects.removeAll()
        nextId = 1
    }

    var count: Int {
        return objects.count
    }
}
