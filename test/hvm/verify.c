// verify.c - Minimal test that builds, links, and runs HVM.
//
// Prints "tag=<n> val=<n>" so the test harness can parse and assert.

#include <stdio.h>
#include <stdint.h>

typedef uint64_t Term;

extern void     hvm_init(uint32_t threads, int debug, int silent, int steps);
extern void     hvm_free(void);
extern int      hvm_prepare_text(uint32_t *main_id, const char *src_path, const char *src_text);
extern Term     hvm_normalize(Term term);
extern Term     hvm_term_new_ref(uint32_t id);
extern uint8_t  hvm_term_tag(Term t);
extern uint64_t hvm_term_val(Term t);

int main(void) {
  hvm_init(1, 0, 1, 0);

  uint32_t main_id = 0;
  const char *src = "@main = 42";
  int ok = hvm_prepare_text(&main_id, "<test>", (char *)src);
  if (!ok) {
    fprintf(stderr, "prepare failed\n");
    return 1;
  }

  Term ref = hvm_term_new_ref(main_id);
  Term result = hvm_normalize(ref);
  printf("tag=%u val=%llu\n", hvm_term_tag(result), hvm_term_val(result));

  hvm_free();
  return 0;
}
