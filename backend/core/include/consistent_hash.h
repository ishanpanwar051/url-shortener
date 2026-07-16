#pragma once
#include <map>
#include <vector>
#include <string>
#include <functional>
#include <mutex>

namespace urlshortener {

class ConsistentHash {
public:
    ConsistentHash(size_t virtualNodes = 150);

    void addNode(const std::string& node);
    void removeNode(const std::string& node);
    std::string getNode(const std::string& key) const;
    std::vector<std::string> getNodes() const;
    size_t size() const { return nodes_.size(); }

private:
    size_t virtualNodes_;
    std::map<uint32_t, std::string> ring_;
    std::vector<std::string> nodes_;
    mutable std::mutex mutex_;

    uint32_t hash(const std::string& key) const;
    std::string virtualNodeKey(const std::string& node, size_t idx) const;
};

} // namespace urlshortener
