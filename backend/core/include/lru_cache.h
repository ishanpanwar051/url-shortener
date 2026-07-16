#pragma once
#include <unordered_map>
#include <list>
#include <string>
#include <mutex>

namespace urlshortener {

template<typename K, typename V>
class LRUCache {
public:
    LRUCache(size_t capacity) : capacity_(capacity) {}

    bool get(const K& key, V& value) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = cacheMap_.find(key);
        if (it == cacheMap_.end()) {
            return false;
        }
        // Move to front (most recently used)
        cacheList_.splice(cacheList_.begin(), cacheList_, it->second);
        value = it->second->second;
        return true;
    }

    void put(const K& key, const V& value) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = cacheMap_.find(key);
        if (it != cacheMap_.end()) {
            it->second->second = value;
            cacheList_.splice(cacheList_.begin(), cacheList_, it->second);
            return;
        }

        if (cacheMap_.size() >= capacity_) {
            auto last = cacheList_.back();
            cacheMap_.erase(last.first);
            cacheList_.pop_back();
        }

        cacheList_.emplace_front(key, value);
        cacheMap_[key] = cacheList_.begin();
    }

    bool contains(const K& key) {
        std::lock_guard<std::mutex> lock(mutex_);
        return cacheMap_.find(key) != cacheMap_.end();
    }

    size_t size() const { return cacheMap_.size(); }
    size_t capacity() const { return capacity_; }

    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        cacheMap_.clear();
        cacheList_.clear();
    }

private:
    size_t capacity_;
    std::list<std::pair<K, V>> cacheList_;
    std::unordered_map<K, typename std::list<std::pair<K, V>>::iterator> cacheMap_;
    std::mutex mutex_;
};

} // namespace urlshortener
