#include "bloom_filter.h"
#include <cmath>
#include <cstring>
#include <functional>

namespace urlshortener {

BloomFilter::BloomFilter(size_t expectedItems, double falsePositiveRate) {
    bitCount_ = optimalBitCount(expectedItems, falsePositiveRate);
    hashFunctions_ = optimalHashCount(expectedItems, bitCount_);
    bits_.resize(bitCount_, false);
}

size_t BloomFilter::optimalBitCount(size_t n, double p) {
    return static_cast<size_t>(-n * std::log(p) / (std::log(2.0) * std::log(2.0)));
}

size_t BloomFilter::optimalHashCount(size_t n, size_t m) {
    return static_cast<size_t>(std::round(static_cast<double>(m) / n * std::log(2.0)));
}

std::vector<size_t> BloomFilter::getHashes(const std::string& key) const {
    std::vector<size_t> hashes;
    hashes.reserve(hashFunctions_);

    // Double hashing technique
    std::hash<std::string> hashFn;
    size_t hash1 = hashFn(key);
    size_t hash2 = hashFn(key + std::to_string(hash1));

    for (size_t i = 0; i < hashFunctions_; ++i) {
        size_t combined = hash1 + i * hash2 + i * i;
        hashes.push_back(combined % bitCount_);
    }
    return hashes;
}

void BloomFilter::insert(const std::string& key) {
    for (size_t h : getHashes(key)) {
        bits_[h] = true;
    }
}

bool BloomFilter::contains(const std::string& key) const {
    for (size_t h : getHashes(key)) {
        if (!bits_[h]) return false;
    }
    return true;
}

void BloomFilter::clear() {
    std::fill(bits_.begin(), bits_.end(), false);
}

} // namespace urlshortener
