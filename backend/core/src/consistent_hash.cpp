#include "consistent_hash.h"
#include <algorithm>
#include <sstream>

namespace urlshortener {

ConsistentHash::ConsistentHash(size_t virtualNodes)
    : virtualNodes_(virtualNodes) {}

uint32_t ConsistentHash::hash(const std::string& key) const {
    uint32_t hash = 0;
    for (char c : key) {
        hash += static_cast<unsigned char>(c);
        hash += (hash << 10);
        hash ^= (hash >> 6);
    }
    hash += (hash << 3);
    hash ^= (hash >> 11);
    hash += (hash << 15);
    return hash;
}

std::string ConsistentHash::virtualNodeKey(const std::string& node, size_t idx) const {
    return node + "#" + std::to_string(idx);
}

void ConsistentHash::addNode(const std::string& node) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (size_t i = 0; i < virtualNodes_; ++i) {
        uint32_t h = hash(virtualNodeKey(node, i));
        ring_[h] = node;
    }
    nodes_.push_back(node);
}

void ConsistentHash::removeNode(const std::string& node) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (size_t i = 0; i < virtualNodes_; ++i) {
        uint32_t h = hash(virtualNodeKey(node, i));
        ring_.erase(h);
    }
    auto it = std::find(nodes_.begin(), nodes_.end(), node);
    if (it != nodes_.end()) nodes_.erase(it);
}

std::string ConsistentHash::getNode(const std::string& key) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (ring_.empty()) return "";

    uint32_t h = hash(key);
    auto it = ring_.lower_bound(h);
    if (it == ring_.end()) {
        it = ring_.begin();
    }
    return it->second;
}

std::vector<std::string> ConsistentHash::getNodes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return nodes_;
}

} // namespace urlshortener
