// bind.rs - Rust FFI declarations matching hvm_lib.h.
//
// Unsafe extern "C" declarations wrapped in a safe Rust API.
// Links against libhvm.a (macOS, Linux) or hvm.lib (Windows).

type Term = u64;

extern "C" {
  fn hvm_init(threads: u32, debug: i32, silent: i32, steps: i32);
  fn hvm_free();
  fn hvm_prepare_text(main_id: *mut u32, src_path: *const i8, src_text: *const i8) -> i32;
  fn hvm_wnf(term: Term) -> Term;
  fn hvm_normalize(term: Term) -> Term;
  fn hvm_term_new_num(n: u32) -> Term;
  fn hvm_term_new_ctr(name: u32, arity: u32, args: *const Term) -> Term;
  fn hvm_term_new_sup(label: u32, a: Term, b: Term) -> Term;
  fn hvm_term_new_dup(label: u32, expr: Term, body: Term) -> Term;
  fn hvm_term_new_app(f: Term, x: Term) -> Term;
  fn hvm_term_new_lam(body: Term) -> Term;
  fn hvm_term_new_lam_at(loc: u64, body: Term) -> Term;
  fn hvm_term_new_var(loc: u64) -> Term;
  fn hvm_term_new_ref(id: u32) -> Term;
  fn hvm_term_tag(term: Term) -> u8;
  fn hvm_term_ext(term: Term) -> u32;
  fn hvm_term_val(term: Term) -> u64;
  fn hvm_heap_read(loc: u64) -> Term;
  fn hvm_heap_set(loc: u64, term: Term);
  fn hvm_heap_alloc(words: u64) -> u64;
  fn hvm_table_find(name: *const i8, len: u32) -> u32;
}

/// Safe wrapper around the HVM C API.
pub struct HvmApi;

pub struct InitInput {
  pub threads: u32,
  pub debug: bool,
  pub silent: bool,
  pub steps: i32,
}

impl Default for InitInput {
  fn default() -> Self {
    Self {
      threads: 1,
      debug: false,
      silent: true,
      steps: 0,
    }
  }
}

pub struct AppInput {
  pub f: u64,
  pub x: u64,
}

pub struct HeapSetInput {
  pub loc: u64,
  pub term: u64,
}

impl HvmApi {
  pub fn init(input: &InitInput) {
    unsafe {
      hvm_init(
        input.threads,
        input.debug as i32,
        input.silent as i32,
        input.steps,
      );
    }
  }

  pub fn free() {
    unsafe { hvm_free() }
  }

  pub fn prepare_text(src_path: &str, src_text: &str) -> Option<u32> {
    use std::ffi::CString;
    let c_path = CString::new(src_path).ok()?;
    let c_text = CString::new(src_text).ok()?;
    let mut main_id: u32 = 0;
    let result = unsafe { hvm_prepare_text(&mut main_id, c_path.as_ptr(), c_text.as_ptr()) };
    if result != 0 {
      Some(main_id)
    } else {
      None
    }
  }

  pub fn wnf(term: u64) -> u64 {
    unsafe { hvm_wnf(term) }
  }

  pub fn normalize(term: u64) -> u64 {
    unsafe { hvm_normalize(term) }
  }

  pub fn term_new_num(n: u32) -> u64 {
    unsafe { hvm_term_new_num(n) }
  }

  pub fn term_new_ctr(name: u32, arity: u32, args: &[u64]) -> u64 {
    unsafe { hvm_term_new_ctr(name, arity, args.as_ptr()) }
  }

  pub fn term_new_sup(label: u32, a: u64, b: u64) -> u64 {
    unsafe { hvm_term_new_sup(label, a, b) }
  }

  pub fn term_new_dup(label: u32, expr: u64, body: u64) -> u64 {
    unsafe { hvm_term_new_dup(label, expr, body) }
  }

  pub fn term_new_app(input: &AppInput) -> u64 {
    unsafe { hvm_term_new_app(input.f, input.x) }
  }

  pub fn term_new_lam(body: u64) -> u64 {
    unsafe { hvm_term_new_lam(body) }
  }

  pub fn term_new_lam_at(loc: u64, body: u64) -> u64 {
    unsafe { hvm_term_new_lam_at(loc, body) }
  }

  pub fn term_new_var(loc: u64) -> u64 {
    unsafe { hvm_term_new_var(loc) }
  }

  pub fn term_new_ref(id: u32) -> u64 {
    unsafe { hvm_term_new_ref(id) }
  }

  pub fn term_tag(term: u64) -> u8 {
    unsafe { hvm_term_tag(term) }
  }

  pub fn term_ext(term: u64) -> u32 {
    unsafe { hvm_term_ext(term) }
  }

  pub fn term_val(term: u64) -> u64 {
    unsafe { hvm_term_val(term) }
  }

  pub fn heap_read(loc: u64) -> u64 {
    unsafe { hvm_heap_read(loc) }
  }

  pub fn heap_set(input: &HeapSetInput) {
    unsafe { hvm_heap_set(input.loc, input.term) }
  }

  pub fn heap_alloc(words: u64) -> u64 {
    unsafe { hvm_heap_alloc(words) }
  }

  pub fn table_find(name: &str) -> u32 {
    use std::ffi::CString;
    let c_name = CString::new(name).unwrap();
    unsafe { hvm_table_find(c_name.as_ptr(), name.len() as u32) }
  }
}
