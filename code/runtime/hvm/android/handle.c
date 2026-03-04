// handle.c - JNI global ref management for bridged objects.
//
// When HVM DUPs a native handle, we create a JNI global ref
// to prevent the JVM from garbage-collecting the object.
// When HVM ERAs a handle, we delete the global ref.

#include <jni.h>
#include <stdlib.h>

#define MAX_HANDLES 4096

static jobject HANDLE_TABLE[MAX_HANDLES];
static int HANDLE_COUNT = 0;

// Store a JNI global ref for a handle ID.
// Called from Kotlin when registering an object.
JNIEXPORT void JNICALL Java_surf_clue_hvm_HandleBridge_pinHandle(
    JNIEnv *env, jobject obj, jint id, jobject target) {
  (void)obj;
  if (id >= 0 && id < MAX_HANDLES) {
    HANDLE_TABLE[id] = (*env)->NewGlobalRef(env, target);
  }
}

// Release a JNI global ref for a handle ID.
// Called from Kotlin when releasing a handle.
JNIEXPORT void JNICALL Java_surf_clue_hvm_HandleBridge_unpinHandle(JNIEnv *env,
                                                                   jobject obj,
                                                                   jint id) {
  (void)obj;
  if (id >= 0 && id < MAX_HANDLES && HANDLE_TABLE[id] != NULL) {
    (*env)->DeleteGlobalRef(env, HANDLE_TABLE[id]);
    HANDLE_TABLE[id] = NULL;
  }
}
