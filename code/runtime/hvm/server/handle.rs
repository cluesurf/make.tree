// handle.rs - Handle table for bridging Rust objects into HVM.
//
// Thread-safe via Mutex. Uses Arc for shared ownership.

use std::any::Any;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct HandleTable {
  next_id: u32,
  objects: HashMap<u32, Arc<dyn Any + Send + Sync>>,
}

impl HandleTable {
  pub fn new() -> Mutex<Self> {
    Mutex::new(Self {
      next_id: 1,
      objects: HashMap::new(),
    })
  }

  pub fn register(&mut self, obj: Arc<dyn Any + Send + Sync>) -> u32 {
    let id = self.next_id;
    self.next_id += 1;
    self.objects.insert(id, obj);
    id
  }

  pub fn get(&self, id: u32) -> Option<&Arc<dyn Any + Send + Sync>> {
    self.objects.get(&id)
  }

  pub fn release(&mut self, id: u32) {
    self.objects.remove(&id);
  }

  pub fn has(&self, id: u32) -> bool {
    self.objects.contains_key(&id)
  }

  pub fn clear(&mut self) {
    self.objects.clear();
    self.next_id = 1;
  }

  pub fn len(&self) -> usize {
    self.objects.len()
  }

  pub fn is_empty(&self) -> bool {
    self.objects.is_empty()
  }
}
