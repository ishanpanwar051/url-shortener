#pragma once
#include <vector>
#include <cstdint>
#include <functional>

namespace urlshortener {

class BloomFilter {
public:
    BloomFilter(size_t expectedItems, double falsePositiveRate = 0.01);

    void insert(const std::string& key);
    bool contains(const std::string& key) const;
    void clear();
    size_t bitSize() const { return bits_.size(); }
    size_t hashCount() const { return hashFunctions_; }

private:
    std::vector<bool> bits_;
    size_t hashFunctions_;
    size_t bitCount_;

    std::vector<size_t> getHashes(const std::string& key) const;
    static size_t optimalBitCount(size_t n, double p);
    static size_t optimalHashCount(size_t n, size_t m);
};

} // namespace urlshortener
