use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// A mutex that allows locking based on a key (e.g., user ID).
/// This prevents global locking when only user-scoped synchronization is needed.
#[derive(Debug, Clone)]
pub struct KeyedMutex {
    locks: Arc<DashMap<String, Arc<Mutex<()>>>>,
}

impl KeyedMutex {
    pub fn new() -> Self {
        Self {
            locks: Arc::new(DashMap::new()),
        }
    }

    /// Acquires a lock for the given key.
    /// The lock is released when the returned guard is dropped.
    pub async fn lock(&self, key: &str) -> tokio::sync::OwnedMutexGuard<()> {
        let mutex = self
            .locks
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .value()
            .clone();

        // We return the guard directly. The inner Arc<Mutex> is held by the DashMap,
        // so it won't disappear.
        // Note: This simple implementation leaves entries in the map forever.
        // For extremely high distinct user counts, an eviction policy would be needed,
        // but for typical enterprise loads, the memory footprint is negligible.
        mutex.lock_owned().await
    }
    /// Removes locks that are not currently held by any task.
    /// This should be called periodically to prevent memory growth.
    pub fn cleanup(&self) {
        self.locks.retain(|_, mutex| Arc::strong_count(mutex) > 1);
    }
}

impl Default for KeyedMutex {
    fn default() -> Self {
        Self::new()
    }
}
