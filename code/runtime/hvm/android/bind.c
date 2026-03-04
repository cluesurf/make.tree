// bind.c - JNI native method implementations.
//
// Each function bridges from the JNI calling convention to
// the hvm_* C API exported by libhvm.so.

#include "hvm_lib.h"
#include <jni.h>

// Lifecycle

JNIEXPORT void JNICALL
Java_surf_clue_hvm_HvmNative_hvmInit(JNIEnv *env, jobject obj, jint threads,
                                     jint debug, jint silent, jint steps) {
  (void)env;
  (void)obj;
  hvm_init((u32)threads, debug, silent, steps);
}

JNIEXPORT void JNICALL Java_surf_clue_hvm_HvmNative_hvmFree(JNIEnv *env,
                                                            jobject obj) {
  (void)env;
  (void)obj;
  hvm_free();
}

// Program loading

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmPrepareText(
    JNIEnv *env, jobject obj, jstring srcPath, jstring srcText) {
  (void)obj;
  const char *path = (*env)->GetStringUTFChars(env, srcPath, NULL);
  const char *text = (*env)->GetStringUTFChars(env, srcText, NULL);

  u32 mainId = 0;
  int result = hvm_prepare_text(&mainId, path, text);

  (*env)->ReleaseStringUTFChars(env, srcPath, path);
  (*env)->ReleaseStringUTFChars(env, srcText, text);

  if (result == 0)
    return -1;
  return (jlong)mainId;
}

// Evaluation

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmWnf(JNIEnv *env,
                                                            jobject obj,
                                                            jlong term) {
  (void)env;
  (void)obj;
  return (jlong)hvm_wnf((Term)term);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmNormalize(JNIEnv *env,
                                                                  jobject obj,
                                                                  jlong term) {
  (void)env;
  (void)obj;
  return (jlong)hvm_normalize((Term)term);
}

// Term constructors

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewNum(JNIEnv *env,
                                                                   jobject obj,
                                                                   jint n) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_num((u32)n);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewCtr(
    JNIEnv *env, jobject obj, jint name, jint arity, jlongArray args) {
  (void)obj;
  jlong *elems = (*env)->GetLongArrayElements(env, args, NULL);
  Term cArgs[16];
  for (int i = 0; i < arity && i < 16; i++) {
    cArgs[i] = (Term)elems[i];
  }
  (*env)->ReleaseLongArrayElements(env, args, elems, 0);
  return (jlong)hvm_term_new_ctr((u32)name, (u32)arity, cArgs);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewSup(
    JNIEnv *env, jobject obj, jint label, jlong a, jlong b) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_sup((u32)label, (Term)a, (Term)b);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewDup(
    JNIEnv *env, jobject obj, jint label, jlong expr, jlong body) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_dup((u32)label, (Term)expr, (Term)body);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewApp(JNIEnv *env,
                                                                   jobject obj,
                                                                   jlong f,
                                                                   jlong x) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_app((Term)f, (Term)x);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewLam(JNIEnv *env,
                                                                   jobject obj,
                                                                   jlong body) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_lam((Term)body);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewLamAt(
    JNIEnv *env, jobject obj, jlong loc, jlong body) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_lam_at((u64)loc, (Term)body);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewVar(JNIEnv *env,
                                                                   jobject obj,
                                                                   jlong loc) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_var((u64)loc);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermNewRef(JNIEnv *env,
                                                                   jobject obj,
                                                                   jint id) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_new_ref((u32)id);
}

// Term accessors

JNIEXPORT jint JNICALL Java_surf_clue_hvm_HvmNative_hvmTermTag(JNIEnv *env,
                                                               jobject obj,
                                                               jlong term) {
  (void)env;
  (void)obj;
  return (jint)hvm_term_tag((Term)term);
}

JNIEXPORT jint JNICALL Java_surf_clue_hvm_HvmNative_hvmTermExt(JNIEnv *env,
                                                               jobject obj,
                                                               jlong term) {
  (void)env;
  (void)obj;
  return (jint)hvm_term_ext((Term)term);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmTermVal(JNIEnv *env,
                                                                jobject obj,
                                                                jlong term) {
  (void)env;
  (void)obj;
  return (jlong)hvm_term_val((Term)term);
}

// Heap

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmHeapRead(JNIEnv *env,
                                                                 jobject obj,
                                                                 jlong loc) {
  (void)env;
  (void)obj;
  return (jlong)hvm_heap_read((u64)loc);
}

JNIEXPORT void JNICALL Java_surf_clue_hvm_HvmNative_hvmHeapSet(JNIEnv *env,
                                                               jobject obj,
                                                               jlong loc,
                                                               jlong term) {
  (void)env;
  (void)obj;
  hvm_heap_set((u64)loc, (Term)term);
}

JNIEXPORT jlong JNICALL Java_surf_clue_hvm_HvmNative_hvmHeapAlloc(JNIEnv *env,
                                                                  jobject obj,
                                                                  jlong words) {
  (void)env;
  (void)obj;
  return (jlong)hvm_heap_alloc((u64)words);
}

// Symbol table

JNIEXPORT jint JNICALL Java_surf_clue_hvm_HvmNative_hvmTableFind(JNIEnv *env,
                                                                 jobject obj,
                                                                 jstring name,
                                                                 jint len) {
  (void)obj;
  const char *str = (*env)->GetStringUTFChars(env, name, NULL);
  u32 result = hvm_table_find(str, (u32)len);
  (*env)->ReleaseStringUTFChars(env, name, str);
  return (jint)result;
}
