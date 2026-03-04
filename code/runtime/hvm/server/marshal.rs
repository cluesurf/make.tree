// marshal.rs - Convert between Rust values and HVM terms.

use super::bind::HeapSetInput;
use super::bind::HvmApi;
use super::handle::HandleTable;
use std::sync::Mutex;

// Tag constants (must match hvm.c)
const TAG_NUM: u8 = 30;
const TAG_ERA: u8 = 11;
const TAG_C00: u8 = 13;
const TAG_C16: u8 = 29;

/// Value type for marshaling.
#[derive(Debug, Clone)]
pub enum HvmValue {
  Num(i32),
  Str(String),
  Bool(bool),
  List(Vec<HvmValue>),
  Handle(u32),
  Null,
}

/// Well-known constructor name IDs, resolved at init time.
pub struct NameIds {
  pub bool_true: u32,
  pub bool_false: u32,
  pub list_cons: u32,
  pub list_nil: u32,
  pub string_cons: u32,
  pub string_nil: u32,
}

pub struct MarshalContext<'a> {
  pub handles: &'a Mutex<HandleTable>,
  pub ids: &'a NameIds,
}

pub fn to_term(ctx: &MarshalContext, value: &HvmValue) -> u64 {
  let ids = ctx.ids;

  match value {
    HvmValue::Num(n) => HvmApi::term_new_num(*n as u32),

    HvmValue::Str(s) => {
      let mut term = HvmApi::term_new_ctr(ids.string_nil, 0, &[]);
      for ch in s.chars().rev() {
        let ch_term = HvmApi::term_new_num(ch as u32);
        let loc = HvmApi::heap_alloc(2);
        HvmApi::heap_set(&HeapSetInput { loc, term: ch_term });
        HvmApi::heap_set(&HeapSetInput { loc: loc + 1, term });
        term = HvmApi::term_new_ctr(ids.string_cons, 2, &[ch_term, term]);
      }
      term
    }

    HvmValue::Bool(b) => {
      let name = if *b { ids.bool_true } else { ids.bool_false };
      HvmApi::term_new_ctr(name, 0, &[])
    }

    HvmValue::List(items) => {
      let mut term = HvmApi::term_new_ctr(ids.list_nil, 0, &[]);
      for item in items.iter().rev() {
        let elem = to_term(ctx, item);
        let loc = HvmApi::heap_alloc(2);
        HvmApi::heap_set(&HeapSetInput { loc, term: elem });
        HvmApi::heap_set(&HeapSetInput { loc: loc + 1, term });
        term = HvmApi::term_new_ctr(ids.list_cons, 2, &[elem, term]);
      }
      term
    }

    HvmValue::Handle(id) => HvmApi::term_new_num(*id),

    HvmValue::Null => (TAG_ERA as u64) << 56,
  }
}

pub fn from_term(ctx: &MarshalContext, term: u64) -> HvmValue {
  let ids = ctx.ids;
  let tag = HvmApi::term_tag(term);

  if tag == TAG_NUM {
    return HvmValue::Num(HvmApi::term_ext(term) as i32);
  }

  if tag == TAG_ERA {
    return HvmValue::Null;
  }

  if tag >= TAG_C00 && tag <= TAG_C16 {
    let name = HvmApi::term_ext(term);
    let arity = (tag - TAG_C00) as usize;

    if name == ids.bool_true {
      return HvmValue::Bool(true);
    }
    if name == ids.bool_false {
      return HvmValue::Bool(false);
    }

    if name == ids.string_cons || name == ids.string_nil {
      return HvmValue::Str(read_string(ctx, term));
    }

    if name == ids.list_cons || name == ids.list_nil {
      return HvmValue::List(read_list(ctx, term));
    }

    // Generic constructor: read fields.
    let loc = HvmApi::term_val(term);
    let fields: Vec<HvmValue> = (0..arity)
      .map(|i| {
        let field = HvmApi::wnf(HvmApi::heap_read(loc + i as u64));
        from_term(ctx, field)
      })
      .collect();
    return HvmValue::List(fields);
  }

  HvmValue::Null
}

fn read_string(ctx: &MarshalContext, start: u64) -> String {
  let ids = ctx.ids;
  let mut chars = Vec::new();
  let mut current = start;

  loop {
    let tag = HvmApi::term_tag(current);
    if tag < TAG_C00 || tag > TAG_C16 {
      break;
    }

    let name = HvmApi::term_ext(current);
    if name == ids.string_nil {
      break;
    }
    if name != ids.string_cons {
      break;
    }

    let loc = HvmApi::term_val(current);
    let ch = HvmApi::wnf(HvmApi::heap_read(loc));
    if let Some(c) = char::from_u32(HvmApi::term_ext(ch)) {
      chars.push(c);
    }
    current = HvmApi::wnf(HvmApi::heap_read(loc + 1));
  }

  chars.into_iter().collect()
}

fn read_list(ctx: &MarshalContext, start: u64) -> Vec<HvmValue> {
  let ids = ctx.ids;
  let mut items = Vec::new();
  let mut current = start;

  loop {
    let tag = HvmApi::term_tag(current);
    if tag < TAG_C00 || tag > TAG_C16 {
      break;
    }

    let name = HvmApi::term_ext(current);
    if name == ids.list_nil {
      break;
    }
    if name != ids.list_cons {
      break;
    }

    let loc = HvmApi::term_val(current);
    let head = HvmApi::wnf(HvmApi::heap_read(loc));
    items.push(from_term(ctx, head));
    current = HvmApi::wnf(HvmApi::heap_read(loc + 1));
  }

  items
}
