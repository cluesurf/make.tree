// loop.rs - IO action interpreter for server (macOS/Linux/Windows).

use super::bind::{AppInput, HvmApi};
use super::marshal::{from_term, to_term, HvmValue, MarshalContext};
use std::collections::HashMap;

/// Well-known IO constructor name IDs.
pub struct IoNameIds {
  pub io_done: u32,
  pub io_call: u32,
  pub io_bind: u32,
}

pub type NativePrimFn = fn(&MarshalContext, &str, u64) -> HvmValue;

pub struct IoContext<'a> {
  pub marshal: MarshalContext<'a>,
  pub ids: &'a IoNameIds,
  pub prims: &'a HashMap<String, NativePrimFn>,
}

pub fn run_io(ctx: &IoContext, term: u64) -> HvmValue {
  let ids = ctx.ids;

  let mut current = HvmApi::wnf(term);

  loop {
    let name = HvmApi::term_ext(current);

    if name == ids.io_done {
      let loc = HvmApi::term_val(current);
      let value = HvmApi::wnf(HvmApi::heap_read(loc));
      return from_term(&ctx.marshal, value);
    }

    if name == ids.io_call {
      let loc = HvmApi::term_val(current);
      let prim_name_term = HvmApi::wnf(HvmApi::heap_read(loc));
      let prim_name = from_term(&ctx.marshal, prim_name_term);

      let prim_str = match &prim_name {
        HvmValue::Str(s) => s.as_str(),
        _ => panic!("IO.call: expected string prim name"),
      };

      let arg = HvmApi::wnf(HvmApi::heap_read(loc + 1));
      let cont = HvmApi::heap_read(loc + 2);

      let handler = ctx
        .prims
        .get(prim_str)
        .unwrap_or_else(|| panic!("Unknown native primitive: {prim_str}"));

      let result = handler(&ctx.marshal, prim_str, arg);
      let hvm_result = to_term(&ctx.marshal, &result);

      current = HvmApi::wnf(HvmApi::term_new_app(&AppInput {
        f: cont,
        x: hvm_result,
      }));
      continue;
    }

    if name == ids.io_bind {
      let loc = HvmApi::term_val(current);
      let action = HvmApi::heap_read(loc);
      let cont = HvmApi::heap_read(loc + 1);

      let action_result = run_io(ctx, action);
      let hvm_result = to_term(&ctx.marshal, &action_result);

      current = HvmApi::wnf(HvmApi::term_new_app(&AppInput {
        f: cont,
        x: hvm_result,
      }));
      continue;
    }

    panic!("Unknown IO action: {name}");
  }
}
